import React, { useState, useMemo } from 'react';
import { parseISO, addDays, format } from 'date-fns';
import type { ValueStreamData, Sprint } from '../../types/models';
import { useValueStreamContext } from '../../contexts/ValueStreamContext';
import styles from '../../pages/List.module.css';
import { generateId } from '../../utils/security';
import { PageWrapper } from '../layout/PageWrapper';

export interface SprintPageProps {
    data: ValueStreamData | null;
    loading: boolean;
    error: Error | null;
    addSprint: (s: Sprint) => void;
    updateSprint: (id: string, updates: Partial<Sprint>, immediate?: boolean) => Promise<void>;
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
    const { showConfirm } = useValueStreamContext();
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

    const handleArchive = async (id: string, name: string) => {
        const confirmed = await showConfirm('Archive Sprint', `Are you sure you want to archive ${name}? It will no longer appear in the list or ValueStream.`);
        if (confirmed) {
            updateSprint(id, { is_archived: true });
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

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return '#2563eb';
            case 'past':
            case 'future': return '#475569';
            default: return '#334155';
        }
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

                    <div className={styles.list} style={{ paddingBottom: '100px' }}>
                        {sortedQuarters.map(q => (
                            <React.Fragment key={q}>
                                <div className={styles.sectionHeader}>{q}</div>
                                {groupedSprints[q].map((s) => {
                                    const status = getSprintStatus(s);
                                    const isLast = data.sprints[data.sprints.length - 1].id === s.id;
                                    const isFirst = data.sprints[0].id === s.id;
                                    
                                    return (
                                        <div key={s.id} className={styles.listItem} style={{ 
                                            cursor: 'default',
                                            borderLeft: `4px solid ${getStatusColor(status)}`,
                                            backgroundColor: status === 'active' ? 'rgba(37, 99, 235, 0.05)' : undefined
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ flex: 1 }}>
                                                    <input 
                                                        type="text" 
                                                        value={s.name} 
                                                        onChange={e => updateSprint(s.id, { name: e.target.value })}
                                                        style={{ 
                                                            background: 'none', 
                                                            border: 'none', 
                                                            color: '#f1f5f9', 
                                                            fontWeight: 'bold', 
                                                            fontSize: '16px',
                                                            outline: 'none', 
                                                            width: '100%',
                                                            marginBottom: '4px'
                                                        }}
                                                    />
                                                    <div className={styles.itemDetails}>
                                                        {s.start_date} to {s.end_date}
                                                    </div>
                                                </div>
                                                
                                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                    <span style={{ 
                                                        fontSize: '11px', 
                                                        textTransform: 'uppercase', 
                                                        fontWeight: 'bold',
                                                        padding: '2px 8px',
                                                        borderRadius: '10px',
                                                        backgroundColor: getStatusColor(status),
                                                        color: 'white'
                                                    }}>
                                                        {status}
                                                    </span>
                                                    
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {isLast ? (
                                                            <button 
                                                                onClick={() => handleDelete(s.id, s.name)} 
                                                                className="btn-danger" 
                                                                style={{ padding: '4px 12px', fontSize: '12px' }}
                                                            >
                                                                Delete
                                                            </button>
                                                        ) : (isFirst && status === 'past') ? (
                                                            <button 
                                                                onClick={() => handleArchive(s.id, s.name)} 
                                                                className="btn-danger" 
                                                                style={{ padding: '4px 12px', fontSize: '12px' }}
                                                            >
                                                                Archive
                                                            </button>
                                                        ) : (
                                                            <span title="Only the first past sprint or the last sprint can be managed." style={{ color: '#475569', fontSize: '12px', cursor: 'help', width: '55px', textAlign: 'center' }}>Locked</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                    })}
                                    </React.Fragment>
                                    ))}
                        {isCreating && (
                            <div className={styles.listItem} style={{ 
                                border: '2px dashed #3b82f6', 
                                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                                marginTop: '12px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <input 
                                            autoFocus
                                            type="text" 
                                            value={newSprintDraft.name} 
                                            onChange={e => setNewSprintDraft({ ...newSprintDraft, name: e.target.value })}
                                            style={{ 
                                                background: 'none', 
                                                border: 'none', 
                                                color: '#60a5fa', 
                                                fontWeight: 'bold', 
                                                fontSize: '16px',
                                                outline: 'none', 
                                                width: '100%',
                                                marginBottom: '4px'
                                            }}
                                        />
                                        <div className={styles.itemDetails} style={{ color: '#60a5fa' }}>
                                            {newSprintDraft.start_date} to {newSprintDraft.end_date} (Draft)
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                        <span style={{ 
                                            fontSize: '11px', 
                                            textTransform: 'uppercase', 
                                            fontWeight: 'bold',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            backgroundColor: '#3b82f6',
                                            color: 'white'
                                        }}>
                                            NEW
                                        </span>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={handleCreate} className="btn-primary">Save</button>
                                            <button onClick={() => setIsCreating(false)} className="btn-secondary">Cancel</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {data.sprints.length === 0 && !isCreating && (
                        <div className={styles.empty}>No sprints configured. Use the button above to start your timeline.</div>
                    )}
                </>
            )}
        </PageWrapper>
    );
};




