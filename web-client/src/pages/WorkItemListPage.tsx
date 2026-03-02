import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData } from '../types/models';
import styles from './List.module.css';
import { calculateWorkItemEffort, calculateWorkItemTcv } from '../utils/businessLogic';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

type SortField = 'name' | 'score' | 'tcv' | 'effort';
type SortOrder = 'asc' | 'desc';

export const WorkItemListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState('');
    const [sortBy, setSortBy] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    const processedItems = useMemo(() => {
        if (!data) return [];
        return data.workItems.map(w => ({
            ...w,
            calculatedEffort: calculateWorkItemEffort(w, data.epics),
            calculatedTcv: calculateWorkItemTcv(w, data.customers)
        }));
    }, [data]);

    if (loading) return <div className={styles.pageContainer}>Loading work items...</div>;
    if (!data) return <div className={styles.pageContainer}>No data</div>;

    const filtered = processedItems
        .filter(w => w.name.toLowerCase().includes(filter.toLowerCase()))
        .sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortBy === 'score') {
                comparison = (a.score || 0) - (b.score || 0);
            } else if (sortBy === 'tcv') {
                comparison = a.calculatedTcv - b.calculatedTcv;
            } else if (sortBy === 'effort') {
                comparison = a.calculatedEffort - b.calculatedEffort;
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
                <h1>Work Items</h1>
                <button onClick={() => navigate('/workitem/new')} className="btn-primary">+ New Work Item</button>
            </div>
            <div className={styles.controls} style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input 
                    type="text" 
                    placeholder="Filter work items..." 
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
                        onClick={() => toggleSort('score')} 
                        className={sortBy === 'score' ? styles.activeSort : styles.sortBtn}
                    >
                        Score {sortBy === 'score' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </button>
                    <button 
                        onClick={() => toggleSort('tcv')} 
                        className={sortBy === 'tcv' ? styles.activeSort : styles.sortBtn}
                    >
                        TCV {sortBy === 'tcv' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </button>
                    <button 
                        onClick={() => toggleSort('effort')} 
                        className={sortBy === 'effort' ? styles.activeSort : styles.sortBtn}
                    >
                        Effort {sortBy === 'effort' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </button>
                </div>
            </div>
            <div className={styles.list}>
                {filtered.map(w => (
                    <div key={w.id} className={styles.listItem} onClick={() => navigate(`/workitem/${w.id}`)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className={styles.itemTitle}>{w.name}</div>
                            <div style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 'bold', backgroundColor: 'rgba(96, 165, 250, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                                Score: {Math.round(w.score || 0)}
                            </div>
                        </div>
                        <div className={styles.itemDetails}>
                            Effort: {w.calculatedEffort} MDs | TCV: ${w.calculatedTcv.toLocaleString()} | Released in: {data.sprints.find(s => s.id === w.released_in_sprint_id)?.name || 'Not Released'}
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && <div className={styles.empty}>No work items found.</div>}
            </div>
        </div>
    );
};
