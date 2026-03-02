import React, { useState, useMemo } from 'react';
import { parseISO, addDays, format } from 'date-fns';
import type { DashboardData, Sprint } from '../../types/models';
import { useDashboardContext } from '../../contexts/DashboardContext';
import styles from '../../pages/List.module.css';
import { generateId } from '../../utils/security';
import { PageWrapper } from '../layout/PageWrapper';

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

    const groupedSprints = useMemo(() => {
        if (!data) return {};
        const groups: Record<string, Sprint[]> = {};
        data.sprints.forEach(s => {
            const q = s.quarter || 'TBD';
            if (!groups[q]) groups[q] = [];
            groups[q].push(s);
        });
        return groups;
    }, [data?.sprints]);

    const sortedQuarters = useMemo(() => {
        return Object.keys(groupedSprints).sort((a, b) => {
            if (a === 'TBD') return 1;
            if (b === 'TBD') return -1;
            return a.localeCompare(b);
        });
    }, [groupedSprints]);

    const handleStartCreate = () => {
        if (!data) return;
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
        if (!data) return;
        const newSprint: Sprint = {
            id: generateId('s'),
            name: newSprintDraft.name || 'New Sprint',
            start_date: newSprintDraft.start_date || '',
            end_date: newSprintDraft.end_date || '',
            quarter: 'TBD' // Computed on server or during save
        };
        addSprint(newSprint);
        setIsCreating(false);
    };

    const handleDelete = async (id: string, name: string) => {
        const confirmed = await showConfirm('Delete Sprint', `Are you sure you want to delete ${name}? This may affect data mapped to this sprint.`);
        if (confirmed) {
            deleteSprint(id);
        }
    };

    const getSprintStatus = (sprint: Sprint) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = parseISO(sprint.start_date);
        const end = parseISO(sprint.end_date);
        
        if (today > end) return 'past';
        if (today >= start && today <= end) return 'active';
        return 'future';
    };

    return (
        <PageWrapper
            loading={loading}
            error={error}
            data={data}
            loadingMessage="Loading sprints..."
            emptyMessage="No data available."
        >
            {data && (
                <>
                    <header className={styles.header}>
                        <h1>Sprint Management</h1>
                        <button onClick={handleStartCreate} className="btn-primary">+ Create Next Sprint</button>
                    </header>

                    <div className={styles.list} style={{ overflow: 'visible' }}>
                        <table className={styles.table} style={{ width: '100%', borderCollapse: 'collapse', color: '#f1f5f9' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
                                    <th style={{ padding: '12px' }}>Name</th>
                                    <th style={{ padding: '12px' }}>Start Date</th>
                                    <th style={{ padding: '12px' }}>End Date</th>
                                    <th style={{ padding: '12px' }}>Status</th>
                                    <th style={{ padding: '12px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedQuarters.map(q => (
                                    <React.Fragment key={q}>
                                        <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
                                            <td colSpan={5} style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 'bold', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {q}
                                            </td>
                                        </tr>
                                        {groupedSprints[q].map((s) => {
                                            const status = getSprintStatus(s);
                                            const isLast = data.sprints[data.sprints.length - 1].id === s.id;
                                            
                                            return (
                                                <tr key={s.id} style={{ 
                                                    borderBottom: '1px solid #1e293b',
                                                    backgroundColor: status === 'active' ? 'rgba(37, 99, 235, 0.1)' : 'transparent'
                                                }}>
                                                    <td style={{ padding: '12px' }}>
                                                        <input 
                                                            type="text" 
                                                            value={s.name} 
                                                            onChange={e => updateSprint(s.id, { name: e.target.value })}
                                                            style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: status === 'active' ? 'bold' : 'normal', outline: 'none', width: '100%' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '12px', color: '#94a3b8' }}>{s.start_date}</td>
                                                    <td style={{ padding: '12px', color: '#94a3b8' }}>{s.end_date}</td>
                                                    <td style={{ padding: '12px' }}>
                                                        <span style={{ 
                                                            fontSize: '11px', 
                                                            textTransform: 'uppercase', 
                                                            fontWeight: 'bold',
                                                            padding: '2px 8px',
                                                            borderRadius: '10px',
                                                            backgroundColor: status === 'active' ? '#2563eb' : (status === 'past' ? '#334155' : '#065f46'),
                                                            color: 'white'
                                                        }}>
                                                            {status}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px' }}>
                                                        {isLast ? (
                                                            <button onClick={() => handleDelete(s.id, s.name)} className="btn-danger" style={{ padding: '4px 8px', fontSize: '12px' }}>Delete</button>
                                                        ) : (
                                                            <span title="Only the last sprint can be deleted to maintain sequence." style={{ color: '#475569', fontSize: '12px', cursor: 'help' }}>Locked</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}

                                {isCreating && (
                                    <tr style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderBottom: '1px solid #059669' }}>
                                        <td style={{ padding: '12px' }}>
                                            <input 
                                                autoFocus
                                                type="text" 
                                                value={newSprintDraft.name} 
                                                onChange={e => setNewSprintDraft({ ...newSprintDraft, name: e.target.value })}
                                                style={{ background: 'none', border: 'none', color: '#10b981', fontWeight: 'bold', outline: 'none', width: '100%' }}
                                            />
                                        </td>
                                        <td style={{ padding: '12px', color: '#10b981' }}>{newSprintDraft.start_date}</td>
                                        <td style={{ padding: '12px', color: '#10b981' }}>{newSprintDraft.end_date}</td>
                                        <td style={{ padding: '12px' }}><span style={{ fontSize: '11px', fontWeight: 'bold', color: '#10b981' }}>NEW</span></td>
                                        <td style={{ padding: '12px', display: 'flex', gap: '8px' }}>
                                            <button onClick={handleCreate} className="btn-primary" style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#10b981' }}>Save</button>
                                            <button onClick={() => setIsCreating(false)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }}>Cancel</button>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {data.sprints.length === 0 && !isCreating && (
                        <div className={styles.empty}>No sprints configured.</div>
                    )}
                </>
            )}
        </PageWrapper>
    );
};
