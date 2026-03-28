import { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import {
  getGleanSettings,
  saveGleanSettings,
  GleanTokenResponse
} from '../utils/gleanHelpers';
import { GleanAuthInitBody, GleanAuthInitBodyType } from './schemas';
import { fetchAuthServerUrl, discoverAuthMetadata, ensureClient } from './gleanDiscovery';
import { AppError } from '../utils/errors';

// Memory storage for PKCE verifiers (short-lived)
const pkceStore: Record<string, { verifier: string; gleanUrl: string }> = {};

export async function gleanAuthRoutes(app: FastifyInstance) {

  // 1. Start OAuth Flow
  app.post<{ Body: GleanAuthInitBodyType }>('/api/glean/auth/init', { schema: { body: GleanAuthInitBody } }, async (req, reply) => {
    const { gleanUrl } = req.body;
    if (!gleanUrl) {
      throw new AppError('gleanUrl is required', 400);
    }

    const normalizedUrl = gleanUrl.replace(/\/$/, '');
    app.log.info(`Initializing Glean auth for ${normalizedUrl}`);

    const authServerBase = await fetchAuthServerUrl(normalizedUrl, app.log);
    const discoveryData = await discoverAuthMetadata(authServerBase, normalizedUrl, app.log);
    const client = await ensureClient(normalizedUrl, discoveryData, app.log);

    // PKCE
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    pkceStore[state] = { verifier, gleanUrl: normalizedUrl };

    const authUrl = new URL(client.authorization_endpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', client.client_id);
    authUrl.searchParams.set('redirect_uri', `${process.env.GLEAN_REDIRECT_BASE_URL || 'http://localhost:4000'}/api/glean/auth/callback`);
    // LIMIT SCOPES HERE
    authUrl.searchParams.set('scope', 'chat offline_access');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return { authUrl: authUrl.toString() };
  });

  // 2. OAuth Callback
  app.get('/api/glean/auth/callback', async (req: FastifyRequest<{ Querystring: { code: string; state: string; error?: string } }>, reply) => {
    const { code, state, error } = req.query;
    const frontendBase = (process.env.GLEAN_FRONTEND_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');

    if (error) {
      return reply.redirect(`${frontendBase}/support?glean_error=${encodeURIComponent(error)}`);
    }

    const pkce = pkceStore[state];
    if (!pkce) {
      return reply.redirect(`${frontendBase}/support?glean_error=invalid_state`);
    }
    delete pkceStore[state];

    const gleanState = await getGleanSettings();
    const client = gleanState.clients[pkce.gleanUrl];
    if (!client) {
      return reply.redirect(`${frontendBase}/support?glean_error=client_missing`);
    }

    try {
      const redirectBase = process.env.GLEAN_REDIRECT_BASE_URL || 'http://localhost:4000';
      const tokenRes = await fetch(client.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: client.client_id,
          client_secret: client.client_secret,
          redirect_uri: `${redirectBase}/api/glean/auth/callback`,
          code_verifier: pkce.verifier
        })
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text().catch(() => 'unknown error');
        throw new Error(`Token exchange failed: ${tokenRes.status} ${tokenRes.statusText} - ${err}`);
      }

      let tokenData: GleanTokenResponse;
      try {
        tokenData = await tokenRes.json() as any;
      } catch (e) {
        const text = await tokenRes.text().catch(() => 'unavailable');
        app.log.error(`Failed to parse token response from ${client.token_endpoint}. Response: ${text.substring(0, 500)}`);
        throw new Error(`Token exchange failed: expected JSON but received ${tokenRes.headers.get('content-type')}`);
      }

      gleanState.tokens[pkce.gleanUrl] = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
        client_id: client.client_id,
        client_secret: client.client_secret,
        token_endpoint: client.token_endpoint
      };
      await saveGleanSettings(gleanState);

      // Redirect back to support page - the frontend will check status
      return reply.redirect(`${frontendBase}/support?glean_auth=success`);
    } catch (err: any) {
      app.log.error(err);
      return reply.redirect(`${frontendBase}/support?glean_error=${encodeURIComponent(err.message)}`);
    }
  });

  // 3. Status Check
  app.get('/api/glean/status', async (req: FastifyRequest<{ Querystring: { gleanUrl: string } }>, reply) => {
    const { gleanUrl } = req.query;
    if (!gleanUrl) return { authenticated: false };

    const normalizedUrl = gleanUrl.replace(/\/$/, '');
    const gleanState = await getGleanSettings();
    const token = gleanState.tokens[normalizedUrl];

    if (!token) return { authenticated: false };

    // If expired but has refresh token, we'll refresh on next chat attempt or here
    if (Date.now() > token.expires_at && !token.refresh_token) {
      delete gleanState.tokens[normalizedUrl];
      await saveGleanSettings(gleanState);
      return { authenticated: false };
    }

    return { authenticated: true };
  });
}
