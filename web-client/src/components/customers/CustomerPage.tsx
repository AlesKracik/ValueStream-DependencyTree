import React, { useState } from 'react';
import type { DashboardData, Customer, WorkItem, TcvHistoryEntry } from '../../types/models';
import { SearchableDropdown } from '../common/SearchableDropdown';
import { useDashboardContext } from '../../contexts/DashboardContext';
import styles from './CustomerPage.module.css';
import { generateId } from '../../utils/security';
import { calculateWorkItemEffort } from '../../utils/businessLogic';
import { PageWrapper } from '../layout/PageWrapper';

export interface CustomerPageProps {
    customerId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateCustomer: (id: string, updates: Partial<Customer>) => void;
    deleteCustomer: (id: string) => void;
    addCustomer: (customer: Customer) => void;
    updateWorkItem: (id: string, updates: Partial<WorkItem>) => void;
    
}

export const CustomerPage: React.FC<CustomerPageProps> = ({
    customerId,
    onBack,
    data,
    loading,
    error,
    updateCustomer,
    deleteCustomer,
    addCustomer,
    updateWorkItem
}) => {
    const { showConfirm, showAlert } = useDashboardContext();
    const isNew = customerId === 'new';

    // Draft states for new customer creation
    const [newCustDraft, setNewCustDraft] = useState<Partial<Customer>>({ 
        name: 'New Customer', 
        existing_tcv: 0, 
        existing_tcv_valid_from: new Date().toISOString().split('T')[0],
        potential_tcv: 0 
    });
    const [newCustomerWorkItems, setNewCustomerWorkItems] = useState<{ workItemId: string, tcv_type: 'existing' | 'potential', priority: 'Must-have' | 'Should-have' | 'Nice-to-have', tcv_history_id?: string }[]>([]);

    // State for the "Update Actual TCV" form
    const [isUpdatingTcv, setIsUpdatingTcv] = useState(false);
    const [newTcvValue, setNewTcvValue] = useState<number>(0);
    const [newTcvDate, setNewTcvDate] = useState<string>(new Date().toISOString().split('T')[0]);

    const [activeTab, setActiveTab] = useState<'workItems' | 'history'>('workItems');

    const customer = isNew ? newCustDraft as Customer : data?.customers.find(c => c.id === customerId);

    const targetedWorkItems = (isNew && data)
        ? newCustomerWorkItems.map(ncf => data.workItems.find(f => f.id === ncf.workItemId)!).filter(Boolean)
        : data?.workItems.filter(f => f.customer_targets.some(ct => ct.customer_id === customerId)) || [];

    const handleSave = async () => {
        if (!data) return;
        try {
            if (isNew) {
                const newId = generateId('c');
                const newCust: Customer = {
                    id: newId,
                    name: newCustDraft.name || 'New Customer',
                    existing_tcv: newCustDraft.existing_tcv || 0,
                    existing_tcv_valid_from: newCustDraft.existing_tcv_valid_from,
                    potential_tcv: newCustDraft.potential_tcv || 0
                };

                // Inject the drafted work items
                const updatedWorkItems = data.workItems.map(f => {
                    const draftTarget = newCustomerWorkItems.find(ncf => ncf.workItemId === f.id);
                    if (draftTarget) {
                        return {
                            ...f,
                            customer_targets: [
                                ...(f.customer_targets || []),
                                {
                                    customer_id: newId,
                                    tcv_type: draftTarget.tcv_type,
                                    priority: draftTarget.priority,
                                    tcv_history_id: draftTarget.tcv_history_id
                                }
                            ]
                        };
                    }
                    return f;
                });

                addCustomer(newCust);
                updatedWorkItems.forEach((f, i) => {
                    const oldF = data.workItems[i];
                    if (oldF.customer_targets.length !== f.customer_targets.length) {
                        updateWorkItem(f.id, { customer_targets: f.customer_targets });
                    }
                });

                setTimeout(() => { onBack(); }, 1000);
            }
        } catch (err) {
            console.error('Save failed', err);
        }
    };

    const handleArchiveAndSetNewTcv = async () => {
        if (!customer) return;
        if (!newTcvDate || isNaN(newTcvValue)) {
            await showAlert('Invalid Input', 'Please provide a valid date and value.');
            return;
        }

        const confirmed = await showConfirm('Update Actual TCV', `This will move the current TCV ($${customer.existing_tcv.toLocaleString()}) to history and set the new actual TCV to $${newTcvValue.toLocaleString()} starting from ${newTcvDate}. Continue?`);
        if (!confirmed) return;

        // 1. Create history entry from current "Actual"
        const historyEntry: TcvHistoryEntry = {
            id: generateId('h'),
            value: customer.existing_tcv,
            valid_from: customer.existing_tcv_valid_from || '2000-01-01'
        };

        // 2. Update customer with new values and updated history
        const newHistory = [...(customer.tcv_history || []), historyEntry].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
        
        updateCustomer(customer.id, {
            existing_tcv: newTcvValue,
            existing_tcv_valid_from: newTcvDate,
            tcv_history: newHistory
        });

        setIsUpdatingTcv(false);
    };

    const handleDelete = async () => {
        if (!customer) return;
        const confirmed = await showConfirm('Delete Customer', `Are you sure you want to delete ${customer.name}? This will remove all their work item impact.`);
        if (!confirmed) return;
        try {
            deleteCustomer(customerId);
            onBack();
        } catch (err) {
            console.error('Delete failed', err);
        }
    };

    return (
        <PageWrapper 
            loading={loading} 
            error={error} 
            data={data} 
            loadingMessage="Loading customer details..."
            emptyMessage="No data available."
        >
            {!customer ? (
                <div className={styles.empty}>Customer not found.</div>
            ) : (
                <>
                    <div className={styles.header}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <button className="btn-secondary" onClick={onBack}>
                                ← Back
                            </button>
                            <h1>{isNew ? 'New Customer' : customer.name}</h1>
                        </div>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            {!isNew && (
                                <button className="btn-danger" onClick={handleDelete}>
                                    Delete Customer
                                </button>
                            )}
                            {isNew ? (
                                <button className="btn-primary" onClick={handleSave}>
                                    Create
                                </button>
                            ) : null}
                        </div>
                    </div>

                    <div className={styles.content}>
                        <section className={styles.card}>
                            <h2>Customer Details</h2>
                            <div className={styles.formGrid}>
                                <label>
                                    Name:
                                    <input 
                                        type="text" 
                                        value={isNew ? newCustDraft.name : customer.name} 
                                        onChange={e => {
                                            if (isNew) setNewCustDraft(prev => ({ ...prev, name: e.target.value }));
                                            else updateCustomer(customer.id, { name: e.target.value });
                                        }}
                                    />
                                </label>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label>
                                        Actual Existing TCV ($):
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input 
                                                type={isNew ? "number" : "text"} 
                                                readOnly={!isNew}
                                                value={isNew ? newCustDraft.existing_tcv : (customer.existing_tcv || 0).toLocaleString()} 
                                                onChange={e => {
                                                    if (!isNew) return;
                                                    const val = parseInt(e.target.value) || 0;
                                                    setNewCustDraft(prev => ({ ...prev, existing_tcv: val }));
                                                }}
                                                style={!isNew ? { backgroundColor: '#1e293b', border: 'none' } : {}}
                                            />
                                            {!isNew && !isUpdatingTcv && (
                                                <button className="btn-primary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => {
                                                    setNewTcvValue(customer.existing_tcv);
                                                    setIsUpdatingTcv(true);
                                                }}>Update TCV</button>
                                            )}
                                        </div>
                                    </label>
                                    {customer.existing_tcv_valid_from && (
                                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>Valid from: {customer.existing_tcv_valid_from}</span>
                                    )}
                                </div>

                                <label>
                                    Potential TCV ($):
                                    <input 
                                        type="text" 
                                        value={(isNew ? (newCustDraft.potential_tcv || 0) : (customer.potential_tcv || 0)).toLocaleString()} 
                                        onChange={e => {
                                            const val = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0;
                                            if (isNew) setNewCustDraft(prev => ({ ...prev, potential_tcv: val }));
                                            else updateCustomer(customer.id, { potential_tcv: val });
                                        }}
                                    />
                                </label>

                                {isNew && (
                                    <label>
                                        Valid From (Initial):
                                        <input 
                                            type="date" 
                                            value={newCustDraft.existing_tcv_valid_from} 
                                            onChange={e => setNewCustDraft(prev => ({ ...prev, existing_tcv_valid_from: e.target.value }))}
                                        />
                                    </label>
                                )}
                            </div>

                            {isUpdatingTcv && (
                                <div style={{ marginTop: '24px', padding: '16px', border: '1px solid #3b82f6', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.05)' }}>
                                    <h3 style={{ marginTop: 0, fontSize: '16px', color: '#60a5fa' }}>Archive Current and Set New Actual TCV</h3>
                                    <div className={styles.formGrid} style={{ gridTemplateColumns: '1fr 1fr auto', alignItems: 'flex-end', marginTop: '12px' }}>
                                        <label>
                                            New Valid From Date:
                                            <input type="date" value={newTcvDate} onChange={e => setNewTcvDate(e.target.value)} />
                                        </label>
                                        <label>
                                            New TCV Value ($):
                                            <input type="number" value={newTcvValue} onChange={e => setNewTcvValue(parseInt(e.target.value) || 0)} min="0" />
                                        </label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="btn-secondary" onClick={() => setIsUpdatingTcv(false)}>Cancel</button>
                                            <button className="btn-primary" onClick={handleArchiveAndSetNewTcv}>Confirm Update</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </section>

                        <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #334155', marginBottom: '24px', marginTop: '24px' }}>
                            <button
                                onClick={() => setActiveTab('workItems')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '12px 16px',
                                    color: activeTab === 'workItems' ? '#60a5fa' : '#94a3b8',
                                    borderBottom: activeTab === 'workItems' ? '2px solid #60a5fa' : '2px solid transparent',
                                    cursor: 'pointer',
                                    fontSize: '15px',
                                    fontWeight: activeTab === 'workItems' ? 'bold' : '500',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Targeted Work Items ({targetedWorkItems.length})
                            </button>
                            {!isNew && (
                                <button
                                    onClick={() => setActiveTab('history')}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: '12px 16px',
                                        color: activeTab === 'history' ? '#60a5fa' : '#94a3b8',
                                        borderBottom: activeTab === 'history' ? '2px solid #60a5fa' : '2px solid transparent',
                                        cursor: 'pointer',
                                        fontSize: '15px',
                                        fontWeight: activeTab === 'history' ? 'bold' : '500',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    TCV History ({customer.tcv_history?.length || 0})
                                </button>
                            )}
                        </div>

                        {activeTab === 'workItems' && (
                            <section className={styles.card}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h2>Targeted Work Items</h2>
                                </div>

                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Work Item</th>
                                            <th>Effort (MDs)</th>
                                            <th>TCV Type</th>
                                            <th>TCV Selection</th>
                                            <th>Priority</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {targetedWorkItems.map(workItem => {
                                            const workItemEpics = data ? data.epics.filter(e => e.work_item_id === workItem.id) : [];
                                            const calculatedEffort = calculateWorkItemEffort(workItem, workItemEpics);
                                            
                                            const targetDef = isNew
                                                ? newCustomerWorkItems.find(ncf => ncf.workItemId === workItem.id)!
                                                : workItem.customer_targets.find(ct => ct.customer_id === customerId)!;

                                            const updateTarget = (updates: Partial<typeof targetDef>) => {
                                                if (isNew) {
                                                    setNewCustomerWorkItems(prev => prev.map(ncf => 
                                                        ncf.workItemId === workItem.id ? { ...ncf, ...updates } : ncf
                                                    ));
                                                } else {
                                                    const newTargets = workItem.customer_targets.map(ct => 
                                                        ct.customer_id === customerId ? { ...ct, ...updates } : ct
                                                    );
                                                    updateWorkItem(workItem.id, { customer_targets: newTargets as any });
                                                }
                                            };

                                            const removeTarget = () => {
                                                if (isNew) {
                                                    setNewCustomerWorkItems(prev => prev.filter(ncf => ncf.workItemId !== workItem.id));
                                                } else {
                                                    const newTargets = workItem.customer_targets.filter(ct => ct.customer_id !== customerId);
                                                    updateWorkItem(workItem.id, { customer_targets: newTargets });
                                                }
                                            };

                                            return (
                                                <tr key={workItem.id}>
                                                    <td>{workItem.name}</td>
                                                    <td>{calculatedEffort.toLocaleString()}</td>
                                                    <td>
                                                        <select 
                                                            value={targetDef.tcv_type}
                                                            onChange={e => updateTarget({ tcv_type: e.target.value as 'existing' | 'potential' })}
                                                        >
                                                            <option value="existing">Existing</option>
                                                            <option value="potential">Potential</option>
                                                        </select>
                                                    </td>
                                                    <td>
                                                        {targetDef.tcv_type === 'existing' ? (
                                                            <select
                                                                value={targetDef.tcv_history_id || 'latest'}
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
                                        {targetedWorkItems.length === 0 && (
                                            <tr>
                                                <td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No targeted work items found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>

                                {isNew && data && (
                                    <div className={styles.addWorkItemBox}>
                                        <h3>Add Work Item Target</h3>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <SearchableDropdown
                                                options={data.workItems
                                                    .filter(f => !targetedWorkItems.find(tf => tf.id === f.id))
                                                    .map(f => ({ id: f.id, label: f.name }))
                                                }
                                                onSelect={(workItemId) => {
                                                    if (isNew) {
                                                        setNewCustomerWorkItems(prev => [...prev, {
                                                            workItemId,
                                                            tcv_type: 'existing',
                                                            priority: 'Should-have'
                                                        }]);
                                                    } else {
                                                        const workItem = data.workItems.find(f => f.id === workItemId);
                                                        if (workItem) {
                                                            const newTargets = [...(workItem.customer_targets || []), {
                                                                customer_id: customerId,
                                                                tcv_type: 'existing',
                                                                priority: 'Should-have'
                                                            }];
                                                            updateWorkItem(workItemId, { customer_targets: newTargets as any });
                                                        }
                                                    }
                                                }}
                                                placeholder="Search for a work item to add..."
                                            />
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {activeTab === 'history' && !isNew && (
                            <section className={styles.card}>
                                <h2>Existing TCV History</h2>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Valid From</th>
                                            <th>Value ($)</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {customer.tcv_history?.map(entry => (
                                            <tr key={entry.id}>
                                                <td>{entry.valid_from}</td>
                                                <td>{entry.value.toLocaleString()}</td>
                                                <td>
                                                    <button 
                                                        className="btn-danger" 
                                                        onClick={() => {
                                                            const newHistory = customer.tcv_history?.filter(h => h.id !== entry.id);
                                                            updateCustomer(customer.id, { tcv_history: newHistory });
                                                        }}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {(!customer.tcv_history || customer.tcv_history.length === 0) && (
                                            <tr>
                                                <td colSpan={3} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No historical entries. Update the Actual TCV to populate history.</td>
                                            </tr>
                                        )}
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
