import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import * as mongoServer from '../../utils/mongoServer';
import fs from 'fs';

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

    mockCollection = {
      createIndex: vi.fn().mockResolvedValue(true),
      replaceOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      deleteOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    };

    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };

    vi.spyOn(mongoServer, 'getDb').mockResolvedValue(mockDb);
    
    const originalReadFileSync = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((p: any, options: any) => {
      if (typeof p === 'string' && p.endsWith('settings.json')) {
        return JSON.stringify({ persistence: { mongo: { app: { uri: 'mongodb://mock' } } } });
      }
      return originalReadFileSync(p, options);
    });

    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      if (typeof p === 'string' && p.endsWith('settings.json')) return true;
      return originalExistsSync(p);
    });
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
    expect(json.success).toBe(false);
    expect(json.error).toBe('Entity ID is required in body');
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
});
