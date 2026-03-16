import React, { useState } from 'react';
import type { Team, ValueStreamData } from '../../types/models';
import { useNavigate, useParams } from 'react-router-dom';
import { useValueStreamContext } from '../../contexts/ValueStreamContext';
import { calculateWorkingDays, getHolidayImpact } from '../../utils/dateHelpers';
import { GenericDetailPage, type DetailTab } from '../common/GenericDetailPage';
import customerStyles from '../customers/CustomerPage.module.css';

interface TeamPageProps {
    data: ValueStreamData | null;
    loading: boolean;
    updateTeam: (id: string, updates: Partial<Team>) => Promise<void>;
    addTeam: (team: Omit<Team, 'id'>) => Promise<string>;
    deleteTeam: (id: string) => void;
}

export const TeamPage: React.FC<TeamPageProps> = ({ data, loading, updateTeam, addTeam, deleteTeam }) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showConfirm } = useValueStreamContext();
    const isNew = id === 'new';

    const existingTeam = data?.teams.find(t => t.id === id);

    const [newTeamDraft, setNewTeamDraft] = useState<Partial<Team>>({
        name: '',
        total_capacity_mds: 10,
        country: 'Default',
        sprint_capacity_overrides: {}
    });

    if (!isNew && !existingTeam && !loading) {
        return <GenericDetailPage entityTitle="Team Not Found" onBack={() => navigate('/teams')} mainDetails={<div>Team not found.</div>} loading={loading} data={data} />;
    }

    const team = isNew ? newTeamDraft : (existingTeam || {});

    const handleDelete = async () => {
        if (!team.id) return;
        const confirmed = await showConfirm('Delete Team', `Are you sure you want to delete "${team.name}"?`);
        if (confirmed) {
            deleteTeam(team.id);
            navigate('/teams');
        }
    };

    const handleCreate = async () => {
        if (!newTeamDraft.name) return;
        const newId = await addTeam(newTeamDraft as Omit<Team, 'id'>);
        navigate(`/team/${newId}`);
    };

    const handleFieldChange = (updates: Partial<Team>) => {
        if (isNew) {
            setNewTeamDraft(prev => ({ ...prev, ...updates }));
        } else if (id) {
            updateTeam(id, updates);
        }
    };

    const handleOverrideChange = (sprintId: string, value: string) => {
        const overrides = { ...(team.sprint_capacity_overrides || {}) };
        
        if (value === '') {
            delete overrides[sprintId];
        } else {
            const parsed = parseFloat(value);
            if (!isNaN(parsed)) {
                overrides[sprintId] = parsed;
            }
        }
        handleFieldChange({ sprint_capacity_overrides: overrides });
    };

    const mainDetails = (
        <>
            <label>
                Team Name
                <input 
                    type="text" 
                    value={team.name || ''} 
                    onChange={e => handleFieldChange({ name: e.target.value })}
                />
            </label>
            <label>
                Total Capacity (MDs per Sprint)
                <input 
                    type="number" 
                    value={team.total_capacity_mds || 0} 
                    onChange={e => handleFieldChange({ total_capacity_mds: parseFloat(e.target.value) })}
                />
            </label>
            <label>
                Country (for Holidays)
                <select 
                    value={team.country || 'Default'} 
                    onChange={e => handleFieldChange({ country: e.target.value })}
                >
                    <option value="Default">Default (No Holidays)</option>
                    <option value="US">United States</option>
                    <option value="UK">United Kingdom</option>
                    <option value="DE">Germany</option>
                    <option value="CZ">Czech Republic</option>
                    <option value="RO">Romania</option>
                </select>
            </label>
        </>
    );

    const tabs: DetailTab[] = isNew ? [] : [
        {
            id: 'overrides',
            label: 'Capacity Overrides',
            content: (
                <>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
                        Values show the effective capacity (MDs) in each sprint. Bold values indicate a manual override.
                    </p>
                    
                    <table className={customerStyles.table}>
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
                                        <td style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                                            {sprint.start_date} to {sprint.end_date}
                                        </td>
                                        <td style={{ color: holidayCount > 0 ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                                            {workDays} days
                                            {holidayCount > 0 && (
                                                <span style={{ fontSize: '11px', marginLeft: '4px' }} title={`${holidayCount} holiday(s)`}>
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
                                                        className="btn-danger"
                                                        onClick={() => handleOverrideChange(sprint.id, '')}
                                                        title="Remove Override"
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: '14px',
                                                            minWidth: 'auto'
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
                </>
            )
        }
    ];

    return (
        <GenericDetailPage
            entityTitle={isNew ? 'Create New Team' : `Team: ${team.name}`}
            onBack={() => navigate('/teams')}
            mainDetails={mainDetails}
            tabs={tabs}
            loading={loading}
            data={data}
            actions={
                <div style={{ display: 'flex', gap: '12px' }}>
                    {!isNew && (
                        <button className="btn-danger" onClick={handleDelete}>Delete Team</button>
                    )}
                    {isNew && (
                        <button className="btn-primary" onClick={handleCreate}>Create Team</button>
                    )}
                </div>
            }
        />
    );
};
