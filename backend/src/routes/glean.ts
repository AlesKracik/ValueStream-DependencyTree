import { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import {
  getGleanSettings,
  saveGleanSettings,
  refreshGleanToken,
  gleanChatRequest,
  GleanTokenResponse
} from '../utils/gleanHelpers';
import {
  GleanAuthInitBody, GleanAuthInitBodyType,
  GleanChatBody, GleanChatBodyType
} from './schemas';

interface GleanClientCredentials {
  client_id: string;
  client_secret: string;
  registration_client_uri?: string;
  registration_access_token?: string;
}

// Memory storage for PKCE verifiers (short-lived)
const pkceStore: Record<string, { verifier: string; gleanUrl: string }> = {};

export async function gleanRoutes(app: FastifyInstance) {
  
  // 1. Start OAuth Flow
  app.post<{ Body: GleanAuthInitBodyType }>('/api/glean/auth/init', { schema: { body: GleanAuthInitBody } }, async (req, reply) => {
    const { gleanUrl } = req.body;
    if (!gleanUrl) {
      return reply.status(400).send({ error: 'gleanUrl is required' });
    }

    try {
      const normalizedUrl = gleanUrl.replace(/\/$/, '');
      app.log.info(`Initializing Glean auth for ${normalizedUrl}`);
      
      // Discovery
      const resourceRes = await fetch(`${normalizedUrl}/.well-known/oauth-protected-resource`);
      if (!resourceRes.ok) throw new Error(`Failed to fetch oauth-protected-resource from ${normalizedUrl}: ${resourceRes.status} ${resourceRes.statusText}`);
      
      let resourceData: { authorization_servers?: string[] };
      try {
        resourceData = await resourceRes.json() as any;
      } catch (e) {
        const text = await resourceRes.text().catch(() => 'unavailable');
        app.log.error(`Failed to parse oauth-protected-resource from ${normalizedUrl}. Response: ${text.substring(0, 500)}`);
        throw new Error(`Glean discovery failed: expected JSON but received ${resourceRes.headers.get('content-type')}`);
      }
      
      const authServerUrl = resourceData.authorization_servers?.[0];
      if (!authServerUrl) throw new Error('No authorization server found in discovery data');

      const authServerBase = authServerUrl.replace(/\/$/, '');
      const discoveryBases = [
        authServerBase,
        normalizedUrl
      ];
      const discoveryPaths = [
        '/.well-known/oauth-authorization-server',
        '/.well-known/openid-configuration'
      ];

      let discoveryRes: any;
      let discoveryUrl = '';
      
      // Try combinations of bases and paths
      for (const base of discoveryBases) {
        for (const path of discoveryPaths) {
          discoveryUrl = `${base}${path}`;
          app.log.info(`Trying discovery at ${discoveryUrl}`);
          try {
            const res = await fetch(discoveryUrl);
            if (res.ok) {
              const contentType = res.headers.get('content-type') || '';
              if (contentType.includes('application/json')) {
                discoveryRes = res;
                break;
              }
              app.log.warn(`Discovery at ${discoveryUrl} returned success but wrong content-type: ${contentType}`);
            } else {
              app.log.warn(`Discovery at ${discoveryUrl} returned ${res.status} ${res.statusText}`);
            }
          } catch (e: any) {
            app.log.warn(`Discovery at ${discoveryUrl} failed: ${e.message}`);
          }
        }
        if (discoveryRes) break;
      }

      if (!discoveryRes) {
        throw new Error(`Glean discovery failed: No valid JSON metadata found at ${authServerBase} or ${normalizedUrl}`);
      }
      
      let discoveryData: { 
        authorization_endpoint: string; 
        token_endpoint: string; 
        registration_endpoint: string;
      };
      try {
        discoveryData = await discoveryRes.json() as any;
      } catch (e) {
        const text = await discoveryRes.text().catch(() => 'unavailable');
        app.log.error(`Failed to parse discovery response from ${discoveryUrl}. Response: ${text.substring(0, 500)}`);
        throw new Error(`Glean discovery failed at ${discoveryUrl}: expected JSON but received ${discoveryRes.headers.get('content-type')}`);
      }

      // Dynamic Client Registration (DCR)
      const gleanState = await getGleanSettings();
      let client = gleanState.clients[normalizedUrl];
      if (!client) {
        const redirectBase = process.env.GLEAN_REDIRECT_BASE_URL || 'http://localhost:4000';
        const registrationRes = await fetch(discoveryData.registration_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'ValueStream DependencyTree',
            redirect_uris: [`${redirectBase}/api/glean/auth/callback`],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code']
          })
        });

        if (!registrationRes.ok) {
          const err = await registrationRes.text().catch(() => 'unknown error');
          throw new Error(`Registration failed: ${registrationRes.status} ${registrationRes.statusText} - ${err}`);
        }

        let registrationData: GleanClientCredentials;
        try {
          registrationData = await registrationRes.json() as any;
        } catch (e) {
          const text = await registrationRes.text().catch(() => 'unavailable');
          app.log.error(`Failed to parse registration response from ${discoveryData.registration_endpoint}. Response: ${text.substring(0, 500)}`);
          throw new Error(`Registration failed: expected JSON but received ${registrationRes.headers.get('content-type')}`);
        }
        client = {
          ...registrationData,
          registration_endpoint: discoveryData.registration_endpoint,
          token_endpoint: discoveryData.token_endpoint,
          authorization_endpoint: discoveryData.authorization_endpoint
        };
        gleanState.clients[normalizedUrl] = client;
        await saveGleanSettings(gleanState);
      }

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
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
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

  // 4. Chat Proxy
  app.post<{ Body: GleanChatBodyType }>('/api/glean/chat', { schema: { body: GleanChatBody } }, async (req, reply) => {
    const { gleanUrl, messages, stream } = req.body;
    if (!gleanUrl) return reply.status(400).send({ error: 'gleanUrl is required' });

    const normalizedUrl = gleanUrl.replace(/\/$/, '');
    const gleanState = await getGleanSettings();
    let token = gleanState.tokens[normalizedUrl];

    if (!token) {
      return reply.status(401).send({ error: 'Glean not authenticated' });
    }

    // Refresh if needed
    if (Date.now() > token.expires_at - 60000) { // 1 min buffer
      try {
        token = await refreshGleanToken(normalizedUrl, token, gleanState);
      } catch (err: any) {
        app.log.error(err);
        return reply.status(401).send({ error: err.message });
      }
    }

    try {
      const chatRes = await gleanChatRequest(normalizedUrl, token.access_token, messages, !!stream);
      
      if (stream && chatRes.body) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Content-Type-Options': 'nosniff',
          'X-Accel-Buffering': 'no'
        });
        
        const reader = chatRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(value);
        }
        reply.raw.end();
        return reply;
      }

      let data: any;
      try {
        data = await chatRes.json();
      } catch (e) {
        const text = await chatRes.text().catch(() => 'unavailable');
        app.log.error(`Failed to parse chat response from ${normalizedUrl}. Response: ${text.substring(0, 500)}`);
        throw new Error(`Glean chat failed: expected JSON but received ${chatRes.headers.get('content-type')}`);
      }
      return data;
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
  });
}
