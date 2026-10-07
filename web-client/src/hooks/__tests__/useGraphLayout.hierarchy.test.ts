import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGraphLayout } from '../useGraphLayout';
import { orderAsTree } from '../useGraphBuilder';
import type { ValueStreamData, WorkItem } from '@valuestream/shared-types';

const BASE_DATA: ValueStreamData = {
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
        auth: { method: 'local' as const, session_expiry_hours: 24, default_role: 'viewer' as const }
    },
    customers: [
        { id: 'c1', name: 'Cust 1', existing_tcv: 100, existing_tcv_valid_from: '2026-01-01', potential_tcv: 0 },
        { id: 'c2', name: 'Cust 2', existing_tcv: 1000, existing_tcv_valid_from: '2026-01-01', potential_tcv: 500 }
    ],
    workItems: [
        {
            id: 'f1',
            name: 'Low RICE Feat',
            total_effort_mds: 10, score: 5, calculated_score: 5, status: 'Backlog',
            customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Nice-to-have' }]
        },
        {
            id: 'f2',
            name: 'High RICE Feat',
            total_effort_mds: 5, score: 50, calculated_score: 50, status: 'Backlog',
            customer_targets: [{ customer_id: 'c2', tcv_type: 'existing', priority: 'Must-have' }]
        }
    ],
    teams: [
        { id: 't1', name: 'Team Alpha', total_capacity_mds: 10 }
    ],
    issues: [
        { id: 'e1', jira_key: 'J-1', work_item_id: 'f1', team_id: 't1', effort_md: 8, target_start: '2026-02-12', target_end: '2026-02-26' },
        { id: 'e2', jira_key: 'J-2', work_item_id: 'f2', team_id: 't1', effort_md: 5, target_start: '2026-02-12', target_end: '2026-02-26' },
        { id: 'e3', jira_key: 'J-3', work_item_id: 'f1', team_id: 't1', effort_md: 3 }
    ],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-02-12', end_date: '2026-02-26' }
    ],
    metrics: {
        maxScore: 100,
        maxRoi: 10
    }
};

const wi = (id: string, score: number, parent_id?: string): WorkItem => ({
    id, name: id, total_effort_mds: 0, score, calculated_score: score, status: 'Backlog',
    customer_targets: [], parent_id,
});

// root A (10) > child A1 (90) > grandchild A1a (5); root B (50); A2 (1) under A.
const DATA: ValueStreamData = {
    ...BASE_DATA,
    workItems: [wi('A', 10), wi('B', 50), wi('A1', 90, 'A'), wi('A2', 1, 'A'), wi('A1a', 5, 'A1')],
    issues: [],
};

const layout = (showHierarchy: boolean, hovered: string | null = null) =>
    renderHook(() => useGraphLayout(
        DATA, hovered, 0, '', '', 'all', '', '', false, 0, 0, null, null, 'score', undefined, showHierarchy,
    )).result.current;

const workItemOrder = (nodes: ReturnType<typeof layout>['nodes']) =>
    nodes.filter(n => n.type === 'workItemNode')
        .sort((a, b) => a.position.y - b.position.y)
        .map(n => n.id.replace('workitem-', ''));

const centerX = (nodes: ReturnType<typeof layout>['nodes'], id: string) => {
    const n = nodes.find(x => x.id === `workitem-${id}`)!;
    const size = (n.data as { baseSize: number; score: number; maxScore: number });
    return n.position.x + (size.baseSize * 0.6 + size.baseSize * 0.8 * (size.score / size.maxScore)) / 2;
};

describe('useGraphLayout hierarchy view', () => {
    it('off: flat metric order, no hierarchy edges', () => {
        const { nodes, edges } = layout(false);
        expect(workItemOrder(nodes)).toEqual(['A1', 'B', 'A', 'A1a', 'A2']);
        expect(edges.some(e => e.id.startsWith('hierarchy__'))).toBe(false);
    });

    it('on: parents before children, siblings and roots in metric order, indented by depth', () => {
        const { nodes, edges } = layout(true);
        expect(workItemOrder(nodes)).toEqual(['B', 'A', 'A1', 'A1a', 'A2']);
        expect(centerX(nodes, 'A')).toBe(350);
        expect(centerX(nodes, 'A1')).toBe(390);
        expect(centerX(nodes, 'A1a')).toBe(430);
        expect(edges.filter(e => e.id.startsWith('hierarchy__')).map(e => [e.source, e.target]).sort()).toEqual([
            ['workitem-A', 'workitem-A1'], ['workitem-A', 'workitem-A2'], ['workitem-A1', 'workitem-A1a'],
        ]);
    });

    it('hovering a work item lights its direct parent and children only', () => {
        const { nodes } = layout(true, 'workitem-A1');
        const bright = nodes.filter(n => n.type === 'workItemNode' && n.style?.opacity === 1).map(n => n.id).sort();
        expect(bright).toEqual(['workitem-A', 'workitem-A1', 'workitem-A1a']);
    });
});

describe('orderAsTree', () => {
    it('treats a child of a hidden parent as a root', () => {
        expect(orderAsTree([wi('C', 1, 'gone'), wi('D', 0)]).map(x => [x.workItem.id, x.depth])).toEqual([['C', 0], ['D', 0]]);
    });

    it('keeps every item once when parents form a cycle', () => {
        const out = orderAsTree([wi('X', 2, 'Y'), wi('Y', 1, 'X')]);
        expect(out.map(x => x.workItem.id)).toEqual(['X', 'Y']);
    });
});
