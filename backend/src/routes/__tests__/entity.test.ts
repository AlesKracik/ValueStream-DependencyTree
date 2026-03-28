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
      deleteOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      bulkWrite: vi.fn().mockResolvedValue({ ok: 1 }),
    };

    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };

    vi.spyOn(mongoServer, 'getDb').mockResolvedValue(mockDb);
  });

  it('should upsert an allowed entity', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/customers/cust-1',
      payload: { id: 'cust-1', name: 'Test Customer' }
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    
    expect(mockDb.collection).toHaveBeenCalledWith('customers');
    expect(mockCollection.replaceOne).toHaveBeenCalledWith(
      { id: 'cust-1' },
      { id: 'cust-1', name: 'Test Customer' },
      { upsert: true }
    );
  });

  it('should upsert an allowed entity without ID in URL (ID in body)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/workItems',
      payload: { id: 'wi-2', name: 'Test Work Item' }
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    
    expect(mockDb.collection).toHaveBeenCalledWith('workItems');
    expect(mockCollection.replaceOne).toHaveBeenCalledWith(
      { id: 'wi-2' },
      { id: 'wi-2', name: 'Test Work Item' },
      { upsert: true }
    );
  });

  it('should reject upsert if ID is missing from body when not in URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/workItems',
      payload: { name: 'Test Work Item without ID' }
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.payload);
    // Schema validation caught by global error handler
    expect(json.success).toBe(false);
    expect(json.error).toContain("required property 'id'");
  });

  it('should reject an forbidden collection', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/entity/users/user-1',
      payload: { id: 'user-1' }
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

  it('should cascade-clear work_item_id when deleting a workItem', async () => {
    mockCollection.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/entity/workItems/wi-1'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json.cascaded).toEqual({ issues: 2 });

    expect(mockDb.collection).toHaveBeenCalledWith('issues');
    expect(mockCollection.updateMany).toHaveBeenCalledWith(
      { work_item_id: 'wi-1' },
      { $unset: { work_item_id: '' } }
    );
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
      payload: { id: 'wi-new', name: 'New Work Item' }
    });

    expect(recomputeSpy).toHaveBeenCalledWith(mockDb);
  });

  it('should trigger score recomputation when saving a customer', async () => {
    const recomputeSpy = vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockResolvedValue();

    await app.inject({
      method: 'POST',
      url: '/api/entity/customers',
      payload: { id: 'c-new', name: 'New Customer' }
    });

    expect(recomputeSpy).toHaveBeenCalledWith(mockDb);
  });

  it('should trigger score recomputation when saving an issue', async () => {
    const recomputeSpy = vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockResolvedValue();

    await app.inject({
      method: 'POST',
      url: '/api/entity/issues',
      payload: { id: 'e-new', jira_key: 'TEST-1' }
    });

    expect(recomputeSpy).toHaveBeenCalledWith(mockDb);
  });

  it('should NOT trigger score recomputation when saving a team', async () => {
    const recomputeSpy = vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockResolvedValue();

    await app.inject({
      method: 'POST',
      url: '/api/entity/teams',
      payload: { id: 't-new', name: 'New Team' }
    });

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
