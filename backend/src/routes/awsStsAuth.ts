import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getDb } from '../utils/mongoServer';
import { augmentConfig } from '../utils/configHelpers';
import { AppError } from '../utils/errors';
import { upsertExternalUser, signToken } from '../services/userService';
import type { UserRole } from '@valuestream/shared-types';

// ── Schemas ─────────────────────────────────────────────────────

const AwsStsVerifyBody = Type.Object({
  url: Type.String(),
  method: Type.Optional(Type.String()),
  headers: Type.Record(Type.String(), Type.String()),
  body: Type.String(),
});
type AwsStsVerifyBodyType = Static<typeof AwsStsVerifyBody>;

// ── Helpers ─────────────────────────────────────────────────────

async function getAppDb(fastify: any) {
  const settings = await fastify.getSettings();
  if (!settings.persistence?.mongo?.app?.uri) {
    throw new AppError('App database is not configured.', 500);
  }
  return getDb(augmentConfig(settings, 'app'), 'app', true);
}

/** Extract username/display from an assumed-role ARN's session name (same as aws-sso flow) */
function extractIdentityFromArn(arn: string): { username: string; displayName: string; roleName: string; account: string } {
  // Expected: arn:aws:sts::<account>:assumed-role/<role>/<session>
  const parts = arn.split(':');
  const account = parts[4] || '';
  const resource = parts.slice(5).join(':');
  const resParts = resource.split('/');
  const roleName = resParts[1] || '';
  const sessionName = resParts[resParts.length - 1] || 'unknown';
  return {
    username: sessionName,
    displayName: sessionName.includes('@') ? sessionName.split('@')[0] : sessionName,
    roleName,
    account,
  };
}

/**
 * For IAM Identity Center (SSO) sessions, STS returns the assumed role as
 * `AWSReservedSSO_<PermissionSetName>_<16-hex-hash>`. Extract the permission
 * set name so admins can configure `role_name` using the Identity Center
 * console name (e.g. "CustomPowerUserAccess") rather than the wrapped form.
 * Returns null for non-SSO role names.
 */
function extractSsoPermissionSetName(roleName: string): string | null {
  // Greedy .+ with trailing 16-hex anchor handles permission set names
  // that themselves contain underscores (e.g. "Custom_Power_User_Access").
  const m = /^AWSReservedSSO_(.+)_([0-9a-f]{16})$/i.exec(roleName);
  return m ? m[1] : null;
}

/** Parse the STS GetCallerIdentity XML response */
function parseStsResponse(xml: string): { arn?: string; account?: string; userId?: string } {
  const arn = /<Arn>([^<]+)<\/Arn>/.exec(xml)?.[1];
  const account = /<Account>([^<]+)<\/Account>/.exec(xml)?.[1];
  const userId = /<UserId>([^<]+)<\/UserId>/.exec(xml)?.[1];
  return { arn, account, userId };
}

/** Parse the ISO basic format "YYYYMMDDTHHmmssZ" used by X-Amz-Date */
function parseAmzDate(amzDate: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(amzDate);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

/** Load the raw helper script and substitute backend-configured defaults */
function loadHelperScript(defaultProfile: string, defaultRegion: string): string {
  // Script lives at <repo-root>/scripts/sts-sign.py
  // Both dev (tsx) and prod (dist) have backend/ as the parent; resolve from CWD or module
  const candidates = [
    resolve(__dirname, '../../../scripts/sts-sign.py'),      // backend/src/routes → repo root
    resolve(__dirname, '../../../../scripts/sts-sign.py'),   // backend/dist/routes → repo root
    resolve(process.cwd(), 'scripts/sts-sign.py'),
    resolve(process.cwd(), '../scripts/sts-sign.py'),
  ];
  let raw: string | null = null;
  for (const c of candidates) {
    try {
      raw = readFileSync(c, 'utf-8');
      break;
    } catch { /* try next */ }
  }
  if (!raw) {
    throw new AppError('Helper script not found on server', 500);
  }
  return raw
    .replaceAll('{{DEFAULT_PROFILE}}', defaultProfile || '')
    .replaceAll('{{DEFAULT_REGION}}', defaultRegion || 'us-east-1');
}

// ── Routes ──────────────────────────────────────────────────────

export const awsStsAuthRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * GET /api/auth/aws-sts/helper-script
   * Serves the Python helper script with baked-in default profile and region.
   */
  fastify.get('/api/auth/aws-sts/helper-script', async (_request, reply) => {
    const settings = await fastify.getSettings();
    const stsConfig = settings.auth?.aws_sts;
    const defaultProfile = stsConfig?.default_profile || '';
    const defaultRegion = stsConfig?.region || 'us-east-1';
    const script = loadHelperScript(defaultProfile, defaultRegion);
    reply
      .header('Content-Type', 'text/x-python; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="sts-sign.py"');
    return reply.send(script);
  });

  /**
   * POST /api/auth/aws-sts/verify
   * Accepts an uploaded pre-signed STS request, forwards it to STS, and
   * issues a JWT if the returned ARN matches the configured role.
   */
  fastify.post<{ Body: AwsStsVerifyBodyType }>(
    '/api/auth/aws-sts/verify',
    { schema: { body: AwsStsVerifyBody } },
    async (request, reply) => {
      const settings = await fastify.getSettings();
      const stsConfig = settings.auth?.aws_sts;

      if (!stsConfig?.region || !stsConfig?.account_id || !stsConfig?.role_name) {
        throw new AppError('AWS STS auth is not configured', 400);
      }

      const { url, headers, body } = request.body;
      const method = request.body.method || 'POST';

      // Validate URL host to prevent SSRF
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        throw new AppError('Invalid request URL', 400);
      }
      const expectedHost = `sts.${stsConfig.region}.amazonaws.com`;
      const globalHost = 'sts.amazonaws.com';
      if (parsedUrl.protocol !== 'https:' || (parsedUrl.hostname !== expectedHost && parsedUrl.hostname !== globalHost)) {
        throw new AppError(`URL must point to ${expectedHost}`, 400);
      }

      // Validate X-Amz-Date freshness
      const amzDateHeader = headers['X-Amz-Date'] || headers['x-amz-date'];
      if (!amzDateHeader) {
        throw new AppError('Missing X-Amz-Date header in signed request', 400);
      }
      const signedAt = parseAmzDate(amzDateHeader);
      if (!signedAt) {
        throw new AppError('Malformed X-Amz-Date header', 400);
      }
      const maxAge = stsConfig.max_request_age_seconds ?? 300;
      const ageSeconds = (Date.now() - signedAt.getTime()) / 1000;
      if (ageSeconds < -60 || ageSeconds > maxAge) {
        throw new AppError(`Signed request is outside the allowed time window (age: ${Math.round(ageSeconds)}s, max: ${maxAge}s)`, 400);
      }

      // Forward the signed request verbatim to STS
      let stsResponse: Response;
      try {
        stsResponse = await fetch(url, {
          method,
          headers,
          body,
        });
      } catch (e: any) {
        throw new AppError(`Failed to reach STS: ${e.message}`, 502);
      }

      const responseText = await stsResponse.text();

      if (!stsResponse.ok) {
        // STS returns 403 with an XML error body for invalid signatures / expired tokens
        const errorMatch = /<Message>([^<]+)<\/Message>/.exec(responseText)?.[1] || 'Signature validation failed';
        fastify.log.warn(`[AWS STS] Verification rejected by STS (${stsResponse.status}): ${errorMatch}`);
        throw new AppError(`STS rejected signed request: ${errorMatch}`, 401);
      }

      const { arn, account } = parseStsResponse(responseText);
      if (!arn) {
        throw new AppError('Could not parse caller identity from STS response', 502);
      }

      const identity = extractIdentityFromArn(arn);

      // Enforce configured account and role
      if (identity.account !== stsConfig.account_id || account !== stsConfig.account_id) {
        throw new AppError(`Account ${identity.account} is not authorized (expected ${stsConfig.account_id})`, 403);
      }
      const permissionSet = extractSsoPermissionSetName(identity.roleName);
      const roleMatches =
        identity.roleName === stsConfig.role_name ||
        permissionSet === stsConfig.role_name;
      if (!roleMatches) {
        const actual = permissionSet
          ? `${identity.roleName} (permission set: ${permissionSet})`
          : identity.roleName;
        throw new AppError(`Role ${actual} is not authorized (expected ${stsConfig.role_name})`, 403);
      }

      const configuredRole: UserRole = settings.auth?.default_role || 'viewer';
      const expiry: number = settings.auth?.session_expiry_hours || 24;

      let userRole = configuredRole;
      let userId = identity.username;
      try {
        const db = await getAppDb(fastify);
        const user = await upsertExternalUser(db, identity.username, identity.displayName, 'aws-sts', configuredRole);
        userRole = user.role;
        userId = user.id;
      } catch (dbErr) {
        fastify.log.warn(`[AWS STS] Could not persist user to DB (will use identity from STS): ${(dbErr as Error).message}`);
      }

      const jwt = signToken({ userId, username: identity.username, role: userRole }, expiry);

      return reply.send({
        success: true,
        token: jwt,
        user: { username: identity.username, role: userRole, display_name: identity.displayName },
        aws_identity: { arn, account: identity.account, role: identity.roleName },
      });
    }
  );
};
