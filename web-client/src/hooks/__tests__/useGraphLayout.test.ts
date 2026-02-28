import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useGraphLayout } from '../useGraphLayout';
import type { DashboardData } from '../../types/models';

const MOCK_DATA: DashboardData = {
    dashboards: [], settings: { jira_base_url: "https://jira", jira_api_version: "3" },
    customers: [
        { id: 'c1', name: 'Cust 1', existing_tcv: 100, potential_tcv: 0 },
        { id: 'c2', name: 'Cust 2', existing_tcv: 1000, potential_tcv: 500 }
    ],
    workItems: [
        {
            id: 'f1',
            name: 'Low RICE Feat',
            total_effort_mds: 10,
            customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Nice-to-have' }]
        },
        {
            id: 'f2',
            name: 'High RICE Feat',
            total_effort_mds: 5,
            customer_targets: [{ customer_id: 'c2', tcv_type: 'existing', priority: 'Must-have' }]
        }
    ],
    teams: [
        { id: 't1', name: 'Team Alpha', total_capacity_mds: 10 }
    ],
    epics: [
        // Two overlapping epics to test stack layout
        { id: 'e1', jira_key: 'J-1', work_item_id: 'f1', team_id: 't1', remaining_md: 8, target_start: '2026-02-12', target_end: '2026-02-26' },
        { id: 'e2', jira_key: 'J-2', work_item_id: 'f2', team_id: 't1', remaining_md: 5, target_start: '2026-02-12', target_end: '2026-02-26' },
        { id: 'e3', jira_key: 'J-3', work_item_id: 'f1', team_id: 't1', remaining_md: 3 } // Unscheduled epic without dates
    ],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-02-12', end_date: '2026-02-26' }
    ],
};

describe('useGraphLayout Math Engine', () => {

    it('generates centered HeaderNodes above the columns', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', '', '', true));
        
        const customerHeader = result.current.nodes.find(n => n.id === 'header-customers');
        const workItemHeader = result.current.nodes.find(n => n.id === 'header-workitems');
        const teamHeader = result.current.nodes.find(n => n.id === 'header-teams');

        expect(customerHeader).toBeDefined();
        expect(workItemHeader).toBeDefined();
        expect(teamHeader).toBeDefined();

        // Check if they are at Y=0
        expect(customerHeader?.position.y).toBe(0);
        expect(workItemHeader?.position.y).toBe(0);
        expect(teamHeader?.position.y).toBe(0);

        // Check if they are offset for centering (fixed width 220, so offset -110)
        expect(customerHeader?.position.x).toBe(0 - 110); // COL_CUSTOMER_X = 0
        expect(workItemHeader?.position.x).toBe(350 - 110); // COL_WORKITEM_X = 350
        expect(teamHeader?.position.x).toBe(700 - 110); // COL_TEAM_X = 700
    });

    it('positions data nodes with a vertical buffer to avoid header overlap', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', '', '', true));
        
        const firstCustomer = result.current.nodes.find(n => n.id === 'customer-c1');
        const firstWorkItem = result.current.nodes.find(n => n.id === 'workitem-f1');

        // START_Y is 200, but nodes are positioned at START_Y - (nodeSize / 2)
        // With nodeSize around 100-140, Y should be around 130-150.
        // Crucially, it should be significantly below the header at Y=0.
        expect(firstCustomer?.position.y).toBeGreaterThan(100);
        expect(firstWorkItem?.position.y).toBeGreaterThan(100);
    });

    it('gracefully handles empty data', () => {
        const { result } = renderHook(() => useGraphLayout(null, null, 0, '', '', 'all', '', '', true));
        expect(result.current.nodes).toEqual([]);
        expect(result.current.edges).toEqual([]);
    });

    it('calculates proper RICE visualization scaling', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', '', '', true));

        const f1Node = result.current.nodes.find(n => n.id === 'workitem-f1');
        const f2Node = result.current.nodes.find(n => n.id === 'workitem-f2');

        // High RICE Feat (f2) has massive TCV map and Must-Have compared to Low RICE Feat (f1)
        expect(f1Node).toBeDefined();
        expect(f2Node).toBeDefined();

        // The exact bounding boxes/computed pixel sizes might vary by actual nodeSize rendering logic,
        // but f2's internal data size mapping should be noticeably higher
        const f1Score = (f1Node?.data as any).score || 0;
        const f2Score = (f2Node?.data as any).score || 0;

        expect(f2Score).toBeGreaterThan(f1Score);
    });

    it('flags capacity bottlenecks accurately on Sprint Capacity Nodes', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', '', '', true));

        // epics e1 + e2 demand 13 MDs in total. 
        // Team Alpha has a total_capacity_mds of only 10.
        // The math engine calculates usage on the sprint-cap node.
        const capNode = result.current.nodes.find(n => n.id === 'sprint-cap-t1-s1');
        expect(capNode).toBeDefined();

        const usedMds = (capNode?.data as any).usedMds;
        const totalCap = (capNode?.data as any).totalCapacityMds;
        expect(usedMds).toBeGreaterThan(totalCap);
    });

    it('stacks overlapping Gantt bars vertically within swimlanes', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', '', '', true));

        const e1Node = result.current.nodes.find(n => n.id === 'gantt-e1');
        const e2Node = result.current.nodes.find(n => n.id === 'gantt-e2');

        expect(e1Node).toBeDefined();
        expect(e2Node).toBeDefined();

        // Since e1 and e2 run on the exact same dates inside Team Alpha's row,
        // their Y coordinates must not overlap (they should be stacked vertically).
        // e1 is at y=..., e2 should be at y + some_swimlane_offset
        expect(e1Node?.position.y).not.toEqual(e2Node?.position.y);
    });

    it('ignores epics without target dates for timeline Gantt nodes but preserves edges', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', 'all', '', '', true));

        // Epic e3 has no target_start or target_end. Thus it should NOT have a gantt bar node.
        const e3GanttNode = result.current.nodes.find(n => n.id === 'gantt-e3');
        expect(e3GanttNode).toBeUndefined();

        // But it DOES have a work_item_id (f1) and team_id (t1), so its connection edge should still exist.
        const e3Edge = result.current.edges.find(e => e.id === 'edge-f1-t1-e3');
        expect(e3Edge).toBeDefined();
    });

    it('treats epics with "UNASSIGNED" work_item_id as WorkItemless and renders them on timeline', () => {
        const dataWithUnassigned: DashboardData = {
            ...MOCK_DATA,
            epics: [
                { 
                    id: 'e-unassigned', 
                    jira_key: 'PROJ-123', 
                    work_item_id: 'UNASSIGNED', 
                    team_id: 't1', 
                    remaining_md: 5, 
                    name: 'Standalone Epic',
                    target_start: '2026-02-12',
                    target_end: '2026-02-20'
                }
            ]
        };

        const { result } = renderHook(() => useGraphLayout(dataWithUnassigned));
        
        const ganttNode = result.current.nodes.find(n => n.id === 'gantt-e-unassigned');
        expect(ganttNode).toBeDefined();
        expect(ganttNode?.data.label).toContain('Standalone Epic');
    });

    it('marks segments older than today as frozen and uses slate color', () => {
        // Mock today to be middle of Feb 2026
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-20'));

        const dataWithPast: DashboardData = {
            ...MOCK_DATA,
            sprints: [
                { id: 's_past', name: 'Past Sprint', start_date: '2026-01-01', end_date: '2026-01-14' },
                { id: 's_curr', name: 'Current Sprint', start_date: '2026-02-15', end_date: '2026-02-28' }
            ],
            epics: [
                { 
                    id: 'e_split', 
                    jira_key: 'J-1', 
                    work_item_id: 'f1', 
                    team_id: 't1', 
                    remaining_md: 10, 
                    target_start: '2026-01-05', 
                    target_end: '2026-02-25',
                    sprint_effort_overrides: { 's_past': 5 }
                }
            ]
        };

        const { result: splitResult } = renderHook(() => useGraphLayout(dataWithPast));
        const splitNode = splitResult.current.nodes.find(n => n.id === 'gantt-e_split');
        const splitSegments = splitNode?.data.segments;

        // Find segment for s_past
        const pastSeg = (splitSegments as any[])?.find((s: any) => s.isFrozen === true);
        const currSeg = (splitSegments as any[])?.find((s: any) => s.isFrozen === false);

        expect(pastSeg).toBeDefined();
        expect(pastSeg.color).toBe('#475569'); // Slate Blue
        expect(currSeg).toBeDefined();
        expect(currSeg.color).toBe('#8b5cf6'); // Purple

        vi.useRealTimers();
    });

    it('maintains stable intensity ratios regardless of visible sprint window', () => {
        const dataForIntensity: DashboardData = {
            ...MOCK_DATA,
            sprints: [
                { id: 's1', name: 'S1', start_date: '2026-01-01', end_date: '2026-01-14' },
                { id: 's2', name: 'S2', start_date: '2026-01-15', end_date: '2026-01-28' },
                { id: 's3', name: 'S3', start_date: '2026-01-29', end_date: '2026-02-11' },
                { id: 's4', name: 'S4', start_date: '2026-02-12', end_date: '2026-02-25' }
            ],
            epics: [
                { 
                    id: 'e_long', 
                    jira_key: 'J-1', 
                    team_id: 't1', 
                    remaining_md: 10, 
                    target_start: '2026-01-05', 
                    target_end: '2026-02-20' 
                }
            ]
        };

        // Render with offset 0 (S1-S6)
        const { result: res1 } = renderHook(() => useGraphLayout(dataForIntensity, null, 0));
        const node1 = res1.current.nodes.find(n => n.id === 'gantt-e_long');
        const intensityS2_view1 = (node1?.data.segments as any[])?.find((s: any) => s.startOffsetPixels > 0)?.intensity;

        // Render with offset 1 (S2-S7)
        const { result: res2 } = renderHook(() => useGraphLayout(dataForIntensity, null, 1));
        const node2 = res2.current.nodes.find(n => n.id === 'gantt-e_long');
        // In this view, S2 is the first visible sprint, so offset is 0
        const intensityS2_view2 = (node2?.data.segments as any[])?.[0].intensity;

        expect(intensityS2_view1).toBeDefined();
        expect(intensityS2_view2).toBeDefined();
        // The intensity ratio must be identical in both views
        expect(intensityS2_view1).toBeCloseTo(intensityS2_view2, 5);
    });

    it('skips visual customer edges for global work items', () => {
        const dataWithGlobal: DashboardData = {
            ...MOCK_DATA,
            workItems: [
                {
                    id: 'f_global',
                    name: 'Global Maint',
                    total_effort_mds: 10,
                    all_customers_target: {
                        tcv_type: 'existing',
                        priority: 'Must-have'
                    },
                    customer_targets: []
                }
            ],
            epics: [
                { id: 'e_global', jira_key: 'G-1', work_item_id: 'f_global', team_id: 't1', remaining_md: 5, target_start: '2026-02-12', target_end: '2026-02-26' }
            ]
        };

        const { result } = renderHook(() => useGraphLayout(dataWithGlobal));
        
        const globalWorkItemNode = result.current.nodes.find(n => n.id === 'workitem-f_global');
        expect(globalWorkItemNode).toBeDefined();
        expect(globalWorkItemNode?.data.isGlobal).toBe(true);

        // Should NOT have any edges starting from a customer and ending at this work item
        const edgesToGlobal = result.current.edges.filter(e => e.target === 'workitem-f_global' && e.source.startsWith('customer-'));
        expect(edgesToGlobal).toHaveLength(0);
    });

    it('calculates global work item scores based on total system TCV and selected type', () => {
        const data: DashboardData = {
            ...MOCK_DATA,
            customers: [
                { id: 'c1', name: 'C1', existing_tcv: 1000, potential_tcv: 5000 },
                { id: 'c2', name: 'C2', existing_tcv: 2000, potential_tcv: 0 }
            ],
            workItems: [
                {
                    id: 'f_existing',
                    name: 'Global Exist',
                    total_effort_mds: 10,
                    all_customers_target: { tcv_type: 'existing', priority: 'Must-have' },
                    customer_targets: []
                },
                {
                    id: 'f_potential',
                    name: 'Global Poten',
                    total_effort_mds: 10,
                    all_customers_target: { tcv_type: 'potential', priority: 'Must-have' },
                    customer_targets: []
                }
            ]
        };

        const { result } = renderHook(() => useGraphLayout(data));
        
        const existNode = result.current.nodes.find(n => n.id === 'workitem-f_existing');
        const potenNode = result.current.nodes.find(n => n.id === 'workitem-f_potential');

        // Score Existing: (1000 + 2000) / 10 = 300
        expect(existNode?.data.score).toBe(300);
        
        // Score Potential: (5000 + 0) / 10 = 500
        expect(potenNode?.data.score).toBe(500);
    });

    it('passes releasedInSprintId to workItemNode data', () => {
        const data: DashboardData = {
            ...MOCK_DATA,
            workItems: [
                {
                    id: 'f_release',
                    name: 'Released Feat',
                    total_effort_mds: 10,
                    released_in_sprint_id: 's1',
                    customer_targets: []
                }
            ]
        };

        const { result } = renderHook(() => useGraphLayout(data));
        const node = result.current.nodes.find(n => n.id === 'workitem-f_release');
        expect(node?.data.releasedInSprintId).toBe('s1');
    });
});
