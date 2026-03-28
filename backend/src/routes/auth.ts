import { FastifyPluginAsync } from 'fastify';
import { LoginBody, LoginBodyType } from './schemas';
import { AppError } from '../utils/errors';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: LoginBodyType }>('/api/auth/login', { schema: { body: LoginBody } }, async (request, reply) => {
    const { password } = request.body;
    const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;

    if (password === ADMIN_SECRET) {
      return reply.send({ success: true });
    }
    throw new AppError('Invalid password', 401);
  });
};
