import React, { useState, useMemo } from 'react';
import { parseISO, addDays, format } from 'date-fns';
import type { ValueStreamData, Sprint } from '@valuestream/shared-types';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { useDeleteWithConfirm } from '../../hooks/useDeleteWithConfirm';
import styles from '../../pages/List.module.css';
import { generateId } from '../../utils/security';
import { PageWrapper } from '../layout/PageWrapper';

// Shared grid template for the listHeader row + every item/draft row, so the
// Name / Dates / Status / Action columns line up vertically across the page.
const SPRINT_GRID_COLUMNS = '2fr 1.5fr 1fr 1fr';

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
    const { showConfirm } = useNotificationContext();
    const deleteWithConfirm = useDeleteWithConfirm();
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
    }, [data]);

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
        const duration = (data.settings.general.sprint_duration_days || 14) - 1;
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

    const handleDelete = (id: string, name: string) => {
        deleteWithConfirm(
            'Delete Sprint',
            `Are you sure you want to delete ${name}? This may affect data mapped to this sprint.`,
            () => deleteSprint(id)
        );
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
            case 'active': return 'var(--accent-primary)';
            case 'past':
            case 'future': return 'var(--text-muted)';
            default: return 'var(--border-secondary)';
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
                    {/*
                      Mirrors the title-band header rendered by GenericListPage so this
                      page reads visually as the same family as Teams / Customers / Work
                      Items. The outer div breaks out of PageWrapper's 32px padding
                      (negative margins) to span edge-to-edge as a --bg-secondary band;
                      the inner title row uses --header-band-height so its bottom
                      divider lines up with the sidebar's "Value Stream" divider.
                    */}
                    <div style={{
                        background: 'var(--bg-secondary)',
                        margin: '-32px -32px 32px -32px',
                        borderBottom: '1px solid var(--border-secondary)',
                    }}>
                        <div
                            className={styles.header}
                            style={{
                                borderBottom: 'none',
                                marginBottom: 0,
                                height: 'var(--header-band-height)',
                                boxSizing: 'border-box',
                                padding: '0 2rem',
                            }}
                        >
                            <h1>Sprint Management</h1>
                            <button onClick={handleStartCreate} className="btn-primary">+ Create Next Sprint</button>
                        </div>
                    </div>

                    <div className={styles.list} style={{ paddingBottom: '100px' }}>
                        {/*
                          Column-grid layout mirrors the Team list (rendered via
                          GenericListPage with columns). The grid template is shared
                          between the listHeader row and every item row so the
                          Name / Dates / Status / Action columns line up vertically.
                        */}
                        <div
                            className={styles.listHeader}
                            style={{ display: 'grid', gridTemplateColumns: SPRINT_GRID_COLUMNS, gap: '16px', padding: '0 16px 8px 16px' }}
                        >
                            <div className={styles.columnHeader}>Name</div>
                            <div className={styles.columnHeader}>Dates</div>
                            <div className={styles.columnHeader}>Status</div>
                            <div className={styles.columnHeader}>Action</div>
                        </div>

                        {sortedQuarters.map(q => (
                            <React.Fragment key={q}>
                                <div className={styles.sectionHeader}>{q}</div>
                                {groupedSprints[q].map((s) => {
                                    const status = getSprintStatus(s);
                                    const isLast = data.sprints[data.sprints.length - 1].id === s.id;
                                    const isFirst = data.sprints[0].id === s.id;

                                    return (
                                        <div
                                            key={s.id}
                                            className={styles.listItem}
                                            style={{
                                                cursor: 'default',
                                                display: 'grid',
                                                gridTemplateColumns: SPRINT_GRID_COLUMNS,
                                                gap: '16px',
                                                alignItems: 'center',
                                                // Subtle highlight for the active sprint — status is already
                                                // shown via the badge column, so the colored left border was
                                                // dropped to match the Team list's flat row look.
                                                backgroundColor: status === 'active' ? 'var(--accent-primary-bg)' : undefined,
                                            }}
                                        >
                                            <div className={styles.itemColumn}>
                                                <input
                                                    type="text"
                                                    value={s.name}
                                                    onChange={e => updateSprint(s.id, { name: e.target.value })}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--text-highlight)',
                                                        fontWeight: 600,
                                                        fontSize: '14px',
                                                        outline: 'none',
                                                        width: '100%',
                                                        padding: 0,
                                                    }}
                                                />
                                            </div>
                                            <div className={styles.itemColumn}>
                                                {s.start_date} to {s.end_date}
                                            </div>
                                            <div className={styles.itemColumn}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    fontSize: '11px',
                                                    textTransform: 'uppercase',
                                                    fontWeight: 'bold',
                                                    padding: '2px 8px',
                                                    borderRadius: '10px',
                                                    backgroundColor: getStatusColor(status),
                                                    color: 'white',
                                                }}>
                                                    {status}
                                                </span>
                                            </div>
                                            <div className={styles.itemColumn}>
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
                                                    <span
                                                        title="Only the first past sprint or the last sprint can be managed."
                                                        style={{ color: 'var(--text-muted)', fontSize: '12px', cursor: 'help' }}
                                                    >
                                                        Locked
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}

                        {isCreating && (
                            <div
                                className={styles.listItem}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: SPRINT_GRID_COLUMNS,
                                    gap: '16px',
                                    alignItems: 'center',
                                    // Dashed accent border calls out the unsaved draft row.
                                    border: '2px dashed var(--accent-primary)',
                                    backgroundColor: 'var(--accent-primary-bg)',
                                    marginTop: '12px',
                                }}
                            >
                                <div className={styles.itemColumn}>
                                    <input
                                        autoFocus
                                        type="text"
                                        value={newSprintDraft.name}
                                        onChange={e => setNewSprintDraft({ ...newSprintDraft, name: e.target.value })}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--accent-text)',
                                            fontWeight: 600,
                                            fontSize: '14px',
                                            outline: 'none',
                                            width: '100%',
                                            padding: 0,
                                        }}
                                    />
                                </div>
                                <div className={styles.itemColumn} style={{ color: 'var(--accent-text)' }}>
                                    {newSprintDraft.start_date} to {newSprintDraft.end_date} (Draft)
                                </div>
                                <div className={styles.itemColumn}>
                                    <span style={{
                                        display: 'inline-block',
                                        fontSize: '11px',
                                        textTransform: 'uppercase',
                                        fontWeight: 'bold',
                                        padding: '2px 8px',
                                        borderRadius: '10px',
                                        backgroundColor: 'var(--accent-primary)',
                                        color: 'white',
                                    }}>
                                        NEW
                                    </span>
                                </div>
                                <div className={styles.itemColumn} style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={handleCreate} className="btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }}>Save</button>
                                    <button onClick={() => setIsCreating(false)} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '12px' }}>Cancel</button>
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
