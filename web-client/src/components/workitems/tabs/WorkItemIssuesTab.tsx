import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Issue, ValueStreamData } from '@valuestream/shared-types';
import { syncJiraIssue } from '../../../utils/api';
import { SearchableDropdown } from '../../common/SearchableDropdown';
import { useNotificationContext } from '../../../contexts/NotificationContext';
import { useDeleteWithConfirm } from '../../../hooks/useDeleteWithConfirm';
import { generateId } from '../../../utils/security';
import { parseJiraIssue } from '../../../utils/businessLogic';
import customerStyles from '../../customers/CustomerPage.module.css';

interface Props {
    isNew: boolean;
    workItemId: string;
    issues: Issue[];
    data: ValueStreamData | null;
    updateIssue: (id: string, updates: Partial<Issue>, immediate?: boolean) => Promise<void>;
    addIssue: (e: Issue) => void;
    deleteIssue: (id: string) => void;
    setNewWorkItemIssues: React.Dispatch<React.SetStateAction<Issue[]>>;
}

export const WorkItemIssuesTab: React.FC<Props> = ({
    isNew,
    workItemId,
    issues,
    data,
    updateIssue,
    addIssue,
    deleteIssue,
    setNewWorkItemIssues
}) => {
    const { showAlert } = useNotificationContext();
    const deleteWithConfirm = useDeleteWithConfirm();
    const navigate = useNavigate();
    const [syncingId, setSyncingId] = useState<string | null>(null);

    const syncIssue = async (id: string, jiraKey: string) => {
        setSyncingId(id);
        try {
            const issueData = await syncJiraIssue(jiraKey, data?.settings?.jira || {});
            const updates = parseJiraIssue(issueData, data?.teams || []);

            if (isNew) {
                setNewWorkItemIssues(prev => prev.map(e => e.id === id ? {
                    ...e,
                    ...updates,
                    team_id: updates.team_id || e.team_id || (data?.teams[0]?.id || '')
                } : e));
            } else {
                updateIssue(id, updates);
            }
        } catch (err: unknown) {
            console.error('Sync failed', err);
            const msg = err instanceof Error ? err.message : 'An unexpected error occurred during sync.';
            await showAlert('Sync Failed', msg);
        } finally {
            setSyncingId(null);
        }
    };

    const handleAddIssue = () => {
        const newId = generateId('e');
        const newIssue: Issue = {
            id: newId,
            jira_key: 'TBD',
            name: '',
            effort_md: 0,
            team_id: data?.teams[0]?.id || '',
            work_item_id: workItemId
        };
        if (isNew) {
            setNewWorkItemIssues(prev => [...prev, newIssue]);
        } else {
            addIssue(newIssue);
        }
    };

    const handleDeleteIssue = (id: string, name: string) => {
        if (isNew) {
            setNewWorkItemIssues(prev => prev.filter(e => e.id !== id));
        } else {
            deleteWithConfirm(
                'Delete Issue',
                `Are you sure you want to delete "${name}"? This will permanently remove the issue from the database.`,
                () => deleteIssue(id)
            );
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {issues.map(issue => (
                <div key={issue.id} style={{
                    padding: '16px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-secondary)'
                }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ width: '120px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input
                                type="text"
                                value={issue.jira_key}
                                placeholder="Key"
                                onChange={e => {
                                    if (isNew) {
                                        setNewWorkItemIssues(prev => prev.map(ev => ev.id === issue.id ? { ...ev, jira_key: e.target.value } : ev));
                                    } else {
                                        updateIssue(issue.id, { jira_key: e.target.value });
                                    }
                                }}
                                style={{ flex: 1, minWidth: '60px' }}
                            />
                            {issue.jira_key && issue.jira_key !== 'TBD' && data?.settings.jira.base_url && (
                                <a
                                    href={`${data.settings.jira.base_url.replace(/\/$/, '')}/browse/${issue.jira_key}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open in Jira"
                                    style={{ color: 'var(--accent-text)', textDecoration: 'none', fontSize: '14px' }}
                                >
                                    ↗
                                </a>
                            )}
                        </div>
                        <div style={{ flex: 1 }}>
                            <input
                                type="text"
                                value={issue.name}
                                placeholder="Issue Name"
                                onChange={e => {
                                    if (isNew) {
                                        setNewWorkItemIssues(prev => prev.map(ev => ev.id === issue.id ? { ...ev, name: e.target.value } : ev));
                                    } else {
                                        updateIssue(issue.id, { name: e.target.value });
                                    }
                                }}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn-primary" style={{ fontSize: '12px' }} onClick={() => syncIssue(issue.id, issue.jira_key)} disabled={syncingId === issue.id}>
                                {syncingId === issue.id ? 'Syncing...' : 'Sync from Jira'}
                            </button>
                            <button className="btn-danger" onClick={() => handleDeleteIssue(issue.id, issue.name || issue.jira_key)}>
                                Delete
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '24px', alignItems: 'center', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '25%' }}>
                            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Team:</span>
                            <select
                                value={issue.team_id}
                                onChange={e => {
                                    if (isNew) {
                                        setNewWorkItemIssues(prev => prev.map(ev => ev.id === issue.id ? { ...ev, team_id: e.target.value } : ev));
                                    } else {
                                        updateIssue(issue.id, { team_id: e.target.value });
                                    }
                                }}
                                style={{ width: '100%' }}
                            >
                                {data?.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100px' }}>
                            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Effort:</span>
                            <input
                                type="number"
                                value={issue.effort_md}
                                onChange={e => {
                                    const val = parseInt(e.target.value) || 0;
                                    if (isNew) {
                                        setNewWorkItemIssues(prev => prev.map(ev => ev.id === issue.id ? { ...ev, effort_md: val } : ev));
                                    } else {
                                        updateIssue(issue.id, { effort_md: val });
                                    }
                                }}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '180px' }}>
                            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Start:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                                <input
                                    type="date"
                                    value={issue.target_start || ''}
                                    style={{ width: '100%' }}
                                    onChange={async e => {
                                        const newStart = e.target.value;
                                        if (newStart && issue.target_end && newStart >= issue.target_end) {
                                            await showAlert('Invalid Dates', 'The Start Date must be before the End Date.');
                                            return;
                                        }
                                        if (isNew) {
                                            setNewWorkItemIssues(prev => prev.map(ev => ev.id === issue.id ? { ...ev, target_start: newStart } : ev));
                                        } else {
                                            updateIssue(issue.id, { target_start: newStart });
                                        }
                                    }}
                                />
                                {!issue.target_start && <span title="Missing start date" style={{ cursor: 'help' }}>⚠️</span>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '180px' }}>
                            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>End:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                                <input
                                    type="date"
                                    value={issue.target_end || ''}
                                    style={{ width: '100%' }}
                                    onChange={async e => {
                                        const newEnd = e.target.value;
                                        if (issue.target_start && newEnd && issue.target_start >= newEnd) {
                                            await showAlert('Invalid Dates', 'The Start Date must be before the End Date.');
                                            return;
                                        }
                                        if (isNew) {
                                            setNewWorkItemIssues(prev => prev.map(ev => ev.id === issue.id ? { ...ev, target_end: newEnd } : ev));
                                        } else {
                                            updateIssue(issue.id, { target_end: newEnd });
                                        }
                                    }}
                                />
                                {!issue.target_end && <span title="Missing end date" style={{ cursor: 'help' }}>⚠️</span>}
                            </div>
                        </div>
                        <button
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => navigate(`/issue/${issue.id}`)}
                            disabled={isNew}
                        >
                            Details ↗
                        </button>
                    </div>
                </div>
            ))}
            {issues.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No issues linked yet.</div>
            )}

            <div className={customerStyles.addWorkItemBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0 }}>Associated Issues</h3>
                    <button className="btn-primary" onClick={handleAddIssue}>+ New Issue</button>
                </div>

                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-secondary)', paddingTop: '16px' }}>
                    <h3 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>Link Existing Issue</h3>
                    <SearchableDropdown
                        options={(data?.issues || [])
                            .filter(e => e.work_item_id !== workItemId)
                            .map(e => ({ id: e.id, label: `${e.jira_key !== 'TBD' ? e.jira_key : ''} ${e.name || 'Unnamed Issue'}` }))}
                        onSelect={(issueId) => {
                            if (isNew) {
                                const issueToAssign = data?.issues.find(e => e.id === issueId);
                                if (issueToAssign) setNewWorkItemIssues(prev => [...prev, { ...issueToAssign, work_item_id: 'new' }]);
                            } else {
                                updateIssue(issueId, { work_item_id: workItemId });
                            }
                        }}
                        placeholder="Search for an unassigned issue to link..."
                    />
                </div>
            </div>
        </div>
    );
};
