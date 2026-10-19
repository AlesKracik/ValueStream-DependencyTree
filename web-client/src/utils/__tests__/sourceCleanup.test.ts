import { describe, it, expect } from 'vitest';
import type { Issue, WorkItem } from '@valuestream/shared-types';
import { planSourceCleanup, ahaCleanupCandidates, jiraCleanupCandidates } from '../sourceCleanup';

const NOW = new Date('2026-10-01T00:00:00Z');

const workItem = (id: string, overrides: Partial<WorkItem> = {}): WorkItem => ({
    id, name: id, status: 'Backlog', total_effort_mds: 0, score: 0, customer_targets: [],
    links: { aha: { external_id: `x-${id}`, key: `PROD-${id}`, source_updated_at: '2025-01-01T00:00:00.000Z' } },
    ...overrides,
});

const issue = (id: string, overrides: Partial<Issue> = {}): Issue => ({
    id, jira_key: `J-${id}`, team_id: 't1', effort_md: 0, jira_updated_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
});

describe('planSourceCleanup', () => {
    const candidates = [
        { id: 'old', label: 'old', sourceUpdatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'fresh', label: 'fresh', sourceUpdatedAt: '2026-09-20T00:00:00.000Z' },
        { id: 'linked', label: 'linked', sourceUpdatedAt: '2026-01-01T00:00:00.000Z', linkedReason: 'has customer targets' },
        { id: 'undated', label: 'undated' },
    ];

    it('deletes stale unlinked records and skips linked and undated ones', () => {
        const plan = planSourceCleanup(candidates, 90, false, NOW);
        expect(plan.toDelete.map(c => c.id)).toEqual(['old']);
        expect(plan.linked.map(c => c.id)).toEqual(['linked']);
        expect(plan.undated.map(c => c.id)).toEqual(['undated']);
    });

    it('includes linked records when asked', () => {
        const plan = planSourceCleanup(candidates, 90, true, NOW);
        expect(plan.toDelete.map(c => c.id)).toEqual(['old', 'linked']);
        expect(plan.linked).toEqual([]);
    });

    it('returns an empty plan for an invalid age', () => {
        expect(planSourceCleanup(candidates, NaN, true, NOW).toDelete).toEqual([]);
        expect(planSourceCleanup(candidates, -1, true, NOW).toDelete).toEqual([]);
    });
});

describe('ahaCleanupCandidates', () => {
    it('lists only Aha!-linked work items, children before parents, with link reasons', () => {
        const items = [
            workItem('root'),
            workItem('child', { parent_id: 'root' }),
            workItem('grandchild', { parent_id: 'child' }),
            workItem('local', { links: undefined }),
            workItem('targeted', { customer_targets: [{ customer_id: 'c1', tcv_type: 'existing' }] }),
            workItem('global', { all_customers_target: { tcv_type: 'potential' } }),
        ];
        const candidates = ahaCleanupCandidates(items, [issue('i1', { work_item_id: 'grandchild' })]);

        const ids = candidates.map(c => c.id);
        expect(ids).not.toContain('local');
        expect(ids.indexOf('grandchild')).toBeLessThan(ids.indexOf('child'));
        expect(ids.indexOf('child')).toBeLessThan(ids.indexOf('root'));

        const reason = (id: string) => candidates.find(c => c.id === id)?.linkedReason;
        expect(reason('root')).toBe('has child work items');
        expect(reason('grandchild')).toBe('has Jira issues');
        expect(reason('targeted')).toBe('has customer targets');
        expect(reason('global')).toBe('has customer targets');
        expect(candidates.find(c => c.id === 'root')?.sourceUpdatedAt).toBe('2025-01-01T00:00:00.000Z');
    });
});

describe('jiraCleanupCandidates', () => {
    it('lists Jira issues and marks assigned or depended-on ones as linked', () => {
        const candidates = jiraCleanupCandidates([
            issue('free'),
            issue('assigned', { work_item_id: 'w1' }),
            issue('dependent', { dependencies: [{ issue_id: 'blocker', dependency_type: 'FS' }] }),
            issue('blocker'),
            issue('placeholder', { jira_key: 'TBD' }),
        ]);

        expect(candidates.map(c => c.id)).toEqual(['free', 'assigned', 'dependent', 'blocker']);
        const reason = (id: string) => candidates.find(c => c.id === id)?.linkedReason;
        expect(reason('free')).toBeUndefined();
        expect(reason('assigned')).toBe('assigned to a work item');
        expect(reason('blocker')).toBe('other issues depend on it');
    });
});
