import React, { useMemo } from 'react';
import { isWeekend } from 'date-fns';
import Holidays from 'date-holidays';
import type { DashboardData, Team } from '../../types/models';
import styles from '../customers/CustomerPage.module.css';
import { PageWrapper } from '../layout/PageWrapper';

export interface TeamPageProps {
    teamId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateTeam: (id: string, updates: Partial<Team>) => void;
    
}

export const TeamPage: React.FC<TeamPageProps> = ({
    teamId,
    onBack,
    data,
    loading,
    error,
    updateTeam
}) => {
    const team = data?.teams.find(t => t.id === teamId);

    const hd = useMemo(() => {
        if (!team?.country) return null;
        try {
            return new Holidays(team.country as any);
        } catch (e) {
            return null;
        }
    }, [team?.country]);

    const handleOverrideChange = (sprintId: string, val: string) => {
        if (!team) return;
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
        updateTeam(team.id, { sprint_capacity_overrides: overrides });
    };

    return (
        <PageWrapper
            loading={loading}
            error={error}
            data={data}
            loadingMessage="Loading team details..."
            emptyMessage="No data available."
        >
            {!team ? (
                <div className={styles.empty}>Team not found.</div>
            ) : (
                <>
                    <header className={styles.header}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            <button onClick={onBack} className="btn-secondary">← Back</button>
                            <h1>Team: {team.name}</h1>
                        </div>
                    </header>

                    <div className={styles.content}>
                        <section className={styles.card}>
                            <h2>Team Settings</h2>
                            <div className={styles.formGrid}>
                                <label>
                                    Team Name:
                                    <input 
                                        type="text" 
                                        value={team.name} 
                                        onChange={e => updateTeam(team.id, { name: e.target.value })}
                                    />
                                </label>
                                <label>
                                    Base Capacity (MDs per Sprint):
                                    <input 
                                        type="number" 
                                        value={team.total_capacity_mds} 
                                        onChange={e => updateTeam(team.id, { total_capacity_mds: parseInt(e.target.value) || 0 })}
                                    />
                                </label>
                                <label>
                                    Country (for Holidays):
                                    <select 
                                        value={team.country || ''} 
                                        onChange={e => updateTeam(team.id, { country: e.target.value })}
                                    >
                                        <option value="">None (No Holidays)</option>
                                        <option value="US">USA</option>
                                        <option value="GB">UK</option>
                                        <option value="DE">Germany</option>
                                        <option value="CZ">Czech Republic</option>
                                        <option value="FR">France</option>
                                        <option value="IN">India</option>
                                    </select>
                                </label>
                            </div>
                        </section>

                        <section className={styles.card}>
                            <h2>Sprint Capacity Overrides</h2>
                            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '20px' }}>
                                Set specific capacity for future sprints (e.g. for planned vacations or team changes). 
                                If left blank, the base capacity ({team.total_capacity_mds} MDs) is used.
                            </p>
                            
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Sprint</th>
                                        <th>Dates</th>
                                        <th>Standard Work Days</th>
                                        <th>Effective Capacity (MDs)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data?.sprints.map(sprint => {
                                        // Calculate standard working days (excluding weekends and holidays)
                                        const start = new Date(sprint.start_date);
                                        const end = new Date(sprint.end_date);
                                        let workDays = 0;
                                        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                                            const isWknd = isWeekend(d);
                                            const isHolid = hd ? hd.isHoliday(d) : false;
                                            if (!isWknd && !isHolid) workDays++;
                                        }

                                        return (
                                            <tr key={sprint.id}>
                                                <td>{sprint.name}</td>
                                                <td style={{ fontSize: '12px', color: '#94a3b8' }}>
                                                    {sprint.start_date} to {sprint.end_date}
                                                </td>
                                                <td>{workDays} days</td>
                                                <td>
                                                    <input 
                                                        type="number"
                                                        placeholder={String(team.total_capacity_mds)}
                                                        value={team.sprint_capacity_overrides?.[sprint.id] ?? ''}
                                                        onChange={e => handleOverrideChange(sprint.id, e.target.value)}
                                                        style={{ width: '100px' }}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </section>
                    </div>
                </>
            )}
        </PageWrapper>
    );
};
