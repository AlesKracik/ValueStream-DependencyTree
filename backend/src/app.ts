import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { resolve } from 'path';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config({ path: resolve(__dirname, '../.env') });

import mongoPlugin from './plugins/mongo';
import authPlugin from './plugins/auth';

import { authRoutes } from './routes/auth';
import { settingsRoutes } from './routes/settings';
import { dataRoutes } from './routes/data';
import { entityRoutes } from './routes/entity';
import { mongoRoutes } from './routes/mongo';
import { jiraRoutes } from './routes/jira';
import { llmRoutes } from './routes/llm';
import { awsRoutes } from './routes/aws';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    bodyLimit: 10 * 1024 * 1024 // 10MB limit as per previous Vite config
  });

  // Enable CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret']
  });

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok' };
  });

  // Register core plugins
  await app.register(mongoPlugin);
  await app.register(authPlugin);

  // Register all feature routes
  await app.register(authRoutes);
  await app.register(settingsRoutes);
  await app.register(dataRoutes);
  await app.register(entityRoutes);
  await app.register(mongoRoutes);
  await app.register(jiraRoutes);
  await app.register(llmRoutes);
  await app.register(awsRoutes);

  return app;
}
