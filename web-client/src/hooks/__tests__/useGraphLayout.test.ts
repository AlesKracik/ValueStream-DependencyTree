import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGraphLayout } from '../useGraphLayout';
import type { DashboardData } from '../../types/models';

const MOCK_DATA: DashboardData = {
    dashboards: [], settings: { jira_base_url: "https://jira", jira_api_version: "3" },
    customers: [
        { id: 'c1', name: 'Cust 1', existing_tcv: 100, existing_tcv_valid_from: '2026-01-01', potential_tcv: 0 },
        { id: 'c2', name: 'Cust 2', existing_tcv: 1000, existing_tcv_valid_from: '2026-01-01', potential_tcv: 500 }
    ],
    workItems: [
        {
            id: 'f1',
            name: 'Low RICE Feat',
            total_effort_mds: 10, score: 5,
            customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Nice-to-have' }]
        },
        {
            id: 'f2',
            name: 'High RICE Feat',
            total_effort_mds: 5, score: 50,
            customer_targets: [{ customer_id: 'c2', tcv_type: 'existing', priority: 'Must-have' }]
        }
    ],
    teams: [
        { id: 't1', name: 'Team Alpha', total_capacity_mds: 10 }
    ],
    epics: [
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

describe('useGraphLayout Math Engine', () => {

    it('generates HeaderNodes above the columns', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA));
        
        const customerHeader = result.current.nodes.find(n => n.id === 'header-customers');
        const workItemHeader = result.current.nodes.find(n => n.id === 'header-workitems');
        const teamHeader = result.current.nodes.find(n => n.id === 'header-teams');

        expect(customerHeader).toBeDefined();
        expect(workItemHeader).toBeDefined();
        expect(teamHeader).toBeDefined();

        expect(customerHeader?.position.y).toBe(0);
        expect(workItemHeader?.position.y).toBe(0);
        expect(teamHeader?.position.y).toBe(0);
    });

    it('positions data nodes with a vertical buffer to avoid header overlap', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA));
        
        const firstCustomer = result.current.nodes.find(n => n.id === 'customer-c1');
        const firstWorkItem = result.current.nodes.find(n => n.id === 'workitem-f1');

        expect(firstCustomer?.position.y).toBeGreaterThan(50);
        expect(firstWorkItem?.position.y).toBeGreaterThan(50);
    });

    it('gracefully handles empty data', () => {
        const { result } = renderHook(() => useGraphLayout(null));
        expect(result.current.nodes).toEqual([]);
        expect(result.current.edges).toEqual([]);
    });

    it('uses server-provided RICE scores for visualization', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA));

        const f1Node = result.current.nodes.find(n => n.id === 'workitem-f1');
        const f2Node = result.current.nodes.find(n => n.id === 'workitem-f2');

        expect(f1Node).toBeDefined();
        expect(f2Node).toBeDefined();

        expect((f1Node?.data as any).score).toBe(5);
        expect((f2Node?.data as any).score).toBe(50);
    });

    it('maintains consistent team capacity usage regardless of filters', () => {
        // Unfiltered
        const { result: resultUnfiltered } = renderHook(() => useGraphLayout(MOCK_DATA));
        const unfilteredCapNode = resultUnfiltered.current.nodes.find(n => n.id === 'sprint-cap-t1-s1');
        // e1 (8 MD) + e2 (5 MD) = 13 MD used in s1 for Team t1
        expect((unfilteredCapNode?.data as any).usedMds).toBe(13);

        // With filter that hides workitem f2 (and thus epic e2)
        const { result: resultFiltered } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', 'Low RICE Feat'));
        
        // Confirm f2 is hidden
        expect(resultFiltered.current.nodes.find(n => n.id === 'workitem-f2')).toBeUndefined();
        
        const filteredCapNode = resultFiltered.current.nodes.find(n => n.id === 'sprint-cap-t1-s1');
        // Capacity usage should STILL be 13, not 8
        expect((filteredCapNode?.data as any).usedMds).toBe(13);
    });

    it('filters nodes based on persistent sprint range', () => {
        const DATA_WITH_TIME: DashboardData = {
            ...MOCK_DATA,
            sprints: [
                { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' },
                { id: 's2', name: 'Sprint 2', start_date: '2026-01-15', end_date: '2026-01-28' }
            ],
            epics: [
                { id: 'e1', jira_key: 'J-1', work_item_id: 'f1', team_id: 't1', effort_md: 5, target_start: '2026-01-01', target_end: '2026-01-10' }, // s1
                { id: 'e2', jira_key: 'J-2', work_item_id: 'f2', team_id: 't1', effort_md: 5, target_start: '2026-01-15', target_end: '2026-01-20' }  // s2
            ]
        };

        // Filter for s1 ONLY
        const baseParams = {
            customerFilter: '', workItemFilter: '', releasedFilter: 'all' as const,
            minTcvFilter: '', minScoreFilter: '', teamFilter: '', epicFilter: '',
            startSprintId: 's1', endSprintId: 's1'
        };

        const { result } = renderHook(() => useGraphLayout(DATA_WITH_TIME, null, 0, '', '', 'all', '', '', true, 0, 0, null, baseParams));

        // f1 should be visible (e1 is in range)
        expect(result.current.nodes.find(n => n.id === 'workitem-f1')).toBeDefined();
        // f2 should NOT be visible (e2 is in s2, out of range)
        expect(result.current.nodes.find(n => n.id === 'workitem-f2')).toBeUndefined();
        
        // e1 visible, e2 hidden
        expect(result.current.nodes.find(n => n.id === 'gantt-e1')).toBeDefined();
        expect(result.current.nodes.find(n => n.id === 'gantt-e2')).toBeUndefined();
    });

    it('calculates hasUnestimatedEffort correctly', () => {
        const TEST_DATA: DashboardData = {
            ...MOCK_DATA,
            workItems: [
                { id: 'f1', name: 'Estimated Feat', total_effort_mds: 10, score: 50, customer_targets: [] },
                { id: 'f2', name: 'Unestimated Feat (0 MDs)', total_effort_mds: 0, score: 50, customer_targets: [] },
                { id: 'f3', name: 'Feat with Unestimated Epic', total_effort_mds: 10, score: 50, customer_targets: [] },
            ],
            epics: [
                { id: 'e1', jira_key: 'E1', work_item_id: 'f1', team_id: 't1', effort_md: 5 },
                { id: 'e2', jira_key: 'E2', work_item_id: 'f3', team_id: 't1', effort_md: 0 },
            ]
        };

        const { result } = renderHook(() => useGraphLayout(TEST_DATA));

        const f1Node = result.current.nodes.find(n => n.id === 'workitem-f1');
        const f2Node = result.current.nodes.find(n => n.id === 'workitem-f2');
        const f3Node = result.current.nodes.find(n => n.id === 'workitem-f3');

        expect((f1Node?.data as any).hasUnestimatedEffort).toBe(false);
        expect((f2Node?.data as any).hasUnestimatedEffort).toBe(true);
        expect((f3Node?.data as any).hasUnestimatedEffort).toBe(true);
    });

    it('reflects team capacity overrides in sprint capacity nodes', () => {
        const OVERRIDE_DATA: DashboardData = {
            ...MOCK_DATA,
            teams: [
                { 
                    id: 't1', 
                    name: 'Team Alpha', 
                    total_capacity_mds: 10,
                    sprint_capacity_overrides: { 's1': 7 }
                }
            ]
        };

        const { result } = renderHook(() => useGraphLayout(OVERRIDE_DATA));
        const capNode = result.current.nodes.find(n => n.id === 'sprint-cap-t1-s1');
        
        expect((capNode?.data as any).totalCapacityMds).toBe(7);
        expect((capNode?.data as any).isOverridden).toBe(true);
    });

    it('calculates holiday impact on team capacity correctly', () => {
        const HOLIDAY_DATA: DashboardData = {
            ...MOCK_DATA,
            teams: [
                { 
                    id: 't1', 
                    name: 'Team Alpha', 
                    total_capacity_mds: 10,
                    country: 'US' // Holidays in US
                }
            ],
            sprints: [
                { id: 's1', name: 'New Year Sprint', start_date: '2026-01-01', end_date: '2026-01-14' }
            ]
        };

        const { result } = renderHook(() => useGraphLayout(HOLIDAY_DATA));
        const capNode = result.current.nodes.find(n => n.id === 'sprint-cap-t1-s1');
        
        // Jan 1st 2026 is a Thursday (Public Holiday)
        // 1 holiday = 10% reduction of 10 MDs = 9 MDs remaining
        expect((capNode?.data as any).holidayCount).toBe(1);
        expect((capNode?.data as any).totalCapacityMds).toBe(9);
    });
});
