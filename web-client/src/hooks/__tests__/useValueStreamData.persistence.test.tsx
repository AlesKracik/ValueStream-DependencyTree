import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useValueStreamData } from '../useValueStreamData';
import type { ValueStreamData } from '@valuestream/shared-types';

const mockData: ValueStreamData = {
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
    },    customers: [],    workItems: [],
    teams: [],
    issues: [
        { id: 'e1', jira_key: 'E1', team_id: 't1', effort_md: 10, name: 'Issue 1' },
        { id: 'e2', jira_key: 'E2', team_id: 't1', effort_md: 20, name: 'Issue 2' }
    ],
    sprints: [],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('useValueStreamData Persistence', () => {
    beforeEach(() => {
        const fetchMock = vi.fn().mockImplementation((url) => {
            if (url.startsWith('/api/workspace')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockData)
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
        });
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('debounces multiple updates to the SAME issue', async () => {
        // Use a small debounce for testing with real timers
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 50));
        await waitFor(() => expect(result.current.loading).toBe(false));

        vi.mocked(fetch).mockClear();

        await act(async () => {
            result.current.updateIssue('e1', { name: 'Update 1' });
            result.current.updateIssue('e1', { name: 'Update 2' });
            result.current.updateIssue('e1', { name: 'Update 3' });
        });

        // Wait for the debounce to expire
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1), { timeout: 1000 });

        // Coalesced PATCH carries the latest value for `name`.
        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/issues/e1',
            expect.objectContaining({
                method: 'PATCH',
                body: expect.stringContaining('"name":"Update 3"')
            })
        );
    });

    it('does NOT debounce updates to DIFFERENT issues (independent timers)', async () => {
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 50));
        await waitFor(() => expect(result.current.loading).toBe(false));

        vi.mocked(fetch).mockClear();

        await act(async () => {
            result.current.updateIssue('e1', { name: 'Issue 1 Updated' });
            result.current.updateIssue('e2', { name: 'Issue 2 Updated' });
        });

        // Both should be called independently
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2), { timeout: 1000 });

        expect(fetch).toHaveBeenCalledWith('/api/entity/issues/e1', expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('"name":"Issue 1 Updated"')
        }));
        expect(fetch).toHaveBeenCalledWith('/api/entity/issues/e2', expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('"name":"Issue 2 Updated"')
        }));
    });

    it('persists immediately when the immediate flag is set', async () => {
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 1000));
        await waitFor(() => expect(result.current.loading).toBe(false));

        vi.mocked(fetch).mockClear();

        await act(async () => {
            await result.current.updateIssue('e1', { name: 'Immediate Update' }, true);
        });

        // Should have called fetch immediately without waiting for debounce
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/issues/e1',
            expect.objectContaining({
                method: 'PATCH',
                body: expect.stringContaining('"name":"Immediate Update"')
            })
        );
    });

    it('returns a promise that resolves after persistence when using immediate flag', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let resolveFetch: (value: any) => void;
        const fetchPromise = new Promise((resolve) => {
            resolveFetch = resolve;
        });

        vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
            if (url.startsWith('/api/workspace')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockData) });
            if (url.startsWith('/api/auth/me/settings')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, client_settings: {} }) });
            return fetchPromise;
        }));

        const { result } = renderHook(() => useValueStreamData(undefined, {}, 1000));
        await waitFor(() => expect(result.current.loading).toBe(false));

        let updateResolved = false;
        const updatePromise = result.current.updateIssue('e1', { name: 'Async Test' }, true).then(() => {
            updateResolved = true;
        });

        expect(updateResolved).toBe(false);

        await act(async () => {
            resolveFetch!({ ok: true, json: () => Promise.resolve({ success: true }) });
            await updatePromise;
        });

        expect(updateResolved).toBe(true);
    });

    it('supports immediate flag for updateSprint', async () => {
        const dataWithSprint: ValueStreamData = {
            ...mockData,
            sprints: [{ id: 's1', name: 'S1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'Q1' }]
        };
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
            if (url.startsWith('/api/workspace')) return Promise.resolve({ ok: true, json: () => Promise.resolve(dataWithSprint) });
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
        }));

        const { result } = renderHook(() => useValueStreamData(undefined, {}, 1000));
        await waitFor(() => expect(result.current.loading).toBe(false));

        vi.mocked(fetch).mockClear();

        await act(async () => {
            await result.current.updateSprint('s1', { name: 'S1 Updated' }, true);
        });

        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/sprints/s1',
            expect.objectContaining({
                method: 'PATCH',
                body: expect.stringContaining('"name":"S1 Updated"')
            })
        );
    });

    it('attaches _version: 0 to PATCH bodies for entities that lack a stored version', async () => {
        const { result } = renderHook(() => useValueStreamData(undefined, {}, 1000));
        await waitFor(() => expect(result.current.loading).toBe(false));

        vi.mocked(fetch).mockClear();

        await act(async () => {
            await result.current.updateIssue('e1', { name: 'With version' }, true);
        });

        // mockData.issues had no _version on the documents; the PATCH envelope
        // should default it to 0.
        const issueCall = vi.mocked(fetch).mock.calls.find(
            c => typeof c[0] === 'string' && c[0]!.startsWith('/api/entity/issues')
        );
        expect(issueCall).toBeDefined();
        const body = JSON.parse((issueCall![1] as RequestInit).body as string);
        expect(body._version).toBe(0);
        expect(body.patch).toEqual({ name: 'With version' });
    });

    it('patchCustomerArrayItem PATCHes the array element endpoint and bumps parent _version locally', async () => {
        const dataWithCustomer: ValueStreamData = {
            ...mockData,
            customers: [{
                id: 'c1',
                _version: 3,
                name: 'Acme',
                existing_tcv: 0,
                potential_tcv: 0,
                support_issues: [
                    { id: 'si-1', description: 'old', status: 'to do' }
                ]
            }]
        };

        vi.stubGlobal('fetch', vi.fn().mockImplementation((url, init?: RequestInit) => {
            if (typeof url === 'string' && url.startsWith('/api/workspace')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve(dataWithCustomer) });
            }
            if (typeof url === 'string' && url.startsWith('/api/entity/customers/c1/items/support_issues/si-1') && init?.method === 'PATCH') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, _version: 4 }) });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }));

        const { result } = renderHook(() => useValueStreamData(undefined, {}, 1000));
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            const ok = await result.current.patchCustomerArrayItem('c1', 'support_issues', 'si-1', { description: 'new' });
            expect(ok).toBe(true);
        });

        const calls = vi.mocked(fetch).mock.calls.filter(
            c => typeof c[0] === 'string' && c[0]!.includes('/items/support_issues/si-1')
        );
        expect(calls).toHaveLength(1);
        const body = JSON.parse((calls[0][1] as RequestInit).body as string);
        expect(body._version).toBe(3);
        expect(body.patch).toEqual({ description: 'new' });

        // Local state should have applied the optimistic edit AND back-written the bumped version.
        const cust = result.current.data?.customers.find(c => c.id === 'c1');
        expect(cust?._version).toBe(4);
        expect(cust?.support_issues?.[0].description).toBe('new');
    });

    it('on 409 conflict, replays the PATCH against the server _version', async () => {
        // Issue e1 starts at no local _version. Server has moved to _version: 4
        // with a different `name`. We edit `effort_md`. The PATCH targets only
        // effort_md, so concurrent edits to `name` do NOT conflict on the field,
        // but the version stamp does — we retry at the server's version.
        let patchCallCount = 0;
        const conflictDoc = { id: 'e1', _version: 4, jira_key: 'E1', team_id: 't1', effort_md: 10, name: 'Server name' };

        vi.stubGlobal('fetch', vi.fn().mockImplementation((url, init?: RequestInit) => {
            if (typeof url === 'string' && url.startsWith('/api/workspace')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve(mockData) });
            }
            if (typeof url === 'string' && url.startsWith('/api/entity/issues') && init?.method === 'PATCH') {
                patchCallCount += 1;
                if (patchCallCount === 1) {
                    return Promise.resolve({
                        ok: false,
                        status: 409,
                        json: () => Promise.resolve({ success: false, conflict: true, error: 'stale', current: conflictDoc }),
                    });
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, _version: 5 }) });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }));

        const { result } = renderHook(() => useValueStreamData(undefined, {}, 1000));
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.updateIssue('e1', { effort_md: 42 }, true);
        });

        expect(patchCallCount).toBe(2);

        const calls = vi.mocked(fetch).mock.calls.filter(
            c => typeof c[0] === 'string' && c[0]!.startsWith('/api/entity/issues')
        );
        const firstBody = JSON.parse((calls[0][1] as RequestInit).body as string);
        const retryBody = JSON.parse((calls[1][1] as RequestInit).body as string);
        expect(firstBody._version).toBe(0);
        expect(retryBody._version).toBe(4);
        expect(retryBody.patch).toEqual({ effort_md: 42 });
    });
});






