import { describe, it, expect } from 'vitest';
import {
    deepMerge,
    hasUnestimatedWorkItemEffort,
    calculateIssueEffortPerSprint,
    calculateIssueIntensityRatio,
    parseJiraIssue,
    deriveWorkItemStatusFromJira,
    mapJiraStatusToWorkItemStatus,
    buildSupportStatusPatch,
    SUPPORT_DONE_RETENTION_DAYS,
    estimateTeamCapacityMds,
    TEAM_CAPACITY_PTO_FACTOR,
    customerMoneyBagTcv,
    moneyBagFillRatio,
    resolveFieldId,
    extractParentLinkKey,
    planHierarchyAlignment,
    parseAhaFeature,
    parseAhaEpic,
    findJiraParent,
    findJiraChildren
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
            expect(result).toEqual({ parent_jira_key: null, jira_status: null });
        });

        describe('parent_jira_key', () => {
            const names = { customfield_1: 'Parent Link', customfield_2: 'Epic Link' };

            it('Data Center: prefers Parent Link, then Epic Link, then a sub-task parent', () => {
                expect(parseJiraIssue({ names, fields: { customfield_1: 'INIT-1', customfield_2: 'EPIC-1' } }, mockTeams).parent_jira_key).toBe('INIT-1');
                expect(parseJiraIssue({ names, fields: { customfield_2: 'EPIC-1', parent: { key: 'P-1' } } }, mockTeams).parent_jira_key).toBe('EPIC-1');
                expect(parseJiraIssue({ names, fields: { parent: { key: 'P-1' } } }, mockTeams).parent_jira_key).toBe('P-1');
            });

            it('Cloud: prefers the system parent over a lingering Parent Link', () => {
                const issue = { names, fields: { parent: { key: 'EPIC-9' }, customfield_1: 'INIT-1' } };
                expect(parseJiraIssue(issue, mockTeams, 'cloud').parent_jira_key).toBe('EPIC-9');
                expect(parseJiraIssue({ names, fields: { customfield_1: 'INIT-1' } }, mockTeams, 'cloud').parent_jira_key).toBe('INIT-1');
            });

            it('clears the parent when Jira has none', () => {
                expect(parseJiraIssue({ names, fields: { summary: 'x' } }, mockTeams).parent_jira_key).toBeNull();
                expect(parseJiraIssue({ fields: { summary: 'x' } }, mockTeams, 'cloud').parent_jira_key).toBeNull();
            });
        });

        it('reads the Jira status name, null when Jira has none', () => {
            expect(parseJiraIssue({ fields: { status: { name: 'In Review' } } }, mockTeams).jira_status).toBe('In Review');
            expect(parseJiraIssue({ fields: {} }, mockTeams).jira_status).toBeNull();
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

    describe('mapJiraStatusToWorkItemStatus', () => {
        it('maps Draft, Open and the done statuses; anything else is Development', () => {
            expect(mapJiraStatusToWorkItemStatus('Draft')).toBe('Backlog');
            expect(mapJiraStatusToWorkItemStatus('open')).toBe('Planning');
            expect(mapJiraStatusToWorkItemStatus('Done')).toBe('Done');
            expect(mapJiraStatusToWorkItemStatus('CLOSED')).toBe('Done');
            expect(mapJiraStatusToWorkItemStatus(' Cancelled ')).toBe('Done');
            expect(mapJiraStatusToWorkItemStatus('In Progress')).toBe('Development');
            expect(mapJiraStatusToWorkItemStatus('Reopened')).toBe('Development');
        });
    });

    describe('deriveWorkItemStatusFromJira', () => {
        const mk = (id: string, jira_status: string | null | undefined, work_item_id = 'w1'): Issue =>
            ({ id, jira_key: id, work_item_id, team_id: '', effort_md: 0, jira_status });

        it('is undefined when no linked issue has a Jira status', () => {
            expect(deriveWorkItemStatusFromJira('w1', [])).toBeUndefined();
            expect(deriveWorkItemStatusFromJira('w1', [mk('a', null), mk('b', undefined), mk('c', 'Done', 'w2')])).toBeUndefined();
        });

        it('is Done only when every issue is done', () => {
            expect(deriveWorkItemStatusFromJira('w1', [mk('a', 'Done'), mk('b', 'Closed'), mk('c', 'Cancelled')])).toBe('Done');
            expect(deriveWorkItemStatusFromJira('w1', [mk('a', 'Done'), mk('b', 'Draft')])).toBe('Backlog');
        });

        it('otherwise the most advanced status wins', () => {
            expect(deriveWorkItemStatusFromJira('w1', [mk('a', 'Draft'), mk('b', 'In Progress'), mk('c', 'Done')])).toBe('Development');
            expect(deriveWorkItemStatusFromJira('w1', [mk('a', 'Draft'), mk('b', 'Open')])).toBe('Planning');
            expect(deriveWorkItemStatusFromJira('w1', [mk('a', 'Draft')])).toBe('Backlog');
        });

        it('ignores issues without a Jira status', () => {
            expect(deriveWorkItemStatusFromJira('w1', [mk('a', 'Done'), mk('b', null)])).toBe('Done');
        });
    });

    describe('hasUnestimatedWorkItemEffort', () => {
        const baseWorkItem: WorkItem = {
            id: 'f1',
            name: 'Test Feature',
            total_effort_mds: 0,
            score: 0,
            status: 'Backlog',
            customer_targets: []
        };

        it('flags a workitem with no effort and no linked issues', () => {
            expect(hasUnestimatedWorkItemEffort(baseWorkItem, [])).toBe(true);
        });

        it('does not flag a workitem whose stored effort is positive and has no issues', () => {
            const wi = { ...baseWorkItem, total_effort_mds: 5, calculated_effort: 5 };
            expect(hasUnestimatedWorkItemEffort(wi, [])).toBe(false);
        });

        it('does not flag a workitem whose linked issues all have positive effort', () => {
            const issues: Issue[] = [
                { id: 'e1', jira_key: 'J1', work_item_id: 'f1', team_id: 't1', effort_md: 5 },
                { id: 'e2', jira_key: 'J2', work_item_id: 'f1', team_id: 't2', effort_md: 3 }
            ];
            // calculated_effort is the backend's stored value (DEC-016).
            expect(hasUnestimatedWorkItemEffort({ ...baseWorkItem, calculated_effort: 8 }, issues)).toBe(false);
        });

        it('flags a workitem when any linked issue has zero effort', () => {
            const issues: Issue[] = [
                { id: 'e1', jira_key: 'J1', work_item_id: 'f1', team_id: 't1', effort_md: 5 },
                { id: 'e2', jira_key: 'J2', work_item_id: 'f1', team_id: 't2', effort_md: 0 }
            ];
            expect(hasUnestimatedWorkItemEffort({ ...baseWorkItem, calculated_effort: 5 }, issues)).toBe(true);
        });

        it('ignores issues belonging to other work items', () => {
            const issues: Issue[] = [
                { id: 'e1', jira_key: 'J1', work_item_id: 'f2', team_id: 't1', effort_md: 0 }
            ];
            // The workitem has 0 own effort and no own issues — still unestimated.
            expect(hasUnestimatedWorkItemEffort(baseWorkItem, issues)).toBe(true);
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

    describe('customerMoneyBagTcv', () => {
        it('uses existing TCV when present', () => {
            expect(customerMoneyBagTcv({ existing_tcv: 100, potential_tcv: 50 })).toBe(100);
        });

        it('falls back to potential TCV when existing is 0', () => {
            expect(customerMoneyBagTcv({ existing_tcv: 0, potential_tcv: 50 })).toBe(50);
        });

        it('falls back to potential TCV when existing is missing', () => {
            expect(customerMoneyBagTcv({ potential_tcv: 75 } as Customer)).toBe(75);
        });

        it('returns 0 when neither is set', () => {
            expect(customerMoneyBagTcv({} as Customer)).toBe(0);
        });

        it('prefers existing even when potential is larger', () => {
            expect(customerMoneyBagTcv({ existing_tcv: 10, potential_tcv: 1000 })).toBe(10);
        });
    });

    describe('moneyBagFillRatio', () => {
        it('is the sqrt of the tcv/max ratio', () => {
            expect(moneyBagFillRatio(100, 100)).toBe(1);
            expect(moneyBagFillRatio(25, 100)).toBe(0.5);
            expect(moneyBagFillRatio(50, 100)).toBeCloseTo(0.7071, 4);
        });

        it('returns 0 when max is non-positive', () => {
            expect(moneyBagFillRatio(50, 0)).toBe(0);
            expect(moneyBagFillRatio(50, -10)).toBe(0);
        });

        it('returns 0 when the customer tcv is non-positive', () => {
            expect(moneyBagFillRatio(0, 100)).toBe(0);
            expect(moneyBagFillRatio(-5, 100)).toBe(0);
        });
    });
});

describe('Jira Parent Link hierarchy alignment', () => {
    const PL = 'customfield_99'; // Parent Link field id
    const names = { [PL]: 'Parent Link' };
    // A raw Jira issue as /search returns it, with its `names` map attached.
    type FetchedIssue = { key: string; names: Record<string, string>; fields: Record<string, unknown> };

    const issue = (id: string, jira_key: string, work_item_id?: string): Issue =>
        ({ id, jira_key, work_item_id, team_id: 't1', effort_md: 0 });
    const wi = (id: string, parent_id?: string): WorkItem =>
        ({ id, name: id, status: 'Backlog', total_effort_mds: 0, score: 0, customer_targets: [], parent_id });
    // Build a fetched-issue map; parent = the Parent Link key for that issue.
    const fetched = (entries: { key: string; parent?: string }[]) => {
        const m = new Map<string, FetchedIssue>();
        for (const e of entries) {
            m.set(e.key, { key: e.key, names, fields: e.parent ? { [PL]: e.parent } : {} });
        }
        return m;
    };

    describe('resolveFieldId', () => {
        it('finds the field id by label', () => {
            expect(resolveFieldId(names, 'Parent Link')).toBe(PL);
        });
        it('returns undefined when absent', () => {
            expect(resolveFieldId({ x: 'Team' }, 'Parent Link')).toBeUndefined();
            expect(resolveFieldId(undefined, 'Parent Link')).toBeUndefined();
        });
    });

    describe('extractParentLinkKey', () => {
        it('accepts a plain key string', () => {
            expect(extractParentLinkKey('ABC-1')).toBe('ABC-1');
            expect(extractParentLinkKey('  ABC-1  ')).toBe('ABC-1');
        });
        it('accepts object shapes', () => {
            expect(extractParentLinkKey({ key: 'ABC-2' })).toBe('ABC-2');
            expect(extractParentLinkKey({ data: { key: 'ABC-3' } })).toBe('ABC-3');
        });
        it('returns undefined for empty/invalid', () => {
            expect(extractParentLinkKey(undefined)).toBeUndefined();
            expect(extractParentLinkKey('')).toBeUndefined();
            expect(extractParentLinkKey({})).toBeUndefined();
        });
    });

    describe('parseAhaFeature / parseAhaEpic', () => {
        it('reads a feature\'s Aha! epic, null without one, undefined when the payload lacks it', () => {
            expect(parseAhaFeature({ id: 1, reference_num: 'DR-1', epic: { id: 900 } }).data?.epic_id).toBe('900');
            expect(parseAhaFeature({ id: 1, reference_num: 'DR-1', epic: null }).data?.epic_id).toBeNull();
            expect(parseAhaFeature({ id: 1, reference_num: 'DR-1' }).data?.epic_id).toBeUndefined();
            expect(parseAhaFeature({ id: 1, reference_num: 'DR-1' }).record_type).toBe('feature');
        });

        it('marks an epic and drops feature-only fields', () => {
            const link = parseAhaEpic({ id: 900, reference_num: 'DR-E-1', name: 'Set', score: 4, description: { body: '<p>x</p>' } });
            expect(link).toMatchObject({ external_id: '900', key: 'DR-E-1', record_type: 'epic', data: { name: 'Set', score: 4, description: '<p>x</p>' } });
            expect(link.data).not.toHaveProperty('epic_id');
            expect(link.data).not.toHaveProperty('requirements');
        });
    });

    describe('planHierarchyAlignment', () => {
        it('Cloud: uses the system parent field even without a Parent Link field', () => {
            const plan = planHierarchyAlignment({
                fetchedByKey: new Map([
                    ['C-1', { key: 'C-1', names: {}, fields: { parent: { id: '10', key: 'P-1', fields: {} } } }],
                ]),
                issues: [issue('i1', 'C-1', 'wiC'), issue('i2', 'P-1', 'wiP')],
                workItems: [wi('wiC'), wi('wiP')],
                deployment: 'cloud',
            });
            expect(plan.parentFieldMissing).toBe(false);
            expect(plan.updates).toEqual([{ workItemId: 'wiC', parentId: 'wiP' }]);
        });

        it('Data Center: follows Epic Link and a sub-task parent, like the issue parent', () => {
            const dcNames = { cf_pl: 'Parent Link', cf_el: 'Epic Link' };
            const plan = planHierarchyAlignment({
                fetchedByKey: new Map([
                    ['S-1', { key: 'S-1', names: dcNames, fields: { cf_el: 'E-1' } }],
                    ['T-1', { key: 'T-1', names: dcNames, fields: { parent: { key: 'S-2' } } }],
                ]),
                issues: [issue('i1', 'S-1', 'wiS'), issue('i2', 'E-1', 'wiE'), issue('i3', 'T-1', 'wiT'), issue('i4', 'S-2', 'wiS2')],
                workItems: [wi('wiS'), wi('wiE'), wi('wiT'), wi('wiS2')],
            });
            expect(plan.parentFieldMissing).toBe(false);
            expect(plan.updates).toEqual([
                { workItemId: 'wiS', parentId: 'wiE' },
                { workItemId: 'wiT', parentId: 'wiS2' },
            ]);
        });

        it('Data Center: an Epic Link field alone is enough', () => {
            const plan = planHierarchyAlignment({
                fetchedByKey: new Map([['S-1', { key: 'S-1', names: { cf_el: 'Epic Link' }, fields: {} }]]),
                issues: [issue('i1', 'S-1', 'wiS')],
                workItems: [wi('wiS')],
            });
            expect(plan.parentFieldMissing).toBe(false);
        });

        it('Data Center: no hierarchy field means nothing aligns, even with a sub-task parent', () => {
            const plan = planHierarchyAlignment({
                fetchedByKey: new Map([
                    ['C-1', { key: 'C-1', names: {}, fields: { parent: { key: 'P-1' } } }],
                ]),
                issues: [issue('i1', 'C-1', 'wiC'), issue('i2', 'P-1', 'wiP')],
                workItems: [wi('wiC'), wi('wiP')],
            });
            expect(plan.parentFieldMissing).toBe(true);
        });

        it('flags parentFieldMissing when no Parent Link or Epic Link field is present', () => {
            const plan = planHierarchyAlignment({
                fetchedByKey: new Map([['C-1', { key: 'C-1', names: { x: 'Team' }, fields: {} }]]),
                issues: [issue('i1', 'C-1', 'wiC')],
                workItems: [wi('wiC')],
            });
            expect(plan.parentFieldMissing).toBe(true);
            expect(plan.updates).toEqual([]);
        });

        it('sets parent_id when child WI differs from current', () => {
            const plan = planHierarchyAlignment({
                fetchedByKey: fetched([{ key: 'C-1', parent: 'P-1' }]),
                issues: [issue('i1', 'C-1', 'wiC'), issue('i2', 'P-1', 'wiP')],
                workItems: [wi('wiC'), wi('wiP')],
            });
            expect(plan.updates).toEqual([{ workItemId: 'wiC', parentId: 'wiP' }]);
        });

        it('skips a work item whose parent Aha! owns (Jira never overrides the Aha! epic)', () => {
            const ahaFeature = {
                ...wi('wiC'), origin: 'aha' as const,
                links: { aha: { external_id: '42', key: 'DR-42', data: { epic_id: '900' } } },
            };
            const plan = planHierarchyAlignment({
                fetchedByKey: fetched([{ key: 'C-1', parent: 'P-1' }]),
                issues: [issue('i1', 'C-1', 'wiC'), issue('i2', 'P-1', 'wiP')],
                workItems: [ahaFeature, wi('wiP')],
            });
            expect(plan.updates).toEqual([]);
            expect(plan.ahaOwned).toEqual(['wiC']);
        });

        it('is a no-op when parent_id already correct', () => {
            const plan = planHierarchyAlignment({
                fetchedByKey: fetched([{ key: 'C-1', parent: 'P-1' }]),
                issues: [issue('i1', 'C-1', 'wiC'), issue('i2', 'P-1', 'wiP')],
                workItems: [wi('wiC', 'wiP'), wi('wiP')],
            });
            expect(plan.updates).toEqual([]);
        });

        it('skips when the child jira is Unassigned', () => {
            const plan = planHierarchyAlignment({
                fetchedByKey: fetched([{ key: 'C-1', parent: 'P-1' }]),
                issues: [issue('i1', 'C-1', undefined), issue('i2', 'P-1', 'wiP')],
                workItems: [wi('wiP')],
            });
            expect(plan.updates).toEqual([]);
        });

        it('skips when the parent jira is Unassigned', () => {
            const plan = planHierarchyAlignment({
                fetchedByKey: fetched([{ key: 'C-1', parent: 'P-1' }]),
                issues: [issue('i1', 'C-1', 'wiC'), issue('i2', 'P-1', undefined)],
                workItems: [wi('wiC')],
            });
            expect(plan.updates).toEqual([]);
        });

        it('skips when the parent jira is not in the system', () => {
            const plan = planHierarchyAlignment({
                fetchedByKey: fetched([{ key: 'C-1', parent: 'GHOST-1' }]),
                issues: [issue('i1', 'C-1', 'wiC')],
                workItems: [wi('wiC')],
            });
            expect(plan.updates).toEqual([]);
        });

        it('skips when both jiras share a work item', () => {
            const plan = planHierarchyAlignment({
                fetchedByKey: fetched([{ key: 'C-1', parent: 'P-1' }]),
                issues: [issue('i1', 'C-1', 'wiX'), issue('i2', 'P-1', 'wiX')],
                workItems: [wi('wiX')],
            });
            expect(plan.updates).toEqual([]);
        });

        it('records a conflict when child jiras in one WI point to different parent WIs', () => {
            const plan = planHierarchyAlignment({
                fetchedByKey: fetched([
                    { key: 'C-1', parent: 'P-1' },
                    { key: 'C-2', parent: 'P-2' },
                ]),
                issues: [
                    issue('i1', 'C-1', 'wiC'), issue('i2', 'C-2', 'wiC'),
                    issue('i3', 'P-1', 'wiP1'), issue('i4', 'P-2', 'wiP2'),
                ],
                workItems: [wi('wiC'), wi('wiP1'), wi('wiP2')],
            });
            expect(plan.updates).toEqual([]);
            expect(plan.conflicts).toHaveLength(1);
            expect(plan.conflicts[0].workItemId).toBe('wiC');
            expect([...plan.conflicts[0].parentIds].sort()).toEqual(['wiP1', 'wiP2']);
        });

        it('records a cycle and skips the edge', () => {
            // wiP already child of wiC; making wiC child of wiP would loop.
            const plan = planHierarchyAlignment({
                fetchedByKey: fetched([{ key: 'C-1', parent: 'P-1' }]),
                issues: [issue('i1', 'C-1', 'wiC'), issue('i2', 'P-1', 'wiP')],
                workItems: [wi('wiC'), wi('wiP', 'wiC')],
            });
            expect(plan.updates).toEqual([]);
            expect(plan.cycles).toEqual(['wiC']);
        });

        it('handles object-shaped Parent Link values', () => {
            const m = new Map<string, FetchedIssue>([
                ['C-1', { key: 'C-1', names, fields: { [PL]: { key: 'P-1' } } }],
            ]);
            const plan = planHierarchyAlignment({
                fetchedByKey: m,
                issues: [issue('i1', 'C-1', 'wiC'), issue('i2', 'P-1', 'wiP')],
                workItems: [wi('wiC'), wi('wiP')],
            });
            expect(plan.updates).toEqual([{ workItemId: 'wiC', parentId: 'wiP' }]);
        });
    });

    describe('findJiraParent / findJiraChildren', () => {
        const mk = (id: string, jira_key: string, parent_jira_key?: string | null): Issue =>
            ({ id, jira_key, parent_jira_key, team_id: '', effort_md: 0 });
        const epic = mk('e', 'EPIC-1');
        const story = mk('s', 'ST-1', 'epic-1 ');
        const other = mk('o', 'ST-2', 'GONE-1');
        const issues = [epic, story, other];

        it('matches Jira keys case- and whitespace-insensitively', () => {
            expect(findJiraParent(story, issues)).toBe(epic);
            expect(findJiraChildren(epic, issues)).toEqual([story]);
        });

        it('returns no parent when it is not imported or unset', () => {
            expect(findJiraParent(other, issues)).toBeUndefined();
            expect(findJiraParent(epic, issues)).toBeUndefined();
            expect(findJiraChildren(story, issues)).toEqual([]);
        });
    });
});
