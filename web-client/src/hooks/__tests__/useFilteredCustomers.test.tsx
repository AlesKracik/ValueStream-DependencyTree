import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFilteredCustomers } from '../useFilteredCustomers';

vi.mock('../../utils/api', () => ({
    authorizedFetch: vi.fn(),
}));

import { authorizedFetch } from '../../utils/api';
const fetchMock = vi.mocked(authorizedFetch);

const ok = (customers: unknown[], extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ customers, ...extra }), { status: 200 });

// Wait long enough for the 250ms debounce + the resolved fetch to flush.
const flushDebounce = () => new Promise(r => setTimeout(r, 350));

describe('useFilteredCustomers', () => {
    beforeEach(() => {
        fetchMock.mockReset();
    });

    it('reports loading=true on initial mount and flips to false when the first response arrives', async () => {
        fetchMock.mockResolvedValueOnce(ok([{ id: 'c1', name: 'A' }]));
        const { result } = renderHook(() => useFilteredCustomers({}, {}));

        expect(result.current.loading).toBe(true);
        expect(result.current.refetching).toBe(false);

        await act(flushDebounce);
        expect(result.current.loading).toBe(false);
        expect(result.current.customers).toHaveLength(1);
    });

    it('does NOT flip loading back to true on subsequent refetches — only refetching does', async () => {
        fetchMock.mockResolvedValueOnce(ok([{ id: 'c1', name: 'A' }]));
        const { result, rerender } = renderHook(
            ({ filters }) => useFilteredCustomers(filters, {}),
            { initialProps: { filters: { name: 'A' } as Record<string, string> } }
        );
        await act(flushDebounce);
        expect(result.current.loading).toBe(false);

        // Change filters → triggers a refetch with a deferred response so we can
        // observe the in-flight state.
        let resolveSecond!: (r: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise<Response>(res => { resolveSecond = res; }));
        rerender({ filters: { name: 'B' } });

        await act(flushDebounce);
        // Loading must NOT flip back to true (otherwise PageWrapper unmounts the page
        // and the user loses input focus mid-typing). Refetching is the in-flight signal.
        expect(result.current.loading).toBe(false);
        expect(result.current.refetching).toBe(true);

        await act(async () => { resolveSecond(ok([{ id: 'c2', name: 'B' }])); });
        await waitFor(() => expect(result.current.refetching).toBe(false));
        expect(result.current.customers[0].id).toBe('c2');
    });

    it('builds the URL with name + tcv ranges + sort params', async () => {
        fetchMock.mockResolvedValue(ok([]));
        renderHook(() => useFilteredCustomers(
            {
                name: 'acme',
                minExistingTcv: '1000',
                maxPotentialTcv: '50000',
                minTotalTcv: '5000',
            },
            { sortBy: 'existing', sortOrder: 'desc' }
        ));
        await act(flushDebounce);
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain('name=acme');
        expect(url).toContain('minExistingTcv=1000');
        expect(url).toContain('maxPotentialTcv=50000');
        expect(url).toContain('minTotalTcv=5000');
        expect(url).toContain('sortBy=existing');
        expect(url).toContain('sortOrder=desc');
    });

    it('debounces typing into the same filter so only one request fires', async () => {
        fetchMock.mockResolvedValue(ok([]));
        const { rerender } = renderHook(
            ({ filters }) => useFilteredCustomers(filters, {}),
            { initialProps: { filters: { name: 'a' } as Record<string, string> } }
        );

        rerender({ filters: { name: 'ab' } });
        rerender({ filters: { name: 'abc' } });
        rerender({ filters: { name: 'abcd' } });

        await act(flushDebounce);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain('name=abcd');
    });

    it('appends page/pageSize to the URL when pagination is provided and surfaces total', async () => {
        fetchMock.mockResolvedValue(ok([{ id: 'c1' }], { total: 42 }));
        const { result } = renderHook(() =>
            useFilteredCustomers({}, {}, { page: 2, pageSize: 25 })
        );
        await act(flushDebounce);
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain('page=2');
        expect(url).toContain('pageSize=25');
        expect(result.current.total).toBe(42);
    });

    it('omits page/pageSize when pagination is not provided', async () => {
        fetchMock.mockResolvedValue(ok([]));
        renderHook(() => useFilteredCustomers({}, {}));
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
            ({ filters }) => useFilteredCustomers(filters, {}),
            { initialProps: { filters: { name: 'old' } as Record<string, string> } }
        );

        await act(flushDebounce);

        rerender({ filters: { name: 'new' } });
        await act(flushDebounce);

        await act(async () => { resolveSecond(ok([{ id: 'NEW' }])); });
        await act(async () => { resolveFirst(ok([{ id: 'OLD' }])); });

        await waitFor(() => expect(result.current.customers[0]?.id).toBe('NEW'));
        expect(result.current.customers[0].id).toBe('NEW');
    });

    it('tolerates a bare-array response shape (legacy backend)', async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'c1' }, { id: 'c2' }]), { status: 200 }));
        const { result } = renderHook(() => useFilteredCustomers({}, {}));
        await act(flushDebounce);
        expect(result.current.customers).toHaveLength(2);
        expect(result.current.total).toBe(2);
    });
});
