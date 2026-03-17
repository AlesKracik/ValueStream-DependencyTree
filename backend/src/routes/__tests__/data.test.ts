import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import * as mongoServer from '../../utils/mongoServer';
import fs from 'fs';

describe('Data Routes', () => {
  let app: FastifyInstance;
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

    const createMockCollection = (data: any[]) => ({
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(data)
      }),
      updateOne: vi.fn().mockResolvedValue(true)
    });

    mockDb = {
      collection: vi.fn((colName: string) => {
        switch (colName) {
          case 'valueStreams': return createMockCollection([{ id: 'vs1', name: 'Main VS' }]);
          case 'sprints': return createMockCollection([{ id: 's1', start_date: '2026-01-01', end_date: '2026-01-14' }]);
          case 'customers': return createMockCollection([{ id: 'c1', existing_tcv: 1000 }]);
          case 'workItems': return createMockCollection([{ id: 'w1', total_effort_mds: 10 }]);
          case 'teams': return createMockCollection([{ id: 't1', name: 'Team A' }]);
          case 'issues': return createMockCollection([{ id: 'e1', effort_md: 5, work_item_id: 'w1' }]);
          default: return createMockCollection([]);
        }
      })
    };

    vi.spyOn(mongoServer, 'getDb').mockResolvedValue(mockDb);
    
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      if (typeof p === 'string' && (p.endsWith('settings.json') || p.endsWith('backend'))) return true;
      return originalExistsSync(p);
    });

    const originalReadFileSync = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((p: any, options: any) => {
      if (typeof p === 'string' && p.endsWith('settings.json')) {
        return JSON.stringify({ persistence: { mongo: { app: { uri: 'mongodb://mock' } } } });
      }
      return originalReadFileSync(p, options);
    });

    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
  });

  it('should load aggregated data and calculate scores', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/workspace'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    
    // Check if entities were loaded
    expect(json.customers).toHaveLength(1);
    expect(json.workItems).toHaveLength(1);
    expect(json.teams).toHaveLength(1);
    expect(json.issues).toHaveLength(1);
    expect(json.sprints).toHaveLength(1);
    expect(json.valueStreams).toHaveLength(1);

    // Check if score was calculated (Work Item score calculation logic applies)
    expect(json.workItems[0].score).toBeDefined();

    // Check if maxMetrics were calculated
    expect(json.metrics).toBeDefined();
    expect(json.metrics.maxScore).toBeDefined();
    expect(json.metrics.maxRoi).toBeDefined();
  });

  it('should calculate global maxScore and maxRoi correctly based on work item targeting', async () => {
    // Override the mock DB just for this test
    const createMockCollection = (data: any[]) => ({
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(data)
      }),
      updateOne: vi.fn().mockResolvedValue(true)
    });

    mockDb.collection = vi.fn((colName: string) => {
      switch (colName) {
        case 'customers': return createMockCollection([
            { id: 'c1', existing_tcv: 10000, potential_tcv: 5000 },
            { id: 'c2', existing_tcv: 20000, potential_tcv: 0 }
        ]);
        case 'workItems': return createMockCollection([
            { id: 'w1', total_effort_mds: 10, customer_targets: [{ customer_id: 'c1', tcv_type: 'existing' }] },
            { id: 'w2', total_effort_mds: 5, customer_targets: [{ customer_id: 'c2', tcv_type: 'existing' }] },
            { id: 'w3', total_effort_mds: 2, all_customers_target: true }
        ]);
        default: return createMockCollection([]);
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/workspace'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    
    expect(json.metrics).toBeDefined();
    // w1 ROI: 10000 / 10 = 1000
    // w2 ROI: 20000 / 5 = 4000
    // w3 ROI (all_customers): Max of (10000/2, 20000/2) = 10000
    expect(json.metrics.maxRoi).toBe(10000); 
  });

  it('should automatically assign and update missing fiscal quarters on sprints', async () => {
    let updatedSprintId = null;
    let updatedQuarter = null;

    const createMockCollection = (data: any[]) => ({
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(data)
      }),
      updateOne: vi.fn().mockImplementation(async (query, update) => {
          updatedSprintId = query.id;
          updatedQuarter = update.$set.quarter;
          return { acknowledged: true };
      })
    });

    mockDb.collection = vi.fn((colName: string) => {
        if (colName === 'sprints') {
            // Note: missing 'quarter' field
            return createMockCollection([{ id: 'sprint-no-q', start_date: '2026-03-01', end_date: '2026-03-14' }]);
        }
        return createMockCollection([]);
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/workspace'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    
    // The endpoint should have mutated the object before returning
    expect(json.sprints[0].quarter).toBeDefined();
    expect(json.sprints[0].quarter).toBe('FY27Q1'); // Mar 2026 is Q1 of FY27 if start month is 1

    // Ensure the DB update was actually called
    expect(updatedSprintId).toBe('sprint-no-q');
    expect(updatedQuarter).toBe('FY27Q1');
  });

  it('should handle unconfigured App database gracefully', async () => {
    // Override settings mock to simulate NO database configured
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        return JSON.stringify({ persistence: { mongo: { app: { uri: '' } } } }); // Empty URI
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/workspace'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    
    // Should return empty arrays instead of crashing
    expect(json.customers).toEqual([]);
    expect(json.workItems).toEqual([]);
    expect(json.settings).toBeDefined();
    expect(json.metrics.maxScore).toBe(1);
    expect(json.metrics.maxRoi).toBe(1);
  });
});
