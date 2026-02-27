import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGraphLayout } from '../useGraphLayout';
import type { DashboardData } from '../../types/models';

const MOCK_DATA: DashboardData = {
    settings: { jira_base_url: "https://jira", jira_api_version: "3" },
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
    ]
};

describe('useGraphLayout Math Engine', () => {

    it('generates centered HeaderNodes above the columns', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', '', '', true));
        
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
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', '', '', true));
        
        const firstCustomer = result.current.nodes.find(n => n.id === 'customer-c1');
        const firstWorkItem = result.current.nodes.find(n => n.id === 'workitem-f1');

        // START_Y is 200, but nodes are positioned at START_Y - (nodeSize / 2)
        // With nodeSize around 100-140, Y should be around 130-150.
        // Crucially, it should be significantly below the header at Y=0.
        expect(firstCustomer?.position.y).toBeGreaterThan(100);
        expect(firstWorkItem?.position.y).toBeGreaterThan(100);
    });

    it('gracefully handles empty data', () => {
        const { result } = renderHook(() => useGraphLayout(null, null, 0, '', '', '', '', true));
        expect(result.current.nodes).toEqual([]);
        expect(result.current.edges).toEqual([]);
    });

    it('calculates proper RICE visualization scaling', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', '', '', true));

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
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', '', '', true));

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
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', '', '', true));

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
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', '', '', '', true));

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
});
