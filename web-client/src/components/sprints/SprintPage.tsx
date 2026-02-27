import React, { useState } from 'react';
import { parseISO, addDays, format } from 'date-fns';
import type { DashboardData, Sprint } from '../../types/models';
import { useDashboardContext } from '../../contexts/DashboardContext';
import styles from '../customers/CustomerPage.module.css';

export interface SprintPageProps {
    sprintId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    addSprint: (s: Sprint) => void;
    updateSprint: (id: string, updates: Partial<Sprint>) => void;
    deleteSprint: (id: string) => void;
    onNavigateToSprint: (id: string) => void;
    saveDashboardData: (data: DashboardData) => Promise<void>;
}

export const SprintPage: React.FC<SprintPageProps> = ({
    sprintId,
    onBack,
    data,
    loading,
    error,
    addSprint,
    updateSprint,
    deleteSprint,
    onNavigateToSprint,
    saveDashboardData
}) => {
    const { showConfirm } = useDashboardContext();
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const isNew = sprintId === 'new';

    // Draft states for new sprint creation
    const [newSprintDraft, setNewSprintDraft] = useState<Partial<Sprint>>(() => {
        if (!data || data.sprints.length === 0) return { name: 'Sprint 1', start_date: format(new Date(), 'yyyy-MM-dd'), end_date: format(addDays(new Date(), 13), 'yyyy-MM-dd') };
        const lastSprint = data.sprints[data.sprints.length - 1];
        const nextStart = addDays(parseISO(lastSprint.end_date), 1);
        const nextEnd = addDays(nextStart, 13);
        const nextNumber = parseInt(lastSprint.name.replace('Sprint ', '')) + 1 || data.sprints.length + 1;
        return {
            name: `Sprint ${nextNumber}`,
            start_date: format(nextStart, 'yyyy-MM-dd'),
            end_date: format(nextEnd, 'yyyy-MM-dd')
        };
    });

    if (loading) return <div className={styles.pageContainer}>Loading sprint details...</div>;
    if (error) return <div className={styles.pageContainer}>Error: {error.message}</div>;
    if (!data) return <div className={styles.pageContainer}>No data available.</div>;

    const sprint = isNew ? newSprintDraft as Sprint : data.sprints.find(s => s.id === sprintId);
    if (!sprint) return <div className={styles.pageContainer}>Sprint not found.</div>;

    const handleSave = async () => {
        setSaveStatus('saving');
        try {
            if (isNew) {
                const newId = `s${Date.now()}`;
                const newSprint: Sprint = {
                    id: newId,
                    name: newSprintDraft.name || 'New Sprint',
                    start_date: newSprintDraft.start_date!,
                    end_date: newSprintDraft.end_date!
                };

                addSprint(newSprint);
                const newData = { ...data, sprints: [...data.sprints, newSprint].sort((a, b) => a.start_date.localeCompare(b.start_date)) };
                await saveDashboardData(newData);
                setSaveStatus('saved');
                setTimeout(() => {
                    setSaveStatus('idle');
                    onBack();
                }, 1000);
            } else {
                await saveDashboardData(data);
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus('idle'), 2000);
            }
        } catch (err) {
            console.error('Save failed', err);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const handleDelete = async () => {
        const confirmed = await showConfirm('Delete Sprint', `Are you sure you want to delete ${sprint.name}? This may affect Gantt bar alignments.`);
        if (!confirmed) return;
        setSaveStatus('saving');
        try {
            deleteSprint(sprintId);
            const newData = {
                ...data,
                sprints: data.sprints.filter(s => s.id !== sprintId)
            };
            await saveDashboardData(newData);
            onBack();
        } catch (err) {
            console.error('Delete failed', err);
            setSaveStatus('error');
        }
    };

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className={styles.backBtn} onClick={onBack}>
                        ← Back to Dashboard
                    </button>
                    <h1>Sprint Management</h1>
                </div>
            </div>

            <div className={styles.content}>
                <section className={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2>Sprint Schedule</h2>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                className={styles.saveBtn} 
                                style={{ backgroundColor: '#2563eb', borderColor: '#1d4ed8', padding: '8px 16px' }}
                                onClick={handleSave}
                                disabled={saveStatus === 'saving'}
                            >
                                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Error!' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Draft Row for New Sprint */}
                            {isNew && (
                                <tr style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderLeft: '4px solid #10b981' }}>
                                    <td>
                                        <input 
                                            type="text" 
                                            value={newSprintDraft.name} 
                                            onChange={e => setNewSprintDraft(prev => ({ ...prev, name: e.target.value }))}
                                            style={{ width: '100%', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }}
                                            autoFocus
                                        />
                                    </td>
                                    <td style={{ color: '#9ca3af' }}>{newSprintDraft.start_date}</td>
                                    <td style={{ color: '#9ca3af' }}>{newSprintDraft.end_date}</td>
                                    <td style={{ color: '#10b981', fontWeight: 'bold' }}>NEW</td>
                                    <td>
                                        <button onClick={onBack} className={styles.dangerBtn} style={{ padding: '4px 8px' }}>Cancel</button>
                                    </td>
                                </tr>
                            )}

                            {data.sprints.map(s => {
                                const today = new Date();
                                const start = parseISO(s.start_date);
                                const end = parseISO(s.end_date);
                                const isSelected = s.id === sprintId;
                                
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
                                    <tr key={s.id} style={isSelected ? { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderLeft: '4px solid #3b82f6' } : {}}>
                                        <td>
                                            {isSelected ? (
                                                <input 
                                                    type="text" 
                                                    value={s.name} 
                                                    onChange={e => updateSprint(s.id, { name: e.target.value })}
                                                    style={{ width: '100%', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }}
                                                    autoFocus
                                                />
                                            ) : (
                                                s.name
                                            )}
                                        </td>
                                        <td style={{ color: '#9ca3af' }}>{s.start_date}</td>
                                        <td style={{ color: '#9ca3af' }}>{s.end_date}</td>
                                        <td style={{ color: statusColor, fontWeight: 'bold' }}>{status}</td>
                                        <td>
                                            {isSelected && (
                                                <button onClick={handleDelete} className={styles.dangerBtn} style={{ padding: '4px 8px' }}>Delete</button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    
                    {!isNew && (
                        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
                            <button 
                                className={styles.primaryBtn} 
                                style={{ backgroundColor: '#10b981', borderColor: '#059669', padding: '12px 24px', fontSize: '16px' }}
                                onClick={() => onNavigateToSprint('new')}
                            >
                                + Create Next Sprint
                            </button>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};
