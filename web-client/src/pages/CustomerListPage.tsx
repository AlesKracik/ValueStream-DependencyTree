import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData } from '../types/models';
import styles from './List.module.css';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

export const CustomerListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState('');

    if (loading) return <div className={styles.pageContainer}>Loading customers...</div>;
    if (!data) return <div className={styles.pageContainer}>No data</div>;

    const filtered = data.customers.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <h1>Customers</h1>
                <button onClick={() => navigate('/customer/new')} className={styles.createBtn}>+ New Customer</button>
            </div>
            <div className={styles.controls}>
                <input 
                    type="text" 
                    placeholder="Filter customers..." 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className={styles.filterInput}
                />
            </div>
            <div className={styles.list}>
                {filtered.map(c => (
                    <div key={c.id} className={styles.listItem} onClick={() => navigate(`/customer/${c.id}`)}>
                        <div className={styles.itemTitle}>{c.name}</div>
                        <div className={styles.itemDetails}>
                            Existing TCV: ${c.existing_tcv.toLocaleString()} | Potential TCV: ${c.potential_tcv.toLocaleString()}
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && <div className={styles.empty}>No customers found.</div>}
            </div>
        </div>
    );
};
