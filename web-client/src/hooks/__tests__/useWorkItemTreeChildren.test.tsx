import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/api', () => ({
    authorizedFetch: vi.fn(),
}));

import { authorizedFetch } from '../../utils/api';
import { useWorkItemTreeChildren } from '../useWorkItemTreeChildren';
const fetchMock = vi.mocked(authorizedFetch);

const ok = (json: unknown) => ({ ok: true, json: () => Promise.resolve(json) }) as unknown as Response;

describe('useWorkItemTreeChildren', () => {
    beforeEach(() => fetchMock.mockReset());

    it('loads each expanded level once with the same filters and sort', async () => {
        fetchMock.mockResolvedValue(ok({ workItems: [{ id: 'c1', name: 'Child' }], childCounts: { c1: 2 }, contextIds: ['c1'] }));
        const filters = { status: ['Backlog'] };
        const sort = { sortBy: 'name', sortOrder: 'asc' as const };
        const expanded = ['p1'];
        const { result, rerender } = renderHook(() => useWorkItemTreeChildren(filters, sort, expanded, true));

        await waitFor(() => expect(result.current.p1?.workItems).toHaveLength(1));
        expect(result.current.p1).toMatchObject({ childCounts: { c1: 2 }, contextIds: ['c1'] });
        const url = String(fetchMock.mock.calls[0][0]);
        expect(url).toContain('status=Backlog');
        expect(url).toContain('sortBy=name');
        expect(url).toContain('tree=true');
        expect(url).toContain('treeParent=p1');

        rerender();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the tree view is off', () => {
        renderHook(() => useWorkItemTreeChildren({}, {}, ['p1'], false));
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps a failed level as an error instead of refetching it', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ error: 'boom' }) } as unknown as Response);
        const expanded = ['p1'];
        const { result } = renderHook(() => useWorkItemTreeChildren({}, {}, expanded, true));
        await waitFor(() => expect(result.current.p1?.error).toBe('boom'));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
