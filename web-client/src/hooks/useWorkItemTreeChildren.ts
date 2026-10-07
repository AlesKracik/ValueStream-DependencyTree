import { useEffect, useRef, useState } from 'react';
import type { WorkItem } from '@valuestream/shared-types';
import { authorizedFetch } from '../utils/api';
import { buildQueryString, type WorkItemFilters, type WorkItemSort } from './useFilteredWorkItems';

/** One loaded level of the tree: the children of a work item. */
export interface WorkItemTreeChildren {
    workItems: WorkItem[];
    childCounts: Record<string, number>;
    contextIds: string[];
    error?: string;
}

/**
 * Loads the children of every expanded work item in the tree, with the
 * same filters and sort as the top level. Children are not paged. Loaded
 * levels are kept until the filters, sort or `reloadToken` change.
 */
export function useWorkItemTreeChildren(
    filters: WorkItemFilters,
    sort: WorkItemSort,
    expandedIds: string[],
    reloadToken = 0,
): Record<string, WorkItemTreeChildren> {
    const cacheKey = `${buildQueryString(filters, sort, {})}|${reloadToken}`;
    const [cache, setCache] = useState<{ key: string; byParent: Record<string, WorkItemTreeChildren> }>(
        { key: cacheKey, byParent: {} },
    );
    // New filters or sort: drop the loaded levels (adjusted during render).
    if (cache.key !== cacheKey) setCache({ key: cacheKey, byParent: {} });

    const inFlight = useRef(new Set<string>());

    useEffect(() => {
        const missing = expandedIds.filter(id => !(id in cache.byParent) && !inFlight.current.has(`${cacheKey}|${id}`));
        if (missing.length === 0) return;
        missing.forEach(id => inFlight.current.add(`${cacheKey}|${id}`));

        Promise.all(missing.map(async (id): Promise<[string, WorkItemTreeChildren]> => {
            try {
                const qs = buildQueryString(filters, sort, {}, { parentId: id });
                const res = await authorizedFetch(`/api/data/workItems?${qs}`);
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
                return [id, { workItems: json.workItems || [], childCounts: json.childCounts || {}, contextIds: json.contextIds || [] }];
            } catch (e) {
                return [id, { workItems: [], childCounts: {}, contextIds: [], error: e instanceof Error ? e.message : 'Failed to load children' }];
            } finally {
                inFlight.current.delete(`${cacheKey}|${id}`);
            }
        })).then(entries => {
            setCache(prev => prev.key === cacheKey
                ? { ...prev, byParent: { ...prev.byParent, ...Object.fromEntries(entries) } }
                : prev);
        });
    // filters/sort are covered by cacheKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cacheKey, expandedIds, cache.byParent]);

    return cache.key === cacheKey ? cache.byParent : {};
}
