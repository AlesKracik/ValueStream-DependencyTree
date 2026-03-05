import React, { useState } from 'react';
import type { DashboardData, WorkItem, Epic } from '../../types/models';
import { authorizedFetch, syncJiraIssue } from "../../utils/api";
import { SearchableDropdown } from '../common/SearchableDropdown';
import { useDashboardContext } from '../../contexts/DashboardContext';
import styles from '../customers/CustomerPage.module.css';
import { generateId } from '../../utils/security';
import { calculateWorkItemEffort, calculateWorkItemTcv, parseJiraIssue } from '../../utils/businessLogic';
import { PageWrapper } from '../layout/PageWrapper';

export interface WorkItemPageProps {
    workItemId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    addWorkItem: (f: WorkItem) => void;
    deleteWorkItem: (id: string) => void;
    updateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
    addEpic: (e: Epic) => void;
    deleteEpic: (id: string) => void;
    updateEpic: (id: string, updates: Partial<Epic>, immediate?: boolean) => Promise<void>;
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
    deleteEpic,
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

    const workItem = isNew ? newWorkItemDraft as WorkItem : data?.workItems.find(f => f.id === workItemId);

    const targetedCustomers = (isNew && data)
        ? newWorkItemCustomers.map(nfc => data.customers.find(c => c.id === nfc.customerId)!).filter(Boolean)
        : data?.customers.filter(c => workItem?.customer_targets?.some(ct => ct.customer_id === c.id)) || [];

    const epics = isNew ? newWorkItemEpics : data?.epics.filter(e => e.work_item_id === workItemId) || [];
    const calculatedEffort = workItem && data ? calculateWorkItemEffort(workItem, epics) : 0;
    const calculatedTcv = workItem && data ? calculateWorkItemTcv(workItem, data.customers) : 0;

    const handleAddEpic = () => {
        const newId = generateId('e');
        const newEpic: Epic = {
            id: newId,
            jira_key: 'TBD',
            name: 'New Epic',
            effort_md: 0,
            team_id: data?.teams[0]?.id || '',
            work_item_id: workItemId
        };
        if (isNew) {
            setNewWorkItemEpics(prev => [...prev, newEpic]);
        } else {
            addEpic(newEpic);
        }
    };

    const handleDeleteEpic = async (id: string, name: string) => {
        if (isNew) {
            setNewWorkItemEpics(prev => prev.filter(e => e.id !== id));
        } else {
            const confirmed = await showConfirm('Delete Epic', `Are you sure you want to delete "${name}"? This will permanently remove the epic from the database.`);
            if (confirmed) {
                deleteEpic(id);
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

    const syncEpic = async (id: string, jiraKey: string) => {
        setSyncingId(id);
        try {
            const issueData = await syncJiraIssue(jiraKey, data?.settings || {});
            const updates = parseJiraIssue(issueData, data?.teams || []);
            
            if (isNew) {
                setNewWorkItemEpics(prev => prev.map(e => e.id === id ? { 
                    ...e, 
                    ...updates,
                    team_id: updates.team_id || e.team_id || (data?.teams[0]?.id || '')
                } : e));
            } else {
                updateEpic(id, updates);
            }
        } catch (err: any) {
            console.error('Sync failed', err);
            await showAlert('Sync Failed', err.message || 'An unexpected error occurred during sync.');
        } finally {
            setSyncingId(null);
        }
    };

    return (
        <PageWrapper
            loading={loading}
            error={error}
            data={data}
            loadingMessage="Loading work item details..."
            emptyMessage="No data available."
        >
            {!workItem ? (
                <div className={styles.empty}>Work Item not found.</div>
            ) : (
                <>
                    <header className={styles.header}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            <button onClick={onBack} className="btn-secondary">← Back</button>
                            <h1>{isNew ? 'New Work Item' : workItem.name}</h1>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {!isNew && <button onClick={handleDelete} className="btn-danger">Delete Work Item</button>}
                            {isNew && <button onClick={handleSave} className="btn-primary">Create Work Item</button>}
                        </div>
                    </header>

                    <div className={styles.content}>
                        <section className={styles.card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #374151', paddingBottom: '12px', marginBottom: '24px' }}>
                                <h2 style={{ margin: 0, border: 'none', padding: 0 }}>Work Item Details</h2>
                                <div style={{ display: 'flex', gap: '24px' }}>
                                    <div style={{ fontSize: '14px', color: '#94a3b8' }}>
                                        <span style={{ fontWeight: 'bold', color: '#60a5fa', marginRight: '8px' }}>Total Effort:</span>
                                        <span style={{ color: '#f1f5f9' }}>{calculatedEffort.toLocaleString()} MDs</span>
                                    </div>
                                    <div style={{ fontSize: '14px', color: '#94a3b8' }}>
                                        <span style={{ fontWeight: 'bold', color: '#60a5fa', marginRight: '8px' }}>TCV Impact:</span>
                                        <span style={{ color: '#f1f5f9' }}>${calculatedTcv.toLocaleString()}</span>
                                    </div>
                                    <div style={{ fontSize: '14px', color: '#94a3b8' }}>
                                        <span style={{ fontWeight: 'bold', color: '#60a5fa', marginRight: '8px' }}>RICE Score:</span>
                                        <span style={{ color: '#f1f5f9' }}>{Math.round(workItem.score || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.formGrid}>
                                <label>
                                    Name:
                                    <input
                                        type="text"
                                        value={workItem.name}
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
                                        value={workItem.total_effort_mds}
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
                                        options={data?.sprints.map(s => ({ id: s.id, label: s.name })) || []}
                                        onSelect={(sprintId) => {
                                            if (isNew) {
                                                setNewWorkItemDraft(prev => ({ ...prev, released_in_sprint_id: sprintId }));
                                            } else {
                                                updateWorkItem(workItem.id, { released_in_sprint_id: sprintId });
                                            }
                                        }}
                                        placeholder="Select release sprint..."
                                        initialValue={data?.sprints.find(s => s.id === (workItem.released_in_sprint_id))?.name || ''}
                                        clearOnSelect={false}
                                    />
                                </label>
                            </div>

                            <div className={styles.formGrid} style={{ marginTop: '16px' }}>                                <label style={{ flex: 1 }}>
                                    Description:
                                    <textarea
                                        value={workItem.description || ''}
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
                                Targeted Customers ({targetedCustomers.length})
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                    <input
                                        type="checkbox"
                                        id="global-checkbox"
                                        checked={!!workItem.all_customers_target}
                                        onChange={e => {
                                            const val = e.target.checked ? { tcv_type: 'existing' as const, priority: 'Must-have' as const } : undefined;
                                            if (isNew) {
                                                setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: val }));
                                            } else {
                                                updateWorkItem(workItem.id, { all_customers_target: val });
                                            }
                                        }}
                                    />
                                    <label htmlFor="global-checkbox" style={{ fontWeight: '600', color: '#60a5fa', cursor: 'pointer' }}>
                                        ALL CUSTOMERS (Global)
                                    </label>
                                </div>

                                {workItem.all_customers_target ? (
                                    <div style={{ padding: '16px', backgroundColor: 'rgba(96, 165, 250, 0.05)', borderRadius: '8px', border: '1px solid rgba(96, 165, 250, 0.2)' }}>
                                        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#94a3b8' }}>
                                            This initiative relates to all customers (e.g. core maintenance, tech debt).
                                        </p>
                                        <div className={styles.formGrid}>
                                            <label>
                                                TCV Basis:
                                                <select
                                                    value={workItem.all_customers_target.tcv_type}
                                                    onChange={e => {
                                                        const val = { ...workItem.all_customers_target!, tcv_type: e.target.value as 'existing' | 'potential' };
                                                        if (isNew) setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: val }));
                                                        else updateWorkItem(workItem.id, { all_customers_target: val });
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
                                                        const val = { ...workItem.all_customers_target!, priority: e.target.value as any };
                                                        if (isNew) setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: val }));
                                                        else updateWorkItem(workItem.id, { all_customers_target: val });
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
                                        <table className={styles.table}>
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
                                                        : workItem.customer_targets?.find(ct => ct.customer_id === customer.id);
                                                    
                                                    if (!target) return null;

                                                    const updateTarget = (updates: any) => {
                                                        if (isNew) {
                                                            setNewWorkItemCustomers(prev => prev.map(c => c.customerId === customer.id ? { ...c, ...updates } : c));
                                                        } else {
                                                            const newTargets = workItem.customer_targets?.map(ct => ct.customer_id === customer.id ? { ...ct, ...updates } : ct);
                                                            updateWorkItem(workItem.id, { customer_targets: newTargets });
                                                        }
                                                    };

                                                    return (
                                                        <tr key={customer.id}>
                                                            <td>{customer.name}</td>
                                                            <td>
                                                                <select value={target.tcv_type} onChange={e => updateTarget({ tcv_type: e.target.value })}>
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
                                                                    <span style={{ color: '#94a3b8' }}>${customer.potential_tcv.toLocaleString()}</span>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <select value={target.priority} onChange={e => updateTarget({ priority: e.target.value })}>
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
                                                                        else updateWorkItem(workItem.id, { customer_targets: workItem.customer_targets?.filter(ct => ct.customer_id !== customer.id) });
                                                                    }}
                                                                >
                                                                    Remove
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {targetedCustomers.length === 0 && (
                                                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '24px' }}>No customers targeted yet.</td></tr>
                                                )}
                                            </tbody>
                                        </table>

                                        <div className={styles.addWorkItemBox}>
                                            <h3>Target a Customer</h3>
                                            <SearchableDropdown
                                                options={data?.customers
                                                    .filter(c => !targetedCustomers.find(tc => tc.id === c.id))
                                                    .map(c => ({ id: c.id, label: c.name })) || []}
                                                onSelect={(customerId) => {
                                                    const newTarget = { customerId, tcv_type: 'existing' as const, priority: 'Should-have' as const };
                                                    if (isNew) setNewWorkItemCustomers(prev => [...prev, newTarget]);
                                                    else updateWorkItem(workItem.id, { customer_targets: [...(workItem.customer_targets || []), { customer_id: customerId, tcv_type: 'existing', priority: 'Should-have' }] });
                                                }}
                                                placeholder="Search for a customer to target..."
                                            />
                                        </div>
                                    </>
                                )}
                            </section>
                        )}

                        {activeTab === 'epics' && (
                            <section className={styles.card}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {epics.map(epic => (
                                        <div key={epic.id} style={{ 
                                            padding: '16px', 
                                            backgroundColor: '#111827', 
                                            borderRadius: '8px', 
                                            border: '1px solid #374151' 
                                        }}>
                                            {/* Line 1: Key, Name, Actions */}
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                                                <div style={{ width: '120px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                    <input
                                                        type="text"
                                                        value={epic.jira_key}
                                                        placeholder="Key"
                                                        onChange={e => isNew ? setNewWorkItemEpics(prev => prev.map(ev => ev.id === epic.id ? { ...ev, jira_key: e.target.value } : ev)) : updateEpic(epic.id, { jira_key: e.target.value })}
                                                        style={{ flex: 1, minWidth: '60px' }}
                                                    />
                                                    {epic.jira_key && epic.jira_key !== 'TBD' && data?.settings.jira_base_url && (
                                                        <a 
                                                            href={`${data.settings.jira_base_url.replace(/\/$/, '')}/browse/${epic.jira_key}`} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer" 
                                                            title="Open in Jira"
                                                            style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '14px' }}
                                                        >
                                                            ↗
                                                        </a>
                                                    )}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <input
                                                        type="text"
                                                        value={epic.name}
                                                        placeholder="Epic Name"
                                                        onChange={e => isNew ? setNewWorkItemEpics(prev => prev.map(ev => ev.id === epic.id ? { ...ev, name: e.target.value } : ev)) : updateEpic(epic.id, { name: e.target.value })}
                                                        style={{ width: '100%' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button className="btn-primary" onClick={() => syncEpic(epic.id, epic.jira_key)} disabled={syncingId === epic.id}>
                                                        {syncingId === epic.id ? 'Syncing...' : 'Sync from Jira'}
                                                    </button>
                                                    <button className="btn-danger" onClick={() => handleDeleteEpic(epic.id, epic.name || epic.jira_key)}>
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Line 2: Team, Effort, Start, End */}
                                            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', fontSize: '13px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '25%' }}>
                                                    <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Team:</span>
                                                    <select
                                                        value={epic.team_id}
                                                        onChange={e => isNew ? setNewWorkItemEpics(prev => prev.map(ev => ev.id === epic.id ? { ...ev, team_id: e.target.value } : ev)) : updateEpic(epic.id, { team_id: e.target.value })}
                                                        style={{ width: '100%' }}
                                                    >
                                                        {data?.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100px' }}>
                                                    <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Effort:</span>
                                                    <input
                                                        type="number"
                                                        value={epic.effort_md}
                                                        onChange={e => {
                                                            const val = parseInt(e.target.value) || 0;
                                                            isNew ? setNewWorkItemEpics(prev => prev.map(ev => ev.id === epic.id ? { ...ev, effort_md: val } : ev)) : updateEpic(epic.id, { effort_md: val });
                                                        }}
                                                        style={{ width: '100%' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '180px' }}>
                                                    <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Start:</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                                                        <input
                                                            type="date"
                                                            value={epic.target_start || ''}
                                                            style={{ width: '100%' }}
                                                            onChange={async e => {
                                                                const newStart = e.target.value;
                                                                if (newStart && epic.target_end && newStart >= epic.target_end) {
                                                                    await showAlert('Invalid Dates', 'The Start Date must be before the End Date.');
                                                                    return;
                                                                }
                                                                if (isNew) setNewWorkItemEpics(prev => prev.map(ev => ev.id === epic.id ? { ...ev, target_start: newStart } : ev));
                                                                else updateEpic(epic.id, { target_start: newStart });
                                                            }}
                                                        />
                                                        {!epic.target_start && <span title="Missing start date" style={{ cursor: 'help' }}>⚠️</span>}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '180px' }}>
                                                    <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>End:</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                                                        <input
                                                            type="date"
                                                            value={epic.target_end || ''}
                                                            style={{ width: '100%' }}
                                                            onChange={async e => {
                                                                const newEnd = e.target.value;
                                                                if (epic.target_start && newEnd && epic.target_start >= newEnd) {
                                                                    await showAlert('Invalid Dates', 'The Start Date must be before the End Date.');
                                                                    return;
                                                                }
                                                                if (isNew) setNewWorkItemEpics(prev => prev.map(ev => ev.id === epic.id ? { ...ev, target_end: newEnd } : ev));
                                                                else updateEpic(epic.id, { target_end: newEnd });
                                                            }}
                                                        />
                                                        {!epic.target_end && <span title="Missing end date" style={{ cursor: 'help' }}>⚠️</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {epics.length === 0 && (
                                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px' }}>No epics linked yet.</div>
                                    )}
                                </div>

                                <div className={styles.addWorkItemBox}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h3>Create & Link Epic</h3>
                                        <button className="btn-primary" onClick={handleAddEpic}>+ New Epic</button>
                                    </div>

                                    <div style={{ marginTop: '16px', borderTop: '1px solid #334155', paddingTop: '16px' }}>
                                        <h3>Link Existing Epic</h3>
                                        <SearchableDropdown
                                            options={data?.epics
                                                .filter(e => e.work_item_id !== workItemId)
                                                .map(e => ({ id: e.id, label: `${e.jira_key !== 'TBD' ? e.jira_key : ''} ${e.name || 'Unnamed Epic'}` })) || []}
                                            onSelect={(epicId) => {
                                                if (isNew) {
                                                    const epicToAssign = data?.epics.find(e => e.id === epicId);
                                                    if (epicToAssign) setNewWorkItemEpics(prev => [...prev, { ...epicToAssign, work_item_id: 'new' }]);
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
                </>
            )}
        </PageWrapper>
    );
};
