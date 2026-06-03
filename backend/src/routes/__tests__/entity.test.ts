import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import * as mongoServer from '../../utils/mongoServer';
import * as metricsService from '../../services/metricsService';
import { invalidateSettingsCache } from '../../services/secretManager';

describe('Entity Routes', () => {
  let app: FastifyInstance;
  let mockCollection: any;
  let mockDb: any;

  beforeAll(async () => {
    app = await buildApp();
    delete process.env.ADMIN_SECRET;
    delete process.env.VITE_ADMIN_SECRET;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateSettingsCache();
    app.getSettings = vi.fn().mockResolvedValue({ persistence: { mongo: { app: { uri: 'mongodb://mock' } } } });

    mockCollection = {
      createIndex: vi.fn().mockResolvedValue(true),
      replaceOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      // findOneAndUpdate default: returns null → makes upsertWithOcc fall through
      // to the insert path. Tests that need to simulate "doc exists" override this.
      findOneAndUpdate: vi.fn().mockResolvedValue(null),
      insertOne: vi.fn().mockResolvedValue({ acknowledged: true, insertedId: 'mock' }),
      deleteOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      updateOne: vi.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 }),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      bulkWrite: vi.fn().mockResolvedValue({ ok: 1 }),
    };

    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };

    vi.spyOn(mongoServer, 'getDb').mockResolvedValue(mockDb);
  });

  it('should insert a new entity when no document exists', async () => {
    // Default findOneAndUpdate mock returns null, findOne returns null → insert path.
    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/customers/cust-1',
      payload: { id: 'cust-1', _version: 0, name: 'Test Customer' }
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json._version).toBe(0);

    expect(mockDb.collection).toHaveBeenCalledWith('customers');
    expect(mockCollection.insertOne).toHaveBeenCalledWith({
      id: 'cust-1',
      name: 'Test Customer',
      _version: 0,
    });
  });

  it('should bump _version when updating an existing entity with matching version', async () => {
    mockCollection.findOneAndUpdate.mockResolvedValueOnce({
      id: 'cust-1', _version: 4, name: 'Updated',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/customers/cust-1',
      payload: { id: 'cust-1', _version: 3, name: 'Updated' }
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json._version).toBe(4);

    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'cust-1', _version: 3 },
      { $set: { id: 'cust-1', name: 'Updated', _version: 4 } },
      { returnDocument: 'after' }
    );
  });

  it('should match docs missing _version when client sends version 0', async () => {
    // Legacy doc (no _version field). Client sends _version: 0; server matches via $or.
    mockCollection.findOneAndUpdate.mockResolvedValueOnce({
      id: 'cust-legacy', _version: 1, name: 'Legacy',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/customers/cust-legacy',
      payload: { id: 'cust-legacy', _version: 0, name: 'Legacy' }
    });

    expect(response.statusCode).toBe(200);
    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'cust-legacy', $or: [{ _version: 0 }, { _version: { $exists: false } }] },
      expect.objectContaining({ $set: expect.objectContaining({ _version: 1 }) }),
      { returnDocument: 'after' }
    );
  });

  it('should return 409 with current document on version mismatch', async () => {
    // findOneAndUpdate misses (version mismatch). findOne returns the live doc.
    mockCollection.findOneAndUpdate.mockResolvedValueOnce(null);
    mockCollection.findOne.mockResolvedValueOnce({
      id: 'cust-1', _version: 7, name: 'Server-side wins',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/customers/cust-1',
      payload: { id: 'cust-1', _version: 3, name: 'Stale update' }
    });

    expect(response.statusCode).toBe(409);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.conflict).toBe(true);
    expect(json.current).toEqual({ id: 'cust-1', _version: 7, name: 'Server-side wins' });
    expect(mockCollection.insertOne).not.toHaveBeenCalled();
  });

  it('should upsert an allowed entity without ID in URL (ID in body)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/workItems',
      payload: { id: 'wi-2', _version: 0, name: 'Test Work Item' }
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);

    expect(mockDb.collection).toHaveBeenCalledWith('workItems');
    // workItems is a timestamped collection — a fresh insert stamps both
    // created_at and updated_at.
    expect(mockCollection.insertOne).toHaveBeenCalledWith({
      id: 'wi-2',
      name: 'Test Work Item',
      _version: 0,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it('should reject upsert if ID is missing from body when not in URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/workItems',
      payload: { _version: 0, name: 'Test Work Item without ID' }
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.payload);
    // Schema validation caught by global error handler
    expect(json.success).toBe(false);
    expect(json.error).toContain("required property 'id'");
  });

  it('should reject upsert if _version is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/workItems',
      payload: { id: 'wi-no-version', name: 'No version' }
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toContain("required property '_version'");
  });

  it('should reject an forbidden collection', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/users/user-1',
      payload: { id: 'user-1', _version: 0 }
    });

    expect(response.statusCode).toBe(403);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Forbidden collection');
  });

  it('should delete an entity', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/entity/workItems/wi-1'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);

    expect(mockDb.collection).toHaveBeenCalledWith('workItems');
    expect(mockCollection.deleteOne).toHaveBeenCalledWith({ id: 'wi-1' });
  });

  it('should cascade-remove customer_targets when deleting a customer', async () => {
    mockCollection.updateMany.mockResolvedValue({ modifiedCount: 3 });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/entity/customers/cust-1'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json.cascaded).toEqual({ workItems: 3 });

    expect(mockDb.collection).toHaveBeenCalledWith('customers');
    expect(mockCollection.deleteOne).toHaveBeenCalledWith({ id: 'cust-1' });
    expect(mockDb.collection).toHaveBeenCalledWith('workItems');
    expect(mockCollection.updateMany).toHaveBeenCalledWith(
      { 'customer_targets.customer_id': 'cust-1' },
      { $pull: { customer_targets: { customer_id: 'cust-1' } } }
    );
  });

  it('should cascade-clear work_item_id from issues and parent_id from child workItems when deleting a workItem', async () => {
    // First updateMany call (issues) returns 2; second (workItems children) returns 4.
    mockCollection.updateMany
      .mockResolvedValueOnce({ modifiedCount: 2 })
      .mockResolvedValueOnce({ modifiedCount: 4 });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/entity/workItems/wi-1'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json.cascaded).toEqual({ issues: 2, workItems: 4 });

    expect(mockCollection.updateMany).toHaveBeenCalledWith(
      { work_item_id: 'wi-1' },
      { $unset: { work_item_id: '' } }
    );
    expect(mockCollection.updateMany).toHaveBeenCalledWith(
      { parent_id: 'wi-1' },
      { $unset: { parent_id: '' } }
    );
  });

  it('should reject a workItem upsert whose parent_id is itself', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/workItems',
      payload: { id: 'wi-cycle', _version: 0, name: 'Self-parent', parent_id: 'wi-cycle' }
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/cycle/i);
    expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockCollection.insertOne).not.toHaveBeenCalled();
  });

  it('should reject a workItem upsert whose parent_id chain reaches itself (cycle)', async () => {
    // Chain: candidate parent wi-B  ->  wi-A  ->  (would be) wi-self.
    // findOne walks up: ask for wi-B's parent (wi-A), then wi-A's parent (wi-self) → cycle detected.
    mockCollection.findOne
      .mockResolvedValueOnce({ parent_id: 'wi-A' })   // wi-B
      .mockResolvedValueOnce({ parent_id: 'wi-self' }); // wi-A

    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/workItems',
      payload: { id: 'wi-self', _version: 0, name: 'Cycle child', parent_id: 'wi-B' }
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.payload);
    expect(json.error).toMatch(/cycle/i);
    expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockCollection.insertOne).not.toHaveBeenCalled();
  });

  it('should accept a workItem upsert with a valid (non-cyclic) parent_id', async () => {
    // wi-B (cycle-guard lookup) has no parent — chain terminates harmlessly.
    // upsertWithOcc's later findOne (existence check after findOneAndUpdate miss)
    // also returns null, taking the insert path.
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.findOne.mockResolvedValueOnce({ parent_id: undefined });

    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/workItems',
      payload: { id: 'wi-child', _version: 0, name: 'Valid child', parent_id: 'wi-B' }
    });

    expect(response.statusCode).toBe(200);
    expect(mockCollection.insertOne).toHaveBeenCalledWith({
      id: 'wi-child',
      name: 'Valid child',
      parent_id: 'wi-B',
      _version: 0,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it('should cascade-clear team_id when deleting a team', async () => {
    mockCollection.updateMany.mockResolvedValue({ modifiedCount: 5 });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/entity/teams/team-1'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json.cascaded).toEqual({ issues: 5 });

    expect(mockDb.collection).toHaveBeenCalledWith('issues');
    expect(mockCollection.updateMany).toHaveBeenCalledWith(
      { team_id: 'team-1' },
      { $set: { team_id: '' } }
    );
  });

  it('should not include cascaded key when no related documents are modified', async () => {
    mockCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/entity/customers/cust-orphan'
    });

    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json.cascaded).toEqual({});
  });

  it('should trigger score recomputation when saving a workItem', async () => {
    const recomputeSpy = vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockResolvedValue();

    await app.inject({
      method: 'POST',
      url: '/api/entity/workItems',
      payload: { id: 'wi-new', _version: 0, name: 'New Work Item' }
    });

    expect(recomputeSpy).toHaveBeenCalledWith(mockDb);
  });

  it('should trigger score recomputation when saving a customer', async () => {
    const recomputeSpy = vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockResolvedValue();

    await app.inject({
      method: 'POST',
      url: '/api/entity/customers',
      payload: { id: 'c-new', _version: 0, name: 'New Customer' }
    });

    expect(recomputeSpy).toHaveBeenCalledWith(mockDb);
  });

  it('should trigger score recomputation when saving an issue', async () => {
    const recomputeSpy = vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockResolvedValue();

    await app.inject({
      method: 'POST',
      url: '/api/entity/issues',
      payload: { id: 'e-new', _version: 0, jira_key: 'TEST-1' }
    });

    expect(recomputeSpy).toHaveBeenCalledWith(mockDb);
  });

  it('should NOT trigger score recomputation when saving a team', async () => {
    const recomputeSpy = vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockResolvedValue();

    await app.inject({
      method: 'POST',
      url: '/api/entity/teams',
      payload: { id: 't-new', _version: 0, name: 'New Team' }
    });

    expect(recomputeSpy).not.toHaveBeenCalled();
  });

  // ── PATCH /api/entity/:collection/:id ──────────────────────────────────
  it('PATCH should $set only the fields in `patch` and bump _version', async () => {
    mockCollection.findOneAndUpdate.mockResolvedValueOnce({
      id: 'c1', _version: 6, name: 'unchanged', description: 'new',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/entity/customers/c1',
      payload: { _version: 5, patch: { description: 'new' } },
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json._version).toBe(6);

    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'c1', _version: 5 },
      { $set: { description: 'new', _version: 6 } },
      { returnDocument: 'after' }
    );
  });

  it('PATCH should match legacy docs lacking _version when client sends 0', async () => {
    mockCollection.findOneAndUpdate.mockResolvedValueOnce({
      id: 'c1', _version: 1, name: 'updated',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/entity/customers/c1',
      payload: { _version: 0, patch: { name: 'updated' } },
    });

    expect(response.statusCode).toBe(200);
    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'c1', $or: [{ _version: 0 }, { _version: { $exists: false } }] },
      { $set: { name: 'updated', _version: 1 } },
      { returnDocument: 'after' }
    );
  });

  it('PATCH should return 409 with current doc on version mismatch', async () => {
    mockCollection.findOneAndUpdate.mockResolvedValueOnce(null);
    mockCollection.findOne.mockResolvedValueOnce({
      id: 'c1', _version: 11, name: 'remote',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/entity/customers/c1',
      payload: { _version: 3, patch: { name: 'mine' } },
    });

    expect(response.statusCode).toBe(409);
    const json = JSON.parse(response.payload);
    expect(json.conflict).toBe(true);
    expect(json.current).toEqual({ id: 'c1', _version: 11, name: 'remote' });
  });

  it('PATCH should return 404 when the document does not exist', async () => {
    mockCollection.findOneAndUpdate.mockResolvedValueOnce(null);
    mockCollection.findOne.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/entity/customers/missing',
      payload: { _version: 0, patch: { name: 'x' } },
    });

    expect(response.statusCode).toBe(404);
    const json = JSON.parse(response.payload);
    expect(json.error).toMatch(/not found/i);
  });

  it('PATCH should reject server-owned keys in `patch`', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/entity/workItems/w1',
      payload: { _version: 0, patch: { name: 'ok', calculated_score: 99, _version: 7, id: 'sneaky' } },
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.payload);
    expect(json.error).toMatch(/server-owned/);
    expect(json.error).toMatch(/calculated_score/);
    expect(json.error).toMatch(/_version/);
    expect(json.error).toMatch(/id/);
    expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('PATCH should reject a forbidden collection', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/entity/users/u1',
      payload: { _version: 0, patch: { name: 'x' } },
    });

    expect(response.statusCode).toBe(403);
    expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('PATCH should enforce the workItem cycle guard when parent_id is in the patch', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/entity/workItems/wi-cycle',
      payload: { _version: 0, patch: { parent_id: 'wi-cycle' } },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toMatch(/cycle/i);
    expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('PATCH should NOT run the cycle guard when parent_id is absent', async () => {
    mockCollection.findOneAndUpdate.mockResolvedValueOnce({ id: 'wi1', _version: 1, name: 'ok' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/entity/workItems/wi1',
      payload: { _version: 0, patch: { name: 'ok' } },
    });

    expect(response.statusCode).toBe(200);
    // findOne (used inside wouldCreateCycle) shouldn't have been called.
    expect(mockCollection.findOne).not.toHaveBeenCalled();
  });

  it('PATCH should trigger score recomputation on a score-affecting collection', async () => {
    const recomputeSpy = vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockResolvedValue();
    mockCollection.findOneAndUpdate.mockResolvedValueOnce({ id: 'wi1', _version: 1, name: 'ok' });

    await app.inject({
      method: 'PATCH',
      url: '/api/entity/workItems/wi1',
      payload: { _version: 0, patch: { name: 'ok' } },
    });

    expect(recomputeSpy).toHaveBeenCalledWith(mockDb);
  });

  // ── Lifecycle timestamps (workItems) ───────────────────────────────────
  describe('created_at / updated_at timestamps', () => {
    it('POST replace bumps updated_at and preserves an existing created_at', async () => {
      // Returned doc already has a created_at → it must survive untouched.
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        id: 'wi-1', _version: 4, name: 'Updated', created_at: '2020-01-01T00:00:00.000Z',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/entity/workItems/wi-1',
        payload: { id: 'wi-1', _version: 3, name: 'Updated' },
      });

      expect(response.statusCode).toBe(200);
      const setArg = mockCollection.findOneAndUpdate.mock.calls[0][1].$set;
      expect(setArg.updated_at).toEqual(expect.any(String));
      // created_at must not be in the write, so the stored value is preserved…
      expect('created_at' in setArg).toBe(false);
      // …and no lazy backfill is needed since the doc already had one.
      expect(mockCollection.updateOne).not.toHaveBeenCalled();
    });

    it('POST replace lazily backfills created_at on a legacy work item lacking it', async () => {
      // Returned doc has no created_at → backfilled on this update.
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({ id: 'wi-legacy', _version: 4, name: 'Updated' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/entity/workItems/wi-legacy',
        payload: { id: 'wi-legacy', _version: 3, name: 'Updated' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { id: 'wi-legacy' },
        { $set: { created_at: expect.any(String) } }
      );
    });

    it('POST insert stamps both created_at and updated_at', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/entity/workItems/wi-new',
        payload: { id: 'wi-new', _version: 0, name: 'Brand new' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockCollection.insertOne).toHaveBeenCalledWith(expect.objectContaining({
        id: 'wi-new',
        created_at: expect.any(String),
        updated_at: expect.any(String),
      }));
    });

    it('POST ignores a client-supplied created_at/updated_at on insert', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/entity/workItems/wi-forge',
        payload: { id: 'wi-forge', _version: 0, name: 'x', created_at: '1999-01-01T00:00:00.000Z', updated_at: '1999-01-01T00:00:00.000Z' },
      });

      const insertArg = mockCollection.insertOne.mock.calls[0][0];
      expect(insertArg.created_at).not.toBe('1999-01-01T00:00:00.000Z');
      expect(insertArg.updated_at).not.toBe('1999-01-01T00:00:00.000Z');
    });

    it('PATCH refreshes updated_at and strips a client-supplied created_at', async () => {
      // Returned doc already has created_at → no backfill; just refresh + strip.
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        id: 'wi1', _version: 1, name: 'ok', created_at: '2020-01-01T00:00:00.000Z',
      });

      await app.inject({
        method: 'PATCH',
        url: '/api/entity/workItems/wi1',
        payload: { _version: 0, patch: { name: 'ok', created_at: '1999-01-01T00:00:00.000Z' } },
      });

      const setArg = mockCollection.findOneAndUpdate.mock.calls[0][1].$set;
      expect(setArg.updated_at).toEqual(expect.any(String));
      expect(setArg.updated_at).not.toBe('1999-01-01T00:00:00.000Z');
      // The forged created_at must not reach the document.
      expect('created_at' in setArg).toBe(false);
      expect(mockCollection.updateOne).not.toHaveBeenCalled();
    });

    it('PATCH lazily backfills created_at on a legacy work item lacking it', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({ id: 'wi-legacy', _version: 1, name: 'ok' });

      await app.inject({
        method: 'PATCH',
        url: '/api/entity/workItems/wi-legacy',
        payload: { _version: 0, patch: { name: 'ok' } },
      });

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { id: 'wi-legacy' },
        { $set: { created_at: expect.any(String) } }
      );
    });

    it('does NOT stamp timestamps on a non-timestamped collection (customers)', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/entity/customers/c-ts',
        payload: { id: 'c-ts', _version: 0, name: 'No stamps' },
      });

      const insertArg = mockCollection.insertOne.mock.calls[0][0];
      expect('created_at' in insertArg).toBe(false);
      expect('updated_at' in insertArg).toBe(false);
    });
  });

  // ── Array element endpoints (Phase 3) ──────────────────────────────────
  describe('Array element endpoints', () => {
    it('POST /items/:arrayPath adds an element with a server-stamped id when none provided', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        id: 'c1', _version: 6, support_issues: [{ id: 'new-uuid', description: 'oops' }],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/entity/customers/c1/items/support_issues',
        payload: { _version: 5, item: { description: 'oops', status: 'to do' } },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.payload);
      expect(json.success).toBe(true);
      expect(json._version).toBe(6);
      expect(typeof json.item.id).toBe('string');
      expect(json.item.id.length).toBeGreaterThan(0);

      const call = mockCollection.findOneAndUpdate.mock.calls[0];
      expect(call[0]).toEqual({ id: 'c1', _version: 5 });
      expect(call[1].$set._version).toBe(6);
      expect(call[1].$push.support_issues.description).toBe('oops');
    });

    it('POST /items honours a client-supplied element id', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({ id: 'c1', _version: 1 });

      await app.inject({
        method: 'POST',
        url: '/api/entity/customers/c1/items/tcv_history',
        payload: { _version: 0, item: { id: 'h-100', value: 1000, valid_from: '2026-01-01' } },
      });

      const call = mockCollection.findOneAndUpdate.mock.calls[0];
      expect(call[1].$push.tcv_history.id).toBe('h-100');
    });

    it('POST /items rejects a non-whitelisted array path', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/entity/customers/c1/items/jira_support_issues',
        payload: { _version: 0, item: { key: 'X-1' } },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload).error).toMatch(/not editable element-wise/);
      expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('POST /items returns 409 with current parent doc on version mismatch', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(null);
      mockCollection.findOne.mockResolvedValueOnce({ id: 'c1', _version: 9, support_issues: [] });

      const response = await app.inject({
        method: 'POST',
        url: '/api/entity/customers/c1/items/support_issues',
        payload: { _version: 2, item: { description: 'stale' } },
      });

      expect(response.statusCode).toBe(409);
      const json = JSON.parse(response.payload);
      expect(json.conflict).toBe(true);
      expect(json.current._version).toBe(9);
    });

    it('POST /items returns 404 when the parent entity does not exist', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(null);
      mockCollection.findOne.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/entity/customers/missing/items/support_issues',
        payload: { _version: 0, item: { description: 'x' } },
      });

      expect(response.statusCode).toBe(404);
    });

    it('PATCH /items/:id $sets only the targeted element fields and bumps _version', async () => {
      // findOneAndUpdate must return the doc with the updated element present.
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        id: 'c1',
        _version: 4,
        support_issues: [{ id: 'si-1', description: 'new desc', status: 'to do' }],
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/entity/customers/c1/items/support_issues/si-1',
        payload: { _version: 3, patch: { description: 'new desc' } },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.payload);
      expect(json._version).toBe(4);

      const call = mockCollection.findOneAndUpdate.mock.calls[0];
      expect(call[0]).toEqual({ id: 'c1', _version: 3 });
      expect(call[1].$set).toEqual({
        _version: 4,
        'support_issues.$[elem].description': 'new desc',
      });
      expect(call[2].arrayFilters).toEqual([{ 'elem.id': 'si-1' }]);
    });

    it('PATCH /items rejects renaming the element key', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/entity/customers/c1/items/support_issues/si-1',
        payload: { _version: 0, patch: { id: 'si-2', description: 'x' } },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload).error).toMatch(/cannot patch the element's "id"/i);
      expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('PATCH /items returns 404 (and rolls back the version) when the element is missing', async () => {
      // findOneAndUpdate succeeds at the parent level but the arrayFilters didn't
      // match — Mongo silently no-ops the element-level $set. The handler then
      // rolls back the _version bump so the client sees a clean 404.
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        id: 'c1', _version: 4, support_issues: [{ id: 'si-other', description: 'unrelated' }],
      });
      mockCollection.updateOne = vi.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/entity/customers/c1/items/support_issues/si-missing',
        payload: { _version: 3, patch: { description: 'x' } },
      });

      expect(response.statusCode).toBe(404);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { id: 'c1', _version: 4 },
        { $set: { _version: 3 } }
      );
    });

    it('PATCH /items returns 409 on parent version mismatch', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(null);
      mockCollection.findOne.mockResolvedValueOnce({ id: 'c1', _version: 12 });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/entity/customers/c1/items/support_issues/si-1',
        payload: { _version: 4, patch: { description: 'x' } },
      });

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.payload).current._version).toBe(12);
    });

    it('DELETE /items removes the element and bumps _version', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({ id: 'c1', _version: 8 });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/entity/customers/c1/items/support_issues/si-1?_version=7',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)._version).toBe(8);

      const call = mockCollection.findOneAndUpdate.mock.calls[0];
      expect(call[0]).toEqual({ id: 'c1', _version: 7 });
      expect(call[1].$set._version).toBe(8);
      expect(call[1].$pull).toEqual({ support_issues: { id: 'si-1' } });
    });

    it('DELETE /items rejects when _version is not a non-negative integer', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/entity/customers/c1/items/support_issues/si-1?_version=oops',
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload).error).toMatch(/invalid _version/i);
    });

    it('DELETE /items returns 409 on parent version mismatch', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(null);
      mockCollection.findOne.mockResolvedValueOnce({ id: 'c1', _version: 12 });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/entity/customers/c1/items/support_issues/si-1?_version=2',
      });

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.payload).current._version).toBe(12);
    });

    it('matches legacy parent docs (no _version) when client sends 0', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({ id: 'c-legacy', _version: 1 });

      await app.inject({
        method: 'POST',
        url: '/api/entity/customers/c-legacy/items/support_issues',
        payload: { _version: 0, item: { description: 'first' } },
      });

      const call = mockCollection.findOneAndUpdate.mock.calls[0];
      expect(call[0]).toEqual({
        id: 'c-legacy',
        $or: [{ _version: 0 }, { _version: { $exists: false } }],
      });
    });
  });

  it('should NOT recompute scores when responding with 409 conflict', async () => {
    mockCollection.findOneAndUpdate.mockResolvedValueOnce(null);
    mockCollection.findOne.mockResolvedValueOnce({ id: 'wi-x', _version: 9, name: 'Conflict' });
    const recomputeSpy = vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockResolvedValue();

    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/workItems',
      payload: { id: 'wi-x', _version: 1, name: 'Stale' }
    });

    expect(response.statusCode).toBe(409);
    expect(recomputeSpy).not.toHaveBeenCalled();
  });

  it('should trigger score recomputation when deleting a score-affecting entity', async () => {
    const recomputeSpy = vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockResolvedValue();

    await app.inject({
      method: 'DELETE',
      url: '/api/entity/customers/cust-del'
    });

    expect(recomputeSpy).toHaveBeenCalledWith(mockDb);
  });

  it('should NOT trigger score recomputation when deleting a sprint', async () => {
    const recomputeSpy = vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockResolvedValue();

    await app.inject({
      method: 'DELETE',
      url: '/api/entity/sprints/s-del'
    });

    expect(recomputeSpy).not.toHaveBeenCalled();
  });
});
