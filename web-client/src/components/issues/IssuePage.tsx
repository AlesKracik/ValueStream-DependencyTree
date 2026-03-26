import React, { useState } from 'react';
import type { Issue, ValueStreamData } from '@valuestream/shared-types';
import { useNavigate, useParams } from 'react-router-dom';
import { calculateIssueEffortPerSprint, parseJiraIssue } from '../../utils/businessLogic';
import { calculateWorkingDays, getHolidayImpact } from '../../utils/dateHelpers';
import { useValueStreamContext } from '../../contexts/ValueStreamContext';
import { syncJiraIssue } from '../../utils/api';
import { GenericDetailPage, type DetailTab } from '../common/GenericDetailPage';
import { SearchableDropdown } from '../common/SearchableDropdown';
import customerStyles from '../customers/CustomerPage.module.css';

interface IssuePageProps {
    data: ValueStreamData | null;
    loading: boolean;
    updateIssue: (id: string, updates: Partial<Issue>) => Promise<void>;
    deleteIssue: (id: string) => void;
}

export const IssuePage: React.FC<IssuePageProps> = ({ data, loading, updateIssue, deleteIssue }) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useValueStreamContext();
    
    const issue = data?.issues.find(e => e.id === id);
    const team = data?.teams.find(t => t.id === issue?.team_id);
    const workItem = data?.workItems.find(wi => wi.id === issue?.work_item_id);

    const [localDates, setLocalDates] = useState({
        start: issue?.target_start || '',
        end: issue?.target_end || ''
    });

    React.useEffect(() => {
        if (issue) {
            setLocalDates({
                start: issue.target_start || '',
                end: issue.target_end || ''
            });
        }
    }, [issue, issue?.id, issue?.target_start, issue?.target_end]);

    if (!issue) {
        if (loading) return null;
        return (
            <GenericDetailPage
                entityTitle="Issue Not Found"
                onBack={() => navigate(-1)}
                mainDetails={<div>Issue not found</div>}
                loading={loading}
                data={data}
            />
        );
    }

    const effortPerSprint = calculateIssueEffortPerSprint(issue, data?.sprints || []);

    const handleDelete = async () => {
        if (!issue) return;
        const confirmed = await showConfirm('Delete Issue', `Are you sure you want to delete "${issue.name}"?`);
        if (confirmed) {
            deleteIssue(issue.id);
            navigate(-1);
        }
    };

    const handleSync = async () => {
        if (!issue) return;
        try {
            const jiraData = await syncJiraIssue(issue.jira_key || '', data?.settings?.jira || {});
            if (jiraData) {
                const updates = parseJiraIssue(jiraData, data?.teams || []);
                await updateIssue(issue.id, updates);
                
                // Update localDates to reflect synced values in the UI
                if (updates.target_start !== undefined || updates.target_end !== undefined) {
                    setLocalDates({
                        start: updates.target_start || issue.target_start || '',
                        end: updates.target_end || issue.target_end || ''
                    });
                }
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            showAlert('Sync Failed', msg);
        }
    };

    const handleOverrideChange = (sprintId: string, value: string) => {
        const overrides = { ...(issue.sprint_effort_overrides || {}) };
        if (value === '') {
            delete overrides[sprintId];
        } else {
            const parsed = parseFloat(value);
            if (!isNaN(parsed)) {
                overrides[sprintId] = parsed;
            }
        }
        updateIssue(issue.id, { sprint_effort_overrides: overrides });
    };

    const handleDateChange = async (field: 'start' | 'end', value: string) => {
        const newStart = field === 'start' ? value : localDates.start;
        const newEnd = field === 'end' ? value : localDates.end;

        if (newStart && newEnd && new Date(newStart) >= new Date(newEnd)) {
            showAlert('Invalid Dates', 'The Start Date must be before the End Date.');
            return;
        }

        setLocalDates({ start: newStart, end: newEnd });
        const updates: Partial<Issue> = { [field === 'start' ? 'target_start' : 'target_end']: value };
        
        if (field === 'start' && issue.sprint_effort_overrides && Object.keys(issue.sprint_effort_overrides).length > 0) {
            const confirmed = await showConfirm(
                'Historical Work Warning',
                'Moving the start date will clear any historical work overrides for this issue. Do you want to proceed?'
            );
            if (!confirmed) {
                setLocalDates({
                    start: issue.target_start || '',
                    end: issue.target_end || ''
                });
                return;
            }
            updates.sprint_effort_overrides = undefined;
        }

        updateIssue(issue.id, updates);
    };

    const workItemOptions = data?.workItems.map(wi => ({ id: wi.id, label: wi.name })) || [];
    // Add "Unassigned" option
    workItemOptions.unshift({ id: 'UNASSIGNED', label: '--- Unassigned ---' });

    const mainDetails = (
        <>
            <div style={{ display: 'flex', gap: '32px', width: '100%' }}>
                <label>
                    Name
                    <input 
                        type="text" 
                        value={issue.name || ''} 
                        onChange={e => updateIssue(issue.id, { name: e.target.value })}
                        placeholder="Issue Name"
                    />
                </label>
                <label>
                    Work Item
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <SearchableDropdown
                            options={workItemOptions}
                            onSelect={(wiId) => updateIssue(issue.id, { work_item_id: wiId === 'UNASSIGNED' ? undefined : wiId })}
                            placeholder="Search for a work item..."
                            clearOnSelect={false}
                            initialValue={workItem?.name || 'Unassigned'}
                        />
                    </div>
                </label>
            </div>
            <div style={{ display: 'flex', gap: '32px', width: '100%' }}>
                <label>
                    Jira Key
                    <input 
                        type="text" 
                        value={issue.jira_key || ''} 
                        onChange={e => updateIssue(issue.id, { jira_key: e.target.value })}
                    />
                </label>
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
                        value={issue.effort_md} 
                        onChange={e => updateIssue(issue.id, { effort_md: parseFloat(e.target.value) })}
                    />
                </label>
            </div>
        </>
    );

    const tabs: DetailTab[] = [
        {
            id: 'distribution',
            label: 'Sprint Effort Distribution',
            content: (
                <>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
                        Values show the effective effort (MDs) in each sprint. Bold values indicate a manual override.
                    </p>
                    
                    <table className={customerStyles.table}>
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
                                const isOverridden = issue.sprint_effort_overrides?.[sprint.id] !== undefined;

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
                                                    value={issue.sprint_effort_overrides?.[sprint.id] ?? ''}
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
            entityTitle={`Issue: ${issue.name}`}
            onBack={() => navigate(-1)}
            mainDetails={mainDetails}
            tabs={tabs}
            loading={loading}
            data={data}
            actions={
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn-danger" onClick={handleDelete}>Delete Issue</button>
                    <button className="btn-primary" onClick={handleSync}>Sync from Jira</button>
                </div>
            }
        />
    );
};

