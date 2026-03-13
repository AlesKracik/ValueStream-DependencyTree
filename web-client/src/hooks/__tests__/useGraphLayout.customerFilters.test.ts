import { renderHook } from '@testing-library/react';
import { useGraphLayout } from '../useGraphLayout';
import type { ValueStreamData } from '../../types/models';
import { describe, it, expect } from 'vitest';
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
        jira: { base_url: '', api_token: '', api_version: '3' },
        ai: { provider: 'openai' }
    },
    customers: [
        { id: 'c1', name: 'Matched Customer', existing_tcv: 50, existing_tcv_valid_from: '2026-01-01', potential_tcv: 500 },
        { id: 'c2', name: 'Other Customer', existing_tcv: 0, existing_tcv_valid_from: '2026-01-01', potential_tcv: 20 },
    ],
    workItems: [
        {
            id: 'f1',
            name: 'Work Item 1',
            total_effort_mds: 1, score: 10,
            customer_targets: [
                { customer_id: 'c1', tcv_type: 'potential', priority: 'Must-have' }
            ]
        }
    ],
    epics: [
        { id: 'e1', jira_key: 'E1', work_item_id: 'f1', team_id: 't1', effort_md: 1, target_start: '2026-01-01', target_end: '2026-01-14' }
    ],
    teams: [{ id: 't1', name: 'T1', total_capacity_mds: 10 }],
    sprints: [{ id: 's1', name: 'S1', start_date: '2026-01-01', end_date: '2026-01-14' }],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('useGraphLayout - Customer Filters', () => {
    it('should filter out customers not matching the name filter', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, 'Matched'));

        const nodes = result.current.nodes;
        const hasC1 = nodes.some(n => n.id === 'customer-c1');
        const hasC2 = nodes.some(n => n.id === 'customer-c2');

        expect(hasC1).toBe(true);
        expect(hasC2).toBe(false);
    });

    it('should filter out customers even if name matches but they target no visible work items', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, 'Matched', 'NonExistent'));

        const nodes = result.current.nodes;
        const hasC1 = nodes.some(n => n.id === 'customer-c1');
        expect(hasC1).toBe(false);
    });
});



