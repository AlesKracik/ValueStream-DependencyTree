import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData } from '../types/models';
import styles from './List.module.css';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

type SortField = 'name' | 'capacity';
type SortOrder = 'asc' | 'desc';

export const TeamListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState('');
    const [sortBy, setSortBy] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    if (loading) return <div className={styles.pageContainer}>Loading teams...</div>;
    if (!data) return <div className={styles.pageContainer}>No data</div>;

    const filtered = data.teams
        .filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
        .sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortBy === 'capacity') {
                comparison = (a.total_capacity_mds || 0) - (b.total_capacity_mds || 0);
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
                <h1>Teams</h1>
            </div>
            <div className={styles.controls} style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input 
                    type="text" 
                    placeholder="Filter teams..." 
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
                        onClick={() => toggleSort('capacity')} 
                        className={sortBy === 'capacity' ? styles.activeSort : styles.sortBtn}
                    >
                        Capacity {sortBy === 'capacity' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </button>
                </div>
            </div>
            <div className={styles.list}>
                {filtered.map(t => (
                    <div key={t.id} className={styles.listItem} onClick={() => navigate(`/team/${t.id}`)}>
                        <div className={styles.itemTitle}>{t.name}</div>
                        <div className={styles.itemDetails}>
                            Capacity (MDs): {t.total_capacity_mds} | Country: {t.country || 'N/A'}
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && <div className={styles.empty}>No teams found.</div>}
            </div>
        </div>
    );
};
