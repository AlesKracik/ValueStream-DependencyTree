import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData } from '../types/models';
import styles from './List.module.css';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

export const DashboardListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState('');

    if (loading) return <div className={styles.pageContainer}>Loading dashboards...</div>;
    if (!data) return <div className={styles.pageContainer}>No data</div>;

    const dashboards = data.dashboards || [];
    const filtered = dashboards.filter(d => d.name.toLowerCase().includes(filter.toLowerCase()));

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <h1>Dashboards</h1>
                <button onClick={() => navigate('/dashboard/new')} className="btn-primary">+ New Dashboard</button>
            </div>
            <div className={styles.controls}>
                <input 
                    type="text" 
                    placeholder="Filter dashboards..." 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className={styles.filterInput}
                />
            </div>
            <div className={styles.list}>
                {filtered.map(d => (
                    <div key={d.id} className={styles.listItem} onClick={() => navigate(`/dashboard/${d.id}`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div className={styles.itemTitle}>{d.name}</div>
                            <div className={styles.itemDetails}>
                                {d.description}
                            </div>
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && <div className={styles.empty}>No dashboards found.</div>}
            </div>
        </div>
    );
};
