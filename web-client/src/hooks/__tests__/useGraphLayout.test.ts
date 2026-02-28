import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
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
            total_effort_mds: 10, score: 0,
            customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Nice-to-have' }]
        },
        {
            id: 'f2',
            name: 'High RICE Feat',
            total_effort_mds: 5, score: 0,
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

    it('calculates proper RICE visualization scaling', () => {
        const { result } = renderHook(() => useGraphLayout(MOCK_DATA));

        const f1Node = result.current.nodes.find(n => n.id === 'workitem-f1');
        const f2Node = result.current.nodes.find(n => n.id === 'workitem-f2');

        expect(f1Node).toBeDefined();
        expect(f2Node).toBeDefined();

        const f1Score = (f1Node?.data as any).score || 0;
        const f2Score = (f2Node?.data as any).score || 0;

        expect(f2Score).toBeGreaterThan(f1Score);
    });
});
