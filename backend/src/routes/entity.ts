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
  EntityDeleteQuery, EntityDeleteQueryType,
  ArrayItemParams, ArrayItemParamsType,
  ArrayItemWithIdParams, ArrayItemWithIdParamsType,
  CollectionParams, CollectionParamsType,
  CollectionIdParams, CollectionIdParamsType
} from './schemas';
import { ALLOWED_COLLECTIONS } from '../utils/constants';
import { AppError } from '../utils/errors';
import { requireRole } from '../utils/roleGuard';
import { wouldCreateCycle } from '../utils/workItemHierarchy';
import { deriveForDocument, deriveForPatch } from '../utils/workItemOrigin';
import { deriveEffort } from '../utils/effortSize';
import {
  assertDocumentStatuses, assertSupportIssueStatus, assertParentExists, namesParent,
  assertReferencesExist, assertCustomerTargetExists, assertJiraKeyUnique
} from '../utils/entityValidation';
// Collections whose mutations affect RICE scores and trigger recomputation
const SCORE_AFFECTING_COLLECTIONS = ['workItems', 'customers', 'issues'];

// Collections whose documents carry server-owned lifecycle timestamps:
// `created_at` is stamped once on insert and is immutable thereafter, while
// `updated_at` is refreshed on every persisted mutation. These let work items
// be aged out / cleaned up later. Score recomputation writes only the
// `calculated_*` fields via a separate bulkWrite, so it never touches these.
const TIMESTAMPED_COLLECTIONS = ['workItems'];

/**
 * Per-collection whitelist of nested array paths that the element-level
 * endpoints (add/patch/delete) are allowed to touch, mapped to the field used
 * to identify an element within the array.
 *
 * Adding an entry here exposes that array to concurrent-safe element-level
 * editing (Phase 3 of the OCC rollout). `serverAssigned` keys are stamped by
 * the server on add (DEC-011); a natural key (`customer_targets.customer_id`)
 * is supplied by the caller and must be unique within the array.
 * `teams.members` is not listed yet: its elements have no id (DEC-020).
 */
// REQ-048 (DEC-020)
const ARRAY_ELEMENT_WHITELIST: Record<string, Record<string, { key: string; serverAssigned: boolean }>> = {
  customers: {
    support_issues: { key: 'id', serverAssigned: true },
    tcv_history: { key: 'id', serverAssigned: true },
  },
  workItems: {
    customer_targets: { key: 'customer_id', serverAssigned: false },
  },
};

function getArraySpec(collection: string, arrayPath: string): { key: string; serverAssigned: boolean } | null {
  return ARRAY_ELEMENT_WHITELIST[collection]?.[arrayPath] ?? null;
}

function getArrayKey(collection: string, arrayPath: string): string | null {
  return getArraySpec(collection, arrayPath)?.key ?? null;
}

/**
 * Match-by-version filter shared by all OCC operations on entity docs.
 * Legacy documents lacking `_version` are matched as version 0 so the first
 * write stamps the field automatically.
 */
// REQ-003 (legacy docs match as version 0)
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
 *  - If the document does not exist, we insert it with `_version: 0`. The
 *    client-sent `_version` is ignored in this case — it lets a client recreate
 *    a deleted entity without first having to re-read it (DEC-002).
 *  - `_version: 0` on an id that already exists (versioned or legacy) is a
 *    conflict: a create never overwrites (DEC-012).
 *  - `_version: N > 0` matching the stored version merges the body ($set) and
 *    bumps the version; a mismatch returns the current document so the caller
 *    can respond 409 and the client can merge.
 */
// REQ-001, REQ-002, REQ-004, REQ-011, REQ-013, REQ-036
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
  // Don't echo the client's version field into the stored doc; we set it
  // explicitly. created_at/updated_at are server-owned — strip any client-sent
  // values so creation time can't be forged or rewound.
  const { _version: _ignored, created_at: _ignoredCreated, updated_at: _ignoredUpdated, ...rest } = body;
  void _ignored; void _ignoredCreated; void _ignoredUpdated;

  const stamped = TIMESTAMPED_COLLECTIONS.includes(collection);
  const now = new Date().toISOString();

  await db.collection(collection).createIndex({ id: 1 }, { unique: true });

  const insertFresh = async (): Promise<boolean> => {
    try {
      await db.collection(collection).insertOne({ ...rest, id: entityId, _version: 0, ...(stamped ? { created_at: now, updated_at: now } : {}) });
      return true;
    } catch (err) {
      // Duplicate key: someone created the id first — that's a conflict.
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  };

  if (clientVersion > 0) {
    const nextVersion = clientVersion + 1;
    const updated = await db.collection(collection).findOneAndUpdate(
      { id: entityId, _version: clientVersion },
      // On replace, bump updated_at but leave created_at untouched so the
      // original creation time survives the write.
      { $set: { ...rest, id: entityId, _version: nextVersion, ...(stamped ? { updated_at: now } : {}) } },
      { returnDocument: 'after' }
    );

    if (updated) {
      // Lazy backfill (no migration): a legacy doc that predates the timestamp
      // fields gets a created_at on its first update. The value is the update
      // time, not the true creation time — an accepted approximation.
      if (stamped && !updated.created_at) {
        await db.collection(collection).updateOne({ id: entityId }, { $set: { created_at: now } });
      }
      return { ok: true, newVersion: nextVersion };
    }
  }

  // Version 0 (a create), or a version that matched nothing: insert when the
  // id is free, otherwise it is a conflict.
  const existing = await db.collection(collection).findOne({ id: entityId });

  // REQ-047: version 0 on a legacy document (no `_version`) matches it as
  // version 0, as PATCH does — replace it and stamp version 1.
  if (clientVersion === 0 && existing && existing._version === undefined) {
    const replaced = await db.collection(collection).findOneAndUpdate(
      { id: entityId, _version: { $exists: false } },
      { $set: { ...rest, id: entityId, _version: 1, ...(stamped ? { updated_at: now } : {}) } },
      { returnDocument: 'after' }
    );
    if (replaced) {
      if (stamped && !replaced.created_at) {
        await db.collection(collection).updateOne({ id: entityId }, { $set: { created_at: now } });
      }
      return { ok: true, newVersion: 1 };
    }
  }

  if (!existing && await insertFresh()) {
    return { ok: true, newVersion: 0 };
  }
  const current = existing ?? await db.collection(collection).findOne({ id: entityId });
  return { ok: false, current: current ?? {} };
}

/**
 * Write guards shared by every route that writes a work item's `parent_id`:
 * the hierarchy must stay acyclic, and a named parent must exist.
 */
// REQ-014, REQ-038; INV-001, INV-008 guard
async function guardParent(db: Db, childId: string, parentId: unknown): Promise<void> {
  if (!namesParent(parentId)) return;
  if (await wouldCreateCycle(db, childId, parentId)) {
    throw new AppError('parent_id would create a cycle in the work item hierarchy', 400);
  }
  await assertParentExists(db, parentId);
}

/**
 * Stamp the server-owned origin (and the source-owned fields) on a work item
 * body before a create or upsert. A body without links on an existing id
 * derives from the stored links, because the upsert merges onto that document.
 */
async function deriveWorkItemWrite(
  db: Db,
  entityId: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
): Promise<void> {
  let links = data.links;
  if (!('links' in data) && entityId) {
    const stored = await db.collection('workItems').findOne({ id: entityId }, { projection: { links: 1 } });
    links = stored?.links;
  }
  Object.assign(data, deriveForDocument({ links }));
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

// REQ-027; INV-003
function maybeRecomputeScores(db: Db, collection: string, log: FastifyBaseLogger) {
  if (SCORE_AFFECTING_COLLECTIONS.includes(collection)) {
    recomputeScoresForWorkItems(db).catch(err =>
      log.error(err, 'Score recomputation failed')
    );
  }
}

/**
 * Create a document under a server-generated id (DEC-017). An idempotency key
 * (`Idempotency-Key` header) is stored with the document; a create repeating
 * a key already used in the collection answers with the document that key
 * created and stores nothing (REQ-044, DEC-019).
 */
// REQ-043, REQ-044
async function createWithServerId(
  db: Db,
  collection: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any>,
  idempotencyKey: string | undefined,
  validate: () => Promise<void>
): Promise<{ id: string; _version: number; replayed: boolean }> {
  const coll = db.collection(collection);
  await coll.createIndex({ id: 1 }, { unique: true });
  await coll.createIndex(
    { _idempotency_key: 1 },
    { unique: true, partialFilterExpression: { _idempotency_key: { $exists: true } } }
  );

  const replay = async () => {
    if (!idempotencyKey) return null;
    const prior = await coll.findOne({ _idempotency_key: idempotencyKey });
    return prior
      ? { id: String(prior.id), _version: typeof prior._version === 'number' ? prior._version : 0, replayed: true }
      : null;
  };

  // A repeated key answers before validation: the first create already passed it.
  const earlier = await replay();
  if (earlier) return earlier;
  await validate();

  const { _version: _v, created_at: _c, updated_at: _u, id: _id, _idempotency_key: _k, ...rest } = body;
  void _v; void _c; void _u; void _id; void _k;
  const stamped = TIMESTAMPED_COLLECTIONS.includes(collection);
  const now = new Date().toISOString();
  const entityId = randomUUID();
  try {
    await coll.insertOne({
      ...rest,
      id: entityId,
      _version: 0,
      ...(idempotencyKey ? { _idempotency_key: idempotencyKey } : {}),
      ...(stamped ? { created_at: now, updated_at: now } : {}),
    });
  } catch (err) {
    // Two creates with the same key raced: the other one won — answer with it.
    if ((err as { code?: number }).code === 11000) {
      const winner = await replay();
      if (winner) return winner;
    }
    throw err;
  }
  return { id: entityId, _version: 0, replayed: false };
}

export const entityRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/entity/:collection — with an id in the body: create-or-update
  // with OCC. Without one: create under a server-generated id (DEC-017).
  // REQ-001..REQ-006, REQ-014, REQ-036, REQ-038, REQ-039, REQ-043..REQ-047
  fastify.post<{ Params: CollectionParamsType; Body: EntityBodyType }>('/api/entity/:collection', { schema: { params: CollectionParams, body: EntityBody } }, async (request, reply) => {
    requireRole(request, 'editor');
    const { collection } = request.params;

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      throw new AppError('Forbidden collection', 403);
    }

    const data = request.body;
    assertDocumentStatuses(collection, data as Record<string, unknown>);

    const settings = await fastify.getSettings();

    if (!settings.persistence?.mongo?.app?.uri) {
      throw new Error("App MongoDB not configured");
    }

    const db = await getDb(augmentConfig(settings, 'app'), 'app', true);
    if (collection === 'workItems') {
      await deriveWorkItemWrite(db, data.id ? String(data.id) : undefined, data as Record<string, unknown>);
      deriveEffort(data as Record<string, unknown>);
    }

    if (!data.id) {
      const keyHeader = request.headers['idempotency-key'];
      const idempotencyKey = typeof keyHeader === 'string' && keyHeader !== '' ? keyHeader : undefined;
      const created = await createWithServerId(db, collection, data, idempotencyKey, async () => {
        if (collection === 'workItems') {
          const parentId = (data as unknown as { parent_id?: unknown }).parent_id;
          if (namesParent(parentId)) await assertParentExists(db, parentId);
        }
        await assertReferencesExist(db, collection, data as Record<string, unknown>);
        await assertJiraKeyUnique(db, collection, data as Record<string, unknown>);
      });
      if (!created.replayed) maybeRecomputeScores(db, collection, fastify.log);
      return reply.send({ success: true, id: created.id, _version: created._version });
    }

    const entityId = String(data.id);

    // Hierarchy guards for workItems: no cycles, and the parent must exist.
    if (collection === 'workItems') {
      await guardParent(db, entityId, (data as unknown as { parent_id?: unknown }).parent_id);
    }
    await assertReferencesExist(db, collection, data as Record<string, unknown>);
    await assertJiraKeyUnique(db, collection, data as Record<string, unknown>, entityId);

    const result = await upsertWithOcc(db, collection, entityId, data);
    if (!result.ok) {
      return replyConflict(reply, result.current);
    }

    maybeRecomputeScores(db, collection, fastify.log);

    return reply.send({ success: true, _version: result.newVersion });
  });

  // POST /api/entity/:collection/:id — id from URL, body may omit it. Create-or-update with OCC.
  // REQ-001..REQ-006, REQ-014, REQ-036, REQ-038, REQ-039 (DEC-006)
  fastify.post<{ Params: CollectionIdParamsType; Body: EntityOptionalIdBodyType }>('/api/entity/:collection/:id', { schema: { params: CollectionIdParams, body: EntityOptionalIdBody } }, async (request, reply) => {
    requireRole(request, 'editor');
    const { collection, id } = request.params;

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      throw new AppError('Forbidden collection', 403);
    }

    const data = request.body;
    const entityId = String(data.id || id);
    assertDocumentStatuses(collection, data as Record<string, unknown>);

    const settings = await fastify.getSettings();

    if (!settings.persistence?.mongo?.app?.uri) {
      throw new Error("App MongoDB not configured");
    }

    const db = await getDb(augmentConfig(settings, 'app'), 'app', true);
    if (collection === 'workItems') {
      await deriveWorkItemWrite(db, entityId, data as Record<string, unknown>);
      deriveEffort(data as Record<string, unknown>);
    }

    // Hierarchy guards for workItems: no cycles, and the parent must exist.
    if (collection === 'workItems') {
      await guardParent(db, entityId, (data as unknown as { parent_id?: unknown }).parent_id);
    }
    await assertReferencesExist(db, collection, data as Record<string, unknown>);
    await assertJiraKeyUnique(db, collection, data as Record<string, unknown>, entityId);

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
  // REQ-003, REQ-007..REQ-010, REQ-012, REQ-013, REQ-038, REQ-039
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
        k === 'id' || k === '_version' || k === '_idempotency_key' || k.startsWith('calculated_')
      );
      if (forbiddenKeys.length > 0) {
        throw new AppError(
          `Cannot patch server-owned fields: ${forbiddenKeys.join(', ')}`,
          400
        );
      }

      assertDocumentStatuses(collection, patch as Record<string, unknown>);

      const settings = await fastify.getSettings();
      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }
      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

      // Hierarchy guards: only fire when the patch touches parent_id.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let derived: Record<string, any> = {};
      if (collection === 'workItems') {
        await guardParent(db, id, (patch as { parent_id?: unknown }).parent_id);
        // Origin is server-owned; source-owned fields can't be edited locally.
        // A concurrent change before the write still fails the version check.
        delete (patch as Record<string, unknown>).origin;
        // Baseline effort: total_effort_mds follows the T-shirt size.
        deriveEffort(patch as Record<string, unknown>);
        if (['links', 'name', 'description'].some(k => k in patch)) {
          const current = await db.collection(collection).findOne({ id });
          derived = deriveForPatch(current, patch as Record<string, unknown>);
        }
      }
      await assertReferencesExist(db, collection, patch as Record<string, unknown>);
      await assertJiraKeyUnique(db, collection, patch as Record<string, unknown>, id);

      // OCC match. Treat legacy docs (no `_version`) as version 0.
      const matchFilter = clientVersion === 0
        ? { id, $or: [{ _version: 0 }, { _version: { $exists: false } }] }
        : { id, _version: clientVersion };

      const nextVersion = clientVersion + 1;
      // created_at is server-owned and immutable; drop any client value. For
      // timestamped collections, refresh updated_at so it reflects this edit.
      const { created_at: _patchCreated, updated_at: _patchUpdated, ...cleanPatch } =
        patch as Record<string, unknown>;
      void _patchCreated; void _patchUpdated;
      const stamped = TIMESTAMPED_COLLECTIONS.includes(collection);
      const now = new Date().toISOString();
      const stampSet = stamped ? { updated_at: now } : {};
      const updated = await db.collection(collection).findOneAndUpdate(
        matchFilter,
        { $set: { ...cleanPatch, ...derived, ...stampSet, _version: nextVersion } },
        { returnDocument: 'after' }
      );

      if (!updated) {
        const existing = await db.collection(collection).findOne({ id });
        if (!existing) {
          throw new AppError('Entity not found', 404);
        }
        return replyConflict(reply, existing);
      }

      // Lazy backfill (no migration): a legacy work item lacking created_at gets
      // one stamped on its first update. The value is the update time, not the
      // true creation time — an accepted approximation.
      if (stamped && !updated.created_at) {
        await db.collection(collection).updateOne({ id }, { $set: { created_at: now } });
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
  // REQ-020, REQ-021, REQ-034, REQ-039 (DEC-011)
  fastify.post<{ Params: ArrayItemParamsType; Body: ArrayItemAddBodyType }>(
    '/api/entity/:collection/:id/items/:arrayPath',
    { schema: { params: ArrayItemParams, body: ArrayItemAddBody } },
    async (request, reply) => {
      requireRole(request, 'editor');
      const { collection, id, arrayPath } = request.params;

      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        throw new AppError('Forbidden collection', 403);
      }
      const spec = getArraySpec(collection, arrayPath);
      if (!spec) {
        throw new AppError(`Array path "${arrayPath}" is not editable element-wise on ${collection}`, 400);
      }
      const keyField = spec.key;

      const { _version: clientVersion, item } = request.body;

      if (arrayPath === 'support_issues') assertSupportIssueStatus(item);

      const settings = await fastify.getSettings();
      if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error("App MongoDB not configured");
      }
      const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

      // A server-assigned key is always stamped fresh, ignoring any id the
      // caller sent (DEC-011). A natural key comes from the caller and must
      // not already be in the array.
      const callerKey = (item as Record<string, unknown>)[keyField];
      if (!spec.serverAssigned && (typeof callerKey !== 'string' || callerKey === '')) {
        throw new AppError(`Element of ${arrayPath} needs a "${keyField}"`, 400);
      }
      if (arrayPath === 'customer_targets') await assertCustomerTargetExists(db, item);
      const elementWithKey = {
        ...item,
        [keyField]: spec.serverAssigned ? randomUUID() : callerKey,
      };

      const nextVersion = clientVersion + 1;
      const filter = spec.serverAssigned
        ? versionMatch(id, clientVersion)
        : { ...versionMatch(id, clientVersion), [`${arrayPath}.${keyField}`]: { $ne: callerKey } };
      const updated = await db.collection(collection).findOneAndUpdate(
        filter,
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
        const arr = (existing as Record<string, unknown>)[arrayPath] as Array<Record<string, unknown>> | undefined;
        if (!spec.serverAssigned && arr?.some(el => el[keyField] === callerKey)) {
          throw new AppError(`${arrayPath} already has an element with ${keyField} "${String(callerKey)}"`, 400);
        }
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
  // REQ-022, REQ-023, REQ-024, REQ-034, REQ-039
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
      if (arrayPath === 'support_issues') assertSupportIssueStatus(patch);

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

      let updated;
      try {
        updated = await db.collection(collection).findOneAndUpdate(
          versionMatch(id, clientVersion),
          { $set: setSpec },
          {
            arrayFilters: [{ [`elem.${keyField}`]: itemId }],
            returnDocument: 'after',
          }
        );
      } catch (err) {
        // The parent matched (version included) but has no such array at all:
        // Mongo refuses the positional update. That is a missing element.
        if (/must exist in the document in order to apply array updates/.test((err as Error).message)) {
          throw new AppError(`Array element "${itemId}" not found in ${arrayPath}`, 404);
        }
        throw err;
      }

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
  // REQ-025, REQ-026, REQ-034
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

  // DELETE /api/entity/:collection/:id?_version=N — version-checked delete
  // (DEC-013). A stale version is a 409 that deletes and cascades nothing; an
  // id that does not exist still succeeds (and still cleans up references).
  // REQ-015..REQ-018, REQ-035, REQ-037 (DEC-007, DEC-013)
  fastify.delete<{ Params: CollectionIdParamsType; Querystring: EntityDeleteQueryType }>('/api/entity/:collection/:id', { schema: { params: CollectionIdParams, querystring: EntityDeleteQuery } }, async (request, reply) => {
    requireRole(request, 'editor');
    const { collection, id } = request.params;

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      throw new AppError('Forbidden collection', 403);
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
    const deleted = await db.collection(collection).deleteOne(versionMatch(id, clientVersion));
    if (deleted.deletedCount === 0) {
      const existing = await db.collection(collection).findOne({ id });
      if (existing) return replyConflict(reply, existing);
    }

    // Cascade: clean up references in related collections. Every cascaded
    // edit is a versioned edit (DEC-007): it bumps `_version`, and refreshes
    // `updated_at` on work items.
    const cascaded: Record<string, number> = {};
    const now = new Date().toISOString();
    const bump = { $inc: { _version: 1 } };

    if (collection === 'customers') {
      // Remove customer_targets entries referencing this customer from ALL workItems
      const result = await db.collection('workItems').updateMany(
        { 'customer_targets.customer_id': id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { $pull: { customer_targets: { customer_id: id } } as any, $set: { updated_at: now }, ...bump }
      );
      if (result.modifiedCount > 0) cascaded.workItems = result.modifiedCount;
    } else if (collection === 'workItems') {
      // Clear work_item_id from ALL issues referencing this workItem
      const issuesResult = await db.collection('issues').updateMany(
        { work_item_id: id },
        { $unset: { work_item_id: '' }, ...bump }
      );
      if (issuesResult.modifiedCount > 0) cascaded.issues = issuesResult.modifiedCount;

      // Detach children: clear parent_id on every workItem that pointed to this one.
      const childrenResult = await db.collection('workItems').updateMany(
        { parent_id: id },
        { $unset: { parent_id: '' }, $set: { updated_at: now }, ...bump }
      );
      if (childrenResult.modifiedCount > 0) cascaded.workItems = childrenResult.modifiedCount;
    } else if (collection === 'teams') {
      // Clear team_id from ALL issues referencing this team
      const result = await db.collection('issues').updateMany(
        { team_id: id },
        { $set: { team_id: '' }, ...bump }
      );
      if (result.modifiedCount > 0) cascaded.issues = result.modifiedCount;
    }

    maybeRecomputeScores(db, collection, fastify.log);

    return reply.send({ success: true, cascaded });
  });
};
