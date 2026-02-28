import { describe, it, expect } from 'vitest';
import { calculateWorkItemScores } from '../scoreCalculator';
import type { DashboardData, WorkItem, Epic, Customer, Team, Sprint, Settings } from '../../types/models';

const mockSettings: Settings = {
    jira_base_url: 'https://jira.example.com',
    jira_api_token: 'token',
    jira_api_version: '3'
};

const mockData: DashboardData = {
    dashboards: [],
    settings: mockSettings,
    customers: [
        { id: 'c1', name: 'Customer A', existing_tcv: 100, potential_tcv: 50 },
        { id: 'c2', name: 'Customer B', existing_tcv: 200, potential_tcv: 150 }
    ],
    workItems: [],
    epics: [],
    teams: [],
    sprints: []
};

describe('scoreCalculator', () => {
    it('calculates score based on individual customer targets with Must-have priority', () => {
        const workItems: WorkItem[] = [
            {
                id: 'f1',
                name: 'Feature 1',
                total_effort_mds: 10,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }
                ]
            }
        ];

        const data: DashboardData = { ...mockData, workItems };
        const result = calculateWorkItemScores(data);

        // Impact = 100 (c1 existing_tcv)
        // Effort = 10
        // Score = 100 / 10 = 10
        expect(result[0].score).toBe(10);
    });

    it('calculates score based on individual customer targets with Should-have priority', () => {
        const workItems: WorkItem[] = [
            {
                id: 'f1',
                name: 'Feature 1',
                total_effort_mds: 10,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Should-have' }
                ]
            },
            {
                id: 'f2',
                name: 'Feature 2',
                total_effort_mds: 10,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Should-have' }
                ]
            }
        ];

        const data: DashboardData = { ...mockData, workItems };
        const result = calculateWorkItemScores(data);

        // For f1: 
        // c1 has 2 "Should-have" work items for 'existing' TCV (f1 and f2)
        // Impact = 100 (c1 existing_tcv) / 2 = 50
        // Effort = 10
        // Score = 50 / 10 = 5
        expect(result[0].score).toBe(5);
        expect(result[1].score).toBe(5);
    });

    it('calculates score based on global customer targets', () => {
        const workItems: WorkItem[] = [
            {
                id: 'f1',
                name: 'Feature 1',
                total_effort_mds: 10,
                score: 0,
                customer_targets: [],
                all_customers_target: { tcv_type: 'existing', priority: 'Must-have' }
            }
        ];

        const data: DashboardData = { ...mockData, workItems };
        const result = calculateWorkItemScores(data);

        // Impact = 100 (c1) + 200 (c2) = 300
        // Effort = 10
        // Score = 300 / 10 = 30
        expect(result[0].score).toBe(30);
    });

    it('uses epic remaining MDs if they are greater than work item effort', () => {
        const workItems: WorkItem[] = [
            {
                id: 'f1',
                name: 'Feature 1',
                total_effort_mds: 10,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }
                ]
            }
        ];

        const epics: Epic[] = [
            { id: 'e1', jira_key: 'E1', work_item_id: 'f1', team_id: 't1', effort_md: 20, name: 'Epic 1' }
        ];

        const data: DashboardData = { ...mockData, workItems, epics };
        const result = calculateWorkItemScores(data);

        // Impact = 100
        // Effort = max(10, 20) = 20
        // Score = 100 / 20 = 5
        expect(result[0].score).toBe(5);
    });

    it('prevents division by zero for effort', () => {
        const workItems: WorkItem[] = [
            {
                id: 'f1',
                name: 'Feature 1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }
                ]
            }
        ];

        const data: DashboardData = { ...mockData, workItems };
        const result = calculateWorkItemScores(data);

        // Impact = 100
        // Effort = max(0, 0) || 1 = 1
        // Score = 100 / 1 = 100
        expect(result[0].score).toBe(100);
    });
});
