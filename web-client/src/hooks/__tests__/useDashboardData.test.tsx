import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDashboardData } from '../useDashboardData';
import type { DashboardData } from '../../types/models';

const mockData: DashboardData = {
    settings: { jira_base_url: "https://jira", jira_api_version: "3" },
    customers: [
        { id: 'c1', name: 'Cust 1', existing_tcv: 100, potential_tcv: 200 }
    ],
    workItems: [
        { id: 'f1', name: 'Feat 1', total_effort_mds: 10, customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }] }
    ],
    teams: [
        { id: 't1', name: 'Team 1', total_capacity_mds: 100 }
    ],
    epics: [
        { id: 'e1', jira_key: 'J-1', work_item_id: 'f1', team_id: 't1', remaining_md: 5, target_start: '2026-02-12', target_end: '2026-02-26' }
    ],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' }
    ]
};

// Mock the global fetch
globalThis.fetch = vi.fn() as any;

describe('useDashboardData API logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (globalThis.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockData,
        });
    });

    it('loads initial data from fetch', async () => {
        const { result } = renderHook(() => useDashboardData());

        // Starts in loading state
        expect(result.current.loading).toBe(true);

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Asserts data was serialized into state
        expect(result.current.data?.customers).toHaveLength(1);
        expect(result.current.data?.workItems).toHaveLength(1);
    });

    it('adds and parses a new customer correctly', async () => {
        const { result } = renderHook(() => useDashboardData());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.addCustomer({
                id: 'c2',
                name: 'Cust 2',
                existing_tcv: 50,
                potential_tcv: 50
            });
        });

        expect(result.current.data?.customers).toHaveLength(2);
        expect(result.current.data?.customers[1].name).toBe('Cust 2');
    });

    it('deletes a customer and scrubs work item references', async () => {
        const { result } = renderHook(() => useDashboardData());
        await waitFor(() => expect(result.current.loading).toBe(false));

        // Delete 'c1' which is referenced by 'f1'
        act(() => {
            result.current.deleteCustomer('c1');
        });

        expect(result.current.data?.customers).toHaveLength(0);
        // The customer should be cleanly removed from the work items targets list
        expect(result.current.data?.workItems[0].customer_targets).toHaveLength(0);
    });

    it('adds a sprint and keeps them sorted by start_date', async () => {
        const { result } = renderHook(() => useDashboardData());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.addSprint({
                id: 's_new',
                name: 'Earlier Sprint',
                start_date: '2025-12-01',
                end_date: '2025-12-14'
            });
        });

        const sprints = result.current.data?.sprints;
        expect(sprints).toHaveLength(2);
        expect(sprints![0].id).toBe('s_new');
    });

    it('updates a sprint correctly', async () => {
        const { result } = renderHook(() => useDashboardData());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.updateSprint('s1', { name: 'Updated Sprint Name' });
        });

        expect(result.current.data?.sprints[0].name).toBe('Updated Sprint Name');
    });

    it('deletes a sprint correctly', async () => {
        const { result } = renderHook(() => useDashboardData());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.deleteSprint('s1');
        });

        expect(result.current.data?.sprints).toHaveLength(0);
    });
});
