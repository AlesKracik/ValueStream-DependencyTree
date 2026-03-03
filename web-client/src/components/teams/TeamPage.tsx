import React, { useMemo } from 'react';
import { isWeekend, parseISO } from 'date-fns';
import Holidays from 'date-holidays';
import type { DashboardData, Team } from '../../types/models';
import { useDashboardContext } from '../../contexts/DashboardContext';
import styles from '../customers/CustomerPage.module.css';
import { PageWrapper } from '../layout/PageWrapper';
import { calculateWorkingDays, getHolidayImpact, getCountryOptions } from '../../utils/dateHelpers';
import { SearchableDropdown } from '../common/SearchableDropdown';

export interface TeamPageProps {
    teamId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateTeam: (id: string, updates: Partial<Team>) => void;
    deleteTeam: (id: string) => void;
    addTeam: (team: Team) => void;
}

export const TeamPage: React.FC<TeamPageProps> = ({
    teamId,
    onBack,
    data,
    loading,
    error,
    updateTeam,
    deleteTeam,
    addTeam
}) => {
    const { showConfirm } = useDashboardContext();
    const isNew = teamId === 'new';

    const [newTeamDraft, setNewTeamDraft] = React.useState<Partial<Team>>({
        name: 'New Team',
        total_capacity_mds: 10,
        country: ''
    });

    const team = isNew ? newTeamDraft as Team : data?.teams.find(t => t.id === teamId);

    const hd = useMemo(() => {
        if (!team?.country) return null;
        try {
            return new Holidays(team.country as any);
        } catch (e) {
            console.error(`Invalid country code: ${team.country}`);
            return null;
        }
    }, [team?.country]);

    const handleSave = () => {
        if (isNew) {
            const newId = `t-${Math.random().toString(36).substr(2, 9)}`;
            addTeam({
                id: newId,
                name: newTeamDraft.name || 'New Team',
                total_capacity_mds: newTeamDraft.total_capacity_mds || 0,
                country: newTeamDraft.country || '',
                sprint_capacity_overrides: {}
            });
            onBack();
        }
    };

    const handleOverrideChange = (sprintId: string, val: string) => {
        if (!team || isNew) return;
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

    const handleDelete = async () => {
        if (!team || isNew) return;
        const confirmed = await showConfirm('Delete Team', `Are you sure you want to delete ${team.name}? This will affect epics assigned to this team.`);
        if (!confirmed) return;
        deleteTeam(team.id);
        onBack();
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
                            <h1>{isNew ? 'New Team' : `Team: ${team.name}`}</h1>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {!isNew && <button onClick={handleDelete} className="btn-danger">Delete Team</button>}
                            {isNew && <button onClick={handleSave} className="btn-primary">Create Team</button>}
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
                                        onChange={e => {
                                            if (isNew) setNewTeamDraft({ ...newTeamDraft, name: e.target.value });
                                            else updateTeam(team.id, { name: e.target.value });
                                        }}
                                    />
                                </label>
                                <label>
                                    Base Capacity (MDs per Sprint):
                                    <input 
                                        type="number" 
                                        value={team.total_capacity_mds} 
                                        onChange={e => {
                                            const val = parseInt(e.target.value) || 0;
                                            if (isNew) setNewTeamDraft({ ...newTeamDraft, total_capacity_mds: val });
                                            else updateTeam(team.id, { total_capacity_mds: val });
                                        }}
                                    />
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    Country (for Holidays):
                                    <SearchableDropdown
                                        options={[
                                            { id: '', label: 'None (No Holidays)' },
                                            ...getCountryOptions()
                                        ]}
                                        onSelect={id => {
                                            if (isNew) setNewTeamDraft({ ...newTeamDraft, country: id });
                                            else updateTeam(team.id, { country: id });
                                        }}
                                        placeholder="Select Country..."
                                        clearOnSelect={false}
                                        initialValue={(() => {
                                            const options = getCountryOptions();
                                            const match = options.find(o => o.id === team.country);
                                            return match ? match.label : (team.country === '' ? 'None (No Holidays)' : team.country || '');
                                        })()}
                                    />
                                </label>
                            </div>
                        </section>

                        {!isNew && (
                            <section className={styles.card}>
                                <h2>Sprint Capacity Overrides</h2>
                                <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '20px' }}>
                                    Values show the effective capacity (MDs) in each sprint. Bold values indicate a manual override.
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
                                            const isOverridden = team.sprint_capacity_overrides?.[sprint.id] !== undefined;
                                            
                                            // Calculate standard working days (excluding weekends and holidays)
                                            const { workDays, holidayCount } = calculateWorkingDays(sprint.start_date, sprint.end_date, team.country);
                                            const holidayImpact = getHolidayImpact(team.total_capacity_mds || 0, holidayCount);
                                            const calculatedCapacity = Math.max(0, (team.total_capacity_mds || 0) - holidayImpact);
                                            return (
                                                <tr key={sprint.id}>
                                                    <td>{sprint.name}</td>
                                                    <td style={{ fontSize: '12px', color: '#94a3b8' }}>
                                                        {sprint.start_date} to {sprint.end_date}
                                                    </td>
                                                    <td style={{ color: holidayCount > 0 ? '#3b82f6' : '#94a3b8' }}>
                                                        {workDays} days
                                                        {holidayCount > 0 && (
                                                            <span style={{ fontSize: '11px', marginLeft: '4px', opacity: 0.8 }} title={`${holidayCount} holiday(s)`}>
                                                                (🏖️ -{holidayCount})
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ width: '160px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <input 
                                                                type="number"
                                                                placeholder={(Math.round(calculatedCapacity * 10) / 10).toLocaleString()}
                                                                value={team.sprint_capacity_overrides?.[sprint.id] ?? ''}
                                                                onChange={e => handleOverrideChange(sprint.id, e.target.value)}
                                                                title={isOverridden ? 'Manual Override Active' : 'Calculated Capacity'}
                                                                style={{ 
                                                                    flex: 1,
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
                                                            {isOverridden && (
                                                                <button
                                                                    onClick={() => handleOverrideChange(sprint.id, '')}
                                                                    title="Remove Override"
                                                                    style={{
                                                                        background: 'none',
                                                                        border: 'none',
                                                                        color: '#3b82f6',
                                                                        cursor: 'pointer',
                                                                        fontSize: '20px',
                                                                        lineHeight: 1,
                                                                        padding: '0 4px',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        opacity: 0.8
                                                                    }}
                                                                    onMouseOver={e => e.currentTarget.style.opacity = '1'}
                                                                    onMouseOut={e => e.currentTarget.style.opacity = '0.8'}
                                                                >
                                                                    ×
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </section>
                        )}
                    </div>
                </>
            )}
        </PageWrapper>
    );
};



