import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useValueStreamData } from '../useValueStreamData';
import type { ValueStreamData } from '../../types/models';

const mockData: ValueStreamData = {
    valueStreams: [],
    settings: {
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: { 
            mongo: { 
                app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
                customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
            }
        },
        jira: { base_url: '', api_version: '3', customer: { jql_new: '', jql_in_progress: '', jql_noop: '' } },
        ai: { provider: 'openai', support: { prompt: '' } }
    },
    customers: [],    workItems: [],
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
        
        expect(fetch).toHaveBeenCalledWith(
            '/api/entity/issues',
            expect.objectContaining({
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

        expect(fetch).toHaveBeenCalledWith('/api/entity/issues', expect.objectContaining({
            body: expect.stringContaining('"id":"e1"')
        }));
        expect(fetch).toHaveBeenCalledWith('/api/entity/issues', expect.objectContaining({
            body: expect.stringContaining('"id":"e2"')
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
            '/api/entity/issues',
            expect.objectContaining({
                method: 'POST',
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
            '/api/entity/sprints',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"name":"S1 Updated"')
            })
        );
    });
});






