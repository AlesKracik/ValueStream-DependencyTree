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

  it('should apply ValueStream static filters when valueStreamId is provided', async () => {
    const createMockCollection = (data: any[]) => ({
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(data)
      }),
      updateOne: vi.fn().mockResolvedValue(true)
    });

    mockDb.collection = vi.fn((colName: string) => {
      switch (colName) {
        case 'valueStreams': return createMockCollection([
          { id: 'vs1', name: 'Filtered VS', parameters: { customerFilter: 'acme', minScoreFilter: '30' } },
          { id: 'vs2', name: 'Unfiltered VS' }
        ]);
        case 'customers': return createMockCollection([
          { id: 'c1', name: 'Acme Corp', existing_tcv: 5000, potential_tcv: 0 },
          { id: 'c2', name: 'Beta Inc', existing_tcv: 1000, potential_tcv: 0 }
        ]);
        case 'workItems': return createMockCollection([
          { id: 'w1', name: 'High Score Feature', total_effort_mds: 5, customer_targets: [{ customer_id: 'c1', tcv_type: 'existing' }] },
          { id: 'w2', name: 'Low Score Bug', total_effort_mds: 100 }
        ]);
        case 'teams': return createMockCollection([{ id: 't1', name: 'Team A' }]);
        case 'issues': return createMockCollection([{ id: 'e1', effort_md: 5, work_item_id: 'w1' }]);
        case 'sprints': return createMockCollection([]);
        default: return createMockCollection([]);
      }
    });

    // With valueStreamId — static filters applied
    const filtered = await app.inject({
      method: 'GET',
      url: '/api/workspace?valueStreamId=vs1'
    });
    expect(filtered.statusCode).toBe(200);
    const filteredJson = JSON.parse(filtered.payload);

    // customerFilter='acme' should keep only Acme Corp
    expect(filteredJson.customers).toHaveLength(1);
    expect(filteredJson.customers[0].id).toBe('c1');

    // minScoreFilter='30' should filter low-score workItems
    // w1 has customer_targets with c1 (existing_tcv=5000), effort=5 → high score
    // w2 has no targets, effort=100 → score=0
    expect(filteredJson.workItems.every((w: any) => (w.score || 0) >= 30)).toBe(true);

    // Without valueStreamId — no static filters, all data returned
    const unfiltered = await app.inject({
      method: 'GET',
      url: '/api/workspace'
    });
    const unfilteredJson = JSON.parse(unfiltered.payload);
    expect(unfilteredJson.customers).toHaveLength(2);
    expect(unfilteredJson.workItems).toHaveLength(2);
  });

  it('should return all data when valueStreamId has no parameters', async () => {
    const createMockCollection = (data: any[]) => ({
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(data)
      }),
      updateOne: vi.fn().mockResolvedValue(true)
    });

    mockDb.collection = vi.fn((colName: string) => {
      switch (colName) {
        case 'valueStreams': return createMockCollection([
          { id: 'vs-no-params', name: 'No Params VS' }
        ]);
        case 'customers': return createMockCollection([
          { id: 'c1', name: 'Acme', existing_tcv: 100 },
          { id: 'c2', name: 'Beta', existing_tcv: 200 }
        ]);
        case 'workItems': return createMockCollection([
          { id: 'w1', name: 'Feature A', total_effort_mds: 5 },
          { id: 'w2', name: 'Feature B', total_effort_mds: 10 }
        ]);
        default: return createMockCollection([]);
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/workspace?valueStreamId=vs-no-params'
    });
    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.customers).toHaveLength(2);
    expect(json.workItems).toHaveLength(2);
  });

  it('should return 413 when filtered workspace data exceeds threshold', async () => {
    const createMockCollection = (data: any[]) => ({
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(data)
      }),
      updateOne: vi.fn().mockResolvedValue(true)
    });

    // Generate large dataset that exceeds threshold even after filtering
    const manyCustomers = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, name: `Customer ${i}`, existing_tcv: 100, potential_tcv: 0 }));
    const manyWorkItems = Array.from({ length: 200 }, (_, i) => ({ id: `w${i}`, name: `WorkItem ${i}`, total_effort_mds: 5 }));
    const manyIssues = Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, name: `Issue ${i}`, team_id: 't1' }));

    mockDb.collection = vi.fn((colName: string) => {
      switch (colName) {
        case 'valueStreams': return createMockCollection([
          { id: 'vs-big', name: 'Big VS', parameters: {} } // empty params → no filtering → over threshold
        ]);
        case 'customers': return createMockCollection(manyCustomers);
        case 'workItems': return createMockCollection(manyWorkItems);
        case 'teams': return createMockCollection([{ id: 't1', name: 'Team A' }]);
        case 'issues': return createMockCollection(manyIssues);
        case 'sprints': return createMockCollection([]);
        default: return createMockCollection([]);
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/workspace?valueStreamId=vs-big'
    });
    expect(response.statusCode).toBe(413);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toContain('too large');
  });

  it('should return 413 from granular endpoint when collection exceeds threshold', async () => {
    const bigData = Array.from({ length: 501 }, (_, i) => ({ id: `c${i}`, name: `Cust ${i}` }));
    const createMockCollection = (data: any[]) => ({
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(data)
      }),
    });

    mockDb.collection = vi.fn(() => createMockCollection(bigData));

    const response = await app.inject({
      method: 'GET',
      url: '/api/data/customers'
    });
    expect(response.statusCode).toBe(413);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toContain('customers');
  });

  it('granular endpoint should apply buildMongoQuery filters', async () => {
    const createMockCollection = (data: any[]) => ({
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(data)
      }),
    });

    const col = createMockCollection([{ id: 't1', name: 'Backend Team' }]);
    mockDb.collection = vi.fn(() => col);

    await app.inject({
      method: 'GET',
      url: '/api/data/teams?teamFilter=Backend'
    });

    // The find() call should have received the mongo query built from the teamFilter
    expect(col.find).toHaveBeenCalledWith(
      expect.objectContaining({ name: { $regex: 'Backend', $options: 'i' } })
    );
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
