import { useState, useEffect, useRef } from 'react';
import type { WorkItem } from '@valuestream/shared-types';
import { authorizedFetch } from '../utils/api';

export interface WorkItemFilters {
    name?: string;
    minScore?: string;
    maxScore?: string;
    minEffort?: string;
    maxEffort?: string;
    minTcv?: string;
    maxTcv?: string;
    /**
     * Range against the field selected by `priorityMetric` (calculated_score,
     * aha_synced_data.score, or stackrank). Lets the metric toggle drive the
     * filter without having a separate min/max pair per metric.
     */
    minPriority?: string;
    maxPriority?: string;
    /**
     * Active prioritization metric. Drives both the priority range filter and
     * the 'priority' sort key on the backend. Defaults server-side to 'score'.
     */
    priorityMetric?: 'score' | 'aha_score' | 'stackrank';
    status?: string[];
    /** May contain real sprint IDs and/or the literal 'unreleased' sentinel. */
    releasedSprintIds?: string[];
}

export interface WorkItemSort {
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface FilteredWorkItemsResult {
    workItems: WorkItem[];
    metrics: { maxScore: number; maxRoi: number };
    /**
     * True only for the *initial* load, before any data has arrived. Refetches
     * triggered by changing filters/sort do NOT flip this back to true — that
     * would unmount the page (PageWrapper swaps content for a loading view) and
     * the input the user is typing into would lose focus.
     */
    loading: boolean;
    /** True whenever a request (including the initial one) is in flight. */
    refetching: boolean;
    error: string | null;
    reload: () => void;
}

/**
 * Builds a query string from the filter + sort objects. Arrays produce repeated
 * params (?status=A&status=B) so Fastify normalizes them back into arrays
 * server-side. Empty / undefined values are omitted.
 */
function buildQueryString(filters: WorkItemFilters, sort: WorkItemSort): string {
    const params = new URLSearchParams();
    const appendIfSet = (key: string, value: string | undefined) => {
        if (value !== undefined && value !== '') params.append(key, value);
    };

    appendIfSet('name', filters.name);
    appendIfSet('minScore', filters.minScore);
    appendIfSet('maxScore', filters.maxScore);
    appendIfSet('minEffort', filters.minEffort);
    appendIfSet('maxEffort', filters.maxEffort);
    appendIfSet('minTcv', filters.minTcv);
    appendIfSet('maxTcv', filters.maxTcv);
    appendIfSet('minPriority', filters.minPriority);
    appendIfSet('maxPriority', filters.maxPriority);
    appendIfSet('priorityMetric', filters.priorityMetric);

    (filters.status || []).forEach(s => params.append('status', s));
    (filters.releasedSprintIds || []).forEach(s => params.append('releasedSprintIds', s));

    appendIfSet('sortBy', sort.sortBy);
    appendIfSet('sortOrder', sort.sortOrder);

    return params.toString();
}

const DEBOUNCE_MS = 250;

/**
 * Fetches a filtered + sorted list of WorkItems from /api/data/workItems.
 * Debounces filter changes so a typing user doesn't trigger a request per keystroke.
 *
 * Stringifies filters/sort for the effect dependency so callers can pass fresh
 * object literals without causing extra fetches.
 */
export function useFilteredWorkItems(filters: WorkItemFilters, sort: WorkItemSort): FilteredWorkItemsResult {
    const [workItems, setWorkItems] = useState<WorkItem[]>([]);
    const [metrics, setMetrics] = useState<{ maxScore: number; maxRoi: number }>({ maxScore: 1, maxRoi: 1 });
    const [loading, setLoading] = useState<boolean>(true);
    const [refetching, setRefetching] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [reloadToken, setReloadToken] = useState(0);

    // Latest-request guard: a slow earlier request must not overwrite a faster newer one.
    const requestSeqRef = useRef(0);
    // Tracks whether at least one request has completed. Used to keep `loading`
    // false on subsequent refetches so the caller's UI stays mounted while the
    // user keeps typing.
    const hasFetchedRef = useRef(false);

    const queryString = buildQueryString(filters, sort);

    useEffect(() => {
        let cancelled = false;
        const seq = ++requestSeqRef.current;

        const fetchData = async () => {
            try {
                setRefetching(true);
                setError(null);
                const response = await authorizedFetch(`/api/data/workItems${queryString ? `?${queryString}` : ''}`);
                if (cancelled || seq !== requestSeqRef.current) return;
                const json = await response.json();
                if (!response.ok) {
                    throw new Error(json?.error || `Request failed (${response.status})`);
                }
                setWorkItems(json.workItems || []);
                setMetrics(json.metrics || { maxScore: 1, maxRoi: 1 });
            } catch (e) {
                if (cancelled || seq !== requestSeqRef.current) return;
                setError(e instanceof Error ? e.message : 'Failed to load work items');
                setWorkItems([]);
            } finally {
                if (!cancelled && seq === requestSeqRef.current) {
                    hasFetchedRef.current = true;
                    setLoading(false);
                    setRefetching(false);
                }
            }
        };

        const timer = setTimeout(fetchData, DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [queryString, reloadToken]);

    return {
        workItems,
        metrics,
        loading,
        refetching,
        error,
        reload: () => setReloadToken(t => t + 1),
    };
}
