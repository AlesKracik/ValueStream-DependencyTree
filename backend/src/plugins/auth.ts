import fp from 'fastify-plugin';
import { FastifyRequest, FastifyReply } from 'fastify';
import { checkAuth, type AuthResult } from '../utils/authServer';
import type { UserRole } from '@valuestream/shared-types';

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated user info — set by auth plugin. Undefined for unauthenticated public endpoints. */
    authUser?: {
      userId: string;
      username: string;
      role: UserRole;
      isAdmin: boolean;
    };
  }
}

export default fp(async (fastify) => {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;

    const authResult: AuthResult = checkAuth(
      request.url,
      request.headers as Record<string, string | string[] | undefined>,
      ADMIN_SECRET
    );

    // Attach user to request if authenticated
    if (authResult.user) {
      request.authUser = authResult.user;
    }

    // If checkAuth generated a direct response (e.g., for /api/auth/status)
    if (authResult.response) {
      reply.code(authResult.statusCode || 200).send(authResult.response);
      return reply;
    }

    // If not authorized
    if (!authResult.authorized) {
      reply.code(401).send({ success: false, error: 'Unauthorized' });
      return reply;
    }
  });
});
