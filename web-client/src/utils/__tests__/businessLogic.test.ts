import { describe, it, expect } from 'vitest';
import { calculateWorkItemEffort, calculateWorkItemTcv, calculateEpicEffortPerSprint, calculateEpicIntensityRatio, parseJiraIssue } from '../businessLogic';
import type { WorkItem, Epic, Customer, Sprint, Team } from '../../types/models';

describe('businessLogic', () => {
    describe('parseJiraIssue', () => {
        const mockTeams: Team[] = [
            { id: 't1', name: 'Team Alpha', jira_team_id: '101', total_capacity_mds: 0 },
            { id: 't2', name: 'Team Beta', jira_team_id: '102', total_capacity_mds: 0 }
        ];

        it('parses basic fields correctly', () => {
            const jiraIssue = {
                fields: {
                    summary: 'Test Epic',
                    timeestimate: 28800 * 5 // 5 man-days
                }
            };
            const result = parseJiraIssue(jiraIssue, mockTeams);
            expect(result.name).toBe('Test Epic');
            expect(result.effort_md).toBe(5);
        });

        it('parses custom date fields correctly', () => {
            const jiraIssue = {
                fields: {
                    summary: 'Test Epic',
                    'customfield_101': '2026-01-01',
                    'customfield_102': '2026-01-14'
                },
                names: {
                    'customfield_101': 'Target start',
                    'customfield_102': 'Target end'
                }
            };
            const result = parseJiraIssue(jiraIssue, mockTeams);
            expect(result.target_start).toBe('2026-01-01');
            expect(result.target_end).toBe('2026-01-14');
        });

        it('matches teams by jira_team_id', () => {
            const jiraIssue = {
                fields: {
                    'customfield_103': { id: '102', name: 'Some Team' }
                },
                names: {
                    'customfield_103': 'Team'
                }
            };
            const result = parseJiraIssue(jiraIssue, mockTeams);
            expect(result.team_id).toBe('t2');
        });

        it('matches teams by name if ID doesn\'t match', () => {
            const jiraIssue = {
                fields: {
                    'customfield_103': { id: '999', name: 'Team Alpha' }
                },
                names: {
                    'customfield_103': 'Team'
                }
            };
            const result = parseJiraIssue(jiraIssue, mockTeams);
            expect(result.team_id).toBe('t1');
        });

        it('handles missing fields gracefully', () => {
            const jiraIssue = { fields: {} };
            const result = parseJiraIssue(jiraIssue, mockTeams);
            expect(result).toEqual({});
        });

        it('treats 0 effort in Jira as source of truth', () => {
            const jiraIssue = {
                fields: {
                    timeestimate: 0
                }
            };
            const result = parseJiraIssue(jiraIssue, mockTeams);
            expect(result.effort_md).toBe(0);
        });

        it('treats null/empty dates in Jira as source of truth', () => {
            const jiraIssue = {
                fields: {
                    'customfield_101': null,
                    'customfield_102': ''
                },
                names: {
                    'customfield_101': 'Target start',
                    'customfield_102': 'Target end'
                }
            };
            const result = parseJiraIssue(jiraIssue, mockTeams);
            expect(result.target_start).toBeUndefined();
            expect(result.target_end).toBeUndefined();
        });

        it('prefers timeestimate over aggregatetimeestimate', () => {
            const jiraIssue = {
                fields: {
                    timeestimate: 28800 * 5,
                    aggregatetimeestimate: 28800 * 10
                }
            };
            const result = parseJiraIssue(jiraIssue, mockTeams);
            expect(result.effort_md).toBe(5);
        });

        it('falls back to aggregatetimeestimate if timeestimate is missing', () => {
            const jiraIssue = {
                fields: {
                    aggregatetimeestimate: 28800 * 10
                }
            };
            const result = parseJiraIssue(jiraIssue, mockTeams);
            expect(result.effort_md).toBe(10);
        });
    });

    describe('calculateWorkItemEffort', () => {
        const mockWorkItem: WorkItem = {
            id: 'f1',
            name: 'Test Feature',
            total_effort_mds: 10,
            score: 0,
            customer_targets: []
        };

        it('uses workItem effort when no epics are present', () => {
            expect(calculateWorkItemEffort(mockWorkItem, [])).toBe(10);
        });

        it('uses workItem effort when epic effort sum is 0', () => {
            const epics: Epic[] = [
                { id: 'e1', jira_key: 'J1', work_item_id: 'f1', team_id: 't1', effort_md: 0 }
            ];
            expect(calculateWorkItemEffort(mockWorkItem, epics)).toBe(10);
        });

        it('prioritizes epic effort sum when it is greater than 0', () => {
            const epics: Epic[] = [
                { id: 'e1', jira_key: 'J1', work_item_id: 'f1', team_id: 't1', effort_md: 5 },
                { id: 'e2', jira_key: 'J2', work_item_id: 'f1', team_id: 't2', effort_md: 7 }
            ];
            // Epic sum (12) > WorkItem effort (10)
            expect(calculateWorkItemEffort(mockWorkItem, epics)).toBe(12);
        });

        it('uses epic effort sum even if it is smaller than workItem effort (as long as it is > 0)', () => {
            const epics: Epic[] = [
                { id: 'e1', jira_key: 'J1', work_item_id: 'f1', team_id: 't1', effort_md: 5 }
            ];
            // Epic sum (5) is taken because it's > 0, even though WorkItem effort is 10
            expect(calculateWorkItemEffort(mockWorkItem, epics)).toBe(5);
        });

        it('ignores epics for other work items', () => {
            const epics: Epic[] = [
                { id: 'e1', jira_key: 'J1', work_item_id: 'f2', team_id: 't1', effort_md: 50 }
            ];
            expect(calculateWorkItemEffort(mockWorkItem, epics)).toBe(10);
        });
    });

    describe('calculateWorkItemTcv', () => {
        const mockCustomers: Customer[] = [
            { id: 'c1', name: 'Cust 1', existing_tcv: 100, potential_tcv: 50, tcv_history: [
                { id: 'h1', value: 80, valid_from: '2025-01-01' }
            ]},
            { id: 'c2', name: 'Cust 2', existing_tcv: 200, potential_tcv: 0 }
        ];

        it('calculates TCV for specific customer targets (existing)', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(100);
        });

        it('calculates TCV for specific customer targets (potential)', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'potential' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(50);
        });

        it('calculates TCV for specific customer targets (historical)', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', tcv_history_id: 'h1' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(80);
        });

        it('sums TCV across multiple customers', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing' },
                    { customer_id: 'c2', tcv_type: 'existing' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(300);
        });

        it('calculates TCV for global work items (all customers)', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [],
                all_customers_target: { tcv_type: 'existing', priority: 'Must-have' }
            };
            // 100 + 200 = 300
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(300);
        });

        it('returns 0 if no customers match', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [
                    { customer_id: 'non-existent', tcv_type: 'existing' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(0);
        });
    });

    describe('calculateEpicEffortPerSprint', () => {
        const mockSprints: Sprint[] = [
            { id: 's1', name: 'S1', start_date: '2025-01-01', end_date: '2025-01-14', quarter: 'Q1' },
            { id: 's2', name: 'S2', start_date: '2025-01-15', end_date: '2025-01-28', quarter: 'Q1' },
            { id: 's3', name: 'S3', start_date: '2025-01-29', end_date: '2025-02-11', quarter: 'Q1' }
        ];

        it('distributes effort proportionally across overlapping sprints', () => {
            const epic: Epic = {
                id: 'e1',
                jira_key: 'J1',
                team_id: 't1',
                effort_md: 30,
                target_start: '2025-01-01',
                target_end: '2025-01-30' // 30 days
            };

            const result = calculateEpicEffortPerSprint(epic, mockSprints);
            // S1 (14 days), S2 (14 days), S3 (2 days)
            expect(result['s1']).toBeCloseTo(14, 0);
            expect(result['s2']).toBeCloseTo(14, 0);
            expect(result['s3']).toBeCloseTo(2, 0);
        });

        it('respects manual overrides and distributes remaining effort', () => {
            const epic: Epic = {
                id: 'e1',
                jira_key: 'J1',
                team_id: 't1',
                effort_md: 30,
                target_start: '2025-01-01',
                target_end: '2025-01-30',
                sprint_effort_overrides: {
                    's1': 5
                }
            };

            const result = calculateEpicEffortPerSprint(epic, mockSprints);
            // Total effort 30. S1 overridden to 5. 25 left.
            // S1 had 14 days, S2 had 14 days, S3 had 2 days.
            // Remaining days for S2 and S3: 14 + 2 = 16.
            expect(result['s1']).toBe(5);
            expect(result['s2']).toBeCloseTo(25 * (14/16), 1);
            expect(result['s3']).toBeCloseTo(25 * (2/16), 1);
        });

        it('returns empty object if dates are missing', () => {
            const epic: Epic = { id: 'e1', jira_key: 'J1', team_id: 't1', effort_md: 30 };
            expect(calculateEpicEffortPerSprint(epic, mockSprints)).toEqual({});
        });
    });

    describe('calculateEpicIntensityRatio', () => {
        it('calculates ratio correctly when baseline is > 0', () => {
            expect(calculateEpicIntensityRatio(20, 10)).toBe(2);
            expect(calculateEpicIntensityRatio(5, 10)).toBe(0.5);
        });

        it('returns 2 if actual > 0 and baseline is 0', () => {
            expect(calculateEpicIntensityRatio(5, 0)).toBe(2);
        });

        it('returns 1 if both actual and baseline are 0', () => {
            expect(calculateEpicIntensityRatio(0, 0)).toBe(1);
        });
    });
});
