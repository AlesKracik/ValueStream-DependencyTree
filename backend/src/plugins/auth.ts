import fp from 'fastify-plugin';
import { FastifyRequest, FastifyReply } from 'fastify';
import { checkAuth } from '../utils/authServer';

export default fp(async (fastify) => {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
    
    // The Vite middleware checked all requests. We pass the URL and headers to the existing logic.
    const authResult = checkAuth(request.url, request.headers as Record<string, string | string[] | undefined>, ADMIN_SECRET);

    // If checkAuth generated a direct response (e.g., for /api/auth/status)
    if (authResult.response) {
      reply.code(authResult.statusCode || 200).send(authResult.response);
      return reply; // Stop request lifecycle and send immediately
    }
    
    // If not authorized
    if (!authResult.authorized) {
      reply.code(401).send({ success: false, error: 'Unauthorized' });
      return reply;
    }
    
    // Otherwise, continue to route handler
  });
});
