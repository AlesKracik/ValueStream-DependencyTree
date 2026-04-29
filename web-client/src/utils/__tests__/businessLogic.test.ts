import { describe, it, expect } from 'vitest';
import {
    deepMerge,
    calculateWorkItemEffort,
    calculateWorkItemTcv,
    calculateWorkItemScore,
    calculateIssueEffortPerSprint,
    calculateIssueIntensityRatio,
    parseJiraIssue,
    buildSupportStatusPatch,
    SUPPORT_DONE_RETENTION_DAYS,
    estimateTeamCapacityMds,
    TEAM_CAPACITY_PTO_FACTOR
} from '../businessLogic';
import type { WorkItem, Issue, Customer, Sprint, Team } from '@valuestream/shared-types';

describe('businessLogic', () => {
    // ... parseJiraIssue tests remain the same ...
    describe('parseJiraIssue', () => {
        const mockTeams: Team[] = [
            { id: 't1', name: 'Team Alpha', jira_team_id: '101', total_capacity_mds: 0 },
            { id: 't2', name: 'Team Beta', jira_team_id: '102', total_capacity_mds: 0 }
        ];

        it('parses basic fields correctly', () => {
            const jiraIssue = {
                fields: {
                    summary: 'Test Issue',
                    timeestimate: 28800 * 5 // 5 man-days
                }
            };
            const result = parseJiraIssue(jiraIssue, mockTeams);
            expect(result.name).toBe('Test Issue');
            expect(result.effort_md).toBe(5);
        });

        it('parses custom date fields correctly', () => {
            const jiraIssue = {
                fields: {
                    summary: 'Test Issue',
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
            status: 'Backlog',
            customer_targets: []
        };

        it('uses workItem effort when no issues are present', () => {
            expect(calculateWorkItemEffort(mockWorkItem, [])).toBe(10);
        });

        it('uses workItem effort when issue effort sum is 0', () => {
            const issues: Issue[] = [
                { id: 'e1', jira_key: 'J1', work_item_id: 'f1', team_id: 't1', effort_md: 0 }
            ];
            expect(calculateWorkItemEffort(mockWorkItem, issues)).toBe(10);
        });

        it('prioritizes issue effort sum when it is greater than 0', () => {
            const issues: Issue[] = [
                { id: 'e1', jira_key: 'J1', work_item_id: 'f1', team_id: 't1', effort_md: 5 },
                { id: 'e2', jira_key: 'J2', work_item_id: 'f1', team_id: 't2', effort_md: 7 }
            ];
            // Issue sum (12) > WorkItem effort (10)
            expect(calculateWorkItemEffort(mockWorkItem, issues)).toBe(12);
        });

        it('uses issue effort sum even if it is smaller than workItem effort (as long as it is > 0)', () => {
            const issues: Issue[] = [
                { id: 'e1', jira_key: 'J1', work_item_id: 'f1', team_id: 't1', effort_md: 5 }
            ];
            // Issue sum (5) is taken because it's > 0, even though WorkItem effort is 10
            expect(calculateWorkItemEffort(mockWorkItem, issues)).toBe(5);
        });

        it('ignores issues for other work items', () => {
            const issues: Issue[] = [
                { id: 'e1', jira_key: 'J1', work_item_id: 'f2', team_id: 't1', effort_md: 50 }
            ];
            expect(calculateWorkItemEffort(mockWorkItem, issues)).toBe(10);
        });
    });

    describe('calculateWorkItemTcv', () => {
        const mockCustomers: Customer[] = [
            { id: 'c1', name: 'Cust 1', existing_tcv: 100, potential_tcv: 50, tcv_history: [
                { id: 'h1', value: 80, valid_from: '2025-01-01' }
            ]},
            { id: 'c2', name: 'Cust 2', existing_tcv: 200, potential_tcv: 0 }
        ];

        it('calculates TCV for specific customer targets (existing, Must-have)', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                status: 'Backlog',
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers, [workItem])).toBe(100);
        });

        it('calculates shared TCV for Should-have priority', () => {
            const f1: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                status: 'Backlog',
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Should-have' }
                ]
            };
            const f2: WorkItem = {
                id: 'f2',
                name: 'F2',
                total_effort_mds: 0,
                score: 0,
                status: 'Backlog',
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Should-have' }
                ]
            };
            const allWorkItems = [f1, f2];

            // c1 has 100 existing_tcv. Shared between 2 should-haves = 50 each.
            expect(calculateWorkItemTcv(f1, mockCustomers, allWorkItems)).toBe(50);
            expect(calculateWorkItemTcv(f2, mockCustomers, allWorkItems)).toBe(50);
        });

        it('returns 0 for Nice-to-have priority', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                status: 'Backlog',
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Nice-to-have' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers, [workItem])).toBe(0);
        });

        it('calculates TCV for specific customer targets (historical)', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                status: 'Backlog',
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', tcv_history_id: 'h1', priority: 'Must-have' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers, [workItem])).toBe(80);
        });

        it('sums TCV across multiple customers with mixed priorities', () => {
            const f1: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                status: 'Backlog',
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }, // 100
                    { customer_id: 'c2', tcv_type: 'existing', priority: 'Should-have' } // 200 / 1 = 200
                ]
            };
            expect(calculateWorkItemTcv(f1, mockCustomers, [f1])).toBe(300);
        });

        it('calculates TCV for global work items (all customers) with Must-have', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                status: 'Backlog',
                customer_targets: [],
                all_customers_target: { tcv_type: 'existing', priority: 'Must-have' }
            };
            // 100 + 200 = 300
            expect(calculateWorkItemTcv(workItem, mockCustomers, [workItem])).toBe(300);
        });

        it('calculates TCV for global work items (all customers) with Should-have', () => {
            const f1: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                status: 'Backlog',
                customer_targets: [],
                all_customers_target: { tcv_type: 'existing', priority: 'Should-have' }
            };
            const f2: WorkItem = {
                id: 'f2',
                name: 'F2',
                total_effort_mds: 0,
                score: 0,
                status: 'Backlog',
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Should-have' }
                ]
            };
            const allWorkItems = [f1, f2];

            // For c1 (100): Shared between f1 (global) and f2. 100 / 2 = 50.
            // For c2 (200): Only f1 (global) targets it as should-have. 200 / 1 = 200.
            // Total for f1 = 50 + 200 = 250.
            expect(calculateWorkItemTcv(f1, mockCustomers, allWorkItems)).toBe(250);
        });
    });

    describe('calculateWorkItemScore', () => {
        const mockCustomers: Customer[] = [
            { id: 'c1', name: 'Cust 1', existing_tcv: 1000, potential_tcv: 0 }
        ];

        it('calculates score as Impact / Effort', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 10,
                score: 0,
                status: 'Backlog',
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }
                ]
            };
            // Impact = 1000, Effort = 10. Score = 100.
            expect(calculateWorkItemScore(workItem, mockCustomers, [workItem], [])).toBe(100);
        });

        it('uses a floor of 1 MD for effort to avoid division by zero', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                status: 'Backlog',
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }
                ]
            };
            // Impact = 1000, Effort floor = 1. Score = 1000.
            expect(calculateWorkItemScore(workItem, mockCustomers, [workItem], [])).toBe(1000);
        });
    });

    describe('calculateIssueEffortPerSprint', () => {
        const mockSprints: Sprint[] = [
            { id: 's1', name: 'S1', start_date: '2025-01-01', end_date: '2025-01-14', quarter: 'Q1' },
            { id: 's2', name: 'S2', start_date: '2025-01-15', end_date: '2025-01-28', quarter: 'Q1' },
            { id: 's3', name: 'S3', start_date: '2025-01-29', end_date: '2025-02-11', quarter: 'Q1' }
        ];

        it('distributes effort proportionally across overlapping sprints', () => {
            const issue: Issue = {
                id: 'e1',
                jira_key: 'J1',
                team_id: 't1',
                effort_md: 30,
                target_start: '2025-01-01',
                target_end: '2025-01-30' // 30 days
            };

            const result = calculateIssueEffortPerSprint(issue, mockSprints);
            // S1 (14 days), S2 (14 days), S3 (2 days)
            expect(result['s1']).toBeCloseTo(14, 0);
            expect(result['s2']).toBeCloseTo(14, 0);
            expect(result['s3']).toBeCloseTo(2, 0);
        });

        it('respects manual overrides and distributes remaining effort', () => {
            const issue: Issue = {
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

            const result = calculateIssueEffortPerSprint(issue, mockSprints);
            // Total effort 30. S1 overridden to 5. 25 left.
            // S1 had 14 days, S2 had 14 days, S3 had 2 days.
            // Remaining days for S2 and S3: 14 + 2 = 16.
            expect(result['s1']).toBe(5);
            expect(result['s2']).toBeCloseTo(25 * (14/16), 1);
            expect(result['s3']).toBeCloseTo(25 * (2/16), 1);
        });

        it('returns empty object if dates are missing', () => {
            const issue: Issue = { id: 'e1', jira_key: 'J1', team_id: 't1', effort_md: 30 };
            expect(calculateIssueEffortPerSprint(issue, mockSprints)).toEqual({});
        });
    });

    describe('calculateIssueIntensityRatio', () => {
        it('calculates ratio correctly when baseline is > 0', () => {
            expect(calculateIssueIntensityRatio(20, 10)).toBe(2);
            expect(calculateIssueIntensityRatio(5, 10)).toBe(0.5);
        });

        it('returns 2 if actual > 0 and baseline is 0', () => {
            expect(calculateIssueIntensityRatio(5, 0)).toBe(2);
        });

        it('returns 1 if both actual and baseline are 0', () => {
            expect(calculateIssueIntensityRatio(0, 0)).toBe(1);
        });
    });

    describe('deepMerge', () => {
        it('preserves source values for keys that exist in target', () => {
            const target = { a: 1, b: 2 };
            const source = { a: 10, b: 20 };
            expect(deepMerge(target, source)).toEqual({ a: 10, b: 20 });
        });

        it('drops source keys not present in target', () => {
            const target = { a: 1 };
            const source = { a: 10, extra: 99 };
            expect(deepMerge(target, source)).toEqual({ a: 10 });
        });

        it('recursively merges nested objects', () => {
            const target = { nested: { x: 1, y: 2 } };
            const source = { nested: { x: 10 } };
            expect(deepMerge(target, source)).toEqual({ nested: { x: 10, y: 2 } });
        });

        it('preserves SSO credential fields through DEFAULT_SETTINGS merge', () => {
            // Simulates the SettingsPage reconciliation: deepMerge(DEFAULT_SETTINGS, settings)
            const defaults = {
                persistence: {
                    mongo: {
                        app: {
                            auth: {
                                sso: { aws_sso_start_url: '', aws_sso_region: '', aws_access_key: '', aws_secret_key: '', aws_session_token: '' }
                            }
                        }
                    }
                }
            };
            const incoming = {
                persistence: {
                    mongo: {
                        app: {
                            auth: {
                                sso: { aws_sso_start_url: 'https://test.aws', aws_sso_region: 'us-east-1', aws_access_key: 'AK', aws_secret_key: 'SK', aws_session_token: 'ST' }
                            }
                        }
                    }
                }
            };

            const result = deepMerge(defaults, incoming);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sso = (result as Record<string, any>).persistence.mongo.app.auth.sso;
            expect(sso.aws_access_key).toBe('AK');
            expect(sso.aws_secret_key).toBe('SK');
            expect(sso.aws_session_token).toBe('ST');
            expect(sso.aws_sso_start_url).toBe('https://test.aws');
        });

        it('drops SSO credential fields if not in defaults (regression guard)', () => {
            // If defaults were missing credential keys, deepMerge would drop them
            const badDefaults = {
                persistence: {
                    mongo: {
                        app: {
                            auth: {
                                sso: { aws_sso_start_url: '' } // missing aws_access_key etc.
                            }
                        }
                    }
                }
            };
            const incoming = {
                persistence: {
                    mongo: {
                        app: {
                            auth: {
                                sso: { aws_sso_start_url: 'https://test.aws', aws_access_key: 'AK' }
                            }
                        }
                    }
                }
            };

            const result = deepMerge(badDefaults, incoming);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sso = (result as Record<string, any>).persistence.mongo.app.auth.sso;
            expect(sso.aws_sso_start_url).toBe('https://test.aws');
            // aws_access_key should be dropped because it's not in badDefaults
            expect(sso.aws_access_key).toBeUndefined();
        });

        it('preserves Role auth credential fields through merge', () => {
            const defaults = {
                auth: {
                    role: { aws_role_arn: '', aws_access_key: '', aws_secret_key: '', aws_session_token: '' }
                }
            };
            const incoming = {
                auth: {
                    role: { aws_role_arn: 'arn:aws:iam::123:role/R', aws_access_key: 'AK', aws_secret_key: 'SK' }
                }
            };

            const result = deepMerge(defaults, incoming);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const role = (result as Record<string, any>).auth.role;
            expect(role.aws_access_key).toBe('AK');
            expect(role.aws_role_arn).toBe('arn:aws:iam::123:role/R');
        });
    });

    describe('buildSupportStatusPatch', () => {
        const isoToday = (offsetDays: number): string => {
            const d = new Date();
            d.setDate(d.getDate() + offsetDays);
            return d.toISOString().split('T')[0];
        };

        it('sets only the status when transitioning to a non-done status', () => {
            const patch = buildSupportStatusPatch({ expiration_date: undefined }, 'work in progress');
            expect(patch).toEqual({ status: 'work in progress' });
        });

        it('schedules an auto-expiration N days out when transitioning to "done" with no existing expiry', () => {
            const patch = buildSupportStatusPatch({ expiration_date: undefined }, 'done');
            expect(patch.status).toBe('done');
            expect(patch.expiration_date).toBe(isoToday(SUPPORT_DONE_RETENTION_DAYS));
        });

        it('does NOT overwrite an existing expiration_date when transitioning to "done"', () => {
            const existing = '2099-12-31';
            const patch = buildSupportStatusPatch({ expiration_date: existing }, 'done');
            expect(patch.status).toBe('done');
            // expiration_date is not part of the patch — caller's existing value is preserved.
            expect(patch.expiration_date).toBeUndefined();
        });

        it('does NOT set expiration_date when transitioning AWAY from done to a non-done status', () => {
            const patch = buildSupportStatusPatch({ expiration_date: undefined }, 'to do');
            expect(patch).toEqual({ status: 'to do' });
            expect(patch.expiration_date).toBeUndefined();
        });
    });

    describe('estimateTeamCapacityMds', () => {
        it('returns 0 for an empty member list', () => {
            expect(estimateTeamCapacityMds([], 14)).toBe(0);
        });

        it('returns 0 when sprint duration is non-positive', () => {
            expect(estimateTeamCapacityMds([{ capacity_percentage: 100 }], 0)).toBe(0);
            expect(estimateTeamCapacityMds([{ capacity_percentage: 100 }], -5)).toBe(0);
        });

        it('computes 8 MDs for one full-time member on a 14-day sprint (10 working days × 80%)', () => {
            // 14 * 5/7 = 10 working days. 10 * 1.0 = 10 gross. 10 * 0.8 = 8 net.
            expect(estimateTeamCapacityMds([{ capacity_percentage: 100 }], 14)).toBe(8);
        });

        it('scales by per-member capacity_percentage', () => {
            // Three members at 100%, 50%, 25% → effective FTEs = 1.75
            // workingDays = 10. gross = 10 * 1.75 = 17.5. net = 17.5 * 0.8 = 14.
            const members = [
                { capacity_percentage: 100 },
                { capacity_percentage: 50 },
                { capacity_percentage: 25 }
            ];
            expect(estimateTeamCapacityMds(members, 14)).toBe(14);
        });

        it('honors a non-default sprint duration', () => {
            // 7-day sprint = 5 working days. One full-time member: 5 * 0.8 = 4.
            expect(estimateTeamCapacityMds([{ capacity_percentage: 100 }], 7)).toBe(4);
        });

        it('rounds to one decimal', () => {
            // 1 member @ 33% on a 14-day sprint: 10 * 0.33 * 0.8 = 2.64 → 2.6.
            expect(estimateTeamCapacityMds([{ capacity_percentage: 33 }], 14)).toBe(2.6);
        });

        it('treats missing/falsy capacity_percentage as 0', () => {
            // First member contributes nothing; second adds 8.
            const members = [
                { capacity_percentage: 0 },
                { capacity_percentage: 100 }
            ];
            expect(estimateTeamCapacityMds(members, 14)).toBe(8);
        });

        it('exposes the PTO factor constant', () => {
            expect(TEAM_CAPACITY_PTO_FACTOR).toBe(0.8);
        });
    });
});
