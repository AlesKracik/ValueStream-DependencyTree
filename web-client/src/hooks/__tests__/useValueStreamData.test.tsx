import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useValueStreamData } from '../useValueStreamData';
import type { ValueStreamData, Settings } from '@valuestream/shared-types';

const mockSettings: Settings = {
    general: {
        fiscal_year_start_month: 1,
        sprint_duration_days: 14
    },
    persistence: {
        app_provider: 'mongo',
        customer_provider: 'mongo',
        mongo: {
            app: {
                uri: 'mongodb://localhost:27017',
                db: 'testdb',
                use_proxy: false,
                auth: { method: 'scram' }
            },
            customer: {
                uri: '',
                db: '',
                use_proxy: false,
                auth: { method: 'scram' }
            }
        }
    },
    jira: {
        base_url: 'https://jira.com',
        api_version: '3',
        api_token: 'token'
    },
    aha: { subdomain: '', api_key: '' },
    ai: {
        provider: 'openai',
        api_key: ''
    },
    ldap: { url: '', bind_dn: '', team: { base_dn: '', search_filter: '' } },
        auth: { method: 'local' as const, session_expiry_hours: 24, default_role: 'viewer' as const }
};

const mockData: ValueStreamData = {
    valueStreams: [], 
    settings: mockSettings,
    customers: [
        { id: 'c1', name: 'Cust 1', existing_tcv: 100, potential_tcv: 0 }
    ],
    workItems: [
        { id: 'f1', name: 'Feat 1', total_effort_mds: 10, score: 0, status: 'Backlog', customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }] }
    ],
    teams: [],
    issues: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'FY2026 Q1' }
    ],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('useValueStreamData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const fetchMock = vi.fn().mockImplementation((url) => {
            if (url.startsWith('/api/workspace')) {
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
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 0));
        
        expect(result.current.loading).toBe(true);
        
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data?.customers).toHaveLength(1);
    });

    it('passes only valueStreamId to the API (static filters are resolved server-side)', async () => {
        const filters = { customerFilter: 'test', minTcvFilter: '100' };
        renderHook(() => useValueStreamData('dash123', filters, 0));

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/workspace?valueStreamId=dash123'),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': expect.stringContaining('Bearer')
                    })
                })
            );
            // Dynamic filters should NOT be in the URL — they are applied client-side
            const calls = vi.mocked(fetch).mock.calls;
            const workspaceCall = calls.find(c => (c[0] as string).includes('/api/workspace'));
            expect(workspaceCall![0]).not.toContain('customerFilter');
            expect(workspaceCall![0]).not.toContain('minTcvFilter');
        });
    });

    it('adds a customer', async () => {
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 0));
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
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 0));
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

    it('archives a sprint and filters it out from the data', async () => {
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.updateSprint('s1', { is_archived: true });
        });

        expect(result.current.data?.sprints).toHaveLength(0);
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                '/api/entity/sprints',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('"is_archived":true'),
                    headers: expect.objectContaining({
                        'Authorization': expect.stringContaining('Bearer')
                    })
                })
            );
        });
    });

    it('omits Content-Type and body on DELETE requests', async () => {
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        vi.mocked(global.fetch).mockClear();

        act(() => {
            result.current.deleteCustomer('c1');
        });

        // The exact call for deleting the customer
        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/customers/c1',
            expect.objectContaining({
                method: 'DELETE',
                body: undefined,
            })
        );

        // Verify headers don't have Content-Type
        const deleteCall = vi.mocked(global.fetch).mock.calls.find(call => 
            call[0] === '/api/entity/customers/c1' && (call[1] as RequestInit)?.method === 'DELETE'
        );
        expect(deleteCall).toBeDefined();
        
        const callHeaders = deleteCall![1]?.headers as Record<string, string>;
        expect(callHeaders).not.toHaveProperty('Content-Type');
    });

    it('cascades deleteCustomer to workItem targets in local state (backend handles DB cascade)', async () => {
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.deleteCustomer('c1');
        });

        expect(result.current.data?.customers).toHaveLength(0);
        // f1 had c1 as target — local state should reflect the removal
        const f1 = result.current.data?.workItems.find(w => w.id === 'f1');
        expect(f1?.customer_targets).toHaveLength(0);
        // Only the DELETE call should be made — backend handles cascade persistence
        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/customers/c1',
            expect.objectContaining({ method: 'DELETE' })
        );
        // Should NOT persist cascaded workItem updates from frontend
        expect(fetch).not.toHaveBeenCalledWith(
            '/api/entity/workItems',
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('cascades deleteWorkItem to issues in local state (backend handles DB cascade)', async () => {
        const dataWithIssue: ValueStreamData = {
            ...mockData,
            issues: [{ id: 'e1', jira_key: 'E1', work_item_id: 'f1', team_id: 't1', effort_md: 5, name: 'Issue 1' }]
        };
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
            if (url.startsWith('/api/workspace')) return Promise.resolve({ ok: true, json: () => Promise.resolve(dataWithIssue) });
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }));

        const { result } = renderHook(() => useValueStreamData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.deleteWorkItem('f1');
        });

        expect(result.current.data?.workItems).toHaveLength(0);
        const e1 = result.current.data?.issues.find(e => e.id === 'e1');
        expect(e1?.work_item_id).toBeUndefined();
        // Only the DELETE call should be made — backend handles cascade persistence
        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/workItems/f1',
            expect.objectContaining({ method: 'DELETE' })
        );
        // Should NOT persist cascaded issue updates from frontend
        expect(fetch).not.toHaveBeenCalledWith(
            '/api/entity/issues',
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('recomputes sprint quarters when fiscal year setting changes', async () => {
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        // Initial: FY starts in January (default). 2026-01-01 is FY2026 Q1
        act(() => {
            result.current.updateSettings({ general: { fiscal_year_start_month: 1, sprint_duration_days: 14 } });
        });
        expect(result.current.data?.sprints[0].quarter).toBe('FY2026 Q1');

        // Update: FY starts in April (4). 2026-01-01 is now FY2026 Q4
        act(() => {
            result.current.updateSettings({ general: { fiscal_year_start_month: 4, sprint_duration_days: 14 } });
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
        const dataWithCrossQuarterSprint: ValueStreamData = {
            ...mockData,
            settings: { 
                ...mockData.settings, 
                general: { ...mockData.settings.general, fiscal_year_start_month: 7 } 
            }, // July 1st FY start
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
            if (url.startsWith('/api/workspace')) return Promise.resolve({ ok: true, json: () => Promise.resolve(dataWithCrossQuarterSprint) });
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }));

        const { result } = renderHook(() => useValueStreamData(undefined, {}, 0));
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
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 0));
        await waitFor(() => expect(result.current.loading).toBe(false));

        // Reset mock to track new calls
        vi.mocked(fetch).mockClear();

        await act(async () => {
            result.current.updateSettings({ 
                persistence: { 
                    ...mockSettings.persistence,
                    mongo: {
                        ...mockSettings.persistence.mongo,
                        app: { ...mockSettings.persistence.mongo.app, uri: 'mongodb://new-host:27017' }
                    }
                } 
            });
        });

        // Should call persist settings then refresh data (loadData)
        expect(fetch).toHaveBeenCalledWith('/api/settings', expect.objectContaining({ method: 'POST' }));
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/workspace'), expect.anything());
        });
    });

    it('shows an alert when an ID collision occurs (409 Conflict)', async () => {
        const mockAlert = vi.fn();
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 0, mockAlert));
        await waitFor(() => expect(result.current.loading).toBe(false));

        // Mock a 409 Conflict response for the next fetch
        vi.stubGlobal('fetch', vi.fn().mockImplementation(() => 
            Promise.resolve({
                ok: false,
                status: 409,
                json: () => Promise.resolve({ error: "ID collision: 'f1' already exists in the 'workItems' collection." })
            })
        ));

        act(() => {
            result.current.addWorkItem({ id: 'f1', name: 'Collision Item', total_effort_mds: 10, score: 0, status: 'Backlog', customer_targets: [] });
        });

        await waitFor(() => {
            expect(mockAlert).toHaveBeenCalledWith('Conflict', expect.stringContaining("ID collision: 'f1'"));
        });
    });
});
