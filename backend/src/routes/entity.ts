import { FastifyPluginAsync } from 'fastify';
import { augmentConfig } from '../utils/configHelpers';
import { getDb } from '../utils/mongoServer';
import { recomputeScoresForWorkItems } from '../services/metricsService';
import {
  EntityBody, EntityBodyType,
  EntityOptionalIdBody, EntityOptionalIdBodyType,
  CollectionParams, CollectionParamsType,
  CollectionIdParams, CollectionIdParamsType
} from './schemas';
import { ALLOWED_COLLECTIONS } from '../utils/constants';
// Collections whose mutations affect RICE scores and trigger recomputation
const SCORE_AFFECTING_COLLECTIONS = ['workItems', 'customers', 'issues'];

export const entityRoutes: FastifyPluginAsync = async (fastify) => {
  // Use a wildcard param to match /api/entity/:collection/:id
  fastify.post<{ Params: CollectionParamsType; Body: EntityBodyType }>('/api/entity/:collection', { schema: { params: CollectionParams, body: EntityBody } }, async (request, reply) => {
    try {
      const { collection } = request.params;

      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        return reply.code(403).send({ success: false, error: 'Forbidden collection' });
      }

      const data = request.body;

      if (!data.id) {
        return reply.code(400).send({ success: false, error: 'Entity ID is required in body' });
      }

      const entityId = String(data.id);

      const settings = await fastify.getSettings();

      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }

      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

      await db.collection(collection).createIndex({ id: 1 }, { unique: true });
      await db.collection(collection).replaceOne({ id: entityId }, data, { upsert: true });

      // Fire-and-forget: recompute RICE scores when score-affecting entities change
      if (SCORE_AFFECTING_COLLECTIONS.includes(collection)) {
        recomputeScoresForWorkItems(db).catch(err =>
          console.error('Score recomputation failed:', err)
        );
      }

      return reply.send({ success: true });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

  fastify.post<{ Params: CollectionIdParamsType; Body: EntityOptionalIdBodyType }>('/api/entity/:collection/:id', { schema: { params: CollectionIdParams, body: EntityOptionalIdBody } }, async (request, reply) => {
    try {
      const { collection, id } = request.params;

      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        return reply.code(403).send({ success: false, error: 'Forbidden collection' });
      }

      const data = request.body;
      const entityId = String(data.id || id);

      const settings = await fastify.getSettings();

      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }

      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

      await db.collection(collection).createIndex({ id: 1 }, { unique: true });
      await db.collection(collection).replaceOne({ id: entityId }, data, { upsert: true });

      if (SCORE_AFFECTING_COLLECTIONS.includes(collection)) {
        recomputeScoresForWorkItems(db).catch(err =>
          console.error('Score recomputation failed:', err)
        );
      }

      return reply.send({ success: true });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

  fastify.delete<{ Params: CollectionIdParamsType }>('/api/entity/:collection/:id', { schema: { params: CollectionIdParams } }, async (request, reply) => {
    try {
      const { collection, id } = request.params;

      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        return reply.code(403).send({ success: false, error: 'Forbidden collection' });
      }

      const settings = await fastify.getSettings();

      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }

      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);
      await db.collection(collection).deleteOne({ id });

      // Cascade: clean up references in related collections
      const cascaded: Record<string, number> = {};

      if (collection === 'customers') {
        // Remove customer_targets entries referencing this customer from ALL workItems
        const result = await db.collection('workItems').updateMany(
          { 'customer_targets.customer_id': id },
          { $pull: { customer_targets: { customer_id: id } } as any }
        );
        if (result.modifiedCount > 0) cascaded.workItems = result.modifiedCount;
      } else if (collection === 'workItems') {
        // Clear work_item_id from ALL issues referencing this workItem
        const result = await db.collection('issues').updateMany(
          { work_item_id: id },
          { $unset: { work_item_id: '' } }
        );
        if (result.modifiedCount > 0) cascaded.issues = result.modifiedCount;
      } else if (collection === 'teams') {
        // Clear team_id from ALL issues referencing this team
        const result = await db.collection('issues').updateMany(
          { team_id: id },
          { $set: { team_id: '' } }
        );
        if (result.modifiedCount > 0) cascaded.issues = result.modifiedCount;
      }

      if (SCORE_AFFECTING_COLLECTIONS.includes(collection)) {
        recomputeScoresForWorkItems(db).catch(err =>
          console.error('Score recomputation failed:', err)
        );
      }

      return reply.send({ success: true, cascaded });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });
};
