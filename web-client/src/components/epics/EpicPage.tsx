import React, { useState } from 'react';
import { parseISO } from 'date-fns';
import type { DashboardData, Epic } from '../../types/models';
import { authorizedFetch } from "../../utils/api";
import { useDashboardContext } from '../../contexts/DashboardContext';
import styles from '../customers/CustomerPage.module.css';
import { sanitizeUrl } from '../../utils/security';
import { PageWrapper } from '../layout/PageWrapper';

export interface EpicPageProps {
    epicId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateEpic: (id: string, updates: Partial<Epic>) => void;
    deleteEpic: (id: string) => void;
    
}

export const EpicPage: React.FC<EpicPageProps> = ({
    epicId,
    onBack,
    data,
    loading,
    error,
    updateEpic,
    deleteEpic
}) => {
    const { showAlert, showConfirm } = useDashboardContext();
    const [syncing, setSyncing] = useState<boolean>(false);

    const epic = data?.epics.find(e => e.id === epicId);

    const getActiveSprintStart = () => {
        if (!data) return new Date();
        const today = new Date();
        const activeSprint = data.sprints.find(s => {
            const start = parseISO(s.start_date);
            const end = parseISO(s.end_date);
            return today >= start && today <= end;
        }) || data.sprints[0];
        return activeSprint ? parseISO(activeSprint.start_date) : new Date();
    };

    const updateEpicWithOverlapCheck = async (id: string, updates: Partial<Epic>) => {
        if (!epic) return;
        // Validation: Start Date must be before End Date
        const newStart = updates.target_start || epic.target_start;
        const newEnd = updates.target_end || epic.target_end;

        if (newStart && newEnd && newStart >= newEnd) {
            await showAlert('Invalid Dates', 'The Start Date must be before the End Date.');
            return;
        }

        // 1. If start date is changing, check if we're moving it past already "frozen" work
        if (updates.target_start && updates.target_start !== epic.target_start) {
            const activeStart = getActiveSprintStart();
            const currentStart = epic.target_start ? parseISO(epic.target_start) : null;
            
            // If the current start is in the past (before active sprint)
            if (currentStart && currentStart < activeStart) {
                const confirmed = await showConfirm(
                    'Historical Work Warning',
                    'Moving the start date will clear any historical work overrides for this epic. Do you want to proceed?'
                );
                if (!confirmed) return;
                
                // Clear overrides as they are no longer valid for the new timeline
                updates.sprint_effort_overrides = undefined;
            }
        }

        updateEpic(id, updates);
    };

    const handleSync = async () => {
        if (!epic || epic.jira_key === 'TBD') {
            await showAlert('Invalid Key', 'Please enter a valid Jira Key before syncing.');
            return;
        }
        setSyncing(true);
        try {
            const res = await authorizedFetch(`/api/jira/issue?jira_key=${epic.jira_key}`);
            const json = await res.ok ? await res.json() : null;
            if (json && json.success) {
                const updates = {
                    name: json.data.summary,
                    effort_md: json.data.effort_md,
                    target_start: json.data.target_start,
                    target_end: json.data.target_end,
                    team_id: data?.teams.find(t => t.name.toLowerCase() === json.data.team?.toLowerCase())?.id || epic.team_id
                };
                updateEpicWithOverlapCheck(epic.id, updates);
            } else {
                await showAlert('Sync Failed', json?.error || 'Failed to sync epic from Jira.');
            }
        } catch (err) {
            console.error('Sync failed', err);
        } finally {
            setSyncing(false);
        }
    };

    const handleDelete = async () => {
        if (!epic) return;
        const confirmed = await showConfirm('Delete Epic', `Are you sure you want to delete ${epic.jira_key}?`);
        if (!confirmed) return;
        deleteEpic(epic.id);
        onBack();
    };

    return (
        <PageWrapper
            loading={loading}
            error={error}
            data={data}
            loadingMessage="Loading epic details..."
            emptyMessage="No data available."
        >
            {!epic ? (
                <div className={styles.empty}>Epic not found.</div>
            ) : (
                <>
                    <header className={styles.header}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            <button onClick={onBack} className="btn-secondary">← Back</button>
                            <h1>{epic.jira_key}: {epic.name}</h1>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={handleSync} className="btn-primary" disabled={syncing}>
                                {syncing ? 'Syncing...' : 'Sync from Jira'}
                            </button>
                            <button onClick={handleDelete} className="btn-danger">Delete Epic</button>
                        </div>
                    </header>

                    <div className={styles.content}>
                        <section className={styles.card}>
                            <h2>Epic Configuration</h2>
                            <div className={styles.formGrid}>
                                <label>
                                    Jira Key:
                                    <input 
                                        type="text" 
                                        value={epic.jira_key} 
                                        onChange={e => updateEpic(epic.id, { jira_key: e.target.value })}
                                    />
                                </label>
                                <label>
                                    Name:
                                    <input 
                                        type="text" 
                                        value={epic.name} 
                                        onChange={e => updateEpic(epic.id, { name: e.target.value })}
                                    />
                                </label>
                            </div>

                            <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                                <label>
                                    Effort (MDs):
                                    <input 
                                        type="number" 
                                        value={epic.effort_md} 
                                        onChange={e => updateEpic(epic.id, { effort_md: parseInt(e.target.value) || 0 })}
                                    />
                                </label>
                                <label>
                                    Team:
                                    <select 
                                        value={epic.team_id} 
                                        onChange={e => updateEpic(epic.id, { team_id: e.target.value })}
                                    >
                                        {data?.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </label>
                            </div>

                            <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                                <label>
                                    Target Start:
                                    <input 
                                        type="date" 
                                        value={epic.target_start || ''} 
                                        onChange={e => updateEpicWithOverlapCheck(epic.id, { target_start: e.target.value })}
                                    />
                                </label>
                                <label>
                                    Target End:
                                    <input 
                                        type="date" 
                                        value={epic.target_end || ''} 
                                        onChange={e => updateEpicWithOverlapCheck(epic.id, { target_end: e.target.value })}
                                    />
                                </label>
                            </div>

                            <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                                <label>
                                    External URL:
                                    <input 
                                        type="text" 
                                        placeholder="https://..."
                                        value={epic.external_url || ''} 
                                        onChange={e => updateEpic(epic.id, { external_url: sanitizeUrl(e.target.value) })}
                                    />
                                </label>
                                {epic.external_url && (
                                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '8px' }}>
                                        <a href={epic.external_url} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '14px' }}>
                                            Open Link ↗
                                        </a>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className={styles.card}>
                            <h2>Effort Overrides (Actuals)</h2>
                            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '16px' }}>
                                Values captured when a sprint ends. These are used instead of calculated proportions for historical data.
                            </p>
                            {!epic.sprint_effort_overrides || Object.keys(epic.sprint_effort_overrides).length === 0 ? (
                                <div style={{ color: '#64748b', fontSize: '14px', fontStyle: 'italic' }}>No historical overrides recorded.</div>
                            ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                    {Object.entries(epic.sprint_effort_overrides).map(([sprintId, value]) => (
                                        <div key={sprintId} style={{ padding: '8px 12px', backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '6px' }}>
                                            <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>Sprint ID: {sprintId}</span>
                                            <span style={{ fontWeight: '600', color: '#f1f5f9' }}>{value} MDs</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </>
            )}
        </PageWrapper>
    );
};
