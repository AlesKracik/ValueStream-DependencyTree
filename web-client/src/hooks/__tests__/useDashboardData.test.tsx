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
    ],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('useDashboardData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const fetchMock = vi.fn().mockImplementation((url) => {
            if (url.startsWith('/api/loadData')) {
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
        const { result } = renderHook(() => useDashboardData(undefined, {}, 0));
        
        expect(result.current.loading).toBe(true);
        
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data?.customers).toHaveLength(1);
    });

    it('passes dashboardId and filters to the API', async () => {
        const filters = { customerFilter: 'test', minTcvFilter: '100' };
        renderHook(() => useDashboardData('dash123', filters, 0));
        
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/loadData?dashboardId=dash123&customerFilter=test&minTcvFilter=100'),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': expect.stringContaining('Bearer')
                    })
                })
            );
        });
    });

    it('passes all possible filter parameters to the API', async () => {
        const filters = { 
            customerFilter: 'cust', 
            workItemFilter: 'work', 
            teamFilter: 'team', 
            epicFilter: 'epic',
            releasedFilter: 'released' as const,
            minTcvFilter: '500',
            minScoreFilter: '10'
        };
        renderHook(() => useDashboardData('dash789', filters, 0));
        
        await waitFor(() => {
            const expectedUrl = '/api/loadData?dashboardId=dash789&customerFilter=cust&workItemFilter=work&teamFilter=team&epicFilter=epic&releasedFilter=released&minTcvFilter=500&minScoreFilter=10';
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining(expectedUrl),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': expect.stringContaining('Bearer')
                    })
                })
            );
        });
    });

    it('adds a customer', async () => {
        const { result } = renderHook(() => useDashboardData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        const newCust = { id: 'c2', name: 'Cust 2', existing_tcv: 0, potential_tcv: 50 };
        
        act(() => {
            result.current.addCustomer(newCust);
        });

        expect(result.current.data?.customers).toHaveLength(2);
        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/customers',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': expect.stringContaining('Bearer')
                })
            })
        );
    });

    it('deletes a sprint', async () => {
        const { result } = renderHook(() => useDashboardData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.deleteSprint('s1');
        });

        expect(result.current.data?.sprints).toHaveLength(0);
        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/sprints/s1',
            expect.objectContaining({
                method: 'DELETE',
                headers: expect.objectContaining({
                    'Authorization': expect.stringContaining('Bearer')
                })
            })
        );
    });

    it('cascades deleteCustomer to workItem targets', async () => {
        const { result } = renderHook(() => useDashboardData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.deleteCustomer('c1');
        });

        expect(result.current.data?.customers).toHaveLength(0);
        // f1 had c1 as target, it should be removed
        const f1 = result.current.data?.workItems.find(w => w.id === 'f1');
        expect(f1?.customer_targets).toHaveLength(0);
        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/workItems',
            expect.objectContaining({ 
                method: 'POST',
                body: expect.stringContaining('"customer_targets":[]'),
                headers: expect.objectContaining({
                    'Authorization': expect.stringContaining('Bearer')
                })
            })
        );
    });

    it('cascades deleteWorkItem to epics', async () => {
        const dataWithEpic: DashboardData = {
            ...mockData,
            epics: [{ id: 'e1', jira_key: 'E1', work_item_id: 'f1', team_id: 't1', effort_md: 5, name: 'Epic 1' }]
        };
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
            if (url.startsWith('/api/loadData')) return Promise.resolve({ ok: true, json: () => Promise.resolve(dataWithEpic) });
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }));

        const { result } = renderHook(() => useDashboardData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.deleteWorkItem('f1');
        });

        expect(result.current.data?.workItems).toHaveLength(0);
        const e1 = result.current.data?.epics.find(e => e.id === 'e1');
        expect(e1?.work_item_id).toBeUndefined();
        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/epics',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': expect.stringContaining('Bearer')
                })
            })
        );
    });

    it('recomputes sprint quarters when fiscal year setting changes', async () => {
        const { result } = renderHook(() => useDashboardData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        // Initial: FY starts in January (default). 2026-01-01 is FY2026 Q1
        act(() => {
            result.current.updateSettings({ fiscal_year_start_month: 1 });
        });
        expect(result.current.data?.sprints[0].quarter).toBe('FY2026 Q1');

        // Update: FY starts in April (4). 2026-01-01 is now FY2026 Q4
        act(() => {
            result.current.updateSettings({ fiscal_year_start_month: 4 });
        });
        expect(result.current.data?.sprints[0].quarter).toBe('FY2026 Q4');
        
        // Should have persisted the updated sprint
        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/sprints',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"quarter":"FY2026 Q4"'),
                headers: expect.objectContaining({
                    'Authorization': expect.stringContaining('Bearer')
                })
            })
        );
    });

    it('assigns sprint to the quarter in which it ends', async () => {
        const dataWithCrossQuarterSprint: DashboardData = {
            ...mockData,
            settings: { ...mockData.settings, fiscal_year_start_month: 7 }, // July 1st FY start
            sprints: [
                { 
                    id: 's_cross', 
                    name: 'Cross-Quarter Sprint', 
                    start_date: '2026-09-20', 
                    end_date: '2026-10-04',
                    quarter: 'FY2027 Q1'
                }
            ]
        };
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
            if (url.startsWith('/api/loadData')) return Promise.resolve({ ok: true, json: () => Promise.resolve(dataWithCrossQuarterSprint) });
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }));

        const { result } = renderHook(() => useDashboardData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        // FY starts July 1.
        // Q1: July, Aug, Sept
        // Q2: Oct, Nov, Dec
        // Sprint ends Oct 4, should be Q2.
        
        act(() => {
            // Trigger a re-save and ensure end_date is present for recomputation
            const existing = result.current.data?.sprints.find(s => s.id === 's_cross');
            result.current.updateSprint('s_cross', { name: 'Updated Name', end_date: existing?.end_date });
        });

        const sprint = result.current.data?.sprints.find(s => s.id === 's_cross');
        expect(sprint?.quarter).toBe('FY2027 Q2');
    });

    it('refreshes data when MongoDB connection settings change', async () => {
        const { result } = renderHook(() => useDashboardData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        // Reset mock to track new calls
        vi.mocked(fetch).mockClear();

        await act(async () => {
            result.current.updateSettings({ mongo_uri: 'mongodb://new-host:27017' });
        });

        // Should call persist settings then refresh data (loadData)
        expect(fetch).toHaveBeenCalledWith('/api/settings', expect.objectContaining({ method: 'POST' }));
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/loadData'), expect.anything());
        });
    });

    it('refreshes data when mongo_create_if_not_exists setting changes', async () => {
        const { result } = renderHook(() => useDashboardData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        // Reset mock to track new calls
        vi.mocked(fetch).mockClear();

        await act(async () => {
            result.current.updateSettings({ mongo_create_if_not_exists: true });
        });

        // Should call persist settings then refresh data (loadData)
        expect(fetch).toHaveBeenCalledWith('/api/settings', expect.objectContaining({ method: 'POST' }));
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/loadData'), expect.anything());
        });
    });
});
