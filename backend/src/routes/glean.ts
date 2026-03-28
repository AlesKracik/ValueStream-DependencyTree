import { FastifyInstance } from 'fastify';
import { gleanAuthRoutes } from './gleanAuth';
import { gleanChatRoutes } from './gleanChat';

export async function gleanRoutes(app: FastifyInstance) {
  await app.register(gleanAuthRoutes);
  await app.register(gleanChatRoutes);
}
