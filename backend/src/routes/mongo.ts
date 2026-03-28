import { FastifyPluginAsync } from 'fastify';
import { augmentConfig, maskSettings, getIntegrationConfig } from '../utils/configHelpers';
import { getDb } from '../utils/mongoServer';
import {
  MongoConfigBody, MongoConfigBodyType,
  MongoQueryBody, MongoQueryBodyType,
  MongoImportBody, MongoImportBodyType
} from './schemas';

const ALLOWED_COLLECTIONS = ['customers', 'workItems', 'teams', 'issues', 'sprints', 'valueStreams'];

export const mongoRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.post<{ Body: MongoConfigBodyType }>('/api/mongo/databases', { schema: { body: MongoConfigBody } }, async (request, reply) => {
    try {
      const { full: config } = await getIntegrationConfig(fastify, request.body);
      const role = config.connection_type || 'app';

      const db = await getDb(augmentConfig(config, role), role);
      const dbs = await db.admin().listDatabases();

      return reply.send({ success: true, databases: dbs.databases.map((d: any) => d.name) });
    } catch (e: any) {
      return reply.send({ success: false, error: e.message });
    }
  });

  fastify.post<{ Body: MongoConfigBodyType }>('/api/mongo/test', { schema: { body: MongoConfigBody } }, async (request, reply) => {
    try {
      const { full: config } = await getIntegrationConfig(fastify, request.body);
      const role = config.connection_type || 'app';
      const targetDb = config.persistence?.mongo?.[role]?.db || 'valueStream';

      const db = await getDb(augmentConfig(config, role), role);
      const collections = await db.listCollections().toArray();
      const exists = collections.length > 0;

      return reply.send({ success: true, exists, message: `Connected to ${targetDb}` });
    } catch (e: any) {
      return reply.send({ success: false, error: e.message });
    }
  });

  fastify.post<{ Body: MongoQueryBodyType }>('/api/mongo/query', { schema: { body: MongoQueryBody } }, async (request, reply) => {
    try {
      const rawConfig = request.body;
      const existing = await fastify.getSettings();

      const role = (rawConfig.connection_type || 'customer') as 'app' | 'customer';
      const mongo = existing.persistence?.mongo?.[role] || {};
      const targetCollection = mongo.collection || (role === 'customer' ? 'Customers' : 'customers');

      const db = await getDb(augmentConfig(existing, role), role);
      const collection = db.collection(targetCollection);

      const query = typeof rawConfig.query === 'string' ? JSON.parse(rawConfig.query) : rawConfig.query;
      const results = Array.isArray(query) ? await collection.aggregate(query).toArray() : await collection.find(query).toArray();

      return reply.send({ success: true, data: results });
    } catch (e: any) {
      return reply.send({ success: false, error: e.message });
    }
  });

  fastify.post('/api/mongo/export', async (request, reply) => {
    try {
      const settings = await fastify.getSettings();
      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

      const data: any = { settings: maskSettings(settings) };
      for (const col of ALLOWED_COLLECTIONS) {
        const docs = await db.collection(col).find({}).toArray();
        data[col] = docs.map(({ _id, ...rest }) => rest);
      }

      return reply.send({ success: true, data });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

  fastify.post<{ Body: MongoImportBodyType }>('/api/mongo/import', { schema: { body: MongoImportBody } }, async (request, reply) => {
    try {
      const { data: importData } = request.body;
      const settings = await fastify.getSettings();
      const db = await getDb(augmentConfig(settings, 'app'), 'app', false);

      for (const col of ALLOWED_COLLECTIONS) {
        await db.collection(col).deleteMany({});
        if (importData[col]?.length > 0) {
            await db.collection(col).insertMany(importData[col] as any[]);
        }
      }

      return reply.send({ success: true });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

};
