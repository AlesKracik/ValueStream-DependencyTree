import React, { useState, useMemo, useEffect, useRef } from 'react';
import styles from '../../pages/List.module.css';
import { PageWrapper } from '../layout/PageWrapper';
import { useValueStreamContext } from '../../contexts/ValueStreamContext';

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
    loadingMessage?: string;
    emptyMessage?: string;
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
    loadingMessage = "Loading...",
    emptyMessage = "No items found."
}: GenericListPageProps<T>) {
    const { uiState, updateUiState } = useValueStreamContext();
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
                    scrollPosition: container.scrollTop 
                });
            }
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        
        // Also update once on mount/parameter change to sync current state
        if (isRestored.current) {
            updateUiState(pageId, { filter, sortBy, sortOrder, scrollPosition: container.scrollTop });
        }

        return () => container.removeEventListener('scroll', handleScroll);
    }, [pageId, filter, sortBy, sortOrder, updateUiState, loading]);

    const toggleSort = (key: string) => {
        if (sortBy === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortOrder('asc');
        }
    };

    const handleItemClick = (item: T) => {
        const container = getScrollContainer();
        if (pageId && container) {
            // Lock restoration flag to prevent any subsequent scroll events
            // (like those caused by content swap) from overwriting the state
            isRestored.current = false;
            
            updateUiState(pageId, {
                filter,
                sortBy,
                sortOrder,
                scrollPosition: container.scrollTop
            });
        }
        onItemClick(item);
    };

    const filteredAndSortedItems = useMemo(() => {
        let result = items ? items.filter(item => filterPredicate(item, filter)) : [];

        if (sortBy) {
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
    }, [items, filter, filterPredicate, sortBy, sortOrder, sortOptions]);

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
            <div className={styles.header}>
                <h1>{title}</h1>
                {actionButton && (
                    <button onClick={actionButton.onClick} className="btn-primary">
                        {actionButton.label}
                    </button>
                )}
            </div>

            <div className={styles.controls} style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                    type="text"
                    placeholder={filterPlaceholder}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className={styles.filterInput}
                    style={{ flex: 1, minWidth: '200px' }}
                />
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
                                        {isActive && (
                                            <span style={{ fontSize: '10px' }}>{sortOrder === 'asc' ? '▲' : '▼'}</span>
                                        )}
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
            </div>
        </PageWrapper>
    );
}
