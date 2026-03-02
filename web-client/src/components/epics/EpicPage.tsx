import React, { useState, useMemo } from 'react';
import { parseISO, min, max, differenceInDays, isWeekend } from 'date-fns';
import type { DashboardData, Epic } from '../../types/models';
import { authorizedFetch } from "../../utils/api";
import { useDashboardContext } from '../../contexts/DashboardContext';
import styles from '../customers/CustomerPage.module.css';
import { sanitizeUrl } from '../../utils/security';
import { PageWrapper } from '../layout/PageWrapper';
import { calculateEpicEffortPerSprint, calculateEpicIntensityRatio } from '../../utils/businessLogic';
import Holidays from 'date-holidays';

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

    const handleOverrideChange = (sprintId: string, val: string) => {
        if (!epic) return;
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
        updateEpic(epic.id, { sprint_effort_overrides: overrides });
    };

    const effortPerSprint = useMemo(() => {
        if (!epic || !data) return {};
        return calculateEpicEffortPerSprint(epic, data.sprints);
    }, [epic, data]);

    const team = data?.teams.find(t => t.id === epic?.team_id);
    const holidayChecker = useMemo(() => {
        if (!team?.country) return null;
        try {
            return new Holidays(team.country as any);
        } catch (e) {
            console.error(`Invalid country code: ${team.country}`);
            return null;
        }
    }, [team]);

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
                            <div className={styles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                <label>
                                    Jira Key:
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input 
                                            type="text" 
                                            value={epic.jira_key} 
                                            onChange={e => updateEpic(epic.id, { jira_key: e.target.value })}
                                            style={{ flex: 1 }}
                                        />
                                        {epic.jira_key && epic.jira_key !== 'TBD' && data?.settings.jira_base_url && (
                                            <a 
                                                href={`${data.settings.jira_base_url.replace(/\/$/, '')}/browse/${epic.jira_key}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                title="Open in Jira"
                                                style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '18px', display: 'flex', alignItems: 'center' }}
                                            >
                                                ↗
                                            </a>
                                        )}
                                    </div>
                                </label>
                                <label>
                                    Name:
                                    <input 
                                        type="text" 
                                        value={epic.name} 
                                        onChange={e => updateEpic(epic.id, { name: e.target.value })}
                                    />
                                </label>
                                <label>
                                    Effort (MDs):
                                    <input 
                                        type="number" 
                                        value={epic.effort_md} 
                                        onChange={e => updateEpic(epic.id, { effort_md: parseInt(e.target.value) || 0 })}
                                    />
                                </label>
                            </div>

                            <div className={styles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: '24px' }}>
                                <label>
                                    Team:
                                    <select 
                                        value={epic.team_id} 
                                        onChange={e => updateEpic(epic.id, { team_id: e.target.value })}
                                    >
                                        {data?.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </label>
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
                        </section>

                        <section className={styles.card}>
                            <h2>Sprint Effort Distribution</h2>
                            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '20px' }}>
                                Values show the effective effort (MDs) in each sprint. Bold values indicate a manual override.
                            </p>
                            
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Sprint</th>
                                        <th>Dates</th>
                                        <th>Context</th>
                                        <th>Team Capacity</th>
                                        <th>Effort (MDs)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data?.sprints.filter(s => effortPerSprint[s.id] !== undefined).map(sprint => {
                                        const effective = Math.round((effortPerSprint[sprint.id] || 0) * 10) / 10;
                                        const isOverridden = epic.sprint_effort_overrides?.[sprint.id] !== undefined;

                                        // Holiday calculation logic
                                        let holidayCount = 0;
                                        if (holidayChecker) {
                                            const sStart = parseISO(sprint.start_date);
                                            const sEnd = parseISO(sprint.end_date);
                                            const hList = holidayChecker.getHolidays(sStart.getFullYear());
                                            if (sEnd.getFullYear() !== sStart.getFullYear()) {
                                                hList.push(...holidayChecker.getHolidays(sEnd.getFullYear()));
                                            }
                                            hList.forEach((h: any) => {
                                                if (h.type !== 'public') return;
                                                const hDate = new Date(h.date);
                                                if (hDate >= sStart && hDate <= sEnd && !isWeekend(hDate)) {
                                                    holidayCount++;
                                                }
                                            });
                                        }

                                        const capacityOverride = team?.sprint_capacity_overrides?.[sprint.id];
                                        const hasCapacityOverride = capacityOverride !== undefined;
                                        const holidayImpact = ((team?.total_capacity_mds || 0) / 10) * holidayCount;
                                        const effectiveCapacity = hasCapacityOverride ? capacityOverride : ((team?.total_capacity_mds || 0) - holidayImpact);

                                        return (
                                            <tr key={sprint.id} style={{ fontSize: '14px' }}>
                                                <td>{sprint.name}</td>
                                                <td style={{ color: '#94a3b8' }}>
                                                    {sprint.start_date} to {sprint.end_date}
                                                </td>
                                                <td style={{ color: '#94a3b8' }}>{sprint.quarter}</td>
                                                <td style={{ color: (hasCapacityOverride || holidayCount > 0) ? '#3b82f6' : '#94a3b8' }}>
                                                    <div style={{ fontWeight: (hasCapacityOverride || holidayCount > 0) ? 'bold' : 'normal' }}>
                                                        {Math.round(effectiveCapacity * 10) / 10} MDs
                                                        {hasCapacityOverride && <span style={{ fontSize: '11px', marginLeft: '4px', opacity: 0.8 }}>(Override)</span>}
                                                        {!hasCapacityOverride && holidayCount > 0 && (
                                                            <span style={{ fontSize: '11px', marginLeft: '4px', opacity: 0.8 }} title={`${holidayCount} holiday(s)`}>
                                                                (🏖️ -{Math.round(holidayImpact * 10) / 10})

                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ width: '140px' }}>
                                                    <input 
                                                        type="number"
                                                        value={epic.sprint_effort_overrides?.[sprint.id] ?? ''}
                                                        placeholder={effective > 0 ? String(effective) : '-'}
                                                        onChange={e => handleOverrideChange(sprint.id, e.target.value)}
                                                        title={isOverridden ? 'Manual Override Active' : 'Calculated Proportion'}
                                                        style={{ 
                                                            width: '100%',
                                                            backgroundColor: isOverridden ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                                            border: isOverridden ? '1px solid #3b82f6' : '1px solid #334155',
                                                            borderRadius: '4px',
                                                            color: isOverridden ? '#fff' : '#94a3b8',
                                                            fontWeight: isOverridden ? 'bold' : 'normal',
                                                            padding: '6px 10px',
                                                            boxSizing: 'border-box',
                                                            textAlign: 'center',
                                                            outline: 'none',
                                                            fontSize: '14px'
                                                        }}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {(!data?.sprints || data.sprints.filter(s => effortPerSprint[s.id] !== undefined).length === 0) && (
                                        <tr>
                                            <td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No sprints overlap with this epic's timeline.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </section>
                    </div>
                </>
            )}
        </PageWrapper>
    );
};
