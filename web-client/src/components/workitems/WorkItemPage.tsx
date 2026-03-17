import React, { useState } from 'react';
import type { ValueStreamData, WorkItem, Issue } from '../../types/models';
import { syncJiraIssue, syncAhaFeature } from "../../utils/api";
import { SearchableDropdown } from '../common/SearchableDropdown';
import { useValueStreamContext } from '../../contexts/ValueStreamContext';
import { generateId } from '../../utils/security';
import { calculateWorkItemEffort, calculateWorkItemTcv, parseJiraIssue } from '../../utils/businessLogic';
import { GenericDetailPage, type DetailTab } from '../common/GenericDetailPage';
import customerStyles from '../customers/CustomerPage.module.css';
import { useNavigate } from 'react-router-dom';

export interface WorkItemPageProps {
    workItemId: string;
    onBack: () => void;
    data: ValueStreamData | null;
    loading: boolean;
    error: Error | null;
    addWorkItem: (f: WorkItem) => void;
    deleteWorkItem: (id: string) => void;
    updateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
    addIssue: (e: Issue) => void;
    deleteIssue: (id: string) => void;
    updateIssue: (id: string, updates: Partial<Issue>, immediate?: boolean) => Promise<void>;
}

export const WorkItemPage: React.FC<WorkItemPageProps> = ({
    workItemId,
    onBack,
    data,
    loading,
    error,
    addWorkItem,
    deleteWorkItem,
    updateWorkItem,
    addIssue,
    deleteIssue,
    updateIssue
}) => {
    const { showAlert, showConfirm } = useValueStreamContext();
    const navigate = useNavigate();
    const isNew = workItemId === 'new';

    // Draft states for new workItem creation
    const [newWorkItemDraft, setNewWorkItemDraft] = useState<Partial<WorkItem>>({ name: '', description: '', total_effort_mds: 0, customer_targets: [] });
    const [newWorkItemCustomers, setNewWorkItemCustomers] = useState<{ customerId: string, tcv_type: 'existing' | 'potential', priority: 'Must-have' | 'Should-have' | 'Nice-to-have', tcv_history_id?: string }[]>([]);
    const [newWorkItemIssues, setNewWorkItemIssues] = useState<Issue[]>([]);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [isSyncingAha, setIsSyncingAha] = useState(false);

    const workItem = isNew ? newWorkItemDraft as WorkItem : data?.workItems.find(f => f.id === workItemId);

    const stripHtml = (html: string) => {
        const tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    };

    const handleSyncAha = async () => {
        if (!workItem?.aha_reference?.reference_num) {
            await showAlert('Aha! Sync', 'Please provide an Aha! Reference Number first.');
            return;
        }

        setIsSyncingAha(true);
        try {
            const feature = await syncAhaFeature(workItem.aha_reference.reference_num, data?.settings?.aha || {});
            
            const syncedData: NonNullable<WorkItem['aha_synced_data']> = {
                name: feature.name,
                description: feature.description?.body ? stripHtml(feature.description.body) : '',
                score: feature.score,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                requirements: feature.requirements?.map((r: any) => ({
                    id: r.id,
                    reference_num: r.reference_num,
                    name: r.name,
                    description: r.description?.body ? stripHtml(r.description.body) : '',
                    url: r.url
                })) || []
            };

            // Convert original_estimate (minutes) to MDs (1 MD = 480 minutes)
            if (feature.original_estimate) {
                syncedData.total_effort_mds = Math.round(feature.original_estimate / 480);
            }

            const updates: Partial<WorkItem> = {
                aha_synced_data: syncedData,
                aha_reference: {
                    ...workItem.aha_reference,
                    id: feature.id,
                    url: feature.url,
                    reference_num: workItem.aha_reference.reference_num
                }
            };

            if (isNew) {
                setNewWorkItemDraft(prev => ({ ...prev, ...updates }));
            } else {
                updateWorkItem(workItemId, updates);
            }
            await showAlert('Aha! Sync', `Successfully synced data from ${feature.reference_num}.`);
        } catch (err: unknown) {
            console.error('Aha! Sync failed', err);
            const msg = err instanceof Error ? err.message : 'An unexpected error occurred during Aha! sync.';
            await showAlert('Aha! Sync Failed', msg);
        } finally {
            setIsSyncingAha(false);
        }
    };

    const applyAhaData = async () => {
        if (!workItem?.aha_synced_data) return;
        
        const confirmed = await showConfirm('Apply Aha! Data', 'This will overwrite the current name, description, baseline effort, and score with the values from Aha!. Are you sure?');
        if (!confirmed) return;

        const updates: Partial<WorkItem> = {};
        if (workItem.aha_synced_data.name) updates.name = workItem.aha_synced_data.name;
        if (workItem.aha_synced_data.description) updates.description = workItem.aha_synced_data.description;
        if (workItem.aha_synced_data.total_effort_mds !== undefined) updates.total_effort_mds = workItem.aha_synced_data.total_effort_mds;
        if (workItem.aha_synced_data.score !== undefined) updates.score = workItem.aha_synced_data.score;

        if (isNew) {
            setNewWorkItemDraft(prev => ({ ...prev, ...updates }));
        } else {
            updateWorkItem(workItemId, updates);
        }
        await showAlert('Aha! Data Applied', 'The work item has been updated with data from Aha!.');
    };

    const targetedCustomers = (isNew && data)
        ? newWorkItemCustomers.map(nfc => data.customers.find(c => c.id === nfc.customerId)!).filter(Boolean)
        : data?.customers.filter(c => workItem?.customer_targets?.some(ct => ct.customer_id === c.id)) || [];

    const issues = isNew ? newWorkItemIssues : (data?.issues || []).filter(e => e.work_item_id === workItemId);
    const calculatedEffort = workItem && data ? calculateWorkItemEffort(workItem, issues) : 0;
    const calculatedTcv = workItem && data ? calculateWorkItemTcv(workItem, data.customers, data.workItems) : 0;

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

    const handleDeleteIssue = async (id: string, name: string) => {
        if (isNew) {
            setNewWorkItemIssues(prev => prev.filter(e => e.id !== id));
        } else {
            const confirmed = await showConfirm('Delete Issue', `Are you sure you want to delete "${name}"? This will permanently remove the issue from the database.`);
            if (confirmed) {
                deleteIssue(id);
            }
        }
    };

    const handleSave = async () => {
        if (!data) return;
        try {
            if (isNew) {
                const newId = generateId('f');
                const newFeat: WorkItem = {
                    id: newId,
                    name: newWorkItemDraft.name || 'New Work Item',
                    description: newWorkItemDraft.description || '',
                    total_effort_mds: newWorkItemDraft.total_effort_mds || 0,
                    score: newWorkItemDraft.score || 0,
                    customer_targets: newWorkItemCustomers.map(c => ({
                        customer_id: c.customerId,
                        tcv_type: c.tcv_type,
                        priority: c.priority,
                        tcv_history_id: c.tcv_history_id
                    }))
                };

                const issuesToAdd = newWorkItemIssues.map(e => ({
                    ...e,
                    id: generateId('e'),
                    work_item_id: newId
                }));

                addWorkItem(newFeat);
                issuesToAdd.forEach(e => addIssue(e));

                setTimeout(() => {
                    onBack();
                }, 1000);
            }
        } catch (err) {
            console.error('Save failed', err);
        }
    };

    const handleDelete = async () => {
        const confirmed = await showConfirm('Delete Work Item', 'Are you sure you want to delete this work item? It will be removed from all associated issues.');
        if (!confirmed) return;
        try {
            deleteWorkItem(workItemId);
            onBack();
        } catch (err) {
            console.error('Delete failed', err);
        }
    };

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

    if (!workItem && !loading) {
        return <GenericDetailPage entityTitle="Work Item Not Found" onBack={onBack} mainDetails={<div>Work Item not found.</div>} loading={loading} data={data} />;
    }

    const mainDetails = (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                <label>
                    Name:
                    <input
                        type="text"
                        value={workItem?.name || ''}
                        onChange={e => {
                            if (isNew) setNewWorkItemDraft(prev => ({ ...prev, name: e.target.value }));
                            else updateWorkItem(workItemId, { name: e.target.value });
                        }}
                        placeholder="New Work Item"
                    />
                </label>
                <label>
                    Baseline Effort (MDs):
                    <input
                        type="number"
                        min="0"
                        value={workItem?.total_effort_mds || 0}
                        onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            if (isNew) setNewWorkItemDraft(prev => ({ ...prev, total_effort_mds: val }));
                            else updateWorkItem(workItemId, { total_effort_mds: val });
                        }}
                    />
                </label>
                <label>
                    Released in Sprint:
                    <SearchableDropdown
                        options={data?.sprints.map(s => ({ id: s.id, label: s.name })) || []}
                        onSelect={(sprintId) => {
                            if (isNew) setNewWorkItemDraft(prev => ({ ...prev, released_in_sprint_id: sprintId }));
                            else updateWorkItem(workItemId, { released_in_sprint_id: sprintId });
                        }}
                        placeholder="Select release sprint..."
                        initialValue={data?.sprints.find(s => s.id === (workItem?.released_in_sprint_id))?.name || ''}
                        clearOnSelect={false}
                    />
                </label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                <label style={{ flex: 1 }}>
                    Description:
                    <textarea
                        value={workItem?.description || ''}
                        onChange={e => {
                            if (isNew) setNewWorkItemDraft(prev => ({ ...prev, description: e.target.value }));
                            else updateWorkItem(workItemId, { description: e.target.value });
                        }}
                        rows={4}
                        placeholder="Add a detailed description for this work item..."
                        style={{ resize: 'none', minHeight: '100px', backgroundColor: 'var(--bg-primary)' }}
                    />
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-secondary)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '4px' }}>Total Impact (TCV)</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-text)' }}>
                            ${calculatedTcv.toLocaleString()}
                        </div>
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-secondary)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '4px' }}>Combined Effort</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-text)' }}>
                            {calculatedEffort.toLocaleString()} MDs
                        </div>
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-secondary)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '4px' }}>ROI Score</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-text)' }}>
                            {(calculatedTcv / Math.max(calculatedEffort, 1)).toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    const tabs: DetailTab[] = [
        {
            id: 'customers',
            label: `Targeted Customers (${targetedCustomers.length})`,
            content: (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <input
                            type="checkbox"
                            id="global-checkbox"
                            checked={!!workItem?.all_customers_target}
                            onChange={e => {
                                const val = e.target.checked ? { tcv_type: 'existing' as const, priority: 'Must-have' as const } : null;
                                if (isNew) setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: val }));
                                else updateWorkItem(workItemId, { all_customers_target: val });
                            }}
                        />
                        <label htmlFor="global-checkbox" style={{ fontWeight: '600', color: 'var(--accent-text)', cursor: 'pointer' }}>
                            ALL CUSTOMERS (Global)
                        </label>
                    </div>

                    {workItem?.all_customers_target ? (
                        <div style={{ padding: '16px', backgroundColor: 'rgba(96, 165, 250, 0.05)', borderRadius: '8px', border: '1px solid rgba(96, 165, 250, 0.2)' }}>
                            <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-muted)' }}>
                                This initiative relates to all customers (e.g. core maintenance, tech debt).
                            </p>
                            <div className={customerStyles.formGrid}>
                                <label>
                                    TCV Basis:
                                    <select
                                        value={workItem.all_customers_target.tcv_type}
                                        onChange={e => {
                                            const val = { ...workItem.all_customers_target!, tcv_type: e.target.value as 'existing' | 'potential' };
                                            if (isNew) setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: val }));
                                            else updateWorkItem(workItemId, { all_customers_target: val });
                                        }}
                                    >
                                        <option value="existing">Total Existing TCV</option>
                                        <option value="potential">Total Potential TCV</option>
                                    </select>
                                </label>
                                <label>
                                    Priority:
                                    <select
                                        value={workItem.all_customers_target.priority}
                                        onChange={e => {
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            const val = { ...workItem.all_customers_target!, priority: e.target.value as any };
                                            if (isNew) setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: val }));
                                            else updateWorkItem(workItemId, { all_customers_target: val });
                                        }}
                                    >
                                        <option value="Must-have">Must-have</option>
                                        <option value="Should-have">Should-have</option>
                                        <option value="Nice-to-have">Nice-to-have</option>
                                    </select>
                                </label>
                            </div>
                        </div>
                    ) : (
                        <>
                            <table className={customerStyles.table}>
                                <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th>TCV Type</th>
                                        <th>TCV Selection</th>
                                        <th>Priority</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {targetedCustomers.map(customer => {
                                        const target = isNew 
                                            ? newWorkItemCustomers.find(c => c.customerId === customer.id)
                                            : workItem?.customer_targets?.find(ct => ct.customer_id === customer.id);
                                        
                                        if (!target) return null;

                                        const updateTarget = (updates: Partial<{ tcv_type: 'existing' | 'potential'; priority: 'Must-have' | 'Should-have' | 'Nice-to-have'; tcv_history_id?: string }>) => {
                                            if (isNew) {
                                                setNewWorkItemCustomers(prev => prev.map(c => c.customerId === customer.id ? { ...c, ...updates } as typeof c : c));
                                            } else {
                                                const newTargets = workItem?.customer_targets?.map(ct => ct.customer_id === customer.id ? { ...ct, ...updates } : ct);
                                                updateWorkItem(workItemId, { customer_targets: newTargets });
                                            }
                                        };

                                        return (
                                            <tr key={customer.id}>
                                                <td>{customer.name}</td>
                                                <td>
                                                    <select value={target.tcv_type} onChange={e => updateTarget({ tcv_type: e.target.value as 'existing' | 'potential' })}>
                                                        <option value="existing">Existing</option>
                                                        <option value="potential">Potential</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    {target.tcv_type === 'existing' ? (
                                                        <select
                                                            value={target.tcv_history_id || 'latest'}
                                                            onChange={e => updateTarget({ tcv_history_id: e.target.value === 'latest' ? undefined : e.target.value })}
                                                        >
                                                            <option value="latest">Latest Actual (${customer.existing_tcv.toLocaleString()})</option>
                                                            {customer.tcv_history?.map(h => (
                                                                <option key={h.id} value={h.id}>{h.valid_from} (${h.value.toLocaleString()})</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)' }}>${customer.potential_tcv.toLocaleString()}</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                                    <select value={target.priority} onChange={e => updateTarget({ priority: e.target.value as any })}>
                                                        <option value="Must-have">Must-have</option>
                                                        <option value="Should-have">Should-have</option>
                                                        <option value="Nice-to-have">Nice-to-have</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <button
                                                        className="btn-danger"
                                                        onClick={() => {
                                                            if (isNew) setNewWorkItemCustomers(prev => prev.filter(c => c.customerId !== customer.id));
                                                            else updateWorkItem(workItemId, { customer_targets: workItem?.customer_targets?.filter(ct => ct.customer_id !== customer.id) });
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {targetedCustomers.length === 0 && (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No customers targeted yet.</td></tr>
                                    )}
                                </tbody>
                            </table>

                            <div className={customerStyles.addWorkItemBox}>
                                <h3>Target a Customer</h3>
                                <SearchableDropdown
                                    options={(data?.customers || [])
                                        .filter(c => !targetedCustomers.find(tc => tc.id === c.id))
                                        .map(c => ({ id: c.id, label: c.name }))}
                                    onSelect={(customerId) => {
                                        const newTarget = { customerId, tcv_type: 'existing' as const, priority: 'Should-have' as const };
                                        if (isNew) setNewWorkItemCustomers(prev => [...prev, newTarget]);
                                        else updateWorkItem(workItemId, { customer_targets: [...(workItem?.customer_targets || []), { customer_id: customerId, tcv_type: 'existing', priority: 'Should-have' }] });
                                    }}
                                    placeholder="Search for a customer to target..."
                                />
                            </div>
                        </>
                    )}
                </>
            )
        },
        {
            id: 'issues',
            label: `Engineering Issues (${issues.length})`,
            content: (
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
            )
        }
    ];

    if (data?.settings?.aha?.subdomain) {
        const ahaCount = workItem?.aha_synced_data?.requirements?.length || 0;
        tabs.push({
            id: 'aha',
            label: `Aha! Integration (${ahaCount})`,
            content: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Link to Aha! Feature</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            Enter the Aha! Reference Number (e.g., <code>PROD-123</code>) to link this work item and sync its details.
                        </p>
                        
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ width: '120px' }}>
                                <input
                                    type="text"
                                    placeholder="PROD-123"
                                    value={workItem?.aha_reference?.reference_num || ''}
                                    onChange={e => {
                                        const val = { 
                                            id: workItem?.aha_reference?.id || '',
                                            url: workItem?.aha_reference?.url || '',
                                            reference_num: e.target.value 
                                        };
                                        if (isNew) setNewWorkItemDraft(prev => ({ ...prev, aha_reference: val }));
                                        else updateWorkItem(workItemId, { aha_reference: val });
                                    }}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            {workItem?.aha_reference?.url && (
                                <a 
                                    href={workItem.aha_reference.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    title="Open in Aha!"
                                    style={{ color: 'var(--accent-text)', textDecoration: 'none', fontSize: '18px', fontWeight: 'bold' }}
                                >
                                    ↗
                                </a>
                            )}
                            <button 
                                className="btn-primary" 
                                onClick={handleSyncAha} 
                                disabled={isSyncingAha || !workItem?.aha_reference?.reference_num}
                                style={{ marginLeft: 'auto' }}
                            >
                                {isSyncingAha ? 'Syncing...' : 'Sync from Aha!'}
                            </button>
                        </div>
                    </div>

                    {workItem?.aha_synced_data && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h3 style={{ margin: 0, fontSize: '15px' }}>Synced Information</h3>
                                        <button className="btn-primary" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={applyAhaData}>
                                            Apply to Work Item
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Name</div>
                                            <div style={{ fontSize: '14px', fontWeight: '500' }}>{workItem.aha_synced_data.name}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Description</div>
                                            <div style={{ fontSize: '13px', maxHeight: '150px', overflowY: 'auto', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', padding: '8px', borderRadius: '4px' }}>
                                                {workItem.aha_synced_data.description || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No description</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '32px' }}>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Effort (MDs)</div>
                                                <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-text)' }}>{workItem.aha_synced_data.total_effort_mds ?? '-'}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Score</div>
                                                <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-text)' }}>{workItem.aha_synced_data.score ?? '-'}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                                    <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Requirements ({workItem.aha_synced_data.requirements?.length || 0})</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto', paddingRight: '4px' }}>
                                        {workItem.aha_synced_data.requirements?.map(req => (
                                            <div key={req.id} style={{ padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-secondary)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--accent-text)' }}>{req.reference_num}</span>
                                                    {req.url && (
                                                        <a href={req.url} target="_blank" rel="noopener noreferrer" title="Open Requirement in Aha!" style={{ fontSize: '14px', color: 'var(--text-muted)', textDecoration: 'none' }}>↗</a>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>{req.name}</div>
                                                {req.description && (
                                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', padding: '8px', borderRadius: '4px', borderLeft: '3px solid var(--border-secondary)' }}>
                                                        {req.description}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {(!workItem.aha_synced_data.requirements || workItem.aha_synced_data.requirements.length === 0) && (
                                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '24px' }}>No requirements found.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )
        });
    }

    return (
        <GenericDetailPage
            entityTitle={isNew ? 'Create New Work Item' : `Work Item: ${workItem?.name}`}
            onBack={onBack}
            mainDetails={mainDetails}
            tabs={tabs}
            loading={loading}
            error={error}
            data={data}
            actions={
                <div style={{ display: 'flex', gap: '12px' }}>
                    {!isNew && (
                        <button className="btn-danger" onClick={handleDelete}>Delete Work Item</button>
                    )}
                    {isNew && (
                        <button className="btn-primary" onClick={handleSave}>Save Work Item</button>
                    )}
                </div>
            }
        />
    );
};
