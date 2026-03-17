import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGraphLayout } from '../useGraphLayout';
import type { ValueStreamData, ValueStreamParameters } from '../../types/models';

const MOCK_DATA: ValueStreamData = {
    valueStreams: [],
    settings: {
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: { 
            mongo: { 
                app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
                customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
            }
        },
        jira: { base_url: '', api_version: '3', customer: { jql_new: '', jql_in_progress: '', jql_noop: '' } },
        ai: { provider: 'openai', support: { prompt: '' } }
    },
    customers: [
        { id: 'c1', name: 'Alpha Customer', existing_tcv: 100, potential_tcv: 0 },
        { id: 'c2', name: 'Beta Customer', existing_tcv: 100, potential_tcv: 0 }
    ],
    workItems: [
        { id: 'f1', name: 'Alpha WorkItem', total_effort_mds: 10, score: 50, customer_targets: [{ customer_id: 'c1', tcv_type: 'existing' }] },
        { id: 'f2', name: 'Beta WorkItem', total_effort_mds: 10, score: 50, customer_targets: [{ customer_id: 'c2', tcv_type: 'existing' }] }
    ],
    teams: [
        { id: 't1', name: 'Team Alpha', total_capacity_mds: 10 },
        { id: 't2', name: 'Team Beta', total_capacity_mds: 10 }
    ],
    issues: [
        { id: 'e1', jira_key: 'E1', name: 'Alpha Issue Name', work_item_id: 'f1', team_id: 't1', effort_md: 5, target_start: '2026-01-01', target_end: '2026-01-10' },
        { id: 'e2', jira_key: 'E2', name: 'Beta Issue Name', work_item_id: 'f2', team_id: 't2', effort_md: 5, target_start: '2026-01-01', target_end: '2026-01-10' }
    ],
    sprints: [
        { id: 's1', name: 'S1', start_date: '2026-01-01', end_date: '2026-01-14' }
    ],
    metrics: { maxScore: 100, maxRoi: 10 }
};

const emptyParams: ValueStreamParameters = {
    customerFilter: '', workItemFilter: '', teamFilter: '', issueFilter: '',
    releasedFilter: 'all', minTcvFilter: '', minScoreFilter: ''
};

describe('useGraphLayout - Filter Consolidation (Base vs Transient)', () => {

    it('consolidates Customer filters using Logical AND', () => {
        // Base matches both, Transient matches only Alpha
        const baseParams = { ...emptyParams, customerFilter: 'Customer' };
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, 'Alpha', '', 'all', '', '', true, 0, 0, null, baseParams));
        
        expect(result.current.nodes.some(n => n.id === 'customer-c1')).toBe(true);
        expect(result.current.nodes.some(n => n.id === 'customer-c2')).toBe(false);

        // Conflict: Base matches Beta, Transient matches Alpha -> Should show nothing
        const conflictingParams = { ...emptyParams, customerFilter: 'Beta' };
        const { result: resConflict } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, 'Alpha', '', 'all', '', '', true, 0, 0, null, conflictingParams));
        expect(resConflict.current.nodes.some(n => n.id.startsWith('customer-'))).toBe(false);
    });

    it('consolidates Team filters using Logical AND', () => {
        const baseParams = { ...emptyParams, teamFilter: 'Team' };
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', 'Alpha', '', true, 0, 0, null, baseParams));
        
        expect(result.current.nodes.some(n => n.id === 'team-t1')).toBe(true);
        expect(result.current.nodes.some(n => n.id === 'team-t2')).toBe(false);
    });

    it('consolidates Issue filters using Logical AND', () => {
        const baseParams = { ...emptyParams, issueFilter: 'Issue' };
        // We use 'Beta' as ISSUE filter transiently.
        // We must also NOT filter out its path. If customerFilter is '', all paths are valid.
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', '', 'Beta', true, 0, 0, null, baseParams));
        
        expect(result.current.nodes.some(n => n.id === 'gantt-e2')).toBe(true);
        expect(result.current.nodes.some(n => n.id === 'gantt-e1')).toBe(false);
    });

    it('consolidates WorkItem filters using Logical AND', () => {
        const baseParams = { ...emptyParams, workItemFilter: 'WorkItem' };
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', 'Alpha', 'all', '', '', true, 0, 0, null, baseParams));
        
        expect(result.current.nodes.some(n => n.id === 'workitem-f1')).toBe(true);
        expect(result.current.nodes.some(n => n.id === 'workitem-f2')).toBe(false);
    });

    it('consolidates Released filters using Logical AND (most restrictive wins)', () => {
        const releasedData: ValueStreamData = {
            ...MOCK_DATA,
            workItems: [
                { id: 'f1', name: 'Released', released_in_sprint_id: 's1', customer_targets: [], score: 10, total_effort_mds: 5 },
                { id: 'f2', name: 'Unreleased', released_in_sprint_id: undefined, customer_targets: [], score: 10, total_effort_mds: 5 }
            ]
        };

        // Base: all, Transient: released -> Should show only Released
        const { result: res1 } = renderHook(() => useGraphLayout(releasedData, null, 0, '', '', 'released', '', '', true, 0, 0, null, emptyParams));
        expect(res1.current.nodes.some(n => n.id === 'workitem-f1')).toBe(true);
        expect(res1.current.nodes.some(n => n.id === 'workitem-f2')).toBe(false);

        // Base: unreleased, Transient: released -> Should show nothing (conflict)
        const baseParams = { ...emptyParams, releasedFilter: 'unreleased' as const };
        const { result: res2 } = renderHook(() => useGraphLayout(releasedData, null, 0, '', '', 'released', '', '', true, 0, 0, null, baseParams));
        expect(res2.current.nodes.some(n => n.id.startsWith('workitem-'))).toBe(false);
    });
});






