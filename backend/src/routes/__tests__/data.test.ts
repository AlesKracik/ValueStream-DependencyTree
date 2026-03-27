import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import * as mongoServer from '../../utils/mongoServer';
import { invalidateSettingsCache } from '../../services/secretManager';

const mockSettings = { persistence: { mongo: { app: { uri: 'mongodb://mock' } } } };

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
    invalidateSettingsCache();
    app.getSettings = vi.fn().mockResolvedValue(mockSettings);

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
          case 'workItems': return createMockCollection([{
            id: 'w1', total_effort_mds: 10,
            calculated_score: 100, calculated_tcv: 1000, calculated_effort: 10
          }]);
          case 'teams': return createMockCollection([{ id: 't1', name: 'Team A' }]);
          case 'issues': return createMockCollection([{ id: 'e1', effort_md: 5, work_item_id: 'w1' }]);
          default: return createMockCollection([]);
        }
      })
    };

    vi.spyOn(mongoServer, 'getDb').mockResolvedValue(mockDb);
  });

  it('should load data with pre-computed scores and metrics', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/workspace'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);

    expect(json.customers).toHaveLength(1);
    expect(json.workItems).toHaveLength(1);
    expect(json.teams).toHaveLength(1);
    expect(json.issues).toHaveLength(1);
    expect(json.sprints).toHaveLength(1);
    expect(json.valueStreams).toHaveLength(1);

    // Pre-computed score fields should be present on workItems
    expect(json.workItems[0].calculated_score).toBe(100);
    expect(json.workItems[0].calculated_tcv).toBe(1000);

    // Metrics computed from pre-computed scores
    expect(json.metrics).toBeDefined();
    expect(json.metrics.maxScore).toBeGreaterThanOrEqual(1);
    expect(json.metrics.maxRoi).toBeGreaterThanOrEqual(0.0001);
  });

  it('should compute maxScore and maxRoi from pre-computed fields', async () => {
    const createMockCollection = (data: any[]) => ({
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(data)
      }),
      updateOne: vi.fn().mockResolvedValue(true)
    });

    mockDb.collection = vi.fn((colName: string) => {
      switch (colName) {
        case 'workItems': return createMockCollection([
            { id: 'w1', calculated_score: 500, calculated_tcv: 10000, calculated_effort: 10 },
            { id: 'w2', calculated_score: 200, calculated_tcv: 20000, calculated_effort: 5 },
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
    expect(json.metrics.maxScore).toBe(500);
    // maxRoi = max(10000/10, 20000/5) = max(1000, 4000) = 4000
    expect(json.metrics.maxRoi).toBe(4000);
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

    expect(json.sprints[0].quarter).toBeDefined();
    expect(json.sprints[0].quarter).toBe('FY27Q1');

    expect(updatedSprintId).toBe('sprint-no-q');
    expect(updatedQuarter).toBe('FY27Q1');
  });

  it('should build DB-level queries from ValueStream parameters', async () => {
    const createMockCollection = (data: any[]) => {
      const col = {
        find: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnThis(),
          toArray: vi.fn().mockResolvedValue(data)
        }),
        updateOne: vi.fn().mockResolvedValue(true)
      };
      return col;
    };

    const customerCol = createMockCollection([{ id: 'c1', name: 'Acme', existing_tcv: 5000 }]);
    const workItemCol = createMockCollection([{ id: 'w1', name: 'Auth', calculated_score: 50 }]);

    mockDb.collection = vi.fn((colName: string) => {
      switch (colName) {
        case 'valueStreams': return createMockCollection([
          { id: 'vs1', name: 'Test VS', parameters: { customerFilter: 'acme', minScoreFilter: '30' } }
        ]);
        case 'customers': return customerCol;
        case 'workItems': return workItemCol;
        default: return createMockCollection([]);
      }
    });

    await app.inject({
      method: 'GET',
      url: '/api/workspace?valueStreamId=vs1'
    });

    // Verify DB-level queries were passed to find()
    expect(customerCol.find).toHaveBeenCalledWith(
      expect.objectContaining({ name: { $regex: 'acme', $options: 'i' } })
    );
    expect(workItemCol.find).toHaveBeenCalledWith(
      expect.objectContaining({ calculated_score: { $gte: 30 } })
    );
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
          { id: 'w1', name: 'Feature A', calculated_score: 10 },
          { id: 'w2', name: 'Feature B', calculated_score: 20 }
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

    const manyCustomers = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, name: `Customer ${i}`, existing_tcv: 100, potential_tcv: 0 }));
    const manyWorkItems = Array.from({ length: 200 }, (_, i) => ({ id: `w${i}`, name: `WorkItem ${i}`, calculated_score: 5 }));
    const manyIssues = Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, name: `Issue ${i}`, team_id: 't1' }));

    mockDb.collection = vi.fn((colName: string) => {
      switch (colName) {
        case 'valueStreams': return createMockCollection([
          { id: 'vs-big', name: 'Big VS', parameters: {} }
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

    expect(col.find).toHaveBeenCalledWith(
      expect.objectContaining({ name: { $regex: 'Backend', $options: 'i' } })
    );
  });

  it('granular workItems endpoint uses pre-computed scores', async () => {
    const createMockCollection = (data: any[]) => ({
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(data)
      }),
    });

    const workItemCol = createMockCollection([
      { id: 'w1', calculated_score: 100, calculated_tcv: 5000, calculated_effort: 10 },
      { id: 'w2', calculated_score: 50, calculated_tcv: 2500, calculated_effort: 20 },
    ]);
    mockDb.collection = vi.fn(() => workItemCol);

    const response = await app.inject({
      method: 'GET',
      url: '/api/data/workItems'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.workItems).toHaveLength(2);
    expect(json.metrics.maxScore).toBe(100);
    expect(json.metrics.maxRoi).toBe(500); // 5000 / 10
  });

  it('should handle unconfigured App database gracefully', async () => {
    app.getSettings = vi.fn().mockResolvedValue({ persistence: { mongo: { app: { uri: '' } } } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/workspace'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);

    expect(json.customers).toEqual([]);
    expect(json.workItems).toEqual([]);
    expect(json.settings).toBeDefined();
    expect(json.metrics.maxScore).toBe(1);
    expect(json.metrics.maxRoi).toBe(1);
  });
});
