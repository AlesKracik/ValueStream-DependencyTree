import { FastifyPluginAsync } from 'fastify';
import { LoginBody, LoginBodyType } from './schemas';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: LoginBodyType }>('/api/auth/login', { schema: { body: LoginBody } }, async (request, reply) => {
    try {
      const { password } = request.body;
      const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;

      if (password === ADMIN_SECRET) {
        return reply.send({ success: true });
      } else {
        return reply.code(401).send({ success: false, error: 'Invalid password' });
      }
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });
};
