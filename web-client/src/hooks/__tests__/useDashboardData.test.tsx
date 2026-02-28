import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDashboardData } from '../useDashboardData';
import type { DashboardData } from '../../types/models';

const mockData: DashboardData = {
    dashboards: [], settings: { jira_base_url: 'https://jira.com', jira_api_version: '3' },
    customers: [
        { id: 'c1', name: 'Cust 1', existing_tcv: 100, potential_tcv: 0 }
    ],
    workItems: [
        { id: 'f1', name: 'Feat 1', total_effort_mds: 10, score: 0, customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }] }
    ],
    teams: [],
    epics: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' }
    ]
};

describe('useDashboardData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const fetchMock = vi.fn().mockImplementation((url) => {
            if (url === '/api/loadData') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockData)
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });
        vi.stubGlobal('fetch', fetchMock);
    });

    it('loads initial data', async () => {
        const { result } = renderHook(() => useDashboardData());
        
        expect(result.current.loading).toBe(true);
        
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data?.customers).toHaveLength(1);
    });

    it('adds a customer', async () => {
        const { result } = renderHook(() => useDashboardData());
        await waitFor(() => expect(result.current.loading).toBe(false));

        const newCust = { id: 'c2', name: 'Cust 2', existing_tcv: 0, potential_tcv: 50 };
        
        act(() => {
            result.current.addCustomer(newCust);
        });

        expect(result.current.data?.customers).toHaveLength(2);
        expect(fetch).toHaveBeenCalledWith('/api/entity/customers', expect.objectContaining({ method: 'POST' }));
    });

    it('deletes a sprint', async () => {
        const { result } = renderHook(() => useDashboardData());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.deleteSprint('s1');
        });

        expect(result.current.data?.sprints).toHaveLength(0);
    });
});
