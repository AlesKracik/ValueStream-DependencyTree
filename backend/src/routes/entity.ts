import { FastifyPluginAsync, FastifyBaseLogger, FastifyReply } from 'fastify';
import { Db } from 'mongodb';
import { augmentConfig } from '../utils/configHelpers';
import { getDb } from '../utils/mongoServer';
import { recomputeScoresForWorkItems } from '../services/metricsService';
import { randomUUID } from 'crypto';
import {
  EntityBody, EntityBodyType,
  EntityOptionalIdBody, EntityOptionalIdBodyType,
  EntityPatchBody, EntityPatchBodyType,
  ArrayItemAddBody, ArrayItemAddBodyType,
  ArrayItemPatchBody, ArrayItemPatchBodyType,
  ArrayItemDeleteQuery, ArrayItemDeleteQueryType,
  ArrayItemParams, ArrayItemParamsType,
  ArrayItemWithIdParams, ArrayItemWithIdParamsType,
  CollectionParams, CollectionParamsType,
  CollectionIdParams, CollectionIdParamsType
} from './schemas';
import { ALLOWED_COLLECTIONS } from '../utils/constants';
import { AppError } from '../utils/errors';
import { requireRole } from '../utils/roleGuard';
import { wouldCreateCycle } from '../utils/workItemHierarchy';
// Collections whose mutations affect RICE scores and trigger recomputation
const SCORE_AFFECTING_COLLECTIONS = ['workItems', 'customers', 'issues'];

/**
 * Per-collection whitelist of nested array paths that the element-level
 * endpoints (add/patch/delete) are allowed to touch, mapped to the field used
 * to identify an element within the array.
 *
 * Adding an entry here exposes that array to concurrent-safe element-level
 * editing (Phase 3 of the OCC rollout). Arrays whose elements lack a stable
 * identifier — `workItems.customer_targets`, `teams.members` — are deliberately
 * NOT listed; they still go through the whole-array PATCH path until they
 * grow proper element ids.
 */
const ARRAY_ELEMENT_WHITELIST: Record<string, Record<string, string>> = {
  customers: {
    support_issues: 'id',
    tcv_history: 'id',
  },
};

function getArrayKey(collection: string, arrayPath: string): string | null {
  return ARRAY_ELEMENT_WHITELIST[collection]?.[arrayPath] ?? null;
}

/**
 * Match-by-version filter shared by all OCC operations on entity docs.
 * Legacy documents lacking `_version` are matched as version 0 so the first
 * write stamps the field automatically.
 */
function versionMatch(id: string, clientVersion: number): Record<string, unknown> {
  return clientVersion === 0
    ? { id, $or: [{ _version: 0 }, { _version: { $exists: false } }] }
    : { id, _version: clientVersion };
}

/**
 * Optimistic-concurrency upsert for an entity document.
 *
 * Contract:
 *  - Client sends `_version` (the value it last observed; 0 for new entities).
 *  - If the document does not exist, we insert it with `_version: 0` (preserves
 *    legacy upsert-on-POST behaviour). The client-sent `_version` is ignored in
 *    this case — it lets a client recreate a deleted entity without first
 *    having to re-read it.
 *  - If the document exists with a matching `_version` (or has no `_version`
 *    field at all and the client sent 0), we replace it and bump the version.
 *  - If the document exists with a non-matching `_version`, we return the
 *    current document so the caller can respond 409 and the client can merge.
 */
async function upsertWithOcc(
  db: Db,
  collection: string,
  entityId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any>
): Promise<
  | { ok: true; newVersion: number }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { ok: false; current: Record<string, any> }
> {
  const clientVersion = typeof body._version === 'number' ? body._version : 0;
  // Don't echo the client's version field into the stored doc; we set it explicitly.
  const { _version: _ignored, ...rest } = body;
  void _ignored;

  await db.collection(collection).createIndex({ id: 1 }, { unique: true });

  // Legacy docs lack `_version` entirely; treat them as version 0 so a client
  // that reads one and sends back `_version: 0` succeeds. We can't use $or
  // inside findOneAndUpdate's filter portably across older MongoDB driver
  // versions, but a single $or on top-level fields is fine.
  const matchFilter = clientVersion === 0
    ? { id: entityId, $or: [{ _version: 0 }, { _version: { $exists: false } }] }
    : { id: entityId, _version: clientVersion };

  const nextVersion = clientVersion + 1;
  const updated = await db.collection(collection).findOneAndUpdate(
    matchFilter,
    { $set: { ...rest, id: entityId, _version: nextVersion } },
    { returnDocument: 'after' }
  );

  if (updated) {
    return { ok: true, newVersion: nextVersion };
  }

  // No match: either the document doesn't exist (treat as insert) or there's a
  // version conflict. Disambiguate with a plain findOne.
  const existing = await db.collection(collection).findOne({ id: entityId });
  if (!existing) {
    // Insert with version 0. Re-fetch through insertOne with full payload.
    await db.collection(collection).insertOne({ ...rest, id: entityId, _version: 0 });
    return { ok: true, newVersion: 0 };
  }

  return { ok: false, current: existing };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function replyConflict(reply: FastifyReply, current: Record<string, any>) {
  return reply.code(409).send({
    success: false,
    conflict: true,
    error: 'Version conflict — the entity was modified by someone else.',
    current,
  });
}

function maybeRecomputeScores(db: Db, collection: string, log: FastifyBaseLogger) {
  if (SCORE_AFFECTING_COLLECTIONS.includes(collection)) {
    recomputeScoresForWorkItems(db).catch(err =>
      log.error(err, 'Score recomputation failed')
    );
  }
}

export const entityRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/entity/:collection — id supplied in body. Create-or-update with OCC.
  fastify.post<{ Params: CollectionParamsType; Body: EntityBodyType }>('/api/entity/:collection', { schema: { params: CollectionParams, body: EntityBody } }, async (request, reply) => {
    requireRole(request, 'editor');
    const { collection } = request.params;

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      throw new AppError('Forbidden collection', 403);
    }

    const data = request.body;

    if (!data.id) {
      throw new AppError('Entity ID is required in body', 400);
    }

    const entityId = String(data.id);

    const settings = await fastify.getSettings();

    if (!settings.persistence?.mongo?.app?.uri) {
      throw new Error("App MongoDB not configured");
    }

    const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

    // Hierarchy cycle guard for workItems.
    if (collection === 'workItems') {
      const parentId = (data as unknown as { parent_id?: unknown }).parent_id;
      if (typeof parentId === 'string' && await wouldCreateCycle(db, entityId, parentId)) {
        throw new AppError('parent_id would create a cycle in the work item hierarchy', 400);
      }
    }

    const result = await upsertWithOcc(db, collection, entityId, data);
    if (!result.ok) {
      return replyConflict(reply, result.current);
    }

    maybeRecomputeScores(db, collection, fastify.log);

    return reply.send({ success: true, _version: result.newVersion });
  });

  // POST /api/entity/:collection/:id — id from URL, body may omit it. Create-or-update with OCC.
  fastify.post<{ Params: CollectionIdParamsType; Body: EntityOptionalIdBodyType }>('/api/entity/:collection/:id', { schema: { params: CollectionIdParams, body: EntityOptionalIdBody } }, async (request, reply) => {
    const { collection, id } = request.params;

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      throw new AppError('Forbidden collection', 403);
    }

    const data = request.body;
    const entityId = String(data.id || id);

    const settings = await fastify.getSettings();

    if (!settings.persistence?.mongo?.app?.uri) {
      throw new Error("App MongoDB not configured");
    }

    const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

    // Hierarchy cycle guard for workItems.
    if (collection === 'workItems') {
      const parentId = (data as unknown as { parent_id?: unknown }).parent_id;
      if (typeof parentId === 'string' && await wouldCreateCycle(db, entityId, parentId)) {
        throw new AppError('parent_id would create a cycle in the work item hierarchy', 400);
      }
    }

    const result = await upsertWithOcc(db, collection, entityId, data);
    if (!result.ok) {
      return replyConflict(reply, result.current);
    }

    maybeRecomputeScores(db, collection, fastify.log);

    return reply.send({ success: true, _version: result.newVersion });
  });

  // PATCH /api/entity/:collection/:id — field-level update.
  // Only the fields named in `patch` are touched; the rest of the document is
  // preserved. Server-owned keys (id, _version, calculated_*) are rejected.
  // Returns 404 if the document doesn't exist (PATCH never creates), 409 on
  // version mismatch, 200 with the new `_version` on success.
  fastify.patch<{ Params: CollectionIdParamsType; Body: EntityPatchBodyType }>(
    '/api/entity/:collection/:id',
    { schema: { params: CollectionIdParams, body: EntityPatchBody } },
    async (request, reply) => {
      requireRole(request, 'editor');
      const { collection, id } = request.params;

      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        throw new AppError('Forbidden collection', 403);
      }

      const { _version: clientVersion, patch } = request.body;

      // Reject server-owned keys in the patch. `calculated_*` are filled by the
      // score recompute service; `id`/`_version` are part of the envelope.
      const forbiddenKeys = Object.keys(patch).filter(k =>
        k === 'id' || k === '_version' || k.startsWith('calculated_')
      );
      if (forbiddenKeys.length > 0) {
        throw new AppError(
          `Cannot patch server-owned fields: ${forbiddenKeys.join(', ')}`,
          400
        );
      }

      const settings = await fastify.getSettings();
      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }
      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

      // Hierarchy cycle guard: only fires when the patch touches parent_id.
      if (collection === 'workItems') {
        const patchParentId = (patch as { parent_id?: unknown }).parent_id;
        if (typeof patchParentId === 'string') {
          if (await wouldCreateCycle(db, id, patchParentId)) {
            throw new AppError(
              'parent_id would create a cycle in the work item hierarchy',
              400
            );
          }
        }
      }

      // OCC match. Treat legacy docs (no `_version`) as version 0.
      const matchFilter = clientVersion === 0
        ? { id, $or: [{ _version: 0 }, { _version: { $exists: false } }] }
        : { id, _version: clientVersion };

      const nextVersion = clientVersion + 1;
      const updated = await db.collection(collection).findOneAndUpdate(
        matchFilter,
        { $set: { ...patch, _version: nextVersion } },
        { returnDocument: 'after' }
      );

      if (!updated) {
        const existing = await db.collection(collection).findOne({ id });
        if (!existing) {
          throw new AppError('Entity not found', 404);
        }
        return replyConflict(reply, existing);
      }

      maybeRecomputeScores(db, collection, fastify.log);

      return reply.send({ success: true, _version: nextVersion });
    }
  );

  // ── Array element endpoints ────────────────────────────────────────────
  //
  // The endpoints below mutate a single element of a whitelisted array on a
  // parent entity, leaving every other element untouched. This eliminates the
  // "two users editing different support_issues clobber each other's array"
  // failure mode that whole-document or whole-array PATCH cannot fix.
  //
  // Concurrency control is the same OCC contract as the entity endpoints —
  // the client sends the parent's `_version`, every successful operation bumps
  // it, and a mismatch returns 409 with the current parent document so the
  // client can retry against the fresh version.

  // POST /api/entity/:collection/:id/items/:arrayPath — push a new element.
  fastify.post<{ Params: ArrayItemParamsType; Body: ArrayItemAddBodyType }>(
    '/api/entity/:collection/:id/items/:arrayPath',
    { schema: { params: ArrayItemParams, body: ArrayItemAddBody } },
    async (request, reply) => {
      requireRole(request, 'editor');
      const { collection, id, arrayPath } = request.params;

      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        throw new AppError('Forbidden collection', 403);
      }
      const keyField = getArrayKey(collection, arrayPath);
      if (!keyField) {
        throw new AppError(`Array path "${arrayPath}" is not editable element-wise on ${collection}`, 400);
      }

      const { _version: clientVersion, item } = request.body;

      // Stamp an id on the new element if the caller didn't provide one.
      const elementWithKey = {
        ...item,
        [keyField]: (item as Record<string, unknown>)[keyField] ?? randomUUID(),
      };

      const settings = await fastify.getSettings();
      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }
      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

      const nextVersion = clientVersion + 1;
      const updated = await db.collection(collection).findOneAndUpdate(
        versionMatch(id, clientVersion),
        {
          $set: { _version: nextVersion },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          $push: { [arrayPath]: elementWithKey } as any,
        },
        { returnDocument: 'after' }
      );

      if (!updated) {
        const existing = await db.collection(collection).findOne({ id });
        if (!existing) throw new AppError('Entity not found', 404);
        return replyConflict(reply, existing);
      }

      maybeRecomputeScores(db, collection, fastify.log);

      return reply.send({
        success: true,
        _version: nextVersion,
        item: elementWithKey,
      });
    }
  );

  // PATCH /api/entity/:collection/:id/items/:arrayPath/:itemId — element field update.
  fastify.patch<{ Params: ArrayItemWithIdParamsType; Body: ArrayItemPatchBodyType }>(
    '/api/entity/:collection/:id/items/:arrayPath/:itemId',
    { schema: { params: ArrayItemWithIdParams, body: ArrayItemPatchBody } },
    async (request, reply) => {
      requireRole(request, 'editor');
      const { collection, id, arrayPath, itemId } = request.params;

      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        throw new AppError('Forbidden collection', 403);
      }
      const keyField = getArrayKey(collection, arrayPath);
      if (!keyField) {
        throw new AppError(`Array path "${arrayPath}" is not editable element-wise on ${collection}`, 400);
      }

      const { _version: clientVersion, patch } = request.body;

      // Disallow editing the element's own key — that would rename the element
      // mid-flight and break subsequent references.
      if (keyField in patch) {
        throw new AppError(`Cannot patch the element's "${keyField}" field`, 400);
      }

      const settings = await fastify.getSettings();
      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }
      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

      // Build the $set spec: rename each patch key to a positional-element
      // path (e.g. `support_issues.$[elem].description`) and stamp the bumped
      // parent _version in the same operation.
      const setSpec: Record<string, unknown> = { _version: clientVersion + 1 };
      for (const [k, v] of Object.entries(patch)) {
        setSpec[`${arrayPath}.$[elem].${k}`] = v;
      }

      const updated = await db.collection(collection).findOneAndUpdate(
        versionMatch(id, clientVersion),
        { $set: setSpec },
        {
          arrayFilters: [{ [`elem.${keyField}`]: itemId }],
          returnDocument: 'after',
        }
      );

      if (!updated) {
        const existing = await db.collection(collection).findOne({ id });
        if (!existing) throw new AppError('Entity not found', 404);
        return replyConflict(reply, existing);
      }

      // arrayFilters miss is silent: findOneAndUpdate returns the doc even if
      // no element matched. Confirm the element exists; otherwise return 404
      // so the client doesn't see a phantom success.
      const updatedArray = (updated as Record<string, unknown>)[arrayPath] as Array<Record<string, unknown>> | undefined;
      const found = updatedArray?.some(el => el[keyField] === itemId);
      if (!found) {
        // Roll back the version bump so we don't strand the parent at a higher
        // version than the client thinks. We use a conditional update — if
        // someone else moved on, we let them keep their version.
        await db.collection(collection).updateOne(
          { id, _version: clientVersion + 1 },
          { $set: { _version: clientVersion } }
        );
        throw new AppError(`Array element "${itemId}" not found in ${arrayPath}`, 404);
      }

      maybeRecomputeScores(db, collection, fastify.log);

      return reply.send({ success: true, _version: clientVersion + 1 });
    }
  );

  // DELETE /api/entity/:collection/:id/items/:arrayPath/:itemId — remove element.
  fastify.delete<{ Params: ArrayItemWithIdParamsType; Querystring: ArrayItemDeleteQueryType }>(
    '/api/entity/:collection/:id/items/:arrayPath/:itemId',
    { schema: { params: ArrayItemWithIdParams, querystring: ArrayItemDeleteQuery } },
    async (request, reply) => {
      requireRole(request, 'editor');
      const { collection, id, arrayPath, itemId } = request.params;

      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        throw new AppError('Forbidden collection', 403);
      }
      const keyField = getArrayKey(collection, arrayPath);
      if (!keyField) {
        throw new AppError(`Array path "${arrayPath}" is not editable element-wise on ${collection}`, 400);
      }

      const clientVersion = Number.parseInt(request.query._version, 10);
      if (!Number.isFinite(clientVersion) || clientVersion < 0) {
        throw new AppError('Invalid _version query parameter', 400);
      }

      const settings = await fastify.getSettings();
      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }
      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

      const nextVersion = clientVersion + 1;
      const updated = await db.collection(collection).findOneAndUpdate(
        versionMatch(id, clientVersion),
        {
          $set: { _version: nextVersion },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          $pull: { [arrayPath]: { [keyField]: itemId } } as any,
        },
        { returnDocument: 'after' }
      );

      if (!updated) {
        const existing = await db.collection(collection).findOne({ id });
        if (!existing) throw new AppError('Entity not found', 404);
        return replyConflict(reply, existing);
      }

      maybeRecomputeScores(db, collection, fastify.log);

      return reply.send({ success: true, _version: nextVersion });
    }
  );

  fastify.delete<{ Params: CollectionIdParamsType }>('/api/entity/:collection/:id', { schema: { params: CollectionIdParams } }, async (request, reply) => {
    requireRole(request, 'editor');
    const { collection, id } = request.params;

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      throw new AppError('Forbidden collection', 403);
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
      const issuesResult = await db.collection('issues').updateMany(
        { work_item_id: id },
        { $unset: { work_item_id: '' } }
      );
      if (issuesResult.modifiedCount > 0) cascaded.issues = issuesResult.modifiedCount;

      // Detach children: clear parent_id on every workItem that pointed to this one.
      const childrenResult = await db.collection('workItems').updateMany(
        { parent_id: id },
        { $unset: { parent_id: '' } }
      );
      if (childrenResult.modifiedCount > 0) cascaded.workItems = childrenResult.modifiedCount;
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
        fastify.log.error(err, 'Score recomputation failed')
      );
    }

    return reply.send({ success: true, cascaded });
  });
};
