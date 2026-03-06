import React, { useState, useMemo } from 'react';
import styles from '../../pages/List.module.css';
import { PageWrapper } from '../layout/PageWrapper';

export type SortOption<T> = {
    label: string;
    key: string;
    getValue: (item: T) => string | number;
};

interface GenericListPageProps<T> {
    title: string;
    items: T[];
    loading: boolean;
    error?: Error | null;
    filterPlaceholder?: string;
    filterPredicate: (item: T, query: string) => boolean;
    sortOptions?: SortOption<T>[];
    defaultSortKey?: string;
    onItemClick: (item: T) => void;
    renderItemTitle: (item: T) => React.ReactNode;
    renderItemDetails?: (item: T) => React.ReactNode;
    renderItemRight?: (item: T) => React.ReactNode;
    actionButton?: {
        label: string;
        onClick: () => void;
    };
    loadingMessage?: string;
    emptyMessage?: string;
}

export function GenericListPage<T extends { id: string }>({
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
    actionButton,
    loadingMessage = "Loading...",
    emptyMessage = "No items found."
}: GenericListPageProps<T>) {
    const [filter, setFilter] = useState('');
    const [sortBy, setSortBy] = useState<string | undefined>(defaultSortKey || (sortOptions.length > 0 ? sortOptions[0].key : undefined));
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

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
                
                {sortOptions.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', color: '#9ca3af' }}>
                        Sort by:
                        {sortOptions.map(option => (
                            <button
                                key={option.key}
                                onClick={() => toggleSort(option.key)}
                                className={sortBy === option.key ? styles.activeSort : styles.sortBtn}
                            >
                                {option.label} {sortBy === option.key && (sortOrder === 'asc' ? '↑' : '↓')}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className={styles.list}>
                {filteredAndSortedItems.map(item => (
                    <div key={item.id} className={styles.listItem} onClick={() => onItemClick(item)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div className={styles.itemTitle}>{renderItemTitle(item)}</div>
                                {renderItemDetails && <div className={styles.itemDetails}>{renderItemDetails(item)}</div>}
                            </div>
                            {renderItemRight && (
                                <div>{renderItemRight(item)}</div>
                            )}
                        </div>
                    </div>
                ))}
                {filteredAndSortedItems.length === 0 && (
                    <div className={styles.empty}>{emptyMessage}</div>
                )}
            </div>
        </PageWrapper>
    );
}
