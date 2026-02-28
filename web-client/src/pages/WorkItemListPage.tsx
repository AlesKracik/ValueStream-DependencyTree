import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData } from '../types/models';
import styles from './List.module.css';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

export const WorkItemListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState('');

    if (loading) return <div className={styles.pageContainer}>Loading work items...</div>;
    if (!data) return <div className={styles.pageContainer}>No data</div>;

    const filtered = data.workItems.filter(w => w.name.toLowerCase().includes(filter.toLowerCase()));

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <h1>Work Items</h1>
                <button onClick={() => navigate('/workitem/new')} className={styles.createBtn}>+ New Work Item</button>
            </div>
            <div className={styles.controls}>
                <input 
                    type="text" 
                    placeholder="Filter work items..." 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className={styles.filterInput}
                />
            </div>
            <div className={styles.list}>
                {filtered.map(w => (
                    <div key={w.id} className={styles.listItem} onClick={() => navigate(`/workitem/${w.id}`)}>
                        <div className={styles.itemTitle}>{w.name}</div>
                        <div className={styles.itemDetails}>
                            Total Effort (MDs): {w.total_effort_mds} | Released in: {w.released_in_sprint_id || 'Not Released'}
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && <div className={styles.empty}>No work items found.</div>}
            </div>
        </div>
    );
};
