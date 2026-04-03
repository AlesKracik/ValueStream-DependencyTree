import { FastifyPluginAsync } from 'fastify';
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
import {
  STSClient,
  GetCallerIdentityCommand,
} from '@aws-sdk/client-sts';
import { Type, Static } from '@sinclair/typebox';
import { getDb } from '../utils/mongoServer';
import { augmentConfig } from '../utils/configHelpers';
import { AppError } from '../utils/errors';
import { upsertExternalUser, signToken } from '../services/userService';
import type { UserRole } from '@valuestream/shared-types';

// ── Schemas ─────────────────────────────────────────────────────

const AwsSsoPollBody = Type.Object({
  session_id: Type.String(),
});
type AwsSsoPollBodyType = Static<typeof AwsSsoPollBody>;

// ── In-memory session store for device auth flows ───────────────

interface DeviceSession {
  clientId: string;
  clientSecret: string;
  deviceCode: string;
  region: string;
  accountId: string;
  roleName: string;
  expiresAt: number;
}

const deviceSessions = new Map<string, DeviceSession>();

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of deviceSessions) {
    if (session.expiresAt < now) deviceSessions.delete(id);
  }
}, 60_000);

// ── Helpers ─────────────────────────────────────────────────────

async function getAppDb(fastify: any) {
  const settings = await fastify.getSettings();
  if (!settings.persistence?.mongo?.app?.uri) {
    throw new AppError('App database is not configured.', 500);
  }
  return getDb(augmentConfig(settings, 'app'), 'app', true);
}

/** Extract username/email from an STS ARN like arn:aws:sts::123:assumed-role/RoleName/user@email.com */
function extractIdentityFromArn(arn: string): { username: string; displayName: string } {
  // assumed-role ARN format: arn:aws:sts::<account>:assumed-role/<role>/<session-name>
  const parts = arn.split('/');
  const sessionName = parts[parts.length - 1] || 'unknown';
  // Session name is typically the email or username from the IdP
  return {
    username: sessionName,
    displayName: sessionName.includes('@') ? sessionName.split('@')[0] : sessionName,
  };
}

// ── Routes ──────────────────────────────────────────────────────

export const awsAuthRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * POST /api/auth/aws-sso/start
   * Initiates the device authorization flow. Returns a verification URL for the user.
   */
  fastify.post('/api/auth/aws-sso/start', async (_request, reply) => {
    const settings = await fastify.getSettings();
    const ssoConfig = settings.auth?.aws_sso;

    if (!ssoConfig?.start_url || !ssoConfig?.region) {
      throw new AppError('AWS SSO is not configured in auth settings', 400);
    }

    const oidcClient = new SSOOIDCClient({ region: ssoConfig.region });

    // Step 1: Register a public client (no admin needed)
    const registerResp = await oidcClient.send(new RegisterClientCommand({
      clientName: 'valuestream-auth',
      clientType: 'public',
    }));

    if (!registerResp.clientId || !registerResp.clientSecret) {
      throw new AppError('Failed to register SSO OIDC client', 500);
    }

    // Step 2: Start device authorization
    const deviceResp = await oidcClient.send(new StartDeviceAuthorizationCommand({
      clientId: registerResp.clientId,
      clientSecret: registerResp.clientSecret,
      startUrl: ssoConfig.start_url,
    }));

    if (!deviceResp.deviceCode || !deviceResp.verificationUriComplete) {
      throw new AppError('Failed to start device authorization', 500);
    }

    // Store session for polling
    const sessionId = crypto.randomUUID();
    fastify.log.info(`[AWS SSO] Created device session ${sessionId}, active sessions: ${deviceSessions.size + 1}`);
    deviceSessions.set(sessionId, {
      clientId: registerResp.clientId,
      clientSecret: registerResp.clientSecret,
      deviceCode: deviceResp.deviceCode,
      region: ssoConfig.region,
      accountId: ssoConfig.account_id,
      roleName: ssoConfig.role_name,
      expiresAt: Date.now() + (deviceResp.expiresIn || 600) * 1000,
    });

    return reply.send({
      success: true,
      session_id: sessionId,
      verification_url: deviceResp.verificationUriComplete,
      user_code: deviceResp.userCode,
      expires_in: deviceResp.expiresIn,
      interval: deviceResp.interval || 5,
    });
  });

  /**
   * POST /api/auth/aws-sso/poll
   * Poll for token after user has authorized the device. Returns JWT on success.
   */
  fastify.post<{ Body: AwsSsoPollBodyType }>(
    '/api/auth/aws-sso/poll',
    { schema: { body: AwsSsoPollBody } },
    async (request, reply) => {
      const { session_id } = request.body;
      const session = deviceSessions.get(session_id);

      if (!session) {
        fastify.log.warn(`[AWS SSO] Poll for unknown session ${session_id}, active sessions: ${deviceSessions.size}`);
        throw new AppError('Session expired or not found', 404);
      }

      if (session.expiresAt < Date.now()) {
        deviceSessions.delete(session_id);
        throw new AppError('Session expired', 410);
      }

      const oidcClient = new SSOOIDCClient({ region: session.region });

      // Step 3: Try to create token (will throw AuthorizationPendingException if user hasn't approved yet)
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
          throw new AppError('Device authorization expired', 410);
        }
        throw new AppError(`SSO token error: ${e.message}`, 500);
      }

      if (!tokenResp.accessToken) {
        throw new AppError('No access token received', 500);
      }

      // Step 4: Get role credentials
      const ssoClient = new SSOClient({ region: session.region });
      const credsResp = await ssoClient.send(new GetRoleCredentialsCommand({
        accountId: session.accountId,
        roleName: session.roleName,
        accessToken: tokenResp.accessToken,
      }));

      const roleCreds = credsResp.roleCredentials;
      if (!roleCreds?.accessKeyId || !roleCreds?.secretAccessKey) {
        throw new AppError('Failed to get role credentials', 500);
      }

      // Step 5: Get caller identity to extract the user
      const stsClient = new STSClient({
        region: session.region,
        credentials: {
          accessKeyId: roleCreds.accessKeyId,
          secretAccessKey: roleCreds.secretAccessKey,
          sessionToken: roleCreds.sessionToken || undefined,
        },
      });

      const identity = await stsClient.send(new GetCallerIdentityCommand({}));
      if (!identity.Arn) {
        throw new AppError('Could not determine user identity', 500);
      }

      // Clean up session
      deviceSessions.delete(session_id);

      // Extract identity and create/update local user
      const { username, displayName } = extractIdentityFromArn(identity.Arn);

      const settings = await fastify.getSettings();
      const configuredRole: UserRole = settings.auth?.default_role || 'viewer';
      const expiry: number = settings.auth?.session_expiry_hours || 24;

      // Try to persist user to DB; if DB is unavailable, issue JWT from identity alone
      // Bootstrap: if no users exist yet (or DB unreachable), grant admin
      let userRole = configuredRole;
      let userId = username;
      try {
        const db = await getAppDb(fastify);
        const user = await upsertExternalUser(db, username, displayName, 'aws-sso', configuredRole);
        userRole = user.role;
        userId = user.id;
      } catch (dbErr) {
        fastify.log.warn(`[AWS SSO] Could not persist user to DB (will use identity from STS): ${(dbErr as Error).message}`);
      }

      const jwt = signToken({ userId, username, role: userRole }, expiry);

      return reply.send({
        success: true,
        token: jwt,
        user: { username, role: userRole, display_name: displayName },
        aws_identity: { arn: identity.Arn, account: identity.Account },
      });
    }
  );
};
