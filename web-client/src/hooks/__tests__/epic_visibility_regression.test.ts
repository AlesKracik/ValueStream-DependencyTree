import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGraphLayout } from '../useGraphLayout';
import type { ValueStreamData } from '../../types/models';

const MOCK_DATA: ValueStreamData = {
    ValueStreams: [], settings: { jira_base_url: "https://jira", jira_api_version: "3" },
    customers: [
        { id: 'c1', name: 'Cust 1', existing_tcv: 100, potential_tcv: 0 }
    ],
    workItems: [
        {
            id: 'f1',
            name: 'Spanning Feature',
            total_effort_mds: 10, score: 50,
            customer_targets: [{ customer_id: 'c1', tcv_type: 'existing' }]
        }
    ],
    teams: [
        { id: 't1', name: 'Team Alpha', total_capacity_mds: 10 }
    ],
    epics: [
        { 
            id: 'e1', jira_key: 'J-1', work_item_id: 'f1', team_id: 't1', effort_md: 10, 
            target_start: '2026-01-01', target_end: '2026-03-31' // Spans Q1
        }
    ],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-02-01', end_date: '2026-02-14' },
        { id: 's2', name: 'Sprint 2', start_date: '2026-02-15', end_date: '2026-02-28' }
    ],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('reproduce_epic_bug', () => {
    it('should show an epic that spans the filtered range', () => {
        // Filter for February only
        const baseParams = {
            customerFilter: '', workItemFilter: '', releasedFilter: 'all' as const,
            minTcvFilter: '', minScoreFilter: '', teamFilter: '', epicFilter: '',
            startSprintId: 's1', endSprintId: 's2'
        };

        const { result } = renderHook(() => useGraphLayout(
            MOCK_DATA, null, 0, '', '', 'all', '', '', true, 0, 0, null, baseParams
        ));

        // f1 should be visible (e1 spans the range)
        const f1Node = result.current.nodes.find(n => n.id === 'workitem-f1');
        expect(f1Node, 'Work item f1 should be visible because e1 spans the range').toBeDefined();
        
        // e1 should be visible
        const e1Node = result.current.nodes.find(n => n.id === 'gantt-e1');
        expect(e1Node, 'Epic e1 should be visible because it spans the range').toBeDefined();
    });

    it('should show a global work item even if no customers match the TCV filter but they are otherwise visible', () => {
        const GLOBAL_DATA: ValueStreamData = {
            ...MOCK_DATA,
            workItems: [
                {
                    id: 'f2',
                    name: 'Global Feature',
                    total_effort_mds: 10, score: 50,
                    all_customers_target: { tcv_type: 'existing' },
                    customer_targets: []
                }
            ],
            epics: [
                { id: 'e2', jira_key: 'J-2', work_item_id: 'f2', team_id: 't1', effort_md: 10, target_start: '2026-02-01', target_end: '2026-02-14' }
            ]
        };

        // Filter for Min TCV = 1000. Customer c1 has only 100.
        const baseParams = {
            customerFilter: '', workItemFilter: '', releasedFilter: 'all' as const,
            minTcvFilter: '1000', minScoreFilter: '', teamFilter: '', epicFilter: '',
            startSprintId: '', endSprintId: ''
        };

        const { result } = renderHook(() => useGraphLayout(
            GLOBAL_DATA, null, 0, '', '', 'all', '', '', true, 0, 0, null, baseParams
        ));

        // Customer c1 should NOT be visible (tcv 100 < 1000)
        expect(result.current.nodes.find(n => n.id === 'customer-c1')).toBeUndefined();

        // f2 is a GLOBAL feature. Should it be visible? 
        // If it targets ALL customers, but NO customers match the filter, should it still be shown?
        // Usually, if a work item is global, it's NOT dependent on a specific customer match to be relevant to the value stream.
        const f2Node = result.current.nodes.find(n => n.id === 'workitem-f2');
        // Currently, it will likely be UNDEFINED because connectedValidCustomers is empty.
        expect(f2Node, 'Global work item should be visible even if no customers match the TCV filter').toBeDefined();
    });
});



