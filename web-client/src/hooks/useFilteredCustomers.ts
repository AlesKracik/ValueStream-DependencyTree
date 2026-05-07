import { useState, useEffect, useRef } from 'react';
import type { Customer } from '@valuestream/shared-types';
import { authorizedFetch } from '../utils/api';

export interface CustomerFilters {
    name?: string;
    minExistingTcv?: string;
    maxExistingTcv?: string;
    minPotentialTcv?: string;
    maxPotentialTcv?: string;
    /** Range against existing_tcv + potential_tcv combined. */
    minTotalTcv?: string;
    maxTotalTcv?: string;
}

export interface CustomerSort {
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface CustomerPagination {
    /** 1-based page index. When omitted (alongside pageSize), the backend returns the full unpaginated set. */
    page?: number;
    pageSize?: number;
}

export interface FilteredCustomersResult {
    customers: Customer[];
    /** Total number of customers matching the filters across all pages. */
    total: number;
    /**
     * True only for the *initial* load. Refetches triggered by filter/sort/page
     * changes do NOT flip this back to true — that would unmount the page mid-
     * typing (PageWrapper swaps content for a loading view) and the input the
     * user is typing into would lose focus.
     */
    loading: boolean;
    /** True whenever a request (including the initial one) is in flight. */
    refetching: boolean;
    error: string | null;
    reload: () => void;
}

/**
 * Builds a query string from the filter + sort + pagination objects. Empty /
 * undefined values are omitted; numeric fields are passed as strings (the
 * backend coerces them).
 */
function buildQueryString(filters: CustomerFilters, sort: CustomerSort, pagination: CustomerPagination): string {
    const params = new URLSearchParams();
    const appendIfSet = (key: string, value: string | undefined) => {
        if (value !== undefined && value !== '') params.append(key, value);
    };

    appendIfSet('name', filters.name);
    appendIfSet('minExistingTcv', filters.minExistingTcv);
    appendIfSet('maxExistingTcv', filters.maxExistingTcv);
    appendIfSet('minPotentialTcv', filters.minPotentialTcv);
    appendIfSet('maxPotentialTcv', filters.maxPotentialTcv);
    appendIfSet('minTotalTcv', filters.minTotalTcv);
    appendIfSet('maxTotalTcv', filters.maxTotalTcv);

    appendIfSet('sortBy', sort.sortBy);
    appendIfSet('sortOrder', sort.sortOrder);

    if (pagination.page !== undefined && pagination.pageSize !== undefined) {
        params.append('page', String(pagination.page));
        params.append('pageSize', String(pagination.pageSize));
    }

    return params.toString();
}

const DEBOUNCE_MS = 250;

/**
 * Fetches a filtered + sorted list of Customers from /api/data/customers.
 * Debounces filter changes so a typing user doesn't trigger a request per keystroke.
 *
 * Stringifies filters/sort for the effect dependency so callers can pass fresh
 * object literals without causing extra fetches.
 */
export function useFilteredCustomers(
    filters: CustomerFilters,
    sort: CustomerSort,
    pagination: CustomerPagination = {}
): FilteredCustomersResult {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [refetching, setRefetching] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [reloadToken, setReloadToken] = useState(0);

    // Latest-request guard: a slow earlier request must not overwrite a faster newer one.
    const requestSeqRef = useRef(0);
    const hasFetchedRef = useRef(false);

    const queryString = buildQueryString(filters, sort, pagination);

    useEffect(() => {
        let cancelled = false;
        const seq = ++requestSeqRef.current;

        const fetchData = async () => {
            try {
                setRefetching(true);
                setError(null);
                const response = await authorizedFetch(`/api/data/customers${queryString ? `?${queryString}` : ''}`);
                if (cancelled || seq !== requestSeqRef.current) return;
                const json = await response.json();
                if (!response.ok) {
                    throw new Error(json?.error || `Request failed (${response.status})`);
                }
                // Tolerate either { customers, total } or a bare array (legacy
                // shape kept for safety if a stale backend is in front).
                const items: Customer[] = Array.isArray(json) ? json : (json.customers || []);
                setCustomers(items);
                const totalField: unknown = Array.isArray(json) ? undefined : json.total;
                setTotal(typeof totalField === 'number' ? totalField : items.length);
            } catch (e) {
                if (cancelled || seq !== requestSeqRef.current) return;
                setError(e instanceof Error ? e.message : 'Failed to load customers');
                setCustomers([]);
                setTotal(0);
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
        customers,
        total,
        loading,
        refetching,
        error,
        reload: () => setReloadToken(t => t + 1),
    };
}
