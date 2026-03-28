import { FastifyInstance } from 'fastify';
import {
  getGleanSettings,
  refreshGleanToken,
  gleanChatRequest
} from '../utils/gleanHelpers';
import { GleanChatBody, GleanChatBodyType } from './schemas';

export async function gleanChatRoutes(app: FastifyInstance) {

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
