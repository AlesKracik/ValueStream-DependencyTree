import React, { useState } from 'react';
import { parseISO, differenceInDays, min, max } from 'date-fns';
import type { DashboardData, Epic } from '../../types/models';
import styles from '../customers/CustomerPage.module.css';

export interface EpicPageProps {
    epicId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateEpic: (id: string, updates: Partial<Epic>) => void;
    saveDashboardData: (data: DashboardData) => Promise<void>;
}

export const EpicPage: React.FC<EpicPageProps> = ({
    epicId,
    onBack,
    data,
    loading,
    error,
    updateEpic,
    saveDashboardData
}) => {
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [syncing, setSyncing] = useState<boolean>(false);
    if (loading) return <div>Loading epic details...</div>;
    if (error) return <div>Error: {error.message}</div>;
    if (!data) return <div>No data available</div>;

    const epic = data.epics.find(e => e.id === epicId);
    if (!epic) return <div>Epic not found.</div>;

    const handleSave = async () => {
        setSaveStatus('saving');
        try {
            await saveDashboardData(data);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (err) {
            console.error('Failed to save data:', err);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const handleSyncJira = async () => {
        if (!epic.jira_key) return;
        if (!data.settings.jira_base_url) {
            alert('Please configure Jira Base URL in Settings first.');
            return;
        }
        setSyncing(true);
        try {
            const response = await fetch('/api/jira/issue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jira_key: epic.jira_key,
                    jira_base_url: data.settings.jira_base_url,
                    jira_api_version: data.settings.jira_api_version || '3',
                    jira_api_token: data.settings.jira_api_token
                })
            });

            const resData = await response.json();
            if (!response.ok || !resData.success) {
                throw new Error(resData.error || 'Failed to fetch Jira data');
            }

            const issue = resData.data;
            const fields = issue.fields;
            const names = issue.names;

            let targetStartKey = '';
            let targetEndKey = '';
            let teamKey = '';

            Object.entries(names as Record<string, string>).forEach(([key, name]) => {
                if (name === 'Target start') targetStartKey = key;
                if (name === 'Target end') targetEndKey = key;
                if (name === 'Team') teamKey = key;
            });

            const updates: Partial<Epic> = {};
            if (fields.summary) updates.name = fields.summary;
            if (fields.timeestimate !== undefined && fields.timeestimate !== null) {
                updates.remaining_md = Math.round(fields.timeestimate / 28800);
            }

            if (targetStartKey && fields[targetStartKey]) updates.target_start = fields[targetStartKey];
            if (targetEndKey && fields[targetEndKey]) updates.target_end = fields[targetEndKey];

            if (teamKey && fields[teamKey]) {
                const teamField = fields[teamKey];
                const jiraTeamId = (teamField.id || teamField.value || teamField.toString()).toString();
                const jiraTeamName = teamField.name || '';

                const matchedTeam = data.teams.find(t =>
                    (t.jira_team_id && t.jira_team_id.toString() === jiraTeamId) ||
                    (t.name === jiraTeamId) ||
                    (jiraTeamName && t.name === jiraTeamName)
                );
                if (matchedTeam) updates.team_id = matchedTeam.id;
            }

            updateEpic(epicId, updates);
        } catch (err: any) {
            console.error('Jira sync error:', err);
            alert(`Error syncing from Jira: ${err.message}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleOverrideChange = (sprintId: string, val: string) => {
        const overrides = { ...(epic.sprint_effort_overrides || {}) };
        const cleanVal = val.trim();

        if (cleanVal === '') {
            delete overrides[sprintId];
        } else {
            const parsed = Number(cleanVal);
            if (!isNaN(parsed) && parsed >= 0) {
                overrides[sprintId] = parsed;
            }
        }
        updateEpic(epicId, { sprint_effort_overrides: Object.keys(overrides).length > 0 ? overrides : undefined });
    };

    // Calculate effort overlaps
    const sStart = epic.target_start ? parseISO(epic.target_start) : null;
    const sEnd = epic.target_end ? parseISO(epic.target_end) : null;
    const totalMd = Number(epic.remaining_md) || 0;
    const overrides = epic.sprint_effort_overrides || {};

    let overlappingSprints: { id: string, name: string, defaultEffort: number, hasOverride: boolean }[] = [];

    if (sStart && sEnd) {
        try {
            const overlaps = (data.sprints || []).map(sprint => {
                const spStart = parseISO(sprint.start_date);
                const spEnd = parseISO(sprint.end_date);
                const overlapStart = max([sStart, spStart]);
                const overlapEnd = min([sEnd, spEnd]);
                if (overlapStart <= overlapEnd) {
                    return { sprint, overlapDays: differenceInDays(overlapEnd, overlapStart) + 1 };
                }
                return null;
            }).filter(Boolean) as { sprint: any, overlapDays: number }[];

            let totalOverrideMd = 0;
            let remainingDefaultDays = 0;

            overlaps.forEach(({ sprint, overlapDays }) => {
                const overrideVal = overrides[sprint.id];
                const hasOverride = overrideVal !== undefined && overrideVal !== null;
                if (hasOverride) {
                    totalOverrideMd += Number(overrideVal);
                } else {
                    remainingDefaultDays += overlapDays;
                }
            });

            const remainingMdForDefaults = Math.max(0, totalMd - totalOverrideMd);

            overlappingSprints = overlaps.map(({ sprint, overlapDays }) => {
                const overrideVal = overrides[sprint.id];
                const hasOverride = overrideVal !== undefined && overrideVal !== null;
                let defaultEffort = 0;

                if (!hasOverride && remainingDefaultDays > 0) {
                    defaultEffort = remainingMdForDefaults * (overlapDays / remainingDefaultDays);
                } else if (hasOverride) {
                    defaultEffort = Number(overrideVal);
                }

                return {
                    id: sprint.id,
                    name: sprint.name,
                    defaultEffort,
                    hasOverride
                };
            });
        } catch (e) {
            // ignore invalid dates
        }
    }

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <button onClick={onBack} className={styles.backBtn}>← Back to Dashboard</button>
                    <h1>Epic: {epicId}</h1>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={handleSyncJira}
                        disabled={!epic?.jira_key || epic.jira_key === 'TBD' || syncing}
                        className={styles.saveBtn}
                        style={{
                            backgroundColor: '#374151',
                            borderColor: '#4b5563',
                            color: '#fff',
                            opacity: (!epic?.jira_key || epic.jira_key === 'TBD' || syncing) ? 0.5 : 1
                        }}
                    >
                        {syncing ? 'Syncing...' : 'Sync from Jira'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saveStatus === 'saving'}
                        className={styles.saveBtn}
                        style={{
                            backgroundColor: saveStatus === 'saved' ? '#10b981' : saveStatus === 'error' ? '#ef4444' : '#3b82f6',
                            borderColor: saveStatus === 'saved' ? '#059669' : saveStatus === 'error' ? '#b91c1c' : '#2563eb'
                        }}
                    >
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Error!' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div className={styles.content}>
                <section className={styles.card}>
                    <h2>Epic Details</h2>
                    <div className={styles.formGrid}>
                        <label>
                            Custom Name (Optional):
                            <input
                                type="text"
                                value={epic.name || ''}
                                placeholder="Uses Feature Name by default"
                                onChange={e => updateEpic(epicId, { name: e.target.value.trim() || undefined })}
                            />
                        </label>
                        <label>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span>Jira Key:</span>
                                {epic.jira_key && epic.jira_key !== 'TBD' && data?.settings?.jira_base_url && (
                                    <a
                                        href={`${data.settings.jira_base_url}/browse/${epic.jira_key}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: '12px', color: '#60a5fa', textDecoration: 'none' }}
                                    >
                                        View in Jira ↗
                                    </a>
                                )}
                            </div>
                            <input
                                type="text"
                                value={epic.jira_key || ''}
                                onChange={e => updateEpic(epicId, { jira_key: e.target.value })}
                            />
                        </label>
                        <label>
                            Remaining Estimate (MDs):
                            <input
                                type="number"
                                step="0.1"
                                value={epic.remaining_md === undefined ? '' : epic.remaining_md}
                                onChange={e => updateEpic(epicId, { remaining_md: Number(e.target.value) })}
                            />
                        </label>
                        <label>
                            Target Start:
                            <input
                                type="date"
                                value={epic.target_start || ''}
                                onChange={e => updateEpic(epicId, { target_start: e.target.value })}
                            />
                        </label>
                        <label>
                            Target End:
                            <input
                                type="date"
                                value={epic.target_end || ''}
                                onChange={e => updateEpic(epicId, { target_end: e.target.value })}
                            />
                        </label>
                    </div>
                </section>

                <section className={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2>Effort Breakdown</h2>
                    </div>
                    {overlappingSprints.length === 0 ? (
                        <p style={{ color: '#9ca3af', fontSize: '14px' }}>
                            No overlapping sprints found for the selected Target Dates.
                        </p>
                    ) : (
                        <div className={styles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                            {overlappingSprints.map((sprint) => (
                                <div key={sprint.id} style={{
                                    backgroundColor: '#1f2937',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    border: sprint.hasOverride ? '1px solid #8b5cf6' : '1px solid #374151'
                                }}>
                                    <div style={{ color: sprint.hasOverride ? '#fff' : '#9ca3af', fontSize: '13px', marginBottom: '8px', fontWeight: 500 }}>
                                        {sprint.name}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder={sprint.defaultEffort.toFixed(1)}
                                            value={epic.sprint_effort_overrides?.[sprint.id] ?? ''}
                                            onChange={e => handleOverrideChange(sprint.id, e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '6px 8px',
                                                backgroundColor: '#111827',
                                                border: '1px solid #4b5563',
                                                borderRadius: '4px',
                                                color: '#fff',
                                                fontSize: '13px',
                                                textAlign: 'right'
                                            }}
                                        />
                                        {sprint.hasOverride && (
                                            <button
                                                onClick={() => handleOverrideChange(sprint.id, '')}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#ef4444',
                                                    cursor: 'pointer',
                                                    fontSize: '18px',
                                                    padding: '0 4px'
                                                }}
                                                title="Clear override"
                                            >×</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};
