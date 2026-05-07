import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ValueStreamData, Customer } from '@valuestream/shared-types';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';
import { Pagination } from '../components/common/Pagination';
import { useFilteredCustomers, type CustomerFilters, type CustomerSort } from '../hooks/useFilteredCustomers';

const DEFAULT_PAGE_SIZE = 25;

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
}

const numberInputStyle: React.CSSProperties = {
    width: '90px',
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid var(--border-primary)',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
};

export const CustomerListPage: React.FC<Props> = ({ data, loading: outerLoading }) => {
    const navigate = useNavigate();

    // --- Filter & sort state ---
    const [filters, setFilters] = useState<CustomerFilters>({});
    const [sort, setSort] = useState<CustomerSort>({ sortBy: 'name', sortOrder: 'asc' });

    // --- Pagination state ---
    // pageSize comes from the user's "Items per page" setting (general.items_per_page).
    // page is reset to 1 whenever filters or sort change (see resetKey snap below).
    const pageSize = data?.settings?.general?.items_per_page ?? DEFAULT_PAGE_SIZE;
    const [page, setPage] = useState(1);

    const setFilterField = <K extends keyof CustomerFilters>(key: K, value: CustomerFilters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    // Active filter count = 1 per active field (not per value), matching WorkItemListPage.
    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (filters.name) n++;
        if (filters.minExistingTcv || filters.maxExistingTcv) n++;
        if (filters.minPotentialTcv || filters.maxPotentialTcv) n++;
        if (filters.minTotalTcv || filters.maxTotalTcv) n++;
        return n;
    }, [filters]);

    // --- Data ---
    const { customers, total, loading: hookLoading, error } = useFilteredCustomers(
        filters,
        sort,
        { page, pageSize }
    );
    const loading = outerLoading || hookLoading;

    // Snap back to page 1 when filters/sort/pageSize change. Same "adjust state
    // during render" pattern WorkItemListPage uses (avoids set-state-in-effect).
    const resetKey = `${JSON.stringify(filters)}|${sort.sortBy ?? ''}|${sort.sortOrder ?? ''}|${pageSize}`;
    const [prevResetKey, setPrevResetKey] = useState(resetKey);
    if (resetKey !== prevResetKey) {
        setPrevResetKey(resetKey);
        if (page !== 1) setPage(1);
    }

    const sortOptions: SortOption<Customer>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (c) => c.name },
        { label: 'Existing', key: 'existing', getValue: (c) => c.existing_tcv || 0 },
        { label: 'Potential', key: 'potential', getValue: (c) => c.potential_tcv || 0 }
    ], []);

    const columns: ListColumn<Customer>[] = useMemo(() => [
        { header: 'Name', render: (c) => c.name, flex: 2, sortKey: 'name' },
        {
            header: 'Existing TCV',
            render: (c) => `$${c.existing_tcv.toLocaleString()}${c.existing_tcv_duration_months ? ` (${c.existing_tcv_duration_months}mo)` : ''}`,
            flex: 1.5,
            sortKey: 'existing'
        },
        {
            header: 'Potential TCV',
            render: (c) => `$${c.potential_tcv.toLocaleString()}${c.potential_tcv_duration_months ? ` (${c.potential_tcv_duration_months}mo)` : ''}`,
            flex: 1.5,
            sortKey: 'potential'
        }
    ], []);

    const handleSortChange = useCallback((sortBy: string | undefined, sortOrder: 'asc' | 'desc') => {
        setSort({ sortBy, sortOrder });
    }, []);
    const handleFilterChange = useCallback((name: string) => {
        setFilters(prev => ({ ...prev, name: name || undefined }));
    }, []);

    const labelStyle: React.CSSProperties = {
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
    };
    const groupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px' };
    const rangeRowStyle: React.CSSProperties = { display: 'flex', gap: '6px', alignItems: 'center' };

    const renderFilterGroups = () => (
        <>
            <div style={groupStyle}>
                <label style={labelStyle}>Existing TCV ($)</label>
                <div style={rangeRowStyle}>
                    <input aria-label="Min existing TCV" type="number" placeholder="min" value={filters.minExistingTcv || ''}
                        onChange={(e) => setFilterField('minExistingTcv', e.target.value || undefined)} style={numberInputStyle} />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input aria-label="Max existing TCV" type="number" placeholder="max" value={filters.maxExistingTcv || ''}
                        onChange={(e) => setFilterField('maxExistingTcv', e.target.value || undefined)} style={numberInputStyle} />
                </div>
            </div>

            <div style={groupStyle}>
                <label style={labelStyle}>Potential TCV ($)</label>
                <div style={rangeRowStyle}>
                    <input aria-label="Min potential TCV" type="number" placeholder="min" value={filters.minPotentialTcv || ''}
                        onChange={(e) => setFilterField('minPotentialTcv', e.target.value || undefined)} style={numberInputStyle} />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input aria-label="Max potential TCV" type="number" placeholder="max" value={filters.maxPotentialTcv || ''}
                        onChange={(e) => setFilterField('maxPotentialTcv', e.target.value || undefined)} style={numberInputStyle} />
                </div>
            </div>

            <div style={groupStyle}>
                <label style={labelStyle}>Total TCV ($)</label>
                <div style={rangeRowStyle}>
                    <input aria-label="Min total TCV" type="number" placeholder="min" value={filters.minTotalTcv || ''}
                        onChange={(e) => setFilterField('minTotalTcv', e.target.value || undefined)} style={numberInputStyle} />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input aria-label="Max total TCV" type="number" placeholder="max" value={filters.maxTotalTcv || ''}
                        onChange={(e) => setFilterField('maxTotalTcv', e.target.value || undefined)} style={numberInputStyle} />
                </div>
            </div>

            {activeFilterCount > 0 && (
                <button
                    type="button"
                    onClick={() => setFilters({})}
                    className="btn-secondary"
                    style={{ alignSelf: 'flex-end', padding: '4px 12px', fontSize: '12px' }}
                >
                    Clear filters
                </button>
            )}
        </>
    );

    return (
        <GenericListPage<Customer>
            pageId="customers"
            title="Customers"
            items={customers}
            loading={loading}
            error={error ? new Error(error) : null}
            filterPlaceholder="Filter customers..."
            filterPredicate={() => true}
            sortOptions={sortOptions}
            disableClientSort
            onSortChange={handleSortChange}
            onFilterChange={handleFilterChange}
            collapsible
            activeFilterCount={activeFilterCount}
            nameFilterLabel="Name"
            renderFilterGroups={renderFilterGroups}
            renderBelowList={() => (
                <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
            )}
            onItemClick={(c) => navigate(`/customer/${c.id}`)}
            columns={columns}
            actionButton={{
                label: "+ New Customer",
                onClick: () => navigate('/customer/new')
            }}
            loadingMessage="Loading customers..."
            emptyMessage="No customers found."
        />
    );
};
