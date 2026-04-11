import { renderHook } from '@testing-library/react';
import { useGraphLayout } from '../useGraphLayout';
import type { ValueStreamData } from '@valuestream/shared-types';
import { describe, it, expect } from 'vitest';
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
        auth: { method: 'local' as const, session_expiry_hours: 24, default_role: 'viewer' as const }
    },
    customers: [
        { id: 'c1', name: 'High TCV Customer', existing_tcv: 50, existing_tcv_valid_from: '2026-01-01', potential_tcv: 500 },
        { id: 'c2', name: 'Low TCV Customer', existing_tcv: 0, existing_tcv_valid_from: '2026-01-01', potential_tcv: 20 },
    ],
    workItems: [
        {
            id: 'f1',
            name: 'High Score Work Item',
            total_effort_mds: 1, score: 500, calculated_score: 500, status: 'Backlog',
            customer_targets: [
                { customer_id: 'c1', tcv_type: 'potential', priority: 'Must-have' }
            ]
        },
        {
            id: 'f2',
            name: 'Low Score Work Item',
            total_effort_mds: 10, score: 2, calculated_score: 2, status: 'Backlog',
            customer_targets: [
                { customer_id: 'c2', tcv_type: 'potential', priority: 'Must-have' }
            ]
        }
    ],
    issues: [
        { id: 'e1', jira_key: 'E1', work_item_id: 'f1', team_id: 't1', effort_md: 1, target_start: '2026-01-01', target_end: '2026-01-14' },
        { id: 'e2', jira_key: 'E2', work_item_id: 'f2', team_id: 't1', effort_md: 1, target_start: '2026-01-01', target_end: '2026-01-14' },
    ],
    teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }],
    sprints: [{ id: 's1', name: 'S1', start_date: '2026-01-01', end_date: '2026-01-14' }],
    metrics: { maxScore: 500, maxRoi: 500 }
};

describe('useGraphLayout - Numeric Filters', () => {
    it('should filter out customers with potential TCV strictly lower than minTcv', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', '', '', true, 100));

        const nodes = result.current.nodes;
        const hasC1 = nodes.some(n => n.id === 'customer-c1'); // TCV 500
        const hasC2 = nodes.some(n => n.id === 'customer-c2'); // TCV 20

        expect(hasC1).toBe(true);
        expect(hasC2).toBe(false);
    });

    it('should filter out work items with calculated score strictly lower than minScore', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', '', '', true, 0, 100));

        const nodes = result.current.nodes;
        const hasF1 = nodes.some(n => n.id === 'workitem-f1');
        const hasF2 = nodes.some(n => n.id === 'workitem-f2');

        expect(hasF1).toBe(true);
        expect(hasF2).toBe(false);
    });

    it('should apply both minTcv and minScore simultaneously', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', '', '', true, 500, 500));

        const nodes = result.current.nodes;
        const hasC1 = nodes.some(n => n.id === 'customer-c1');
        const hasF1 = nodes.some(n => n.id === 'workitem-f1');

        expect(hasC1).toBe(true);
        expect(hasF1).toBe(true);
    });
});





