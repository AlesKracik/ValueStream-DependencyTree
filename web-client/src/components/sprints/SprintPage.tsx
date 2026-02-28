import React, { useState } from 'react';
import { parseISO, addDays, format } from 'date-fns';
import type { DashboardData, Sprint } from '../../types/models';
import { useDashboardContext } from '../../contexts/DashboardContext';
import styles from '../../pages/List.module.css';

export interface SprintPageProps {
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    addSprint: (s: Sprint) => void;
    updateSprint: (id: string, updates: Partial<Sprint>) => void;
    deleteSprint: (id: string) => void;
}

export const SprintPage: React.FC<SprintPageProps> = ({
    data,
    loading,
    error,
    addSprint,
    updateSprint,
    deleteSprint
}) => {
    const { showConfirm } = useDashboardContext();
    const [isCreating, setIsCreating] = useState(false);

    // Draft states for new sprint creation
    const [newSprintDraft, setNewSprintDraft] = useState<Partial<Sprint>>({ name: '', start_date: '', end_date: '' });

    if (loading) return <div className={styles.pageContainer}>Loading sprints...</div>;
    if (error) return <div className={styles.pageContainer}>Error: {error.message}</div>;
    if (!data) return <div className={styles.pageContainer}>No data available.</div>;

    const handleStartCreate = () => {
        const lastSprint = data.sprints[data.sprints.length - 1];
        const nextStart = lastSprint ? addDays(parseISO(lastSprint.end_date), 1) : new Date();
        const nextEnd = addDays(nextStart, 13);
        const nextNumber = lastSprint ? (parseInt(lastSprint.name.replace('Sprint ', '')) + 1 || data.sprints.length + 1) : 1;
        
        setNewSprintDraft({
            name: `Sprint ${nextNumber}`,
            start_date: format(nextStart, 'yyyy-MM-dd'),
            end_date: format(nextEnd, 'yyyy-MM-dd')
        });
        setIsCreating(true);
    };

    const handleCreate = () => {
        if (!newSprintDraft.name || !newSprintDraft.start_date || !newSprintDraft.end_date) return;
        
        const newSprint: Sprint = {
            id: `s${Date.now()}`,
            name: newSprintDraft.name,
            start_date: newSprintDraft.start_date,
            end_date: newSprintDraft.end_date
        };

        addSprint(newSprint);
        setIsCreating(false);
    };

    const handleDelete = async (sprint: Sprint) => {
        const confirmed = await showConfirm('Delete Sprint', `Are you sure you want to delete ${sprint.name}? This may affect Gantt bar alignments.`);
        if (!confirmed) return;
        deleteSprint(sprint.id);
    };

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <h1>Sprints</h1>
                <button 
                    className={styles.createBtn} 
                    onClick={handleStartCreate}
                    disabled={isCreating}
                >
                    + New Sprint
                </button>
            </div>

            <div className={styles.list}>
                {data.sprints.map((s, index) => {
                    const today = new Date();
                    const start = parseISO(s.start_date);
                    const end = parseISO(s.end_date);
                    const isLast = index === data.sprints.length - 1;
                    
                    let status = 'Future';
                    let statusColor = '#9ca3af';
                    if (today >= start && today <= end) {
                        status = 'Active';
                        statusColor = '#10b981';
                    } else if (today > end) {
                        status = 'Past';
                        statusColor = '#6b7280';
                    }

                    return (
                        <div key={s.id} className={styles.listItem} style={{ cursor: 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                                <input 
                                    type="text" 
                                    value={s.name} 
                                    onChange={e => updateSprint(s.id, { name: e.target.value })}
                                    className={styles.itemTitle}
                                    style={{ 
                                        backgroundColor: 'transparent', 
                                        border: '1px solid transparent', 
                                        borderRadius: '4px', 
                                        padding: '4px 8px',
                                        width: '100%',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                    onFocus={(e) => {
                                        e.target.style.backgroundColor = '#0f172a';
                                        e.target.style.borderColor = '#3b82f6';
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.backgroundColor = 'transparent';
                                        e.target.style.borderColor = 'transparent';
                                    }}
                                />
                                <div className={styles.itemDetails}>
                                    {s.start_date} to {s.end_date} • <span style={{ color: statusColor, fontWeight: 'bold' }}>{status}</span>
                                </div>
                            </div>
                            <div>
                                {isLast ? (
                                    <button 
                                        onClick={() => handleDelete(s)} 
                                        style={{ 
                                            padding: '6px 12px', 
                                            backgroundColor: 'transparent', 
                                            color: '#ef4444', 
                                            border: '1px solid #ef4444', 
                                            borderRadius: '6px', 
                                            cursor: 'pointer', 
                                            fontSize: '12px',
                                            fontWeight: '600'
                                        }}
                                    >
                                        Delete
                                    </button>
                                ) : (
                                    <span style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>Locked</span>
                                )}
                            </div>
                        </div>
                    );
                })}

                {isCreating && (
                    <div className={styles.listItem} style={{ backgroundColor: 'rgba(37, 99, 235, 0.1)', border: '1px dashed #3b82f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                            <input 
                                type="text" 
                                value={newSprintDraft.name} 
                                onChange={e => setNewSprintDraft(prev => ({ ...prev, name: e.target.value }))}
                                style={{ 
                                    backgroundColor: '#0f172a', 
                                    color: '#fff', 
                                    border: '1px solid #3b82f6', 
                                    borderRadius: '4px', 
                                    padding: '4px 8px',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    width: '100%'
                                }}
                                autoFocus
                            />
                            <div className={styles.itemDetails}>
                                {newSprintDraft.start_date} to {newSprintDraft.end_date} • <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>NEW</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                                onClick={handleCreate} 
                                style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                            >
                                Create
                            </button>
                            <button 
                                onClick={() => setIsCreating(false)} 
                                style={{ padding: '6px 12px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #4b5563', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {data.sprints.length === 0 && !isCreating && (
                    <div className={styles.empty}>No sprints configured.</div>
                )}
            </div>
        </div>
    );
};
