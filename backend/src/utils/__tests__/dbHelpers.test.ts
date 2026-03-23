import { describe, it, expect } from 'vitest';
import { fetchWithThreshold, buildMongoQuery, applyValueStreamFilters, buildWorkspaceQueries, DATA_THRESHOLD } from '../dbHelpers';

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

    it('builds minScoreFilter for workItems using calculated_score', () => {
      const query = buildMongoQuery({ minScoreFilter: '20' }, 'workItems');
      expect(query.calculated_score).toEqual({ $gte: 20 });
    });

    it('ignores minScoreFilter of 0', () => {
      const query = buildMongoQuery({ minScoreFilter: '0' }, 'workItems');
      expect(query.calculated_score).toBeUndefined();
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

  describe('buildWorkspaceQueries', () => {
    it('returns empty queries when params are empty', () => {
      const result = buildWorkspaceQueries({});
      expect(result.customers).toEqual({});
      expect(result.workItems).toEqual({});
      expect(result.teams).toEqual({});
      expect(result.issues).toEqual({});
    });

    it('builds customer name regex', () => {
      const result = buildWorkspaceQueries({ customerFilter: 'Acme' });
      expect(result.customers.name).toEqual({ $regex: 'Acme', $options: 'i' });
    });

    it('builds customer minTcv with $expr', () => {
      const result = buildWorkspaceQueries({ minTcvFilter: '1000' });
      expect(result.customers.$expr).toBeDefined();
      expect(result.customers.$expr.$gte).toBeDefined();
    });

    it('ignores minTcvFilter of 0', () => {
      const result = buildWorkspaceQueries({ minTcvFilter: '0' });
      expect(result.customers.$expr).toBeUndefined();
    });

    it('builds workItem name regex', () => {
      const result = buildWorkspaceQueries({ workItemFilter: 'Auth' });
      expect(result.workItems.name).toEqual({ $regex: 'Auth', $options: 'i' });
    });

    it('builds minScore filter using calculated_score', () => {
      const result = buildWorkspaceQueries({ minScoreFilter: '50' });
      expect(result.workItems.calculated_score).toEqual({ $gte: 50 });
    });

    it('builds released filter for workItems', () => {
      const released = buildWorkspaceQueries({ releasedFilter: 'released' });
      expect(released.workItems.released_in_sprint_id).toEqual({ $exists: true, $ne: '' });

      const unreleased = buildWorkspaceQueries({ releasedFilter: 'unreleased' });
      expect(unreleased.workItems.$or).toHaveLength(2);
    });

    it('ignores releasedFilter=all', () => {
      const result = buildWorkspaceQueries({ releasedFilter: 'all' });
      expect(result.workItems.released_in_sprint_id).toBeUndefined();
      expect(result.workItems.$or).toBeUndefined();
    });

    it('builds team name regex', () => {
      const result = buildWorkspaceQueries({ teamFilter: 'Backend' });
      expect(result.teams.name).toEqual({ $regex: 'Backend', $options: 'i' });
    });

    it('builds issue name regex', () => {
      const result = buildWorkspaceQueries({ issueFilter: 'fix' });
      expect(result.issues.name).toEqual({ $regex: 'fix', $options: 'i' });
    });

    it('combines multiple filters', () => {
      const result = buildWorkspaceQueries({
        customerFilter: 'Acme',
        workItemFilter: 'Auth',
        minScoreFilter: '20',
        releasedFilter: 'released',
        teamFilter: 'Backend',
      });
      expect(result.customers.name).toBeDefined();
      expect(result.workItems.name).toBeDefined();
      expect(result.workItems.calculated_score).toEqual({ $gte: 20 });
      expect(result.workItems.released_in_sprint_id).toBeDefined();
      expect(result.teams.name).toBeDefined();
    });
  });

  describe('applyValueStreamFilters', () => {
    // applyValueStreamFilters now only handles cross-entity filters
    // (issue team membership, sprint range) and the post-filter threshold.
    // Name/score/released/minTcv filters are handled at DB level by buildWorkspaceQueries.
    const baseData = {
      customers: [
        { id: 'c1', name: 'Acme Corp', existing_tcv: 5000, potential_tcv: 1000 },
        { id: 'c2', name: 'Beta Inc', existing_tcv: 200, potential_tcv: 0 },
        { id: 'c3', name: 'Gamma LLC', existing_tcv: 0, potential_tcv: 100 },
      ],
      workItems: [
        { id: 'w1', name: 'Auth Rewrite', calculated_score: 50, released_in_sprint_id: 's1' },
        { id: 'w2', name: 'Dashboard', calculated_score: 10 },
        { id: 'w3', name: 'API Gateway', calculated_score: 80 },
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

    it('filters issues by team membership when teamFilter is set', () => {
      // teamFilter causes teams to be pre-filtered at DB level.
      // Here we simulate that by providing only matching teams.
      // applyValueStreamFilters then filters issues to only those in visible teams.
      const dataWithFilteredTeams = {
        ...baseData,
        teams: [{ id: 't2', name: 'Frontend Team' }],
      };
      const result = applyValueStreamFilters(dataWithFilteredTeams, { teamFilter: 'frontend' });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].id).toBe('e2'); // team_id: 't2'
    });

    it('filters issues by sprint range (startSprintId)', () => {
      const result = applyValueStreamFilters(baseData, { startSprintId: 's2' });
      // s2 starts 2026-02-01. Issues whose end >= 2026-02-01 pass.
      expect(result.issues).toHaveLength(2);
      expect(result.issues.map((e: any) => e.id)).toEqual(['e2', 'e3']);
    });

    it('filters issues by sprint range (endSprintId)', () => {
      const result = applyValueStreamFilters(baseData, { endSprintId: 's2' });
      // s2 ends 2026-02-14. Issues whose start <= 2026-02-14 pass.
      expect(result.issues).toHaveLength(2);
      expect(result.issues.map((e: any) => e.id)).toEqual(['e1', 'e2']);
    });

    it('filters issues by both startSprintId and endSprintId', () => {
      const result = applyValueStreamFilters(baseData, { startSprintId: 's2', endSprintId: 's2' });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].id).toBe('e2');
    });

    it('excludes issues without dates when sprint range is set', () => {
      const data = {
        ...baseData,
        issues: [
          ...baseData.issues,
          { id: 'e4', name: 'No dates', team_id: 't1' },
        ],
      };
      const result = applyValueStreamFilters(data, { startSprintId: 's1' });
      expect(result.issues.find((e: any) => e.id === 'e4')).toBeUndefined();
    });

    it('combines team filter and sprint range (AND logic)', () => {
      const dataWithFilteredTeams = {
        ...baseData,
        teams: [{ id: 't1', name: 'Backend Team' }],
      };
      const result = applyValueStreamFilters(dataWithFilteredTeams, {
        teamFilter: 'backend',
        startSprintId: 's2',
      });
      // Team t1 issues: e1 (ends Jan 14) and e3 (ends Mar 14)
      // Sprint range s2 start: Feb 1 — e1 excluded, e3 included
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].id).toBe('e3');
    });

    it('throws 413 when filtered result still exceeds threshold', () => {
      const largeData = {
        ...baseData,
        customers: Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, name: `Cust ${i}`, existing_tcv: 100, potential_tcv: 0 })),
        workItems: Array.from({ length: 200 }, (_, i) => ({ id: `w${i}`, name: `Work ${i}`, calculated_score: 10 })),
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

    it('does not filter customers/workItems/teams directly (handled at DB level)', () => {
      // These filters are now applied via buildWorkspaceQueries at the DB level.
      // applyValueStreamFilters should pass them through unchanged.
      const result = applyValueStreamFilters(baseData, {
        customerFilter: 'Acme',
        workItemFilter: 'Auth',
        minScoreFilter: '50',
        releasedFilter: 'released',
        minTcvFilter: '1000',
      });
      // All customers/workItems/teams pass through — only issue filtering applies
      expect(result.customers).toHaveLength(3);
      expect(result.workItems).toHaveLength(3);
      expect(result.teams).toHaveLength(2);
    });
  });
});
