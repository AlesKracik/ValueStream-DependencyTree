import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import {
  SSOOIDCClient,
  RegisterClientCommand,
  StartDeviceAuthorizationCommand,
  CreateTokenCommand,
} from '@aws-sdk/client-sso-oidc';
import {
  SSOClient,
  GetRoleCredentialsCommand,
} from '@aws-sdk/client-sso';
import { Type, Static } from '@sinclair/typebox';
import { getIntegrationConfig } from '../utils/configHelpers';
import { evictSsoClients } from '../utils/mongoServer';

// ── Schemas ─────────────────────────────────────────────────────

const SsoStartBody = Type.Object({
  role: Type.Optional(Type.String()),
  persistence: Type.Optional(Type.Object({}, { additionalProperties: true })),
}, { additionalProperties: true });
type SsoStartBodyType = Static<typeof SsoStartBody>;

const SsoPollBody = Type.Object({
  session_id: Type.String(),
});
type SsoPollBodyType = Static<typeof SsoPollBody>;

// ── In-memory session store for device auth flows ───────────────

interface DeviceSession {
  clientId: string;
  clientSecret: string;
  deviceCode: string;
  region: string;
  accountId: string;
  roleName: string;
  role: string; // 'app' | 'customer'
  expiresAt: number;
}

const deviceSessions = new Map<string, DeviceSession>();

// Clean up expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of deviceSessions) {
    if (session.expiresAt < now) deviceSessions.delete(id);
  }
}, 60_000);

// ── Routes ──────────────────────────────────────────────────────

export const awsRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * POST /api/aws/sso/login
   * Initiates the SSO device authorization flow via AWS SDK.
   * Returns a verification URL for the user to open.
   */
  fastify.post<{ Body: SsoStartBodyType }>('/api/aws/sso/login', { schema: { body: SsoStartBody } }, async (request, reply) => {
    const { full: config } = await getIntegrationConfig(fastify, request.body);

    const role = config.role || 'app';
    const auth = config.persistence?.mongo?.[role]?.auth || {};
    const sso = auth.sso || {};
    const startUrl = sso.aws_sso_start_url;
    const region = sso.aws_sso_region;
    const accountId = sso.aws_sso_account_id;
    const roleName = sso.aws_sso_role_name;

    if (!startUrl || !region) {
      return reply.code(400).send({ success: false, error: 'SSO Start URL and Region are required.' });
    }
    if (!accountId || !roleName) {
      return reply.code(400).send({ success: false, error: 'SSO Account ID and Role Name are required.' });
    }

    const oidcClient = new SSOOIDCClient({ region });

    // Register a public client (no admin needed)
    const registerResp = await oidcClient.send(new RegisterClientCommand({
      clientName: `valuestream-${role}`,
      clientType: 'public',
    }));

    if (!registerResp.clientId || !registerResp.clientSecret) {
      return reply.code(500).send({ success: false, error: 'Failed to register SSO OIDC client' });
    }

    // Start device authorization
    const deviceResp = await oidcClient.send(new StartDeviceAuthorizationCommand({
      clientId: registerResp.clientId,
      clientSecret: registerResp.clientSecret,
      startUrl,
    }));

    if (!deviceResp.deviceCode || !deviceResp.verificationUriComplete) {
      return reply.code(500).send({ success: false, error: 'Failed to start device authorization' });
    }

    // Store session for polling
    const sessionId = crypto.randomUUID();
    fastify.log.info(`[AWS SSO] Created persistence device session ${sessionId} for ${role}`);
    deviceSessions.set(sessionId, {
      clientId: registerResp.clientId,
      clientSecret: registerResp.clientSecret,
      deviceCode: deviceResp.deviceCode,
      region,
      accountId,
      roleName,
      role,
      expiresAt: Date.now() + (deviceResp.expiresIn || 600) * 1000,
    });

    // Build a user-friendly message with the URL (backward compatible with existing UI)
    const url = deviceResp.verificationUriComplete;
    const code = deviceResp.userCode || '';
    const message = `SSO authorization started.\n\nOpen this URL to authorize:\n${url}\n\nUser code: ${code}`;

    return reply.send({
      success: true,
      message,
      session_id: sessionId,
      verification_url: url,
      user_code: code,
      expires_in: deviceResp.expiresIn,
    });
  });

  /**
   * POST /api/aws/sso/poll
   * Poll for token completion. Returns AWS credentials on success.
   */
  fastify.post<{ Body: SsoPollBodyType }>('/api/aws/sso/poll', { schema: { body: SsoPollBody } }, async (request, reply) => {
    const { session_id } = request.body;
    const session = deviceSessions.get(session_id);

    if (!session) {
      fastify.log.warn(`[AWS SSO] Poll for unknown persistence session ${session_id}, active: ${deviceSessions.size}`);
      return reply.code(404).send({ success: false, error: 'Session expired or not found' });
    }

    if (session.expiresAt < Date.now()) {
      deviceSessions.delete(session_id);
      return reply.code(410).send({ success: false, error: 'Session expired' });
    }

    const oidcClient = new SSOOIDCClient({ region: session.region });

    // Try to create token
    let tokenResp;
    try {
      tokenResp = await oidcClient.send(new CreateTokenCommand({
        clientId: session.clientId,
        clientSecret: session.clientSecret,
        grantType: 'urn:ietf:params:oauth:grant-type:device_code',
        deviceCode: session.deviceCode,
      }));
    } catch (e: any) {
      if (e.name === 'AuthorizationPendingException') {
        return reply.send({ success: false, pending: true });
      }
      if (e.name === 'SlowDownException') {
        return reply.send({ success: false, pending: true, slow_down: true });
      }
      if (e.name === 'ExpiredTokenException') {
        deviceSessions.delete(session_id);
        return reply.code(410).send({ success: false, error: 'Device authorization expired' });
      }
      return reply.code(500).send({ success: false, error: `SSO token error: ${e.message}` });
    }

    if (!tokenResp.accessToken) {
      return reply.code(500).send({ success: false, error: 'No access token received' });
    }

    // Get role credentials
    const ssoClient = new SSOClient({ region: session.region });
    const credsResp = await ssoClient.send(new GetRoleCredentialsCommand({
      accountId: session.accountId,
      roleName: session.roleName,
      accessToken: tokenResp.accessToken,
    }));

    const roleCreds = credsResp.roleCredentials;
    if (!roleCreds?.accessKeyId || !roleCreds?.secretAccessKey) {
      return reply.code(500).send({ success: false, error: 'Failed to get role credentials' });
    }

    // Clean up session
    deviceSessions.delete(session_id);

    // Save credentials directly to server settings so the backend can connect.
    // This bypasses role checks — any authenticated user who completes the SSO
    // flow should be able to provide credentials for the shared DB connection.
    try {
      const currentSettings = await fastify.getSettings();
      const dbRole = session.role as 'app' | 'customer';
      const mongoAuth = currentSettings.persistence?.mongo?.[dbRole]?.auth || {};
      const updatedSettings = {
        ...currentSettings,
        persistence: {
          ...currentSettings.persistence,
          mongo: {
            ...currentSettings.persistence?.mongo,
            [dbRole]: {
              ...currentSettings.persistence?.mongo?.[dbRole],
              auth: {
                ...mongoAuth,
                sso: {
                  ...mongoAuth.sso,
                  aws_access_key: roleCreds.accessKeyId,
                  aws_secret_key: roleCreds.secretAccessKey,
                  aws_session_token: roleCreds.sessionToken || '',
                }
              }
            }
          }
        }
      };
      await fastify.saveSettings(updatedSettings);
      fastify.log.info(`[AWS SSO] Saved credentials to server settings for ${dbRole}`);
    } catch (e: any) {
      fastify.log.warn(`[AWS SSO] Could not save credentials to server settings: ${e.message}`);
    }

    // Evict cached MongoClients so the next connection uses the new creds
    evictSsoClients(session.role);

    fastify.log.info(`[AWS SSO] Persistence device flow completed for ${session.role}, credentials obtained`);

    return reply.send({
      success: true,
      credentials: {
        access_key: roleCreds.accessKeyId,
        secret_key: roleCreds.secretAccessKey,
        session_token: roleCreds.sessionToken || '',
      },
    });
  });
};
