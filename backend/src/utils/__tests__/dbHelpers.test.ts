import { describe, it, expect } from 'vitest';
import { fetchWithThreshold, buildMongoQuery, applyValueStreamFilters, DATA_THRESHOLD } from '../dbHelpers';

describe('dbHelpers', () => {

  describe('fetchWithThreshold', () => {
    const makeMockCollection = (items: any[]) => ({
      find: () => ({ toArray: async () => items }),
    } as any);

    it('returns items when count is within threshold', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}` }));
      const result = await fetchWithThreshold(makeMockCollection(items), {}, 'test');
      expect(result).toHaveLength(10);
    });

    it('throws 413 when count exceeds threshold', async () => {
      const items = Array.from({ length: DATA_THRESHOLD + 1 }, (_, i) => ({ id: `item-${i}` }));
      await expect(fetchWithThreshold(makeMockCollection(items), {}, 'bigCollection'))
        .rejects.toMatchObject({
          statusCode: 413,
          message: expect.stringContaining('bigCollection'),
        });
    });

    it('returns items at exactly the threshold', async () => {
      const items = Array.from({ length: DATA_THRESHOLD }, (_, i) => ({ id: `item-${i}` }));
      const result = await fetchWithThreshold(makeMockCollection(items), {}, 'test');
      expect(result).toHaveLength(DATA_THRESHOLD);
    });

    it('uses countDocuments when available and skips double-fetch', async () => {
      let findCallCount = 0;
      const collection = {
        countDocuments: async () => 5,
        find: () => {
          findCallCount++;
          return { toArray: async () => [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }] };
        },
      } as any;

      const result = await fetchWithThreshold(collection, {}, 'test');
      expect(result).toHaveLength(5);
      expect(findCallCount).toBe(1); // Only one find() call after countDocuments passes
    });

    it('throws 413 via countDocuments path when count exceeds threshold', async () => {
      const collection = {
        countDocuments: async () => DATA_THRESHOLD + 100,
        find: () => { throw new Error('find should not be called'); },
      } as any;

      await expect(fetchWithThreshold(collection, {}, 'huge'))
        .rejects.toMatchObject({ statusCode: 413 });
    });
  });

  describe('buildMongoQuery', () => {
    it('returns empty query when no filters match the collection', () => {
      expect(buildMongoQuery({ customerFilter: 'Acme' }, 'teams')).toEqual({});
      expect(buildMongoQuery({ teamFilter: 'Backend' }, 'customers')).toEqual({});
      expect(buildMongoQuery({}, 'workItems')).toEqual({});
    });

    it('builds customer name regex for customers collection', () => {
      const query = buildMongoQuery({ customerFilter: 'Acme' }, 'customers');
      expect(query.name).toEqual({ $regex: 'Acme', $options: 'i' });
    });

    it('builds team name regex for teams collection', () => {
      const query = buildMongoQuery({ teamFilter: 'Backend' }, 'teams');
      expect(query.name).toEqual({ $regex: 'Backend', $options: 'i' });
    });

    it('builds released filter for workItems', () => {
      const released = buildMongoQuery({ releasedFilter: 'released' }, 'workItems');
      expect(released.released_in_sprint_id).toEqual({ $exists: true, $ne: '' });

      const unreleased = buildMongoQuery({ releasedFilter: 'unreleased' }, 'workItems');
      expect(unreleased.$or).toBeDefined();
      expect(unreleased.$or).toHaveLength(2);
    });

    it('ignores releasedFilter=all for workItems', () => {
      const query = buildMongoQuery({ releasedFilter: 'all' }, 'workItems');
      expect(query).toEqual({});
    });

    it('does not map teamFilter to issues (requires name lookup)', () => {
      const query = buildMongoQuery({ teamFilter: 'Backend' }, 'issues');
      expect(query).toEqual({});
    });

    // Relational filters for detail pages
    it('filters workItems by customerId (customer_targets)', () => {
      const query = buildMongoQuery({ customerId: 'c1' }, 'workItems');
      expect(query['customer_targets.customer_id']).toBe('c1');
    });

    it('filters issues by workItemId', () => {
      const query = buildMongoQuery({ workItemId: 'w1' }, 'issues');
      expect(query.work_item_id).toBe('w1');
    });

    it('filters issues by teamId', () => {
      const query = buildMongoQuery({ teamId: 't1' }, 'issues');
      expect(query.team_id).toBe('t1');
    });

    it('ignores relational filters on wrong collection', () => {
      expect(buildMongoQuery({ customerId: 'c1' }, 'issues')).toEqual({});
      expect(buildMongoQuery({ workItemId: 'w1' }, 'customers')).toEqual({});
      expect(buildMongoQuery({ teamId: 't1' }, 'workItems')).toEqual({});
    });

    it('combines text and relational filters', () => {
      const query = buildMongoQuery({ releasedFilter: 'released', customerId: 'c1' }, 'workItems');
      expect(query['customer_targets.customer_id']).toBe('c1');
      expect(query.released_in_sprint_id).toEqual({ $exists: true, $ne: '' });
    });
  });

  describe('applyValueStreamFilters', () => {
    const baseData = {
      customers: [
        { id: 'c1', name: 'Acme Corp', existing_tcv: 5000, potential_tcv: 1000 },
        { id: 'c2', name: 'Beta Inc', existing_tcv: 200, potential_tcv: 0 },
        { id: 'c3', name: 'Gamma LLC', existing_tcv: 0, potential_tcv: 100 },
      ],
      workItems: [
        { id: 'w1', name: 'Auth Rewrite', score: 50, released_in_sprint_id: 's1' },
        { id: 'w2', name: 'Dashboard', score: 10 },
        { id: 'w3', name: 'API Gateway', score: 80 },
      ],
      teams: [
        { id: 't1', name: 'Backend Team' },
        { id: 't2', name: 'Frontend Team' },
      ],
      issues: [
        { id: 'e1', name: 'Fix login', team_id: 't1', target_start: '2026-01-01', target_end: '2026-01-14' },
        { id: 'e2', name: 'Add chart', team_id: 't2', target_start: '2026-02-01', target_end: '2026-02-14' },
        { id: 'e3', name: 'Refactor DB', team_id: 't1', target_start: '2026-03-01', target_end: '2026-03-14' },
      ],
      sprints: [
        { id: 's1', start_date: '2026-01-01', end_date: '2026-01-14' },
        { id: 's2', start_date: '2026-02-01', end_date: '2026-02-14' },
        { id: 's3', start_date: '2026-03-01', end_date: '2026-03-14' },
      ],
    };

    it('returns data unchanged when params is null/undefined', () => {
      expect(applyValueStreamFilters(baseData, null)).toBe(baseData);
      expect(applyValueStreamFilters(baseData, undefined)).toBe(baseData);
    });

    it('returns data unchanged when all params are empty/defaults', () => {
      const result = applyValueStreamFilters(baseData, {
        customerFilter: '', workItemFilter: '', teamFilter: '', issueFilter: '',
        releasedFilter: 'all', minTcvFilter: '', minScoreFilter: '',
      });
      expect(result.customers).toHaveLength(3);
      expect(result.workItems).toHaveLength(3);
      expect(result.teams).toHaveLength(2);
      expect(result.issues).toHaveLength(3);
    });

    it('filters customers by name (case-insensitive)', () => {
      const result = applyValueStreamFilters(baseData, { customerFilter: 'acme' });
      expect(result.customers).toHaveLength(1);
      expect(result.customers[0].id).toBe('c1');
    });

    it('filters customers by minTcv (existing + potential)', () => {
      const result = applyValueStreamFilters(baseData, { minTcvFilter: '1000' });
      expect(result.customers).toHaveLength(1);
      expect(result.customers[0].id).toBe('c1'); // 5000+1000 = 6000 >= 1000
    });

    it('combines customerFilter and minTcvFilter', () => {
      const result = applyValueStreamFilters(baseData, { customerFilter: 'a', minTcvFilter: '500' });
      // 'a' matches Acme (6000) and Gamma (100). minTcv 500 excludes Gamma.
      expect(result.customers).toHaveLength(1);
      expect(result.customers[0].id).toBe('c1');
    });

    it('filters workItems by name', () => {
      const result = applyValueStreamFilters(baseData, { workItemFilter: 'dash' });
      expect(result.workItems).toHaveLength(1);
      expect(result.workItems[0].id).toBe('w2');
    });

    it('filters workItems by released status', () => {
      const released = applyValueStreamFilters(baseData, { releasedFilter: 'released' });
      expect(released.workItems).toHaveLength(1);
      expect(released.workItems[0].id).toBe('w1');

      const unreleased = applyValueStreamFilters(baseData, { releasedFilter: 'unreleased' });
      expect(unreleased.workItems).toHaveLength(2);
      expect(unreleased.workItems.map((w: any) => w.id)).toEqual(['w2', 'w3']);
    });

    it('filters workItems by minScore', () => {
      const result = applyValueStreamFilters(baseData, { minScoreFilter: '20' });
      expect(result.workItems).toHaveLength(2);
      expect(result.workItems.map((w: any) => w.id)).toEqual(['w1', 'w3']);
    });

    it('filters teams by name', () => {
      const result = applyValueStreamFilters(baseData, { teamFilter: 'backend' });
      expect(result.teams).toHaveLength(1);
      expect(result.teams[0].id).toBe('t1');
    });

    it('filters issues by team membership when teamFilter is set', () => {
      const result = applyValueStreamFilters(baseData, { teamFilter: 'frontend' });
      expect(result.teams).toHaveLength(1);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].id).toBe('e2'); // team_id: 't2' (Frontend Team)
    });

    it('filters issues by name', () => {
      const result = applyValueStreamFilters(baseData, { issueFilter: 'fix' });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].id).toBe('e1');
    });

    it('filters issues by sprint range (startSprintId)', () => {
      const result = applyValueStreamFilters(baseData, { startSprintId: 's2' });
      // s2 starts 2026-02-01. Issues whose end >= 2026-02-01 pass.
      // e1: ends 2026-01-14 < 2026-02-01 → excluded
      // e2: ends 2026-02-14 >= 2026-02-01 → included
      // e3: ends 2026-03-14 >= 2026-02-01 → included
      expect(result.issues).toHaveLength(2);
      expect(result.issues.map((e: any) => e.id)).toEqual(['e2', 'e3']);
    });

    it('filters issues by sprint range (endSprintId)', () => {
      const result = applyValueStreamFilters(baseData, { endSprintId: 's2' });
      // s2 ends 2026-02-14. Issues whose start <= 2026-02-14 pass.
      // e1: starts 2026-01-01 <= 2026-02-14 → included
      // e2: starts 2026-02-01 <= 2026-02-14 → included
      // e3: starts 2026-03-01 > 2026-02-14 → excluded
      expect(result.issues).toHaveLength(2);
      expect(result.issues.map((e: any) => e.id)).toEqual(['e1', 'e2']);
    });

    it('filters issues by both startSprintId and endSprintId', () => {
      const result = applyValueStreamFilters(baseData, { startSprintId: 's2', endSprintId: 's2' });
      // Only issues overlapping with s2 (2026-02-01 to 2026-02-14)
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].id).toBe('e2');
    });

    it('excludes issues without dates when sprint range is set', () => {
      const data = {
        ...baseData,
        issues: [
          ...baseData.issues,
          { id: 'e4', name: 'No dates', team_id: 't1' }, // no target_start/end
        ],
      };
      const result = applyValueStreamFilters(data, { startSprintId: 's1' });
      expect(result.issues.find((e: any) => e.id === 'e4')).toBeUndefined();
    });

    it('combines multiple filters (AND logic)', () => {
      const result = applyValueStreamFilters(baseData, {
        teamFilter: 'backend',
        issueFilter: 'refactor',
      });
      // teamFilter: Backend Team → t1. issueFilter: 'refactor' → e3.
      // e3 has team_id t1 and name contains 'refactor' → passes both.
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].id).toBe('e3');
    });

    it('throws 413 when filtered result still exceeds threshold', () => {
      const largeData = {
        ...baseData,
        customers: Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, name: `Cust ${i}`, existing_tcv: 100, potential_tcv: 0 })),
        workItems: Array.from({ length: 200 }, (_, i) => ({ id: `w${i}`, name: `Work ${i}`, score: 10 })),
        issues: Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, name: `Issue ${i}`, team_id: 't1' })),
      };
      // Total: 200 + 200 + 2 teams + 200 = 602 > 500
      expect(() => applyValueStreamFilters(largeData, {}))
        .toThrow(/too large/);

      try {
        applyValueStreamFilters(largeData, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(413);
        expect(e.message).toContain('200 customers');
        expect(e.message).toContain('200 workItems');
      }
    });

    it('passes when filtering brings total below threshold', () => {
      const largeData = {
        ...baseData,
        workItems: Array.from({ length: 400 }, (_, i) => ({ id: `w${i}`, name: `Work ${i}`, score: i })),
      };
      // Unfiltered: 3 + 400 + 2 + 3 = 408 (under 500, passes)
      // But with minScore filter, it reduces further
      const result = applyValueStreamFilters(largeData, { minScoreFilter: '350' });
      expect(result.workItems).toHaveLength(50); // scores 350..399
    });
  });
});
