import React, { useState, useMemo, useEffect } from 'react';
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
    
    // Initial state from context if available
    const savedState = pageId ? uiState[pageId] : null;
    
    const [filter, setFilter] = useState(savedState?.filter || '');
    const [sortBy, setSortBy] = useState<string | undefined>(
        savedState?.sortBy || defaultSortKey || (sortOptions.length > 0 ? sortOptions[0].key : undefined)
    );
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(savedState?.sortOrder || 'asc');

    // Update context when state changes
    useEffect(() => {
        if (pageId) {
            updateUiState(pageId, { filter, sortBy, sortOrder });
        }
    }, [pageId, filter, sortBy, sortOrder, updateUiState]);

    const toggleSort = (key: string) => {
        if (sortBy === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortOrder('asc');
        }
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

            <div className={styles.list}>
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
                        onClick={() => onItemClick(item)}
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
