import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { getDb } from '../utils/mongoServer';
import { augmentConfig } from '../utils/configHelpers';
import { AppError } from '../utils/errors';
import { upsertExternalUser, signToken } from '../services/userService';
import type { UserRole } from '@valuestream/shared-types';

// ── In-memory store for PKCE state ─────────────────────────────

interface OktaSession {
  codeVerifier: string;
  state: string;
  expiresAt: number;
}

const oktaSessions = new Map<string, OktaSession>();

// Clean up expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of oktaSessions) {
    if (session.expiresAt < now) oktaSessions.delete(id);
  }
}, 60_000);

// ── Helpers ─────────────────────────────────────────────────────

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function getBackendBase(): string {
  return (process.env.OKTA_REDIRECT_BASE_URL || process.env.GLEAN_REDIRECT_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
}

function getFrontendBase(): string {
  return (process.env.OKTA_FRONTEND_BASE_URL || process.env.GLEAN_FRONTEND_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
}

async function getAppDb(fastify: any) {
  const settings = await fastify.getSettings();
  if (!settings.persistence?.mongo?.app?.uri) {
    throw new AppError('App database is not configured.', 500);
  }
  return getDb(augmentConfig(settings, 'app'), 'app', true);
}

// ── Routes ──────────────────────────────────────────────────────

export const oktaAuthRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * GET /api/auth/okta/login
   * Redirects the user to Okta's authorization endpoint.
   */
  fastify.get('/api/auth/okta/login', async (_request, reply) => {
    const settings = await fastify.getSettings();
    const okta = settings.auth?.okta;

    if (!okta?.issuer || !okta?.client_id) {
      throw new AppError('Okta is not configured in auth settings', 400);
    }

    // Discover endpoints
    const discoveryUrl = `${okta.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const discoveryRes = await fetch(discoveryUrl);
    if (!discoveryRes.ok) {
      throw new AppError(`Failed to fetch Okta OIDC discovery: ${discoveryRes.status}`, 500);
    }
    const discovery = await discoveryRes.json() as { authorization_endpoint: string };

    // Generate PKCE challenge
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = crypto.randomUUID();

    // Store session
    oktaSessions.set(state, {
      codeVerifier,
      state,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    const redirectUri = `${getBackendBase()}/api/auth/okta/callback`;

    const authUrl = new URL(discovery.authorization_endpoint);
    authUrl.searchParams.set('client_id', okta.client_id);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return reply.redirect(authUrl.toString());
  });

  /**
   * GET /api/auth/okta/callback
   * Handles the OAuth2 callback from Okta. Exchanges the auth code for tokens,
   * extracts user identity, creates/updates local user, issues JWT, and redirects
   * back to the frontend.
   */
  fastify.get('/api/auth/okta/callback', async (request, reply) => {
    const { code, state, error, error_description } = request.query as Record<string, string>;

    if (error) {
      const frontendBase = getFrontendBase();
      return reply.redirect(`${frontendBase}/?auth_error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code || !state) {
      throw new AppError('Missing code or state parameter', 400);
    }

    const session = oktaSessions.get(state);
    if (!session) {
      throw new AppError('Invalid or expired state. Please try logging in again.', 400);
    }
    oktaSessions.delete(state);

    const settings = await fastify.getSettings();
    const okta = settings.auth?.okta;

    if (!okta?.issuer || !okta?.client_id) {
      throw new AppError('Okta is not configured', 500);
    }

    // Discover token endpoint
    const discoveryUrl = `${okta.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const discoveryRes = await fetch(discoveryUrl);
    const discovery = await discoveryRes.json() as { token_endpoint: string; userinfo_endpoint: string };

    const redirectUri = `${getBackendBase()}/api/auth/okta/callback`;

    // Exchange code for tokens
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: okta.client_id,
      code_verifier: session.codeVerifier,
    });

    // If client_secret is configured, include it (confidential client)
    if (okta.client_secret) {
      tokenBody.set('client_secret', okta.client_secret);
    }

    const tokenRes = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      fastify.log.error(`Okta token exchange failed: ${errBody}`);
      throw new AppError('Failed to exchange authorization code', 500);
    }

    const tokens = await tokenRes.json() as { id_token?: string; access_token: string };

    // Extract identity from ID token (JWT payload is the second segment)
    let username = '';
    let displayName = '';
    let email = '';

    if (tokens.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString());
        email = payload.email || '';
        username = payload.preferred_username || email || payload.sub || '';
        displayName = payload.name || payload.given_name || username;
      } catch {
        fastify.log.warn('Failed to parse ID token');
      }
    }

    // Fallback: call userinfo endpoint
    if (!username && tokens.access_token) {
      try {
        const userinfoRes = await fetch(discovery.userinfo_endpoint, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (userinfoRes.ok) {
          const userinfo = await userinfoRes.json() as Record<string, string>;
          email = userinfo.email || '';
          username = userinfo.preferred_username || email || userinfo.sub || '';
          displayName = userinfo.name || userinfo.given_name || username;
        }
      } catch {
        fastify.log.warn('Failed to fetch userinfo');
      }
    }

    if (!username) {
      throw new AppError('Could not determine user identity from Okta', 500);
    }

    // Create/update local user
    const db = await getAppDb(fastify);
    const defaultRole: UserRole = settings.auth?.default_role || 'viewer';
    const expiry: number = settings.auth?.session_expiry_hours || 24;

    const user = await upsertExternalUser(db, username, displayName, 'okta', defaultRole);
    const jwt = signToken({ userId: user.id, username: user.username, role: user.role }, expiry);

    // Redirect to frontend with token
    const frontendBase = getFrontendBase();
    return reply.redirect(`${frontendBase}/?auth_token=${encodeURIComponent(jwt)}`);
  });
};
