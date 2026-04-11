import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGraphLayout } from '../useGraphLayout';
import type { ValueStreamData } from '@valuestream/shared-types';

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((f1Node?.data as any).score).toBe(5);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((f2Node?.data as any).score).toBe(50);
    });

    it('maintains consistent team capacity usage regardless of filters', () => {
        // Unfiltered
        const { result: resultUnfiltered } = renderHook(() => useGraphLayout(MOCK_DATA));
        const unfilteredCapNode = resultUnfiltered.current.nodes.find(n => n.id === 'sprint-cap-t1-s1');
        // e1 (8 MD) + e2 (5 MD) = 13 MD used in s1 for Team t1
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((unfilteredCapNode?.data as any).usedMds).toBe(13);

        // With filter that hides workitem f2 (and thus issue e2)
        const { result: resultFiltered } = renderHook(() => useGraphLayout(MOCK_DATA, null, 0, '', 'Low RICE Feat'));
        
        // Confirm f2 is hidden
        expect(resultFiltered.current.nodes.find(n => n.id === 'workitem-f2')).toBeUndefined();
        
        const filteredCapNode = resultFiltered.current.nodes.find(n => n.id === 'sprint-cap-t1-s1');
        // Capacity usage should STILL be 13, not 8
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((filteredCapNode?.data as any).usedMds).toBe(13);
    });

    it('filters nodes based on persistent sprint range', () => {
        const DATA_WITH_TIME: ValueStreamData = {
            ...MOCK_DATA,
            sprints: [
                { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' },
                { id: 's2', name: 'Sprint 2', start_date: '2026-01-15', end_date: '2026-01-28' }
            ],
            issues: [
                { id: 'e1', jira_key: 'J-1', work_item_id: 'f1', team_id: 't1', effort_md: 5, target_start: '2026-01-01', target_end: '2026-01-10' }, // s1
                { id: 'e2', jira_key: 'J-2', work_item_id: 'f2', team_id: 't1', effort_md: 5, target_start: '2026-01-15', target_end: '2026-01-20' }  // s2
            ]
        };

        // Filter for s1 ONLY
        const baseParams = {
            customerFilter: '', workItemFilter: '', releasedFilter: 'all' as const,
            minTcvFilter: '', minScoreFilter: '', teamFilter: '', issueFilter: '',
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
        const TEST_DATA: ValueStreamData = {
            ...MOCK_DATA,
            workItems: [
                { id: 'f1', name: 'Estimated Feat', total_effort_mds: 10, score: 50, calculated_score: 50, status: 'Backlog', customer_targets: [] },
                { id: 'f2', name: 'Unestimated Feat (0 MDs)', total_effort_mds: 0, score: 50, calculated_score: 50, status: 'Backlog', customer_targets: [] },
                { id: 'f3', name: 'Feat with Unestimated Issue', total_effort_mds: 10, score: 50, calculated_score: 50, status: 'Backlog', customer_targets: [] },
            ],
            issues: [
                { id: 'e1', jira_key: 'E1', work_item_id: 'f1', team_id: 't1', effort_md: 5 },
                { id: 'e2', jira_key: 'E2', work_item_id: 'f3', team_id: 't1', effort_md: 0 },
            ]
        };

        const { result } = renderHook(() => useGraphLayout(TEST_DATA));

        const f1Node = result.current.nodes.find(n => n.id === 'workitem-f1');
        const f2Node = result.current.nodes.find(n => n.id === 'workitem-f2');
        const f3Node = result.current.nodes.find(n => n.id === 'workitem-f3');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((f1Node?.data as any).hasUnestimatedEffort).toBe(false);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((f2Node?.data as any).hasUnestimatedEffort).toBe(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((f3Node?.data as any).hasUnestimatedEffort).toBe(true);
    });

    it('reflects team capacity overrides in sprint capacity nodes', () => {
        const OVERRIDE_DATA: ValueStreamData = {
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
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((capNode?.data as any).totalCapacityMds).toBe(7);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((capNode?.data as any).isOverridden).toBe(true);
    });

    it('calculates holiday impact on team capacity correctly', () => {
        const HOLIDAY_DATA: ValueStreamData = {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((capNode?.data as any).holidayCount).toBe(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((capNode?.data as any).totalCapacityMds).toBe(9);
    });

    it('sorts Gantt lanes by related work item score (highest score on top)', () => {
        const SCORE_DATA: ValueStreamData = {
            ...MOCK_DATA,
            workItems: [
                { id: 'f1', name: 'Low Score', total_effort_mds: 10, score: 5, calculated_score: 5, status: 'Backlog', customer_targets: [] },
                { id: 'f2', name: 'High Score', total_effort_mds: 5, score: 50, calculated_score: 50, status: 'Backlog', customer_targets: [] },
                { id: 'f3', name: 'No Work Item Score', total_effort_mds: 5, score: 0, calculated_score: 0, status: 'Backlog', customer_targets: [] },
            ],
            issues: [
                // All overlapping in time (same team) so they need separate lanes
                { id: 'e1', jira_key: 'J-1', work_item_id: 'f1', team_id: 't1', effort_md: 5, target_start: '2026-02-12', target_end: '2026-02-26' },
                { id: 'e2', jira_key: 'J-2', work_item_id: 'f2', team_id: 't1', effort_md: 5, target_start: '2026-02-12', target_end: '2026-02-26' },
                { id: 'e3', jira_key: 'J-3', work_item_id: 'f3', team_id: 't1', effort_md: 3, target_start: '2026-02-12', target_end: '2026-02-26' },
                // Issue with no work item
                { id: 'e4', jira_key: 'J-4', team_id: 't1', effort_md: 2, target_start: '2026-02-12', target_end: '2026-02-26' },
            ]
        };

        const { result } = renderHook(() => useGraphLayout(SCORE_DATA));

        const ganttE1 = result.current.nodes.find(n => n.id === 'gantt-e1');
        const ganttE2 = result.current.nodes.find(n => n.id === 'gantt-e2');
        const ganttE3 = result.current.nodes.find(n => n.id === 'gantt-e3');
        const ganttE4 = result.current.nodes.find(n => n.id === 'gantt-e4');

        expect(ganttE1).toBeDefined();
        expect(ganttE2).toBeDefined();
        expect(ganttE3).toBeDefined();
        expect(ganttE4).toBeDefined();

        // Higher score = lower Y position (top lane)
        // e2 (score 50) should be above e1 (score 5), which should be above e3 (score 0) and e4 (no workitem = 0)
        expect(ganttE2!.position.y).toBeLessThan(ganttE1!.position.y);
        expect(ganttE1!.position.y).toBeLessThan(ganttE3!.position.y);
    });

    it('does not reserve lanes for issues completely outside the visible sprint window', () => {
        const DATA_WITH_OFFSCREEN: ValueStreamData = {
            ...MOCK_DATA,
            sprints: [
                { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' },
                { id: 's2', name: 'Sprint 2', start_date: '2026-01-15', end_date: '2026-01-28' },
                { id: 's3', name: 'Sprint 3', start_date: '2026-01-29', end_date: '2026-02-11' },
                { id: 's4', name: 'Sprint 4', start_date: '2026-02-12', end_date: '2026-02-25' },
                { id: 's5', name: 'Sprint 5', start_date: '2026-02-26', end_date: '2026-03-11' },
                { id: 's6', name: 'Sprint 6', start_date: '2026-03-12', end_date: '2026-03-25' },
                // Off-screen sprints
                { id: 's7', name: 'Sprint 7', start_date: '2026-03-26', end_date: '2026-04-08' },
                { id: 's8', name: 'Sprint 8', start_date: '2026-04-09', end_date: '2026-04-22' },
            ],
            issues: [
                // Visible: in s1
                { id: 'e1', jira_key: 'J-1', work_item_id: 'f1', team_id: 't1', effort_md: 5, target_start: '2026-01-01', target_end: '2026-01-10' },
                // Completely off-screen: in s7-s8 (sprintOffset=0 shows s1-s6)
                { id: 'e2', jira_key: 'J-2', work_item_id: 'f2', team_id: 't1', effort_md: 5, target_start: '2026-03-26', target_end: '2026-04-22' },
                // Another off-screen issue that would overlap e2 and create a new lane
                { id: 'e3', jira_key: 'J-3', work_item_id: 'f1', team_id: 't1', effort_md: 3, target_start: '2026-04-01', target_end: '2026-04-15' },
            ]
        };

        // sprintOffset=0 -> visible window is s1-s6 (Jan 1 - Mar 25)
        const { result } = renderHook(() => useGraphLayout(DATA_WITH_OFFSCREEN, null, 0));

        // Only e1 should have a Gantt bar rendered
        expect(result.current.nodes.find(n => n.id === 'gantt-e1')).toBeDefined();
        expect(result.current.nodes.find(n => n.id === 'gantt-e2')).toBeUndefined();
        expect(result.current.nodes.find(n => n.id === 'gantt-e3')).toBeUndefined();

        // Team height should only account for 1 lane (e1), not 2 (e2+e3 overlap)
        const teamNode = result.current.nodes.find(n => n.id === 'team-t1');
        expect(teamNode).toBeDefined();
        // With 1 lane: height = max(180, 1*45+100) = 180 -> baseY = startY - 90 + 90 = startY
        // With 2 lanes: height = max(180, 2*45+100) = 190 -> baseY would be different
        // The team node Y should reflect only 1 lane of height
        const teamY = teamNode!.position.y;

        // Now shift to see off-screen sprints
        const { result: resultShifted } = renderHook(() => useGraphLayout(DATA_WITH_OFFSCREEN, null, 2));

        // With offset 2, visible sprints are s3-s8 which includes both e2 and e3
        // These overlap, requiring 2 lanes -> taller team
        const teamNodeShifted = resultShifted.current.nodes.find(n => n.id === 'team-t1');
        expect(teamNodeShifted).toBeDefined();
        const teamYShifted = teamNodeShifted!.position.y;

        // If off-screen issues were incorrectly reserving lanes, both Y values would be the same
        // With the fix, the first view (1 visible lane) should have a smaller or equal team area
        // than the shifted view (2 visible lanes that overlap)
        expect(teamYShifted).not.toBe(teamY);
    });

    it('highlights the Issue (Gantt) when hovering the WorkItem even if IDs have dashes', () => {
        const DASH_DATA: ValueStreamData = {
            ...MOCK_DATA,
            customers: [{ id: 'c-1', name: 'Cust 1', existing_tcv: 100, existing_tcv_valid_from: '2026-01-01', potential_tcv: 0 }],
            workItems: [{
                id: 'wi-1',
                name: 'Work Item 1',
                total_effort_mds: 10, score: 5, calculated_score: 5, status: 'Backlog',
                customer_targets: [{ customer_id: 'c-1', tcv_type: 'existing', priority: 'Must-have' }]
            }],
            teams: [{ id: 't-1', name: 'Team Alpha', total_capacity_mds: 10 }],
            issues: [{ id: 'e-1', jira_key: 'J-1', work_item_id: 'wi-1', team_id: 't-1', effort_md: 8, target_start: '2026-02-12', target_end: '2026-02-26' }]
        };

        // Hovering over WorkItem wi-1
        const { result } = renderHook(() => useGraphLayout(DASH_DATA, 'workitem-wi-1'));
        
        const ganttNode = result.current.nodes.find(n => n.id === 'gantt-e-1');
        expect(ganttNode).toBeDefined();
        
        // If it's highlighted, opacity should be 1. If NOT, it's 0.15.
        expect(ganttNode?.style?.opacity).toBe(1);
    });
});





