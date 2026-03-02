import React, { useState } from 'react';
import { parseISO } from 'date-fns';
import type { DashboardData, WorkItem, Epic } from '../../types/models';
import { authorizedFetch } from "../../utils/api";
import { SearchableDropdown } from '../common/SearchableDropdown';
import { useDashboardContext } from '../../contexts/DashboardContext';
import styles from '../customers/CustomerPage.module.css';
import { generateId } from '../../utils/security';

export interface WorkItemPageProps {
    workItemId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    addWorkItem: (f: WorkItem) => void;
    deleteWorkItem: (id: string) => void;
    updateWorkItem: (id: string, updates: Partial<WorkItem>) => void;
    addEpic: (e: Epic) => void;
    deleteEpic: (id: string) => void;
    updateEpic: (id: string, updates: Partial<Epic>) => void;
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
    addEpic,
    updateEpic
}) => {
    const { showAlert, showConfirm } = useDashboardContext();
    const isNew = workItemId === 'new';

    // Draft states for new workItem creation
    const [newWorkItemDraft, setNewWorkItemDraft] = useState<Partial<WorkItem>>({ name: 'New Work Item', description: '', total_effort_mds: 0, customer_targets: [] });
    const [newWorkItemCustomers, setNewWorkItemCustomers] = useState<{ customerId: string, tcv_type: 'existing' | 'potential', priority: 'Must-have' | 'Should-have' | 'Nice-to-have', tcv_history_id?: string }[]>([]);
    const [newWorkItemEpics, setNewWorkItemEpics] = useState<Epic[]>([]);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'customers' | 'epics'>('customers');

    if (loading) return <div className={styles.pageContainer}>Loading work item details...</div>;
    if (error) return <div className={styles.pageContainer}>Error: {error.message}</div>;
    if (!data) return <div className={styles.pageContainer}>No data available.</div>;

    const workItem = isNew ? newWorkItemDraft as WorkItem : data.workItems.find(f => f.id === workItemId);
    if (!workItem) return <div className={styles.pageContainer}>Work Item not found.</div>;

    const targetedCustomers = isNew
        ? newWorkItemCustomers.map(nfc => data.customers.find(c => c.id === nfc.customerId)!).filter(Boolean)
        : data.customers.filter(c => workItem.customer_targets?.some(ct => ct.customer_id === c.id));

    const handleSave = async () => {
        try {
            if (isNew) {
                const newId = generateId('f');
                const newFeat: WorkItem = {
                    id: newId,
                    name: newWorkItemDraft.name || 'New Work Item',
                    description: newWorkItemDraft.description || '',
                    total_effort_mds: newWorkItemDraft.total_effort_mds || 0,
                    score: 0,
                    customer_targets: newWorkItemCustomers.map(c => ({
                        customer_id: c.customerId,
                        tcv_type: c.tcv_type,
                        priority: c.priority,
                        tcv_history_id: c.tcv_history_id
                    }))
                };

                const epicsToAdd = newWorkItemEpics.map(e => ({
                    ...e,
                    id: generateId('e'),
                    work_item_id: newId
                }));

                addWorkItem(newFeat);
                epicsToAdd.forEach(e => addEpic(e));

                setTimeout(() => {
                    onBack();
                }, 1000);
            }
        } catch (err) {
            console.error('Save failed', err);
        }
    };

    const handleDelete = async () => {
        const confirmed = await showConfirm('Delete Work Item', 'Are you sure you want to delete this work item? It will be removed from all associated epics.');
        if (!confirmed) return;
        try {
            deleteWorkItem(workItemId);
            onBack();
        } catch (err) {
            console.error('Delete failed', err);
        }
    };

    const epics = isNew ? newWorkItemEpics : data.epics.filter(e => e.work_item_id === workItemId);

    const handleAddEpic = () => {
        const tempId = generateId('e-temp-');
        const draftEpic: Epic = {
            id: tempId,
            jira_key: 'TBD',
            work_item_id: isNew ? 'new' : workItemId,
            team_id: data.teams[0]?.id || '',
            effort_md: 0,
            target_start: new Date().toISOString().split('T')[0],
            target_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            name: 'New Epic'
        };
        if (isNew) {
            setNewWorkItemEpics(prev => [...prev, draftEpic]);
        } else {
            addEpic(draftEpic);
        }
    };

    const handleUpdateEpic = async (id: string, updates: Partial<Epic>) => {
        const epic = isNew ? newWorkItemEpics.find(e => e.id === id) : data.epics.find(e => e.id === id);
        if (!epic) return;

        // Validation: Start Date must be before End Date
        const newStart = updates.target_start || epic.target_start;
        const newEnd = updates.target_end || epic.target_end;

        if (newStart && newEnd && parseISO(newStart) >= parseISO(newEnd)) {
            await showAlert('Invalid Dates', 'The Start Date must be before the End Date.');
            return;
        }

        if (isNew) {
            setNewWorkItemEpics(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
        } else {
            updateEpic(id, updates);
        }
    };

    const handleRemoveEpic = (id: string) => {
        if (isNew) {
            setNewWorkItemEpics(prev => prev.filter(e => e.id !== id));
        } else {
            updateEpic(id, { work_item_id: undefined });
        }
    };

    const handleSyncJira = async (epicId: string, jiraKey: string) => {
        if (!data.settings.jira_base_url) {
            await showAlert('Configuration Required', 'Please configure Jira Base URL in Settings first.');
            return;
        }
        setSyncingId(epicId);
        try {
            const response = await authorizedFetch('/api/jira/issue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jira_key: jiraKey,
                    jira_base_url: data.settings.jira_base_url,
                    jira_api_version: data.settings.jira_api_version || '3',
                    jira_api_token: data.settings.jira_api_token
                })
            });

            const resData = await response.json();
            if (!response.ok || !resData.success) {
                throw new Error(resData.error || 'Failed to fetch Jira data');
            }

            const issue = resData.data;
            const fields = issue.fields;
            const names = issue.names;

            let targetStartKey = '';
            let targetEndKey = '';
            let teamKey = '';

            Object.entries(names as Record<string, string>).forEach(([key, name]) => {
                if (name === 'Target start') targetStartKey = key;
                if (name === 'Target end') targetEndKey = key;
                if (name === 'Team') teamKey = key;
            });

            const updates: Partial<Epic> = {};
            if (fields.summary) updates.name = fields.summary;
            if (fields.timeestimate !== undefined && fields.timeestimate !== null) {
                updates.effort_md = Math.round(fields.timeestimate / 28800);
            }

            if (targetStartKey && fields[targetStartKey]) updates.target_start = fields[targetStartKey];
            if (targetEndKey && fields[targetEndKey]) updates.target_end = fields[targetEndKey];

            if (teamKey && fields[teamKey]) {
                const teamField = fields[teamKey];
                const jiraTeamId = (teamField.id || teamField.value || teamField.toString()).toString();
                const jiraTeamName = teamField.name || '';

                const matchedTeam = data.teams.find(t =>
                    (t.jira_team_id && t.jira_team_id.toString() === jiraTeamId) ||
                    (t.name === jiraTeamId) ||
                    (jiraTeamName && t.name === jiraTeamName)
                );
                if (matchedTeam) updates.team_id = matchedTeam.id;
            }

            handleUpdateEpic(epicId, updates);
        } catch (err: any) {
            console.error('Jira sync error:', err);
            await showAlert('Sync Error', `Error syncing from Jira: ${err.message}`);
        } finally {
            setSyncingId(null);
        }
    };

    const customersCount = (isNew ? !!newWorkItemDraft.all_customers_target : !!workItem.all_customers_target) ? 'All' : targetedCustomers.length;

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="btn-secondary" onClick={onBack}>
                        ← Back
                    </button>
                    <h1>{isNew ? 'New Work Item' : workItem.name}</h1>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                    {!isNew && (
                        <button
                            className="btn-danger"
                            onClick={handleDelete}
                        >
                            Delete Work Item
                        </button>
                    )}
                    {isNew ? (
                        <button
                            className="btn-primary"
                            onClick={handleSave}
                        >
                            Create
                        </button>
                    ) : null}
                </div>
            </div>

            <div className={styles.content}>
                <section className={styles.card}>
                    <h2>Work Item Details</h2>
                    <div className={styles.formGrid}>
                        <label>
                            Name:
                            <input
                                type="text"
                                value={isNew ? newWorkItemDraft.name : workItem.name}
                                onChange={e => {
                                    if (isNew) {
                                        setNewWorkItemDraft(prev => ({ ...prev, name: e.target.value }));
                                    } else {
                                        updateWorkItem(workItem.id, { name: e.target.value });
                                    }
                                }}
                            />
                        </label>
                        <label>
                            Total Effort (MDs):
                            <input
                                type="number"
                                min="0"
                                value={isNew ? newWorkItemDraft.total_effort_mds : workItem.total_effort_mds}
                                onChange={e => {
                                    const val = parseInt(e.target.value) || 0;
                                    if (isNew) {
                                        setNewWorkItemDraft(prev => ({ ...prev, total_effort_mds: val }));
                                    } else {
                                        updateWorkItem(workItem.id, { total_effort_mds: val });
                                    }
                                }}
                            />
                        </label>
                        <label>
                            Released in Sprint:
                            <SearchableDropdown
                                options={data.sprints.map(s => ({ id: s.id, label: s.name }))}
                                onSelect={(sprintId) => {
                                    if (isNew) {
                                        setNewWorkItemDraft(prev => ({ ...prev, released_in_sprint_id: sprintId }));
                                    } else {
                                        updateWorkItem(workItem.id, { released_in_sprint_id: sprintId });
                                    }
                                }}
                                placeholder="Select release sprint..."
                                initialValue={data.sprints.find(s => s.id === (isNew ? newWorkItemDraft.released_in_sprint_id : workItem.released_in_sprint_id))?.name || ''}
                                clearOnSelect={false}
                            />
                        </label>
                    </div>

                    <div className={styles.formGrid} style={{ marginTop: '16px' }}>
                        <label style={{ flex: 1 }}>
                            Description:
                            <textarea
                                value={isNew ? newWorkItemDraft.description : (workItem.description || '')}
                                onChange={e => {
                                    if (isNew) {
                                        setNewWorkItemDraft(prev => ({ ...prev, description: e.target.value }));
                                    } else {
                                        updateWorkItem(workItem.id, { description: e.target.value });
                                    }
                                }}
                                rows={4}
                                placeholder="Add a detailed description for this work item..."
                                style={{ resize: 'none', minHeight: '100px' }}
                            />
                        </label>
                    </div>
                </section>

                <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #334155', marginBottom: '24px', marginTop: '24px' }}>
                    <button
                        onClick={() => setActiveTab('customers')}
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: '12px 16px',
                            color: activeTab === 'customers' ? '#60a5fa' : '#94a3b8',
                            borderBottom: activeTab === 'customers' ? '2px solid #60a5fa' : '2px solid transparent',
                            cursor: 'pointer',
                            fontSize: '15px',
                            fontWeight: activeTab === 'customers' ? 'bold' : '500',
                            transition: 'all 0.2s'
                        }}
                    >
                        Targeted Customers ({customersCount})
                    </button>
                    <button
                        onClick={() => setActiveTab('epics')}
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: '12px 16px',
                            color: activeTab === 'epics' ? '#60a5fa' : '#94a3b8',
                            borderBottom: activeTab === 'epics' ? '2px solid #60a5fa' : '2px solid transparent',
                            cursor: 'pointer',
                            fontSize: '15px',
                            fontWeight: activeTab === 'epics' ? 'bold' : '500',
                            transition: 'all 0.2s'
                        }}
                    >
                        Epics ({epics.length})
                    </button>
                </div>

                {activeTab === 'customers' && (
                    <section className={styles.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2>Targeted Customers</h2>
                        </div>

                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Customer</th>
                                    <th>TCV Target</th>
                                    <th>Priority</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderLeft: '4px solid #3b82f6' }}>
                                    <td style={{ fontWeight: 'bold' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={isNew ? !!newWorkItemDraft.all_customers_target : !!workItem.all_customers_target}
                                                onChange={e => {
                                                    const checked = e.target.checked;
                                                    const defaultTarget = { tcv_type: 'existing' as const, priority: 'Must-have' as const };
                                                    if (isNew) {
                                                        setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: checked ? defaultTarget : undefined }));
                                                    } else {
                                                        updateWorkItem(workItem.id, { all_customers_target: checked ? defaultTarget : undefined });
                                                    }
                                                }}
                                            />
                                            ALL CUSTOMERS (Global)
                                        </label>
                                    </td>
                                    <td>
                                        {(isNew ? !!newWorkItemDraft.all_customers_target : !!workItem.all_customers_target) && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <select
                                                    value={isNew ? newWorkItemDraft.all_customers_target?.tcv_type : workItem.all_customers_target?.tcv_type}
                                                    onChange={e => {
                                                        const type = e.target.value as 'existing' | 'potential';
                                                        if (isNew) {
                                                            setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: { ...prev.all_customers_target!, tcv_type: type } }));
                                                        } else {
                                                            updateWorkItem(workItem.id, { all_customers_target: { ...workItem.all_customers_target!, tcv_type: type } });
                                                        }
                                                    }}
                                                >
                                                    <option value="existing">Existing TCV</option>
                                                    <option value="potential">Potential TCV</option>
                                                </select>
                                                {(isNew ? newWorkItemDraft.all_customers_target?.tcv_type === 'existing' : workItem.all_customers_target?.tcv_type === 'existing') && (
                                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Always uses latest actual TCV</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        {(isNew ? !!newWorkItemDraft.all_customers_target : !!workItem.all_customers_target) && (
                                            <select
                                                value={isNew ? newWorkItemDraft.all_customers_target?.priority : workItem.all_customers_target?.priority}
                                                onChange={e => {
                                                    const prio = e.target.value as 'Must-have' | 'Should-have' | 'Nice-to-have';
                                                    if (isNew) {
                                                        setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: { ...prev.all_customers_target!, priority: prio } }));
                                                    } else {
                                                        updateWorkItem(workItem.id, { all_customers_target: { ...workItem.all_customers_target!, priority: prio } });
                                                    }
                                                }}
                                            >
                                                <option value="Must-have">Must-have</option>
                                                <option value="Should-have">Should-have</option>
                                                <option value="Nice-to-have">Nice-to-have</option>
                                            </select>
                                        )}
                                    </td>
                                    <td></td>
                                </tr>

                                {!(isNew ? !!newWorkItemDraft.all_customers_target : !!workItem.all_customers_target) && targetedCustomers.map(customer => {
                                    const targetDef = isNew
                                        ? newWorkItemCustomers.find(nfc => nfc.customerId === customer.id)!
                                        : workItem.customer_targets?.find(ct => ct.customer_id === customer.id)!;

                                    const updateTarget = (updates: Partial<typeof targetDef>) => {
                                        if (isNew) {
                                            setNewWorkItemCustomers(prev => prev.map(nfc =>
                                                nfc.customerId === customer.id ? { ...nfc, ...updates } : nfc
                                            ));
                                        } else {
                                            const newTargets = workItem.customer_targets!.map(ct =>
                                                ct.customer_id === customer.id ? { ...ct, ...updates } : ct
                                            );
                                            updateWorkItem(workItem.id, { customer_targets: newTargets as any });
                                        }
                                    };

                                    const removeTarget = () => {
                                        if (isNew) {
                                            setNewWorkItemCustomers(prev => prev.filter(nfc => nfc.customerId !== customer.id));
                                        } else {
                                            const newTargets = workItem.customer_targets!.filter(ct => ct.customer_id !== customer.id);
                                            updateWorkItem(workItem.id, { customer_targets: newTargets });
                                        }
                                    };

                                    return (
                                        <tr key={customer.id}>
                                            <td>{customer.name}</td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <select
                                                        value={targetDef.tcv_type}
                                                        onChange={e => updateTarget({ tcv_type: e.target.value as 'existing' | 'potential', tcv_history_id: undefined })}
                                                    >
                                                        <option value="existing">Existing</option>
                                                        <option value="potential">Potential</option>
                                                    </select>
                                                    
                                                    {targetDef.tcv_type === 'existing' && customer.tcv_history && customer.tcv_history.length > 0 && (
                                                        <select
                                                            value={targetDef.tcv_history_id || 'latest'}
                                                            onChange={e => updateTarget({ tcv_history_id: e.target.value === 'latest' ? undefined : e.target.value })}
                                                            style={{ fontSize: '12px', marginTop: '4px', backgroundColor: '#1e293b', color: '#fff', border: '1px solid #334155' }}
                                                        >
                                                            <option value="latest">Latest Actual (${customer.existing_tcv.toLocaleString()})</option>
                                                            {customer.tcv_history.map(h => (
                                                                <option key={h.id} value={h.id}>
                                                                    {h.valid_from}: ${h.value.toLocaleString()}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <select
                                                    value={targetDef.priority || 'Must-have'}
                                                    onChange={e => updateTarget({ priority: e.target.value as 'Must-have' | 'Should-have' | 'Nice-to-have' })}
                                                >
                                                    <option value="Must-have">Must-have</option>
                                                    <option value="Should-have">Should-have</option>
                                                    <option value="Nice-to-have">Nice-to-have</option>
                                                </select>
                                            </td>
                                            <td>
                                                <button onClick={removeTarget} className="btn-danger">Remove</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {targetedCustomers.length === 0 && !(isNew ? !!newWorkItemDraft.all_customers_target : !!workItem.all_customers_target) && (
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No targeted customers found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <div className={styles.addWorkItemBox}>
                            <h3>Add Customer Target</h3>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <SearchableDropdown
                                    options={data.customers
                                        .filter(c => !targetedCustomers.find(tc => tc.id === c.id))
                                        .map(c => ({ id: c.id, label: c.name }))
                                    }
                                    onSelect={(customerSelectId) => {
                                        if (isNew) {
                                            setNewWorkItemCustomers(prev => [...prev, {
                                                customerId: customerSelectId,
                                                tcv_type: 'potential',
                                                priority: 'Should-have'
                                            }]);
                                        } else {
                                            const newTargets = [...(workItem.customer_targets || []), {
                                                customer_id: customerSelectId,
                                                tcv_type: 'potential',
                                                priority: 'Should-have'
                                            }];
                                            updateWorkItem(workItemId, { customer_targets: newTargets as any });
                                        }
                                    }}
                                    placeholder="Search for a customer to target..."
                                />
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === 'epics' && (
                    <section className={styles.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2>Epics</h2>
                            <button className="btn-primary" onClick={handleAddEpic}>+ Create New Epic</button>
                        </div>

                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Jira Key</th>
                                    <th>Team</th>
                                    <th>Effort MDs</th>
                                    <th>Start Date</th>
                                    <th>End Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {epics.map(epic => (
                                    <tr key={epic.id}>
                                        <td>
                                            <input type="text" value={epic.name || ''} onChange={e => handleUpdateEpic(epic.id, { name: e.target.value })} style={{ width: '100%', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }} />
                                        </td>
                                        <td>
                                            <input type="text" value={epic.jira_key} onChange={e => handleUpdateEpic(epic.id, { jira_key: e.target.value })} style={{ width: '80px', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }} />
                                        </td>
                                        <td>
                                            <SearchableDropdown
                                                options={data.teams.map(t => ({ id: t.id, label: t.name }))}
                                                onSelect={(teamId) => handleUpdateEpic(epic.id, { team_id: teamId })}
                                                placeholder="Select Team"
                                                initialValue={data.teams.find(t => t.id === epic.team_id)?.name || ''}
                                                clearOnSelect={false}
                                            />
                                        </td>
                                        <td>
                                            <input type="number" min="0" value={epic.effort_md} onChange={e => handleUpdateEpic(epic.id, { effort_md: parseInt(e.target.value) || 0 })} style={{ width: '50px', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }} />
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <input type="date" value={epic.target_start || ''} onChange={e => handleUpdateEpic(epic.id, { target_start: e.target.value })} style={{ width: '110px', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }} />
                                                {!epic.target_start && <span title="Missing start date" style={{ fontSize: '16px' }}>⚠️</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <input type="date" value={epic.target_end || ''} onChange={e => handleUpdateEpic(epic.id, { target_end: e.target.value })} style={{ width: '110px', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }} />
                                                {!epic.target_end && <span title="Missing end date" style={{ fontSize: '16px' }}>⚠️</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    onClick={() => handleSyncJira(epic.id, epic.jira_key)}
                                                    disabled={!epic.jira_key || epic.jira_key === 'TBD' || syncingId === epic.id}
                                                    className="btn-secondary"
                                                    style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}
                                                >
                                                    {syncingId === epic.id ? 'Syncing...' : 'Sync from Jira'}
                                                </button>
                                                <button onClick={() => handleRemoveEpic(epic.id)} className="btn-danger" style={{ padding: '6px 12px' }}>Remove</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {epics.length === 0 && (
                                    <tr>
                                        <td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No epics currently mapped to this work item.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <div className={styles.addWorkItemBox}>
                            <h3>Assign Existing Epic</h3>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <SearchableDropdown
                                    options={data.epics
                                        .filter(e => !e.work_item_id || e.work_item_id === 'UNASSIGNED')
                                        .map(e => ({ id: e.id, label: `${e.jira_key !== 'TBD' ? e.jira_key : ''} ${e.name || 'Unnamed Epic'}` }))
                                }
                                onSelect={(epicId) => {
                                    if (isNew) {
                                        const epicToAssign = data.epics.find(e => e.id === epicId);
                                        if (epicToAssign) setNewWorkItemEpics(prev => [...prev, epicToAssign]);
                                    } else {
                                        updateEpic(epicId, { work_item_id: workItemId });
                                    }
                                }}
                                placeholder="Search for an unassigned epic to link..."
                                />
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};
