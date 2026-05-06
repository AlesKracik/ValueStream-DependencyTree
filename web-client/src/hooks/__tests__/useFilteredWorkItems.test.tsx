import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFilteredWorkItems } from '../useFilteredWorkItems';

// Stub authorizedFetch so we never hit the real network.
vi.mock('../../utils/api', () => ({
    authorizedFetch: vi.fn(),
}));

import { authorizedFetch } from '../../utils/api';
const fetchMock = vi.mocked(authorizedFetch);

const ok = (workItems: unknown[], extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ workItems, metrics: { maxScore: 100, maxRoi: 10 }, ...extra }), { status: 200 });

// Wait long enough for the 250ms debounce + the resolved fetch to flush.
const flushDebounce = () => new Promise(r => setTimeout(r, 350));

describe('useFilteredWorkItems', () => {
    beforeEach(() => {
        fetchMock.mockReset();
    });

    it('reports loading=true on initial mount and flips to false when the first response arrives', async () => {
        fetchMock.mockResolvedValueOnce(ok([{ id: 'w1', name: 'A' }]));
        const { result } = renderHook(() => useFilteredWorkItems({}, {}));

        expect(result.current.loading).toBe(true);
        expect(result.current.refetching).toBe(false);

        await act(flushDebounce);
        expect(result.current.loading).toBe(false);
        expect(result.current.workItems).toHaveLength(1);
    });

    it('does NOT flip loading back to true on subsequent refetches — only refetching does', async () => {
        // Initial response.
        fetchMock.mockResolvedValueOnce(ok([{ id: 'w1', name: 'A' }]));
        const { result, rerender } = renderHook(
            ({ filters }) => useFilteredWorkItems(filters, {}),
            { initialProps: { filters: { name: 'A' } as Record<string, string> } }
        );
        await act(flushDebounce);
        expect(result.current.loading).toBe(false);

        // Now change filters → triggers a refetch. Use a deferred response so we can
        // observe the in-flight state.
        let resolveSecond!: (r: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise<Response>(res => { resolveSecond = res; }));
        rerender({ filters: { name: 'B' } });

        // Wait past debounce so the fetch is in flight.
        await act(flushDebounce);
        // Loading must NOT flip back to true (otherwise PageWrapper unmounts the page
        // and the user loses input focus mid-typing). Refetching is the in-flight signal.
        expect(result.current.loading).toBe(false);
        expect(result.current.refetching).toBe(true);

        // Resolve the in-flight request.
        await act(async () => { resolveSecond(ok([{ id: 'w2', name: 'B' }])); });
        await waitFor(() => expect(result.current.refetching).toBe(false));
        expect(result.current.workItems[0].id).toBe('w2');
    });

    it('builds the priority filter URL with minPriority/maxPriority/priorityMetric', async () => {
        fetchMock.mockResolvedValue(ok([]));
        renderHook(() => useFilteredWorkItems(
            { minPriority: '10', maxPriority: '100', priorityMetric: 'aha_score' },
            { sortBy: 'priority', sortOrder: 'desc' }
        ));
        await act(flushDebounce);
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain('minPriority=10');
        expect(url).toContain('maxPriority=100');
        expect(url).toContain('priorityMetric=aha_score');
        expect(url).toContain('sortBy=priority');
        expect(url).toContain('sortOrder=desc');
    });

    it('debounces typing into the same filter so only one request fires', async () => {
        fetchMock.mockResolvedValue(ok([]));
        const { rerender } = renderHook(
            ({ filters }) => useFilteredWorkItems(filters, {}),
            { initialProps: { filters: { name: 'a' } as Record<string, string> } }
        );

        // Three rapid changes within the debounce window.
        rerender({ filters: { name: 'ab' } });
        rerender({ filters: { name: 'abc' } });
        rerender({ filters: { name: 'abcd' } });

        await act(flushDebounce);
        // Only one fetch should fire for the final value.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain('name=abcd');
    });

    it('appends page/pageSize to the URL when pagination is provided and surfaces total', async () => {
        fetchMock.mockResolvedValue(ok([{ id: 'w1' }], { total: 42 }));
        const { result } = renderHook(() =>
            useFilteredWorkItems({}, {}, { page: 2, pageSize: 25 })
        );
        await act(flushDebounce);
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain('page=2');
        expect(url).toContain('pageSize=25');
        expect(result.current.total).toBe(42);
    });

    it('omits page/pageSize when pagination is not provided', async () => {
        fetchMock.mockResolvedValue(ok([]));
        renderHook(() => useFilteredWorkItems({}, {}));
        await act(flushDebounce);
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).not.toContain('page=');
        expect(url).not.toContain('pageSize=');
    });

    it('discards out-of-order responses (latest-request guard)', async () => {
        let resolveFirst!: (r: Response) => void;
        let resolveSecond!: (r: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise<Response>(res => { resolveFirst = res; }));
        fetchMock.mockReturnValueOnce(new Promise<Response>(res => { resolveSecond = res; }));

        const { result, rerender } = renderHook(
            ({ filters }) => useFilteredWorkItems(filters, {}),
            { initialProps: { filters: { name: 'old' } as Record<string, string> } }
        );

        // Trigger first request.
        await act(flushDebounce);

        // Trigger second request (will be sequence #2).
        rerender({ filters: { name: 'new' } });
        await act(flushDebounce);

        // Resolve newer request FIRST.
        await act(async () => { resolveSecond(ok([{ id: 'NEW' }])); });
        // Then resolve older request — its result must be ignored.
        await act(async () => { resolveFirst(ok([{ id: 'OLD' }])); });

        await waitFor(() => expect(result.current.workItems[0]?.id).toBe('NEW'));
        // OLD result should never have replaced NEW.
        expect(result.current.workItems[0].id).toBe('NEW');
    });
});
