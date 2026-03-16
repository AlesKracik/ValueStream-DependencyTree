import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import { getSettingsPath } from './settings';
import { getDb } from '../utils/mongoServer';
import { augmentConfig } from '../utils/configHelpers';

const ALLOWED_COLLECTIONS = ['customers', 'workItems', 'teams', 'epics', 'sprints', 'valueStreams'];

export const entityRoutes: FastifyPluginAsync = async (fastify) => {
  // Use a wildcard param to match /api/entity/:collection/:id
  fastify.post('/api/entity/:collection', async (request, reply) => {
    try {
      const { collection } = request.params as { collection: string };
      
      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        return reply.code(403).send({ success: false, error: 'Forbidden collection' });
      }

      const data = request.body as any || {};
      
      if (!data.id) {
        return reply.code(400).send({ success: false, error: 'Entity ID is required in body' });
      }

      const entityId = String(data.id);

      const settingsPath = getSettingsPath();
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      
      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }
      
      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);
      
      await db.collection(collection).createIndex({ id: 1 }, { unique: true });
      await db.collection(collection).replaceOne({ id: entityId }, data, { upsert: true });
      
      return reply.send({ success: true });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

  fastify.post('/api/entity/:collection/:id', async (request, reply) => {
    try {
      const { collection, id } = request.params as { collection: string, id: string };
      
      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        return reply.code(403).send({ success: false, error: 'Forbidden collection' });
      }

      const data = request.body as any || {};
      const entityId = String(data.id || id);
      
      const settingsPath = getSettingsPath();
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      
      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }
      
      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);
      
      await db.collection(collection).createIndex({ id: 1 }, { unique: true });
      await db.collection(collection).replaceOne({ id: entityId }, data, { upsert: true });
      
      return reply.send({ success: true });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

  fastify.delete('/api/entity/:collection/:id', async (request, reply) => {
    try {
      const { collection, id } = request.params as { collection: string, id: string };
      
      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        return reply.code(403).send({ success: false, error: 'Forbidden collection' });
      }

      const settingsPath = getSettingsPath();
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      
      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }
      
      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);
      await db.collection(collection).deleteOne({ id });
      
      return reply.send({ success: true });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });
};
