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
});
