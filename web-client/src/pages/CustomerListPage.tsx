import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData } from '../types/models';
import styles from './List.module.css';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

type SortField = 'name' | 'existing' | 'potential' | 'total';
type SortOrder = 'asc' | 'desc';

export const CustomerListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState('');
    const [sortBy, setSortBy] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    if (loading) return <div className={styles.pageContainer}>Loading customers...</div>;
    if (!data) return <div className={styles.pageContainer}>No data</div>;

    const filtered = data.customers
        .filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))
        .sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortBy === 'existing') {
                comparison = (a.existing_tcv || 0) - (b.existing_tcv || 0);
            } else if (sortBy === 'potential') {
                comparison = (a.potential_tcv || 0) - (b.potential_tcv || 0);
            } else if (sortBy === 'total') {
                comparison = ((a.existing_tcv || 0) + (a.potential_tcv || 0)) - ((b.existing_tcv || 0) + (b.potential_tcv || 0));
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

    const toggleSort = (field: SortField) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
    };

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <h1>Customers</h1>
                <button onClick={() => navigate('/customer/new')} className="btn-primary">+ New Customer</button>
            </div>
            <div className={styles.controls} style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input 
                    type="text" 
                    placeholder="Filter customers..." 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className={styles.filterInput}
                    style={{ flex: 1, minWidth: '200px' }}
                />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', color: '#9ca3af' }}>
                    Sort by:
                    <button 
                        onClick={() => toggleSort('name')} 
                        className={sortBy === 'name' ? styles.activeSort : styles.sortBtn}
                    >
                        Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </button>
                    <button 
                        onClick={() => toggleSort('existing')} 
                        className={sortBy === 'existing' ? styles.activeSort : styles.sortBtn}
                    >
                        Existing {sortBy === 'existing' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </button>
                    <button 
                        onClick={() => toggleSort('potential')} 
                        className={sortBy === 'potential' ? styles.activeSort : styles.sortBtn}
                    >
                        Potential {sortBy === 'potential' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </button>
                    <button 
                        onClick={() => toggleSort('total')} 
                        className={sortBy === 'total' ? styles.activeSort : styles.sortBtn}
                    >
                        Total {sortBy === 'total' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </button>
                </div>
            </div>
            <div className={styles.list}>
                {filtered.map(c => (
                    <div key={c.id} className={styles.listItem} onClick={() => navigate(`/customer/${c.id}`)}>
                        <div className={styles.itemTitle}>{c.name}</div>
                        <div className={styles.itemDetails}>
                            Existing TCV: ${c.existing_tcv.toLocaleString()} | Potential TCV: ${c.potential_tcv.toLocaleString()} | Total: ${((c.existing_tcv || 0) + (c.potential_tcv || 0)).toLocaleString()}
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && <div className={styles.empty}>No customers found.</div>}
            </div>
        </div>
    );
};
