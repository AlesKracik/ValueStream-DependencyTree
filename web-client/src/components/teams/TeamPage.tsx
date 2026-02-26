import React, { useState, useMemo } from 'react';
import { parseISO, isWeekend } from 'date-fns';
import Holidays from 'date-holidays';
import type { DashboardData, Team } from '../../types/models';
import styles from '../customers/CustomerPage.module.css';

export interface TeamPageProps {
    teamId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateTeam: (id: string, updates: Partial<Team>) => void;
    saveDashboardData: (data: DashboardData) => Promise<void>;
}

export const TeamPage: React.FC<TeamPageProps> = ({
    teamId,
    onBack,
    data,
    loading,
    error,
    updateTeam,
    saveDashboardData
}) => {
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    if (loading) return <div>Loading team details...</div>;
    if (error) return <div>Error: {error.message}</div>;
    if (!data) return <div>No data available</div>;

    const team = data.teams.find(t => t.id === teamId);
    if (!team) return <div>Team not found.</div>;

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

    const hd = useMemo(() => {
        if (!team.country) return null;
        try {
            return new Holidays(team.country as any);
        } catch (e) {
            return null;
        }
    }, [team.country]);

    const handleOverrideChange = (sprintId: string, val: string) => {
        const overrides = { ...(team.sprint_capacity_overrides || {}) };
        const cleanVal = val.trim();

        if (cleanVal === '') {
            delete overrides[sprintId];
        } else {
            const parsed = Number(cleanVal);
            if (!isNaN(parsed) && parsed >= 0) {
                overrides[sprintId] = parsed;
            }
        }
        updateTeam(teamId, { sprint_capacity_overrides: overrides });
    };

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <button onClick={onBack} className={styles.backBtn}>← Back to Dashboard</button>
                    <h1>Team: {team.name}</h1>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
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
                    <h2>Team Details</h2>
                    <div className={styles.formGrid}>
                        <label>
                            Name:
                            <input
                                type="text"
                                value={team.name || ''}
                                onChange={e => updateTeam(teamId, { name: e.target.value })}
                            />
                        </label>
                        <label>
                            Sprint Capacity (MDs):
                            <input
                                type="number"
                                value={team.total_capacity_mds || 0}
                                onChange={e => updateTeam(teamId, { total_capacity_mds: Number(e.target.value) })}
                            />
                        </label>
                        <label>
                            Country (ISO):
                            <input
                                type="text"
                                placeholder="e.g. US, CZ, GB"
                                value={team.country || ''}
                                onChange={e => updateTeam(teamId, { country: e.target.value.toUpperCase().slice(0, 2) })}
                            />
                        </label>
                        <label>
                            Jira Team ID:
                            <input
                                type="text"
                                value={team.jira_team_id || ''}
                                onChange={e => updateTeam(teamId, { jira_team_id: e.target.value })}
                            />
                        </label>
                    </div>
                </section>

                <section className={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2>Sprint Capacity Overrides</h2>
                    </div>
                    <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '16px' }}>
                        Optionally override the default capacity for specific sprints.
                    </p>

                    <div className={styles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        {data.sprints.map(sprint => {
                            const overrideVal = team.sprint_capacity_overrides?.[sprint.id];
                            const isOverridden = overrideVal !== undefined && overrideVal !== null;

                            const sprintStartDate = parseISO(sprint.start_date);
                            const sprintEndDate = parseISO(sprint.end_date);
                            
                            let holidayCount = 0;
                            if (hd) {
                                const hList = hd.getHolidays(sprintStartDate.getFullYear());
                                if (sprintEndDate.getFullYear() !== sprintStartDate.getFullYear()) {
                                    hList.push(...hd.getHolidays(sprintEndDate.getFullYear()));
                                }
                                hList.forEach((h: any) => {
                                    const hDate = new Date(h.date);
                                    if (hDate >= sprintStartDate && hDate <= sprintEndDate && !isWeekend(hDate)) {
                                        holidayCount++;
                                    }
                                });
                            }

                            const holidayImpact = (team.total_capacity_mds / 10) * holidayCount;
                            const suggestedCapacity = Math.max(0, Math.round((team.total_capacity_mds - holidayImpact) * 10) / 10);

                            return (
                                <div key={sprint.id} style={{
                                    backgroundColor: '#1f2937',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    border: isOverridden ? '1px solid #8b5cf6' : '1px solid #374151'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <div style={{ color: isOverridden ? '#fff' : '#9ca3af', fontSize: '13px', fontWeight: 500 }}>
                                            {sprint.name}
                                        </div>
                                        {holidayCount > 0 && (
                                            <div style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 'bold' }} title={`${holidayCount} public holidays`}>
                                                🏝️ -{holidayCount}d
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder={String(suggestedCapacity)}
                                            value={overrideVal === undefined ? '' : overrideVal}
                                            onChange={e => handleOverrideChange(sprint.id, e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '6px 8px',
                                                backgroundColor: '#111827',
                                                border: '1px solid #4b5563',
                                                borderRadius: '4px',
                                                color: '#fff',
                                                fontSize: '13px'
                                            }}
                                        />
                                        {isOverridden && (
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
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
};
