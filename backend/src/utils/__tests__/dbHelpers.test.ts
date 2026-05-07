import { describe, it, expect } from 'vitest';
import { fetchWithThreshold, buildMongoQuery, applyValueStreamFilters, buildWorkspaceQueries, buildWorkItemSort, buildCustomerSort, DATA_THRESHOLD } from '../dbHelpers';

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

    it('applies sort to the cursor when sort spec is provided', async () => {
      // Verify the sort spec is forwarded to the cursor's .sort() call.
      let sortArg: any = undefined;
      const collection = {
        countDocuments: async () => 3,
        find: () => ({
          sort: (spec: any) => {
            sortArg = spec;
            return { toArray: async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
          },
          toArray: async () => [{ id: 'unsorted' }],
        }),
      } as any;

      const result = await fetchWithThreshold(collection, {}, 'sorted', { name: 1 });
      expect(sortArg).toEqual({ name: 1 });
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('a');
    });

    it('skips .sort() when no sort spec is provided', async () => {
      let sortCalled = false;
      const collection = {
        countDocuments: async () => 1,
        find: () => ({
          sort: () => { sortCalled = true; return { toArray: async () => [] }; },
          toArray: async () => [{ id: 'x' }],
        }),
      } as any;

      const result = await fetchWithThreshold(collection, {}, 'unsorted');
      expect(sortCalled).toBe(false);
      expect(result[0].id).toBe('x');
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

    // ── Work-items list-page filters ────────────────────────────────────────
    describe('workItems list-page filters', () => {
      it('builds case-insensitive name regex with regex special chars escaped', () => {
        // A name like "v2.0 (alpha)" must not be interpreted as a regex.
        const q = buildMongoQuery({ name: 'v2.0 (alpha)' }, 'workItems');
        expect(q.name.$options).toBe('i');
        // The dot, parens are escaped — the produced pattern matches the literal text.
        expect(new RegExp(q.name.$regex).test('v2.0 (alpha)')).toBe(true);
        expect(new RegExp(q.name.$regex).test('v2X0 (alpha)')).toBe(false);
      });

      it('ignores empty / whitespace-only name', () => {
        expect(buildMongoQuery({ name: '' }, 'workItems').name).toBeUndefined();
        expect(buildMongoQuery({ name: '   ' }, 'workItems').name).toBeUndefined();
      });

      it('builds min/max ranges for score, effort, tcv', () => {
        const q = buildMongoQuery({
          minScore: '10', maxScore: '100',
          minEffort: '5',
          maxTcv: '5000',
        }, 'workItems');
        expect(q.calculated_score).toEqual({ $gte: 10, $lte: 100 });
        expect(q.calculated_effort).toEqual({ $gte: 5 });
        expect(q.calculated_tcv).toEqual({ $lte: 5000 });
      });

      it('ignores empty range values', () => {
        const q = buildMongoQuery({ minScore: '', maxScore: '' }, 'workItems');
        expect(q.calculated_score).toBeUndefined();
      });

      it('merges new minScore with legacy minScoreFilter on the same field', () => {
        // Legacy minScoreFilter sets $gte; the new max should add $lte without losing it.
        const q = buildMongoQuery({ minScoreFilter: '50', maxScore: '200' }, 'workItems');
        expect(q.calculated_score).toEqual({ $gte: 50, $lte: 200 });
      });

      it('builds $in for status array (no Backlog → simple $in)', () => {
        const q = buildMongoQuery({ status: ['Planning', 'Done'] }, 'workItems');
        expect(q.status).toEqual({ $in: ['Planning', 'Done'] });
        expect(q.$or).toBeUndefined();
      });

      it('accepts a single status string and wraps it in $in', () => {
        const q = buildMongoQuery({ status: 'Done' }, 'workItems');
        expect(q.status).toEqual({ $in: ['Done'] });
      });

      it('expands Backlog selection to also match docs with missing/null/empty status', () => {
        // The UI renders `w.status || 'Backlog'`, so legacy items with no stored
        // status display as Backlog. Selecting Backlog must include them too.
        const q = buildMongoQuery({ status: ['Backlog'] }, 'workItems');
        expect(q.status).toBeUndefined();
        expect(q.$or).toEqual([
          { status: { $in: ['Backlog'] } },
          { status: { $exists: false } },
          { status: null },
          { status: '' },
        ]);
      });

      it('Backlog + another status keeps both real values AND missing-status docs', () => {
        const q = buildMongoQuery({ status: ['Backlog', 'Planning'] }, 'workItems');
        expect(q.$or).toEqual([
          { status: { $in: ['Backlog', 'Planning'] } },
          { status: { $exists: false } },
          { status: null },
          { status: '' },
        ]);
      });

      it('combines Backlog status + sprint multi-select via $and so each $or stays independent', () => {
        // Without $and, the second filter would overwrite $or and one of the
        // selections would silently stop applying.
        const q = buildMongoQuery({
          status: ['Backlog'],
          releasedSprintIds: ['s1'],
        }, 'workItems');
        expect(q.$or).toBeUndefined();
        expect(q.$and).toHaveLength(2);
        expect(q.$and).toContainEqual({ $or: [
          { status: { $in: ['Backlog'] } },
          { status: { $exists: false } },
          { status: null },
          { status: '' },
        ]});
        expect(q.$and).toContainEqual({ $or: [{ released_in_sprint_id: { $in: ['s1'] } }] });
      });

      it('builds $or for releasedSprintIds with real ids only', () => {
        const q = buildMongoQuery({ releasedSprintIds: ['s1', 's2'] }, 'workItems');
        expect(q.$or).toEqual([{ released_in_sprint_id: { $in: ['s1', 's2'] } }]);
      });

      it('builds $or that includes unreleased branches when "unreleased" is in the list', () => {
        const q = buildMongoQuery({ releasedSprintIds: ['s1', 'unreleased'] }, 'workItems');
        expect(q.$or).toHaveLength(3);
        expect(q.$or).toContainEqual({ released_in_sprint_id: { $in: ['s1'] } });
        expect(q.$or).toContainEqual({ released_in_sprint_id: { $exists: false } });
        expect(q.$or).toContainEqual({ released_in_sprint_id: '' });
      });

      it('builds $or with only unreleased branches when "unreleased" alone is selected', () => {
        const q = buildMongoQuery({ releasedSprintIds: ['unreleased'] }, 'workItems');
        expect(q.$or).toHaveLength(2);
        expect(q.$or).toContainEqual({ released_in_sprint_id: { $exists: false } });
        expect(q.$or).toContainEqual({ released_in_sprint_id: '' });
      });

      it('releasedSprintIds supersedes legacy releasedFilter when both are set', () => {
        // Without this rule, the two would fight — released_in_sprint_id { $exists: true } AND $or { not exists }.
        const q = buildMongoQuery({ releasedFilter: 'released', releasedSprintIds: ['s1'] }, 'workItems');
        expect(q.released_in_sprint_id).toBeUndefined();
        expect(q.$or).toEqual([{ released_in_sprint_id: { $in: ['s1'] } }]);
      });

      // ── Priority range tied to active metric ─────────────────────────
      it('priority range targets calculated_score when priorityMetric defaults', () => {
        const q = buildMongoQuery({ minPriority: '10', maxPriority: '100' }, 'workItems');
        expect(q.calculated_score).toEqual({ $gte: 10, $lte: 100 });
      });

      it('priority range targets aha_synced_data.score when priorityMetric=aha_score', () => {
        const q = buildMongoQuery({ minPriority: '10', priorityMetric: 'aha_score' }, 'workItems');
        expect(q['aha_synced_data.score']).toEqual({ $gte: 10 });
      });

      it('priority range targets stackrank when priorityMetric=stackrank', () => {
        const q = buildMongoQuery({ maxPriority: '500', priorityMetric: 'stackrank' }, 'workItems');
        expect(q.stackrank).toEqual({ $lte: 500 });
      });

      it('falls back to calculated_score for an unknown priorityMetric', () => {
        const q = buildMongoQuery({ minPriority: '5', priorityMetric: 'bogus' }, 'workItems');
        expect(q.calculated_score).toEqual({ $gte: 5 });
      });

      it('combines name + ranges + status + sprints', () => {
        const q = buildMongoQuery({
          name: 'auth',
          minScore: '50',
          status: ['Planning', 'Development'],
          releasedSprintIds: ['s1'],
        }, 'workItems');
        expect(q.name).toEqual({ $regex: 'auth', $options: 'i' });
        expect(q.calculated_score).toEqual({ $gte: 50 });
        expect(q.status).toEqual({ $in: ['Planning', 'Development'] });
        expect(q.$or).toEqual([{ released_in_sprint_id: { $in: ['s1'] } }]);
      });

      it('does not apply work-item-only filters to other collections', () => {
        // `name` is a shared list-page filter (both collections honor it), but
        // the work-item-specific `minScore` and `status` params must not bleed
        // into the customers query.
        const q = buildMongoQuery({ name: 'foo', minScore: '10', status: ['Backlog'] }, 'customers');
        expect(q.calculated_score).toBeUndefined();
        expect(q.status).toBeUndefined();
        // Sanity: `name` is honored by the customer branch as a regex filter.
        expect(q.name?.$regex).toBe('foo');
      });
    });
  });

  describe('buildMongoQuery — customers list-page filters', () => {
    it('builds case-insensitive name regex with regex special chars escaped', () => {
      const q = buildMongoQuery({ name: 'A.B (test)' }, 'customers');
      expect(q.name.$options).toBe('i');
      expect(new RegExp(q.name.$regex).test('A.B (test)')).toBe(true);
      // Dot is escaped — should not match arbitrary char.
      expect(new RegExp(q.name.$regex).test('AXB (test)')).toBe(false);
    });

    it('list-page name overrides legacy customerFilter when both are set', () => {
      const q = buildMongoQuery({ customerFilter: 'old', name: 'new' }, 'customers');
      expect(q.name.$regex).toContain('new');
    });

    it('ignores empty / whitespace-only name', () => {
      expect(buildMongoQuery({ name: '' }, 'customers').name).toBeUndefined();
      expect(buildMongoQuery({ name: '   ' }, 'customers').name).toBeUndefined();
    });

    it('builds min/max range for existing_tcv', () => {
      const q = buildMongoQuery({ minExistingTcv: '1000', maxExistingTcv: '5000' }, 'customers');
      expect(q.existing_tcv).toEqual({ $gte: 1000, $lte: 5000 });
    });

    it('builds min-only range for potential_tcv', () => {
      const q = buildMongoQuery({ minPotentialTcv: '500' }, 'customers');
      expect(q.potential_tcv).toEqual({ $gte: 500 });
    });

    it('builds total_tcv via $expr summing existing_tcv + potential_tcv', () => {
      const q = buildMongoQuery({ minTotalTcv: '2000', maxTotalTcv: '20000' }, 'customers');
      expect(q.$expr).toBeDefined();
      // Should be { $and: [{ $gte: [sum, 2000] }, { $lte: [sum, 20000] }] }
      expect(q.$expr.$and).toHaveLength(2);
      expect(q.$expr.$and[0].$gte[1]).toBe(2000);
      expect(q.$expr.$and[1].$lte[1]).toBe(20000);
      // Inner sum expression covers both fields with $ifNull guards.
      const sumExpr = q.$expr.$and[0].$gte[0];
      expect(sumExpr.$add).toBeDefined();
    });

    it('builds total_tcv with single bound (no $and wrapper)', () => {
      const q = buildMongoQuery({ minTotalTcv: '2000' }, 'customers');
      expect(q.$expr.$gte).toBeDefined();
      expect(q.$expr.$gte[1]).toBe(2000);
      expect(q.$expr.$and).toBeUndefined();
    });

    it('ignores empty range values', () => {
      const q = buildMongoQuery({ minExistingTcv: '', maxPotentialTcv: '' }, 'customers');
      expect(q.existing_tcv).toBeUndefined();
      expect(q.potential_tcv).toBeUndefined();
      expect(q.$expr).toBeUndefined();
    });

    it('does not apply customer filters to other collections', () => {
      const q = buildMongoQuery({
        name: 'foo',
        minExistingTcv: '100',
        minTotalTcv: '500',
      }, 'workItems');
      // 'name' on workItems is the work-item name filter — that's fine, but the
      // tcv-range filters shouldn't bleed into workItems.
      expect(q.existing_tcv).toBeUndefined();
      expect(q.potential_tcv).toBeUndefined();
      // No customer-specific $expr on workItems.
      expect(q.$expr).toBeUndefined();
    });
  });

  describe('buildCustomerSort', () => {
    it('returns null when sortBy is missing or empty', () => {
      expect(buildCustomerSort({})).toBeNull();
      expect(buildCustomerSort({ sortBy: '' })).toBeNull();
      expect(buildCustomerSort(null)).toBeNull();
    });

    it('returns null for unsupported sort keys', () => {
      // 'total' would require an aggregation pipeline — intentionally unsupported.
      expect(buildCustomerSort({ sortBy: 'total' })).toBeNull();
      expect(buildCustomerSort({ sortBy: 'unknown' })).toBeNull();
    });

    it('maps known sort keys to MongoDB fields with default asc direction', () => {
      expect(buildCustomerSort({ sortBy: 'name' })).toEqual({ name: 1 });
      expect(buildCustomerSort({ sortBy: 'existing' })).toEqual({ existing_tcv: 1 });
      expect(buildCustomerSort({ sortBy: 'potential' })).toEqual({ potential_tcv: 1 });
    });

    it('honors sortOrder=desc', () => {
      expect(buildCustomerSort({ sortBy: 'existing', sortOrder: 'desc' })).toEqual({ existing_tcv: -1 });
    });
  });

  describe('buildWorkItemSort', () => {
    it('returns null when sortBy is missing or empty', () => {
      expect(buildWorkItemSort({})).toBeNull();
      expect(buildWorkItemSort({ sortBy: '' })).toBeNull();
      expect(buildWorkItemSort(null)).toBeNull();
    });

    it('returns null for unsupported sort keys (e.g. released)', () => {
      // 'released' would sort by raw sprint id which is meaningless; intentionally unsupported.
      expect(buildWorkItemSort({ sortBy: 'released' })).toBeNull();
      expect(buildWorkItemSort({ sortBy: 'unknown' })).toBeNull();
    });

    it('maps known sort keys to MongoDB fields with default asc direction', () => {
      expect(buildWorkItemSort({ sortBy: 'name' })).toEqual({ name: 1 });
      expect(buildWorkItemSort({ sortBy: 'priority' })).toEqual({ calculated_score: 1 });
      expect(buildWorkItemSort({ sortBy: 'score' })).toEqual({ calculated_score: 1 });
      expect(buildWorkItemSort({ sortBy: 'effort' })).toEqual({ calculated_effort: 1 });
      expect(buildWorkItemSort({ sortBy: 'tcv' })).toEqual({ calculated_tcv: 1 });
      expect(buildWorkItemSort({ sortBy: 'status' })).toEqual({ status: 1 });
    });

    it('honors sortOrder=desc', () => {
      expect(buildWorkItemSort({ sortBy: 'priority', sortOrder: 'desc' })).toEqual({ calculated_score: -1 });
    });

    it('priority sort routes to the active metric field', () => {
      expect(buildWorkItemSort({ sortBy: 'priority', priorityMetric: 'aha_score' }))
        .toEqual({ 'aha_synced_data.score': 1 });
      expect(buildWorkItemSort({ sortBy: 'priority', priorityMetric: 'stackrank', sortOrder: 'desc' }))
        .toEqual({ stackrank: -1 });
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
