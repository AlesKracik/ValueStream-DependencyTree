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
        const duration = (data.settings.sprint_duration_days || 14) - 1;
        const nextEnd = addDays(nextStart, duration);
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

    // Group sprints by quarter (now persisted)
    const groupedSprints: { label: string, sprints: (Sprint & { index: number })[] }[] = [];
    data.sprints.forEach((s, index) => {
        const label = s.quarter || 'Unassigned Quarter';
        
        let group = groupedSprints.find(g => g.label === label);
        if (!group) {
            group = { label, sprints: [] };
            groupedSprints.push(group);
        }
        group.sprints.push({ ...s, index });
    });

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <h1>Sprints</h1>
                <button 
                    className="btn-primary" 
                    onClick={handleStartCreate}
                    disabled={isCreating}
                >
                    + New Sprint
                </button>
            </div>

            <div className={styles.list}>
                {groupedSprints.map((group) => (
                    <React.Fragment key={group.label}>
                        <div style={{ 
                            padding: '16px 8px 8px 8px', 
                            fontSize: '14px', 
                            fontWeight: '700', 
                            color: '#60a5fa', 
                            textTransform: 'uppercase', 
                            letterSpacing: '0.05em',
                            borderBottom: '1px solid #374151',
                            marginTop: '16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span>{group.label}</span>
                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>{group.sprints.length} Sprints</span>
                        </div>
                        {group.sprints.map((s) => {
                            const today = new Date();
                            const start = parseISO(s.start_date);
                            const end = parseISO(s.end_date);
                            const isLast = s.index === data.sprints.length - 1;
                            
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
                                <div key={s.id} className={styles.listItem} style={{ cursor: 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: '12px', borderLeft: '2px solid #374151' }}>
                                    <div style={{ flex: 1 }}>
                                        <input 
                                            type="text" 
                                            value={s.name} 
                                            onChange={e => updateSprint(s.id, { name: e.target.value })}
                                            className={styles.itemTitle}
                                            style={{ 
                                                backgroundColor: 'transparent', 
                                                border: '1px solid transparent',
                                                width: '100%',
                                                outline: 'none',
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
                                                className="btn-danger"
                                                style={{ padding: '4px 8px', fontSize: '12px' }}
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
                    </React.Fragment>
                ))}

                {isCreating && (
                    <div className={styles.listItem} style={{ backgroundColor: 'rgba(37, 99, 235, 0.1)', border: '1px dashed #3b82f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                            <input 
                                type="text" 
                                value={newSprintDraft.name} 
                                onChange={e => setNewSprintDraft(prev => ({ ...prev, name: e.target.value }))}
                                style={{ 
                                    fontSize: '16px',
                                    fontWeight: '600',
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
                                className="btn-primary"
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                                Create
                            </button>
                            <button 
                                onClick={() => setIsCreating(false)} 
                                className="btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '12px' }}
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
