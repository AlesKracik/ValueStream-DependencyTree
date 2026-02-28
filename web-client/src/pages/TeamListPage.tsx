import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData } from '../types/models';
import styles from './List.module.css';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

export const TeamListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState('');

    if (loading) return <div className={styles.pageContainer}>Loading teams...</div>;
    if (!data) return <div className={styles.pageContainer}>No data</div>;

    const filtered = data.teams.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()));

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <h1>Teams</h1>
                {/* Assuming no 'create team' implemented yet, but keeping button for consistency if needed, we'll just navigate to new */}
                {/* <button onClick={() => navigate('/team/new')} className={styles.createBtn}>+ New Team</button> */}
            </div>
            <div className={styles.controls}>
                <input 
                    type="text" 
                    placeholder="Filter teams..." 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className={styles.filterInput}
                />
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
