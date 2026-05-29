import React, { useState, useMemo, useEffect, useRef } from 'react';
import styles from '../../pages/List.module.css';
import { PageWrapper } from '../layout/PageWrapper';
import { useUIStateContext } from '../../contexts/UIStateContext';

export type SortOption<T> = {
    label: string;
    key: string;
    getValue: (item: T) => string | number;
};

export type ListColumn<T> = {
    header: string;
    render: (item: T) => React.ReactNode;
    flex?: number | string;
    sortKey?: string;
};

interface GenericListPageProps<T> {
    pageId?: string;
    title: string;
    items: T[];
    loading: boolean;
    error?: Error | null;
    filterPlaceholder?: string;
    filterPredicate: (item: T, query: string) => boolean;
    sortOptions?: SortOption<T>[];
    defaultSortKey?: string;
    onItemClick: (item: T) => void;
    renderItemTitle?: (item: T) => React.ReactNode;
    renderItemDetails?: (item: T) => React.ReactNode;
    renderItemRight?: (item: T) => React.ReactNode;
    columns?: ListColumn<T>[];
    actionButton?: {
        label: string;
        onClick: () => void;
    };
    /**
     * Secondary buttons rendered to the LEFT of the primary action button
     * in the header (upper right). Use for ancillary actions (e.g. "Compact Ranks")
     * that don't deserve the primary slot but should still live in the header.
     */
    secondaryActions?: {
        label: string;
        onClick: () => void;
        title?: string;
        disabled?: boolean;
    }[];
    additionalControls?: React.ReactNode;
    renderBelowControls?: () => React.ReactNode;
    renderAboveList?: () => React.ReactNode;
    /**
     * Returns content rendered immediately AFTER the list rows (and the empty-
     * state placeholder). Use for pagination controls.
     */
    renderBelowList?: () => React.ReactNode;
    loadingMessage?: string;
    emptyMessage?: string;
    /**
     * When true, the filter region (search box, additionalControls, renderBelowControls)
     * is rendered inside a collapsible container with a chevron toggle. The collapsed
     * state is persisted per page in `uiState[pageId].filtersCollapsed`.
     */
    collapsible?: boolean;
    /**
     * Number of active filters to surface on the collapsed pull-tab so the user
     * can tell at a glance whether the list is filtered while the bar is hidden.
     * Counted by the parent (1 per active field, not per value).
     */
    activeFilterCount?: number;
    /**
     * When true, the page does NOT sort items in-memory — it just tracks the active
     * sortBy/sortOrder for column-header indicators and notifies via onSortChange.
     * Use when sorting is delegated to the backend.
     */
    disableClientSort?: boolean;
    /**
     * Fires whenever the active sort changes (column-header click or initial mount).
     * Pages doing backend sort use this to drive the request params.
     */
    onSortChange?: (sortBy: string | undefined, sortOrder: 'asc' | 'desc') => void;
    /**
     * Fires whenever the built-in text filter input changes. Pages doing backend
     * filtering use this to drive the request params (and typically pair it with
     * a no-op `filterPredicate` since the backend has already filtered).
     */
    onFilterChange?: (filter: string) => void;
    /**
     * Returns additional inline filter groups that flow IN THE SAME ROW as the
     * built-in name filter. Each child should be a labeled "group" (e.g. label
     * stacked over an input/dropdown). Use this for per-attribute filters.
     * GenericListPage owns the wrapping flex container — return only the groups.
     */
    renderFilterGroups?: () => React.ReactNode;
    /**
     * Returns content rendered above the filter row inside the same band.
     * Use for visualization / sort toggles that govern how the filters apply
     * (e.g. a "Prioritize by" metric toggle).
     */
    renderFilterBarHeader?: () => React.ReactNode;
    /**
     * Label rendered above the built-in name filter input. Defaults to "Filter".
     */
    nameFilterLabel?: string;
    /**
     * Optional inline node rendered immediately after the page title (inside the
     * <h1>). Use for small affordances like a SettingsLink that points to the
     * related Settings subtab.
     */
    titleAction?: React.ReactNode;
}

export function GenericListPage<T extends { id: string }>({
    pageId,
    title,
    items,
    loading,
    error,
    filterPlaceholder = "Filter items...",
    filterPredicate,
    sortOptions = [],
    defaultSortKey,
    onItemClick,
    renderItemTitle,
    renderItemDetails,
    renderItemRight,
    columns,
    actionButton,
    secondaryActions,
    additionalControls,
    renderBelowControls,
    renderAboveList,
    renderBelowList,
    loadingMessage = "Loading...",
    emptyMessage = "No items found.",
    collapsible,
    activeFilterCount = 0,
    disableClientSort,
    onSortChange,
    onFilterChange,
    renderFilterGroups,
    renderFilterBarHeader,
    nameFilterLabel = 'Filter',
    titleAction,
}: GenericListPageProps<T>) {
    const { uiState, updateUiState } = useUIStateContext();
    const listRef = useRef<HTMLDivElement>(null);
    const isRestored = useRef(false);
    
    // Use a ref to track the actual scroll container (the parent main element)
    const scrollContainerRef = useRef<HTMLElement | null>(null);

    // Initial state from context if available
    const savedState = pageId ? uiState[pageId] : null;
    
    // Reset restored flag when page changes
    useEffect(() => {
        isRestored.current = savedState?.scrollPosition === undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageId]);

    const [filter, setFilter] = useState(savedState?.filter || '');
    const [sortBy, setSortBy] = useState<string | undefined>(
        savedState?.sortBy || defaultSortKey || (sortOptions.length > 0 ? sortOptions[0].key : undefined)
    );
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(savedState?.sortOrder || 'asc');
    const [filtersCollapsed, setFiltersCollapsed] = useState<boolean>(savedState?.filtersCollapsed || false);

    // Toggling only sets local state — persistence into uiState happens in the
    // sync effect below that watches filter/sort/filtersCollapsed.
    const toggleFiltersCollapsed = () => setFiltersCollapsed(prev => !prev);

    // Helper to find the scrollable parent
    const getScrollContainer = () => {
        if (scrollContainerRef.current) return scrollContainerRef.current;
        if (listRef.current) {
            const container = listRef.current.closest('main');
            if (container) {
                scrollContainerRef.current = container;
                return container;
            }
        }
        return null;
    };

    // Restore scroll position
    useEffect(() => {
        if (loading || !pageId || savedState?.scrollPosition === undefined || isRestored.current) {
            // If we have no saved position, mark as restored immediately
            if (!loading && pageId && savedState?.scrollPosition === undefined) {
                isRestored.current = true;
                const container = getScrollContainer();
                if (container) container.scrollTop = 0;
            }
            return;
        }

        let attempts = 0;
        const maxAttempts = 20;
        const targetScroll = savedState.scrollPosition;

        const attemptRestoration = () => {
            const container = getScrollContainer();
            if (!container) {
                if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(attemptRestoration, 50);
                } else {
                    isRestored.current = true;
                }
                return;
            }
            
            // If target is 0, just do it and finish
            if (targetScroll === 0) {
                container.scrollTop = 0;
                isRestored.current = true;
                return;
            }

            container.scrollTop = targetScroll;
            
            // Verify if scroll took effect (items might still be rendering)
            // We use a small tolerance and check if we've reached the target or the maximum possible scroll
            const currentScroll = container.scrollTop;
            const maxScroll = container.scrollHeight - container.clientHeight;
            const reachedTarget = Math.abs(currentScroll - targetScroll) < 2;
            const reachedMax = Math.abs(currentScroll - maxScroll) < 2 && maxScroll > 0;

            if (!reachedTarget && !reachedMax && attempts < maxAttempts) {
                attempts++;
                setTimeout(attemptRestoration, 100);
            } else {
                // If we've reached it, or we've run out of attempts, consider it restored
                // This prevents subsequent scroll events (like browser forcing to 0) from being ignored
                // but only after we've given it a real chance.
                isRestored.current = true;
            }
        };

        const timer = setTimeout(attemptRestoration, 100);
        return () => clearTimeout(timer);
    }, [pageId, savedState?.scrollPosition, loading, items.length]);

    // Update context when filter/sort/scroll state changes
    // We use a scroll listener on the container for real-time tracking
    useEffect(() => {
        const container = getScrollContainer();
        if (!container || !pageId || loading) return;

        const handleScroll = () => {
            if (isRestored.current) {
                updateUiState(pageId, {
                    filter,
                    sortBy,
                    sortOrder,
                    scrollPosition: container.scrollTop,
                    filtersCollapsed,
                });
            }
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        
        // Also update once on mount/parameter change to sync current state
        if (isRestored.current) {
            updateUiState(pageId, { filter, sortBy, sortOrder, scrollPosition: container.scrollTop, filtersCollapsed });
        }

        return () => container.removeEventListener('scroll', handleScroll);
    }, [pageId, filter, sortBy, sortOrder, filtersCollapsed, updateUiState, loading]);

    const toggleSort = (key: string) => {
        let nextOrder: 'asc' | 'desc' = 'asc';
        if (sortBy === key) {
            nextOrder = sortOrder === 'asc' ? 'desc' : 'asc';
            setSortOrder(nextOrder);
        } else {
            setSortBy(key);
            setSortOrder('asc');
        }
        onSortChange?.(key, nextOrder);
    };

    // Notify parent of the initial sort + filter state on mount so backend-driven
    // callers don't need to duplicate the restore-from-uiState logic. Fires once.
    const initialReportedRef = useRef(false);
    useEffect(() => {
        if (initialReportedRef.current) return;
        initialReportedRef.current = true;
        if (onSortChange) onSortChange(sortBy, sortOrder);
        if (onFilterChange && filter) onFilterChange(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleItemClick = (item: T) => {
        // If the user drag-selected text inside the row, the mouseup still fires a
        // click on the row. Skip navigation so the selection is preserved instead of
        // being clobbered by a route change.
        if (typeof window !== 'undefined' && (window.getSelection()?.toString().length ?? 0) > 0) {
            return;
        }
        const container = getScrollContainer();
        if (pageId && container) {
            // Lock restoration flag to prevent any subsequent scroll events
            // (like those caused by content swap) from overwriting the state
            isRestored.current = false;
            
            updateUiState(pageId, {
                filter,
                sortBy,
                sortOrder,
                scrollPosition: container.scrollTop,
                filtersCollapsed,
            });
        }
        onItemClick(item);
    };

    const filteredAndSortedItems = useMemo(() => {
        let result = items ? items.filter(item => filterPredicate(item, filter)) : [];

        if (sortBy && !disableClientSort) {
            const option = sortOptions.find(o => o.key === sortBy);
            if (option) {
                result = [...result].sort((a, b) => {
                    const valA = option.getValue(a);
                    const valB = option.getValue(b);

                    let comparison = 0;
                    if (typeof valA === 'string' && typeof valB === 'string') {
                        comparison = valA.localeCompare(valB);
                    } else {
                        comparison = (Number(valA) || 0) - (Number(valB) || 0);
                    }

                    return sortOrder === 'asc' ? comparison : -comparison;
                });
            }
        }

        return result;
    }, [items, filter, filterPredicate, sortBy, sortOrder, sortOptions, disableClientSort]);

    const gridTemplateColumns = columns 
        ? columns.map(c => typeof c.flex === 'number' ? `${c.flex}fr` : (c.flex || '1fr')).join(' ')
        : '1fr';

    return (
        <PageWrapper 
            loading={loading} 
            error={error} 
            data={items} 
            loadingMessage={loadingMessage}
            emptyMessage={emptyMessage}
        >
            {/*
              Title row + filter region rendered as one continuous --bg-secondary band,
              mirroring Value Stream's header. The two are visually separated by a
              border-top on the filter region (same pattern as ValueStream.module.css
              `.filterBar`). Outer .header class provides the bottom border / spacing
              against the list below; we override its margin-bottom to 0 and pull the
              filter region into the same band.
            */}
            <div style={{
                background: 'var(--bg-secondary)',
                // Break out of the page wrapper's 32px padding so the header band
                // spans edge-to-edge, like Value Stream's header.
                margin: '-32px -32px 32px -32px',
                borderBottom: '1px solid var(--border-secondary)',
            }}>
                <div
                    className={styles.header}
                    style={{
                        // Override List.module.css defaults so the title row sits inside
                        // the band: no own border-bottom, no margin-bottom. Explicit height
                        // ties the title-row bottom (i.e. the divider under it) to the same
                        // Y as the sidebar logo's border-bottom — see --header-band-height.
                        borderBottom: 'none',
                        marginBottom: 0,
                        height: 'var(--header-band-height)',
                        boxSizing: 'border-box',
                        padding: '0 2rem',
                    }}
                >
                    <h1 style={{ display: 'flex', alignItems: 'center' }}>
                        {title}
                        {titleAction}
                    </h1>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {secondaryActions?.map((action, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={action.onClick}
                                title={action.title}
                                disabled={action.disabled}
                                className="btn-primary"
                            >
                                {action.label}
                            </button>
                        ))}
                        {actionButton && (
                            <button onClick={actionButton.onClick} className="btn-primary">
                                {actionButton.label}
                            </button>
                        )}
                    </div>
                </div>

                {(!collapsible || !filtersCollapsed) && (
                    <div
                        id={`${pageId || 'list'}-filter-region`}
                        style={{
                            position: 'relative',
                            // border-top divider mirrors ValueStream.module.css `.filterBar`
                            borderTop: '1px solid var(--border-primary)',
                            padding: '1rem 2rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px',
                        }}
                    >
                        {/* Top-right chevron when collapsible. Absolutely positioned so it
                            doesn't shift the filter row layout. */}
                        {collapsible && (
                            <button
                                type="button"
                                onClick={toggleFiltersCollapsed}
                                className="btn-secondary"
                                aria-expanded={true}
                                aria-controls={`${pageId || 'list'}-filter-region`}
                                title="Hide filters"
                                style={{
                                    position: 'absolute',
                                    top: '0.5rem',
                                    right: '0.75rem',
                                    padding: '4px 16px',
                                    fontSize: '12px',
                                    lineHeight: 1.2,
                                }}
                            >
                                ▾
                            </button>
                        )}

                        {/* Optional header content above the filter row (e.g. visualization
                            toggle). Visually separated from the filter row by a divider. */}
                        {renderFilterBarHeader && (
                            <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-primary)' }}>
                                {renderFilterBarHeader()}
                            </div>
                        )}

                        {/* Filter row: built-in name filter + page-provided filter groups,
                            laid out as labeled groups in a single wrapping flex container so
                            they all read as one cohesive set. */}
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '16px 24px',
                            alignItems: 'flex-start',
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                    {nameFilterLabel}
                                </label>
                                <input
                                    type="text"
                                    placeholder={filterPlaceholder}
                                    value={filter}
                                    onChange={(e) => {
                                        setFilter(e.target.value);
                                        onFilterChange?.(e.target.value);
                                    }}
                                    style={{
                                        // Stand out against the band's --bg-secondary
                                        // background by using --bg-tertiary on the input.
                                        // The other inline filter inputs use the same.
                                        width: '320px',
                                        padding: '6px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid var(--border-primary)',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '13px',
                                    }}
                                />
                            </div>
                            {renderFilterGroups && renderFilterGroups()}
                            {additionalControls}
                        </div>

                        {renderBelowControls && renderBelowControls()}
                    </div>
                )}
                {collapsible && filtersCollapsed && (
                    <div style={{
                        // Pull-tab hangs off the bottom of the header band, like ValueStream.
                        position: 'relative',
                        height: 0,
                    }}>
                        <button
                            type="button"
                            onClick={toggleFiltersCollapsed}
                            className="btn-secondary"
                            aria-expanded={false}
                            aria-controls={`${pageId || 'list'}-filter-region`}
                            title="Show filters"
                            style={{
                                position: 'absolute',
                                top: 0,
                                right: '2rem',
                                padding: '4px 16px',
                                fontSize: '12px',
                                lineHeight: 1.2,
                                borderTopLeftRadius: 0,
                                borderTopRightRadius: 0,
                                borderTop: 'none',
                            }}
                        >
                            ▸{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                        </button>
                    </div>
                )}
            </div>

            <div className={styles.list} ref={listRef}>
                {columns && (
                    <div className={styles.listHeader} style={{ display: 'grid', gridTemplateColumns, gap: '16px', padding: '0 16px 8px 16px' }}>
                        {columns.map((col, i) => {
                            const isSortable = !!col.sortKey;
                            const isActive = sortBy === col.sortKey;
                            if (isSortable) {
                                return (
                                    <button
                                        key={i}
                                        className={`${styles.columnHeader} ${styles.sortableColumnHeader}`}
                                        onClick={() => toggleSort(col.sortKey!)}
                                        style={{ 
                                            cursor: 'pointer', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '4px',
                                            background: 'none',
                                            border: 'none',
                                            padding: 0,
                                            textAlign: 'left',
                                            justifyContent: 'flex-start',
                                            width: '100%',
                                            fontFamily: 'inherit',
                                            outline: 'none'
                                        }}
                                    >
                                        {col.header}
                                        <span
                                            aria-hidden="true"
                                            style={{
                                                fontSize: '10px',
                                                opacity: isActive ? 1 : 0.35,
                                                marginLeft: '2px',
                                            }}
                                        >
                                            {isActive ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                                        </span>
                                    </button>
                                );
                            }
                            return (
                                <div 
                                    key={i} 
                                    className={styles.columnHeader}
                                >
                                    {col.header}
                                </div>
                            );
                        })}
                    </div>
                )}

                {renderAboveList && renderAboveList()}
                {filteredAndSortedItems.map(item => (
                    <div 
                        key={item.id} 
                        className={styles.listItem} 
                        onClick={() => handleItemClick(item)}
                        style={columns ? { display: 'grid', gridTemplateColumns, gap: '16px', alignItems: 'center' } : {}}
                    >
                        {columns ? (
                            columns.map((col, i) => (
                                <div key={i} className={styles.itemColumn}>
                                    {col.render(item)}
                                </div>
                            ))
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div className={styles.itemTitle}>{renderItemTitle?.(item)}</div>
                                    {renderItemDetails && <div className={styles.itemDetails}>{renderItemDetails(item)}</div>}
                                </div>
                                {renderItemRight && (
                                    <div>{renderItemRight(item)}</div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {filteredAndSortedItems.length === 0 && (
                    <div className={styles.empty}>{emptyMessage}</div>
                )}
                {renderBelowList && renderBelowList()}
            </div>
        </PageWrapper>
    );
}
