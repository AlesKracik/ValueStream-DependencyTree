import React, { useState } from 'react';
import type { Epic, ValueStreamData } from '../../types/models';
import { PageWrapper } from '../layout/PageWrapper';
import { useNavigate, useParams } from 'react-router-dom';
import { calculateEpicEffortPerSprint } from '../../utils/businessLogic';
import { calculateWorkingDays, getHolidayImpact } from '../../utils/dateHelpers';
import styles from '../customers/CustomerPage.module.css';

interface EpicPageProps {
    data: ValueStreamData | null;
    loading: boolean;
    updateEpic: (id: string, updates: Partial<Epic>) => Promise<void>;
}

export const EpicPage: React.FC<EpicPageProps> = ({ data, loading, updateEpic }) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const epic = data?.epics.find(e => e.id === id);
    const team = data?.teams.find(t => t.id === epic?.team_id);

    const [localDates, setLocalDates] = useState({
        start: epic?.target_start || '',
        end: epic?.target_end || ''
    });

    if (!epic) return <PageWrapper loading={loading} data={data}><div>Epic not found</div></PageWrapper>;

    const effortPerSprint = calculateEpicEffortPerSprint(epic, data?.sprints || []);

    const handleOverrideChange = (sprintId: string, value: string) => {
        const overrides = { ...(epic.sprint_effort_overrides || {}) };
        if (value === '') {
            delete overrides[sprintId];
        } else {
            const parsed = parseFloat(value);
            if (!isNaN(parsed)) {
                overrides[sprintId] = parsed;
            }
        }
        updateEpic(epic.id, { sprint_effort_overrides: overrides });
    };

    const handleDateChange = (field: 'start' | 'end', value: string) => {
        setLocalDates(prev => ({ ...prev, [field]: value }));
        
        const updates: Partial<Epic> = { [field === 'start' ? 'target_start' : 'target_end']: value };
        
        // If we move the start date, we typically want to clear overrides as the distribution changes
        if (field === 'start' && epic.sprint_effort_overrides && Object.keys(epic.sprint_effort_overrides).length > 0) {
            const confirmed = window.confirm(
                'Moving the start date will clear any historical work overrides for this epic. Do you want to proceed?'
            );
            if (!confirmed) {
                setLocalDates({
                    start: epic.target_start || '',
                    end: epic.target_end || ''
                });
                return;
            }
            // Clear overrides as they are no longer valid for the new timeline
            updates.sprint_effort_overrides = undefined;
        }

        updateEpic(epic.id, updates);
    };

    return (
        <PageWrapper loading={loading} data={data}>
            <div className={styles.pageContainer}>
                <header className={styles.header}>
                    <h1>Epic: {epic.name}</h1>
                    <button className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
                </header>

                <div className={styles.content}>
                    <div className={styles.card}>
                        <h2>Timeline & Effort</h2>
                        <div className={styles.formGrid}>
                            <label>
                                Target Start
                                <input 
                                    type="date" 
                                    value={localDates.start} 
                                    onChange={e => handleDateChange('start', e.target.value)}
                                />
                            </label>
                            <label>
                                Target End
                                <input 
                                    type="date" 
                                    value={localDates.end} 
                                    onChange={e => handleDateChange('end', e.target.value)}
                                />
                            </label>
                            <label>
                                Total Effort (MDs)
                                <input 
                                    type="number" 
                                    value={epic.effort_mds} 
                                    onChange={e => updateEpic(epic.id, { effort_mds: parseFloat(e.target.value) })}
                                />
                            </label>
                        </div>
                    </div>

                    <section className={styles.card}>
                        <h2>Sprint Effort Distribution</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
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
                                    const { holidayCount } = calculateWorkingDays(sprint.start_date, sprint.end_date, team?.country);

                                    const capacityOverride = team?.sprint_capacity_overrides?.[sprint.id];
                                    const hasCapacityOverride = capacityOverride !== undefined;
                                    const holidayImpact = getHolidayImpact(team?.total_capacity_mds || 0, holidayCount);
                                    const effectiveCapacity = hasCapacityOverride ? capacityOverride : ((team?.total_capacity_mds || 0) - holidayImpact);

                                    return (
                                        <tr key={sprint.id} style={{ fontSize: '14px' }}>
                                            <td>{sprint.name}</td>
                                            <td style={{ color: 'var(--text-primary)' }}>
                                                {sprint.start_date} to {sprint.end_date}
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)' }}>{sprint.quarter}</td>
                                            <td style={{ color: (hasCapacityOverride || holidayCount > 0) ? 'var(--accent-text)' : 'var(--text-muted)' }}>
                                                <div style={{ fontWeight: (hasCapacityOverride || holidayCount > 0) ? 'bold' : 'normal' }}>
                                                    {(Math.round(effectiveCapacity * 10) / 10).toLocaleString()} MDs
                                                    {hasCapacityOverride && <span style={{ fontSize: '11px', marginLeft: '4px' }}>(Override)</span>}
                                                    {!hasCapacityOverride && holidayCount > 0 && (
                                                        <span style={{ fontSize: '11px', marginLeft: '4px' }} title={`${holidayCount} holiday(s)`}>
                                                            (🏖️ -{(Math.round(holidayImpact * 10) / 10).toLocaleString()})
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ width: '160px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <input 
                                                        type="number"
                                                        value={epic.sprint_effort_overrides?.[sprint.id] ?? ''}
                                                        placeholder={effective > 0 ? String(effective) : '-'}
                                                        onChange={e => handleOverrideChange(sprint.id, e.target.value)}
                                                        title={isOverridden ? 'Manual Override Active' : 'Calculated Proportion'}
                                                        style={{ 
                                                            flex: 1,
                                                            backgroundColor: isOverridden ? 'var(--accent-primary-bg)' : 'transparent',
                                                            border: isOverridden ? '1px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
                                                            borderRadius: '4px',
                                                            color: isOverridden ? 'var(--text-highlight)' : 'var(--text-muted)',
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
                                                                color: 'var(--accent-text)',
                                                                cursor: 'pointer',
                                                                fontSize: '20px',
                                                                padding: '4px'
                                                            }}
                                                        >
                                                            ✕
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
                </div>
            </div>
        </PageWrapper>
    );
};
