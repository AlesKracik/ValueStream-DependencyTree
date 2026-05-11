import { renderHook } from '@testing-library/react';
import { useGraphLayout } from '../useGraphLayout';
import type { DashboardFilters } from '../useGraphFilters';
import type { ValueStreamData } from '@valuestream/shared-types';
import { describe, it, expect } from 'vitest';

// Two customers spanning a wide TCV range, plus four work items that exercise
// every new filter dimension: status, released sprint, calculated_effort,
// calculated_score, aha score, and stackrank.
const MOCK_DATA: ValueStreamData = {
    valueStreams: [],
    settings: {
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: {
            app_provider: 'mongo',
            customer_provider: 'mongo',
            mongo: {
                app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
                customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
            }
        },
        jira: { base_url: '', api_version: '3', api_token: '', customer: { jql_new: '', jql_in_progress: '', jql_noop: '' } },
        aha: { subdomain: '', api_key: '' },
        ai: { provider: 'openai', support: { prompt: '' } },
        ldap: { url: '', bind_dn: '', team: { base_dn: '', search_filter: '' } },
        auth: { method: 'local' as const, session_expiry_hours: 24, default_role: 'viewer' as const },
    },
    customers: [
        { id: 'c1', name: 'Big Customer', existing_tcv: 8000, potential_tcv: 2000 },
        { id: 'c2', name: 'Tiny Customer', existing_tcv: 100, potential_tcv: 0 },
    ],
    workItems: [
        // Backlog, score 100, effort 5, aha 30, stackrank 1000, released to s1
        {
            id: 'w1', name: 'Alpha', total_effort_mds: 5, score: 100,
            calculated_score: 100, calculated_effort: 5, calculated_tcv: 8000,
            status: 'Backlog', released_in_sprint_id: 's1', stackrank: 1000,
            aha_synced_data: { score: 30 },
            customer_targets: [{ customer_id: 'c1', tcv_type: 'existing' }],
        },
        // Planning, score 40, effort 20, aha 80, stackrank 2000, unreleased
        {
            id: 'w2', name: 'Beta', total_effort_mds: 20, score: 40,
            calculated_score: 40, calculated_effort: 20, calculated_tcv: 4000,
            status: 'Planning', stackrank: 2000,
            aha_synced_data: { score: 80 },
            customer_targets: [{ customer_id: 'c1', tcv_type: 'potential' }],
        },
        // Done, score 200, effort 1, no aha, no stackrank, released to s2
        {
            id: 'w3', name: 'Gamma', total_effort_mds: 1, score: 200,
            calculated_score: 200, calculated_effort: 1, calculated_tcv: 2000,
            status: 'Done', released_in_sprint_id: 's2',
            customer_targets: [{ customer_id: 'c1', tcv_type: 'existing' }],
        },
        // Legacy work item: no `status` field at all (renders as Backlog in UI)
        {
            id: 'w4', name: 'Legacy', total_effort_mds: 8, score: 60,
            calculated_score: 60, calculated_effort: 8, calculated_tcv: 1000,
            status: '' as 'Backlog',
            customer_targets: [{ customer_id: 'c1', tcv_type: 'existing' }],
        },
    ],
    teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 100 }],
    issues: [
        { id: 'e1', jira_key: 'E1', work_item_id: 'w1', team_id: 't1', effort_md: 5, target_start: '2026-01-01', target_end: '2026-01-14' },
        { id: 'e2', jira_key: 'E2', work_item_id: 'w2', team_id: 't1', effort_md: 20, target_start: '2026-01-15', target_end: '2026-01-28' },
        { id: 'e3', jira_key: 'E3', work_item_id: 'w3', team_id: 't1', effort_md: 1, target_start: '2026-01-29', target_end: '2026-02-11' },
        { id: 'e4', jira_key: 'E4', work_item_id: 'w4', team_id: 't1', effort_md: 8, target_start: '2026-02-12', target_end: '2026-02-25' },
    ],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' },
        { id: 's2', name: 'Sprint 2', start_date: '2026-01-15', end_date: '2026-01-28' },
    ],
    metrics: { maxScore: 200, maxRoi: 200 },
};

/** Run useGraphLayout with the new dashboard filters at the end. */
function runWith(df: DashboardFilters) {
    return renderHook(() =>
        useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', '', '', true, 0, 0, null, null, 'score', df)
    );
}

const visibleWorkItemIds = (nodes: ReturnType<typeof renderHook<{ nodes: { id: string }[] }, unknown>>['result']['current']['nodes']) =>
    new Set(nodes.filter(n => n.id.startsWith('workitem-')).map(n => n.id.replace('workitem-', '')));

describe('useGraphLayout - dashboard filters', () => {
    it('maxTcv drops customers above the upper bound', () => {
        const { result } = runWith({ maxTcv: 500 });
        const customerIds = new Set(result.current.nodes.filter(n => n.id.startsWith('customer-')).map(n => n.id.replace('customer-', '')));
        // c1 (10000) drops, c2 (100) survives.
        expect(customerIds.has('c2')).toBe(true);
        expect(customerIds.has('c1')).toBe(false);
    });

    it('minEffort / maxEffort filters work items by calculated_effort', () => {
        const { result } = runWith({ minEffort: 5, maxEffort: 10 });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w1')).toBe(true);  // effort 5
        expect(visible.has('w4')).toBe(true);  // effort 8
        expect(visible.has('w2')).toBe(false); // effort 20 — too high
        expect(visible.has('w3')).toBe(false); // effort 1 — too low
    });

    it('priority range with default metric (score) targets calculated_score', () => {
        const { result } = runWith({ minPriority: 50, maxPriority: 150 });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w1')).toBe(true);  // 100
        expect(visible.has('w4')).toBe(true);  // 60
        expect(visible.has('w2')).toBe(false); // 40 — below min
        expect(visible.has('w3')).toBe(false); // 200 — above max
    });

    it('priority range with priorityMetric=stackrank targets stackrank', () => {
        const { result } = runWith({ minPriority: 1500, priorityMetric: 'stackrank' });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w2')).toBe(true);  // stackrank 2000
        expect(visible.has('w1')).toBe(false); // 1000
        expect(visible.has('w3')).toBe(false); // no stackrank → 0 < 1500
        expect(visible.has('w4')).toBe(false); // no stackrank → 0 < 1500
    });

    it('priority range with priorityMetric=aha_score targets aha_synced_data.score', () => {
        const { result } = runWith({ minPriority: 50, priorityMetric: 'aha_score' });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w2')).toBe(true);  // aha 80
        expect(visible.has('w1')).toBe(false); // aha 30
        expect(visible.has('w3')).toBe(false); // no aha → 0
        expect(visible.has('w4')).toBe(false); // no aha → 0
    });

    it('statuses multi-select keeps only selected statuses (no Backlog expansion)', () => {
        const { result } = runWith({ statuses: ['Planning', 'Done'] });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w2')).toBe(true);  // Planning
        expect(visible.has('w3')).toBe(true);  // Done
        expect(visible.has('w1')).toBe(false); // Backlog
        expect(visible.has('w4')).toBe(false); // legacy (empty status)
    });

    it('selecting Backlog also matches docs with missing/empty status (mirrors WorkItems list semantics)', () => {
        const { result } = runWith({ statuses: ['Backlog'] });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w1')).toBe(true);  // explicit Backlog
        expect(visible.has('w4')).toBe(true);  // legacy, status=''
        expect(visible.has('w2')).toBe(false); // Planning
        expect(visible.has('w3')).toBe(false); // Done
    });

    it('releasedSprintIds with explicit IDs only matches releases to those sprints', () => {
        const { result } = runWith({ releasedSprintIds: ['s2'] });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w3')).toBe(true);  // released to s2
        expect(visible.has('w1')).toBe(false); // released to s1
        expect(visible.has('w2')).toBe(false); // unreleased
        expect(visible.has('w4')).toBe(false); // unreleased
    });

    it('releasedSprintIds with the "unreleased" sentinel matches docs without a release sprint', () => {
        const { result } = runWith({ releasedSprintIds: ['unreleased'] });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w2')).toBe(true);  // unreleased
        expect(visible.has('w4')).toBe(true);  // unreleased
        expect(visible.has('w1')).toBe(false); // released
        expect(visible.has('w3')).toBe(false); // released
    });

    it('combines multiple dashboard filters as AND', () => {
        // Status=Backlog (matches w1, w4) AND minEffort=6 → only w4 (effort 8).
        const { result } = runWith({ statuses: ['Backlog'], minEffort: 6 });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w4')).toBe(true);
        expect(visible.has('w1')).toBe(false);
        expect(visible.has('w2')).toBe(false);
        expect(visible.has('w3')).toBe(false);
    });
});

// Hierarchy fixture: w1 → w2 → w3 (chain), w1 → w4 (sibling of w2). w1 is root.
const HIERARCHY_DATA: ValueStreamData = {
    ...MOCK_DATA,
    workItems: [
        { ...MOCK_DATA.workItems[0] }, // w1 — no parent (root)
        { ...MOCK_DATA.workItems[1], parent_id: 'w1' }, // w2 — child of w1
        { ...MOCK_DATA.workItems[2], parent_id: 'w2' }, // w3 — grandchild of w1
        { ...MOCK_DATA.workItems[3], parent_id: 'w1' }, // w4 — child of w1
    ],
};

function runHierarchy(df: DashboardFilters) {
    return renderHook(() =>
        useGraphLayout(HIERARCHY_DATA, null, 0, '', '', 'all', '', '', true, 0, 0, null, null, 'score', df)
    );
}

describe('useGraphLayout - hierarchy filters', () => {
    it('rootsOnly keeps only work items without a parent_id', () => {
        const { result } = runHierarchy({ rootsOnly: true });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w1')).toBe(true);
        expect(visible.has('w2')).toBe(false);
        expect(visible.has('w3')).toBe(false);
        expect(visible.has('w4')).toBe(false);
    });

    it('parentIds narrows to direct children of the chosen work item', () => {
        const { result } = runHierarchy({ parentIds: ['w1'] });
        const visible = visibleWorkItemIds(result.current.nodes);
        // Direct children of w1 only: w2 and w4. Grandchild w3 is excluded.
        expect(visible.has('w2')).toBe(true);
        expect(visible.has('w4')).toBe(true);
        expect(visible.has('w1')).toBe(false);
        expect(visible.has('w3')).toBe(false);
    });

    it('subtreeOfIds includes every descendant of the chosen work item (root excluded)', () => {
        const { result } = runHierarchy({ subtreeOfIds: ['w1'] });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w2')).toBe(true);  // child
        expect(visible.has('w3')).toBe(true);  // grandchild
        expect(visible.has('w4')).toBe(true);  // child
        expect(visible.has('w1')).toBe(false); // the root itself is excluded
    });

    it('subtreeOfIds returns nothing when the chosen root has no descendants', () => {
        const { result } = runHierarchy({ subtreeOfIds: ['w3'] });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.size).toBe(0);
    });

    it('hierarchy filter ANDs with another dashboard filter (parentIds + status)', () => {
        // parentIds=[w1] → {w2, w4}; status=Planning → {w2}; intersection → only w2.
        const { result } = runHierarchy({ parentIds: ['w1'], statuses: ['Planning'] });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w2')).toBe(true);
        expect(visible.has('w4')).toBe(false);
    });

    it('parentIds with multiple ids includes children of any of them (union)', () => {
        // parentIds=[w1, w2] → direct children of w1 (w2, w4) PLUS direct children
        // of w2 (w3) — the multi-select is a union.
        const { result } = runHierarchy({ parentIds: ['w1', 'w2'] });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w2')).toBe(true);  // child of w1
        expect(visible.has('w3')).toBe(true);  // child of w2
        expect(visible.has('w4')).toBe(true);  // child of w1
        expect(visible.has('w1')).toBe(false); // not a child of anything in the set
    });

    it('subtreeOfIds with multiple roots unions all descendants', () => {
        // subtreeOfIds=[w2, w4] → descendants of w2 (w3) PLUS descendants of w4 (none) → {w3}.
        const { result } = runHierarchy({ subtreeOfIds: ['w2', 'w4'] });
        const visible = visibleWorkItemIds(result.current.nodes);
        expect(visible.has('w3')).toBe(true);
        expect(visible.has('w2')).toBe(false); // the roots themselves are excluded
        expect(visible.has('w4')).toBe(false);
        expect(visible.has('w1')).toBe(false);
    });
});
