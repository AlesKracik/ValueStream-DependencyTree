import { renderHook } from '@testing-library/react';
import { useGraphLayout } from '../useGraphLayout';
import type { DashboardData } from '../../types/models';
import { describe, it, expect } from 'vitest';

const mockData: DashboardData = {
    dashboards: [], settings: {
        jira_base_url: '',
        jira_api_token: '',
        jira_api_version: '3'
    },
    customers: [
        { id: 'c1', name: 'High TCV Customer', existing_tcv: 50, potential_tcv: 500 },
        { id: 'c2', name: 'Low TCV Customer', existing_tcv: 0, potential_tcv: 20 },
    ],
    workItems: [
        {
            id: 'f1',
            name: 'High Score Work Item',
            total_effort_mds: 1, score: 0,
            customer_targets: [
                { customer_id: 'c1', tcv_type: 'potential', priority: 'Must-have' }
            ]
        },
        {
            id: 'f2',
            name: 'Low Score Work Item',
            total_effort_mds: 10, score: 0,
            customer_targets: [
                { customer_id: 'c2', tcv_type: 'potential', priority: 'Must-have' }
            ]
        }
    ],
    epics: [
        { id: 'e1', jira_key: 'E1', work_item_id: 'f1', team_id: 't1', remaining_md: 1, target_start: '2026-01-01', target_end: '2026-01-14' },
        { id: 'e2', jira_key: 'E2', work_item_id: 'f2', team_id: 't1', remaining_md: 1, target_start: '2026-01-01', target_end: '2026-01-14' },
    ],
    teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }],
    sprints: [{ id: 's1', name: 'S1', start_date: '2026-01-01', end_date: '2026-01-14' }],
};

describe('useGraphLayout - Numeric Filters', () => {
    it('should filter out customers with potential TCV strictly lower than minTcv', () => {
        const { result } = renderHook(() => useGraphLayout(mockData, null, 0, '', '', 'all', '', '', true, 100));

        const nodes = result.current.nodes;
        const hasC1 = nodes.some(n => n.id === 'customer-c1'); // TCV 500
        const hasC2 = nodes.some(n => n.id === 'customer-c2'); // TCV 20

        expect(hasC1).toBe(true);
        expect(hasC2).toBe(false);
    });

    it('should filter out work items with calculated score strictly lower than minScore', () => {
        const { result } = renderHook(() => useGraphLayout(mockData, null, 0, '', '', 'all', '', '', true, 0, 100));

        const nodes = result.current.nodes;
        const hasF1 = nodes.some(n => n.id === 'workitem-f1');
        const hasF2 = nodes.some(n => n.id === 'workitem-f2');

        expect(hasF1).toBe(true);
        expect(hasF2).toBe(false);
    });

    it('should correctly divide Score across multiple Should-have work items', () => {
        const sharedCustomer = { id: 'c-shared', name: 'Shared', existing_tcv: 0, potential_tcv: 1000 };
        const shouldHaveData: DashboardData = {
            ...mockData,
            customers: [sharedCustomer],
            workItems: [
                {
                    id: 'f-should-1',
                    name: 'Should Have 1',
                    total_effort_mds: 1, score: 0,
                    customer_targets: [{ customer_id: 'c-shared', tcv_type: 'potential', priority: 'Should-have' }]
                },
                {
                    id: 'f-should-2',
                    name: 'Should Have 2',
                    total_effort_mds: 1, score: 0,
                    customer_targets: [{ customer_id: 'c-shared', tcv_type: 'potential', priority: 'Should-have' }]
                }
            ],
            epics: [
                { id: 'e-s1', jira_key: 'E-S1', work_item_id: 'f-should-1', team_id: 't1', remaining_md: 1, target_start: '2026-01-01', target_end: '2026-01-14' },
                { id: 'e-s2', jira_key: 'E-S2', work_item_id: 'f-should-2', team_id: 't1', remaining_md: 1, target_start: '2026-01-01', target_end: '2026-01-14' },
            ]
        };

        const { result: filteredOut } = renderHook(() => useGraphLayout(shouldHaveData, null, 0, '', '', 'all', '', '', true, 0, 600));
        expect(filteredOut.current.nodes.some(n => n.id.startsWith('workitem-f-should'))).toBe(false);

        const { result: passed } = renderHook(() => useGraphLayout(shouldHaveData, null, 0, '', '', 'all', '', '', true, 0, 400));
        expect(passed.current.nodes.some(n => n.id === 'workitem-f-should-1')).toBe(true);
        expect(passed.current.nodes.some(n => n.id === 'workitem-f-should-2')).toBe(true);
    });

    it('should apply both minTcv and minScore simultaneously', () => {
        const { result } = renderHook(() => useGraphLayout(mockData, null, 0, '', '', 'all', '', '', true, 500, 500));

        const nodes = result.current.nodes;
        const hasC1 = nodes.some(n => n.id === 'customer-c1');
        const hasF1 = nodes.some(n => n.id === 'workitem-f1');

        expect(hasC1).toBe(true);
        expect(hasF1).toBe(true);
    });
});
