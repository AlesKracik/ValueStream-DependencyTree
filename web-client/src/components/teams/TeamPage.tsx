import React, { useState } from 'react';
import type { Team, TeamMember, ValueStreamData } from '@valuestream/shared-types';
import { useNavigate, useParams } from 'react-router-dom';
import { useValueStreamContext } from '../../contexts/ValueStreamContext';
import { authorizedFetch } from '../../utils/api';
import { calculateWorkingDays, getHolidayImpact } from '../../utils/dateHelpers';
import { GenericDetailPage, type DetailTab } from '../common/GenericDetailPage';
import { FormTextField, FormNumberField, FormSelectField } from '../common/FormFields';
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

    const [editingMemberIndex, setEditingMemberIndex] = useState<number | null>(null);
    const [memberDraft, setMemberDraft] = useState<TeamMember>({ name: '', username: '', capacity_percentage: 100 });
    const [isSyncingLdap, setIsSyncingLdap] = useState(false);
    const [ldapSyncResult, setLdapSyncResult] = useState<{ success: boolean; message: string } | null>(null);

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

    const ldapConfigured = !!(data?.settings?.ldap?.url && data?.settings?.ldap?.team?.base_dn && data?.settings?.ldap?.team?.search_filter);

    const handleAddMember = () => {
        if (!memberDraft.name || !memberDraft.username) return;
        const members = [...(team.members || []), { ...memberDraft }];
        handleFieldChange({ members });
        setMemberDraft({ name: '', username: '', capacity_percentage: 100 });
    };

    const handleUpdateMember = (index: number) => {
        if (!memberDraft.name || !memberDraft.username) return;
        const members = [...(team.members || [])];
        members[index] = { ...memberDraft };
        handleFieldChange({ members });
        setEditingMemberIndex(null);
        setMemberDraft({ name: '', username: '', capacity_percentage: 100 });
    };

    const handleDeleteMember = async (index: number) => {
        const member = (team.members || [])[index];
        const confirmed = await showConfirm('Remove Member', `Remove "${member.name}" from the team?`);
        if (confirmed) {
            const members = (team.members || []).filter((_, i) => i !== index);
            handleFieldChange({ members });
            if (editingMemberIndex === index) {
                setEditingMemberIndex(null);
                setMemberDraft({ name: '', username: '', capacity_percentage: 100 });
            }
        }
    };

    const startEditMember = (index: number) => {
        const member = (team.members || [])[index];
        setEditingMemberIndex(index);
        setMemberDraft({ ...member });
    };

    const cancelEditMember = () => {
        setEditingMemberIndex(null);
        setMemberDraft({ name: '', username: '', capacity_percentage: 100 });
    };

    const handleLdapSync = async () => {
        if (!team.ldap_team_name) return;
        setIsSyncingLdap(true);
        setLdapSyncResult(null);
        try {
            const response = await authorizedFetch('/api/ldap/sync-members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ldap_team_name: team.ldap_team_name })
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'LDAP sync failed');

            const ldapMembers: { name: string; username: string }[] = data.members;
            const existingMembers = team.members || [];
            const existingByUsername = new Map(existingMembers.map(m => [m.username, m]));
            const ldapUsernames = new Set(ldapMembers.map(m => m.username));

            // Build merged list: keep existing capacity for known members, add new ones at 100%, remove absent ones
            const merged: TeamMember[] = ldapMembers.map(lm => {
                const existing = existingByUsername.get(lm.username);
                return {
                    name: lm.name || existing?.name || lm.username,
                    username: lm.username,
                    capacity_percentage: existing?.capacity_percentage ?? 100
                };
            });

            const added = ldapMembers.filter(lm => !existingByUsername.has(lm.username)).length;
            const removed = existingMembers.filter(m => !ldapUsernames.has(m.username)).length;
            const kept = ldapMembers.length - added;

            handleFieldChange({ members: merged });
            setLdapSyncResult({ success: true, message: `Synced: ${kept} kept, ${added} added, ${removed} removed` });
        } catch (e: unknown) {
            setLdapSyncResult({ success: false, message: e instanceof Error ? e.message : 'Sync failed' });
        } finally {
            setIsSyncingLdap(false);
        }
    };

    const mainDetails = (
        <>
            <FormTextField
                label="Team Name"
                value={team.name || ''}
                onChange={v => handleFieldChange({ name: v })}
            />
            <FormNumberField
                label="Total Capacity (MDs per Sprint)"
                value={team.total_capacity_mds || 0}
                onChange={v => handleFieldChange({ total_capacity_mds: v ?? 0 })}
                float
            />
            <FormSelectField
                label="Country (for Holidays)"
                value={team.country || 'Default'}
                onChange={v => handleFieldChange({ country: v })}
                options={[
                    { value: 'Default', label: 'Default (No Holidays)' },
                    { value: 'US', label: 'United States' },
                    { value: 'UK', label: 'United Kingdom' },
                    { value: 'DE', label: 'Germany' },
                    { value: 'CZ', label: 'Czech Republic' },
                    { value: 'RO', label: 'Romania' },
                ]}
            />
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
        },
        {
            id: 'members',
            label: 'Members',
            content: (
                <>
                    {ldapConfigured && (
                        <div style={{ marginBottom: '16px', maxWidth: '32rem' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                LDAP Team Name
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        placeholder="Enter LDAP team name to look up members"
                                        value={team.ldap_team_name || ''}
                                        onChange={e => handleFieldChange({ ldap_team_name: e.target.value })}
                                        style={{ flex: 1 }}
                                    />
                                    <button
                                        className="btn-primary"
                                        onClick={handleLdapSync}
                                        disabled={isSyncingLdap || !team.ldap_team_name}
                                        style={{ whiteSpace: 'nowrap' }}
                                    >
                                        {isSyncingLdap ? 'Syncing...' : 'Sync from LDAP'}
                                    </button>
                                </div>
                            </label>
                            {ldapSyncResult && (
                                <div style={{
                                    marginTop: '8px',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    backgroundColor: ldapSyncResult.success ? 'var(--status-success-bg)' : 'var(--status-danger-bg)',
                                    color: ldapSyncResult.success ? 'var(--status-success)' : 'var(--status-danger-text)',
                                    border: `1px solid ${ldapSyncResult.success ? 'var(--status-success)' : 'var(--status-danger-border)'}`
                                }}>
                                    {ldapSyncResult.message}
                                </div>
                            )}
                        </div>
                    )}

                    <table className={customerStyles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Username</th>
                                <th>Capacity %</th>
                                <th style={{ width: '200px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(team.members || []).map((member, index) => (
                                <tr key={index}>
                                    {editingMemberIndex === index ? (
                                        <>
                                            <td>
                                                <input
                                                    type="text"
                                                    value={memberDraft.name}
                                                    onChange={e => setMemberDraft(d => ({ ...d, name: e.target.value }))}
                                                    aria-label="Edit member name"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    value={memberDraft.username}
                                                    onChange={e => setMemberDraft(d => ({ ...d, username: e.target.value }))}
                                                    aria-label="Edit member username"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={memberDraft.capacity_percentage}
                                                    onChange={e => setMemberDraft(d => ({ ...d, capacity_percentage: parseFloat(e.target.value) || 0 }))}
                                                    aria-label="Edit member capacity"
                                                />
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button className="btn-primary" onClick={() => handleUpdateMember(index)}>Save</button>
                                                    <button className="btn-secondary" onClick={cancelEditMember}>Cancel</button>
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td>{member.name}</td>
                                            <td>{member.username}</td>
                                            <td>{member.capacity_percentage}%</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button className="btn-secondary" onClick={() => startEditMember(index)}>Edit</button>
                                                    <button className="btn-danger" onClick={() => handleDeleteMember(index)}>Remove</button>
                                                </div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                            {editingMemberIndex === null && (
                                <tr>
                                    <td>
                                        <input
                                            type="text"
                                            placeholder="Name"
                                            value={memberDraft.name}
                                            onChange={e => setMemberDraft(d => ({ ...d, name: e.target.value }))}
                                            aria-label="New member name"
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            placeholder="Username"
                                            value={memberDraft.username}
                                            onChange={e => setMemberDraft(d => ({ ...d, username: e.target.value }))}
                                            aria-label="New member username"
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={memberDraft.capacity_percentage}
                                            onChange={e => setMemberDraft(d => ({ ...d, capacity_percentage: parseFloat(e.target.value) || 0 }))}
                                            aria-label="New member capacity"
                                        />
                                    </td>
                                    <td>
                                        <button className="btn-primary" onClick={handleAddMember}>Add</button>
                                    </td>
                                </tr>
                            )}
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
