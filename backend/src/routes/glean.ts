import { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { 
  getGleanSettings, 
  saveGleanSettings, 
  refreshGleanToken, 
  gleanChatRequest, 
  GleanTokenResponse 
} from '../utils/gleanHelpers';

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
  app.post('/api/glean/auth/init', async (req: FastifyRequest<{ Body: { gleanUrl: string } }>, reply) => {
    const { gleanUrl } = req.body;
    if (!gleanUrl) {
      return reply.status(400).send({ error: 'gleanUrl is required' });
    }

    try {
      const normalizedUrl = gleanUrl.replace(/\/$/, '');
      
      // Discovery
      const resourceRes = await fetch(`${normalizedUrl}/.well-known/oauth-protected-resource`);
      if (!resourceRes.ok) throw new Error(`Failed to fetch oauth-protected-resource from ${normalizedUrl}`);
      const resourceData = await resourceRes.json() as { authorization_servers?: string[] };
      const authServerUrl = resourceData.authorization_servers?.[0];
      if (!authServerUrl) throw new Error('No authorization server found');

      const discoveryRes = await fetch(`${authServerUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server/oauth`);
      if (!discoveryRes.ok) throw new Error('Failed to fetch oauth-authorization-server');
      const discoveryData = await discoveryRes.json() as { 
        authorization_endpoint: string; 
        token_endpoint: string; 
        registration_endpoint: string;
      };

      // Dynamic Client Registration (DCR)
      const gleanState = getGleanSettings();
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
          const err = await registrationRes.text();
          throw new Error(`Registration failed: ${err}`);
        }

        const registrationData = await registrationRes.json() as GleanClientCredentials;
        client = {
          ...registrationData,
          registration_endpoint: discoveryData.registration_endpoint,
          token_endpoint: discoveryData.token_endpoint,
          authorization_endpoint: discoveryData.authorization_endpoint
        };
        gleanState.clients[normalizedUrl] = client;
        saveGleanSettings(gleanState);
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

    if (error) {
      return reply.redirect(`/support?glean_error=${encodeURIComponent(error)}`);
    }

    const pkce = pkceStore[state];
    if (!pkce) {
      return reply.redirect(`/support?glean_error=invalid_state`);
    }
    delete pkceStore[state];

    const gleanState = getGleanSettings();
    const client = gleanState.clients[pkce.gleanUrl];
    if (!client) {
      return reply.redirect(`/support?glean_error=client_missing`);
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
        const err = await tokenRes.text();
        throw new Error(`Token exchange failed: ${err}`);
      }

      const tokenData = await tokenRes.json() as GleanTokenResponse;
      
      gleanState.tokens[pkce.gleanUrl] = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
        client_id: client.client_id,
        client_secret: client.client_secret,
        token_endpoint: client.token_endpoint
      };
      saveGleanSettings(gleanState);

      // Redirect back to support page - the frontend will check status
      return reply.redirect('/support?glean_auth=success');
    } catch (err: any) {
      app.log.error(err);
      return reply.redirect(`/support?glean_error=${encodeURIComponent(err.message)}`);
    }
  });

  // 3. Status Check
  app.get('/api/glean/status', async (req: FastifyRequest<{ Querystring: { gleanUrl: string } }>, reply) => {
    const { gleanUrl } = req.query;
    if (!gleanUrl) return { authenticated: false };

    const normalizedUrl = gleanUrl.replace(/\/$/, '');
    const gleanState = getGleanSettings();
    const token = gleanState.tokens[normalizedUrl];
    
    if (!token) return { authenticated: false };
    
    // If expired but has refresh token, we'll refresh on next chat attempt or here
    if (Date.now() > token.expires_at && !token.refresh_token) {
      delete gleanState.tokens[normalizedUrl];
      saveGleanSettings(gleanState);
      return { authenticated: false };
    }

    return { authenticated: true };
  });

  // 4. Chat Proxy
  app.post('/api/glean/chat', async (req: FastifyRequest<{ Body: { gleanUrl: string; messages: any[]; stream?: boolean } }>, reply) => {
    const { gleanUrl, messages, stream } = req.body;
    if (!gleanUrl) return reply.status(400).send({ error: 'gleanUrl is required' });

    const normalizedUrl = gleanUrl.replace(/\/$/, '');
    const gleanState = getGleanSettings();
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
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
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

      const data = await chatRes.json();
      return data;
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
  });
}
