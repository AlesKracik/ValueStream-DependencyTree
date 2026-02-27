import React, { useState } from 'react';
import type { DashboardData, Customer, WorkItem } from '../../types/models';
import { SearchableDropdown } from '../common/SearchableDropdown';
import styles from './CustomerPage.module.css';

export interface CustomerPageProps {
    customerId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateCustomer: (id: string, updates: Partial<Customer>) => void;
    deleteCustomer: (id: string) => void;
    updateWorkItem: (id: string, updates: Partial<WorkItem>) => void;
    saveDashboardData: (data: DashboardData) => Promise<void>;
}

export const CustomerPage: React.FC<CustomerPageProps> = ({
    customerId,
    onBack,
    data,
    loading,
    error,
    updateCustomer,
    deleteCustomer,
    updateWorkItem,
    saveDashboardData
}) => {
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const isNew = customerId === 'new';

    // Draft states for new customer creation
    const [newCustDraft, setNewCustDraft] = useState<Partial<Customer>>({ name: 'New Customer', existing_tcv: 0, potential_tcv: 0 });
    const [newCustomerWorkItems, setNewCustomerWorkItems] = useState<{ workItemId: string, tcv_type: 'existing' | 'potential', priority: 'Must-have' | 'Should-have' | 'Nice-to-have' }[]>([]);

    if (loading) return <div className={styles.pageContainer}>Loading customer details...</div>;
    if (error) return <div className={styles.pageContainer}>Error: {error.message}</div>;
    if (!data) return <div className={styles.pageContainer}>No data available.</div>;

    const customer = isNew ? newCustDraft as Customer : data.customers.find(c => c.id === customerId);
    if (!customer) return <div className={styles.pageContainer}>Customer not found.</div>;

    const targetedWorkItems = isNew
        ? newCustomerWorkItems.map(ncf => data.workItems.find(f => f.id === ncf.workItemId)!).filter(Boolean)
        : data.workItems.filter(f => f.customer_targets.some(ct => ct.customer_id === customerId));

    const handleSave = async () => {
        setSaveStatus('saving');
        try {
            if (isNew) {
                const newId = `c${Date.now()}`;
                const newCust: Customer = {
                    id: newId,
                    name: newCustDraft.name || 'New Customer',
                    existing_tcv: newCustDraft.existing_tcv || 0,
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
                                    priority: draftTarget.priority
                                }
                            ]
                        };
                    }
                    return f;
                });

                const newData = { ...data, customers: [...data.customers, newCust], workItems: updatedWorkItems };
                await saveDashboardData(newData);
                setSaveStatus('saved');
                setTimeout(() => {
                    setSaveStatus('idle');
                    onBack();
                }, 1000);
            } else {
                await saveDashboardData(data);
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus('idle'), 2000);
            }
        } catch (err) {
            console.error('Save failed', err);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const handleDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${customer.name}? This will remove all their work item impact.`)) return;
        setSaveStatus('saving');
        try {
            deleteCustomer(customerId);
            // Also need to scrub workItems
            const newData = {
                ...data,
                customers: data.customers.filter(c => c.id !== customerId),
                workItems: data.workItems.map(f => ({
                    ...f,
                    customer_targets: f.customer_targets.filter(ct => ct.customer_id !== customerId)
                }))
            };
            await saveDashboardData(newData);
            onBack();
        } catch (err) {
            console.error('Delete failed', err);
            setSaveStatus('error');
        }
    };

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className={styles.backBtn} onClick={onBack}>
                        ← Back to Dashboard
                    </button>
                    <h1>{isNew ? 'New Customer' : customer.name}</h1>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                    {!isNew && (
                        <button 
                            className={styles.dangerBtn} 
                            style={{ padding: '10px 20px', fontWeight: '600', fontSize: '14px', borderRadius: '6px' }}
                            onClick={handleDelete}
                        >
                            Delete Customer
                        </button>
                    )}
                    <button 
                        className={styles.saveBtn} 
                        style={{ backgroundColor: '#2563eb', borderColor: '#1d4ed8' }}
                        onClick={handleSave}
                        disabled={saveStatus === 'saving'}
                    >
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save Changes'}
                    </button>
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
                        <label>
                            Existing TCV ($):
                            <input 
                                type="number" 
                                min="0" 
                                value={isNew ? newCustDraft.existing_tcv : customer.existing_tcv} 
                                onChange={e => {
                                    const val = parseInt(e.target.value) || 0;
                                    if (isNew) setNewCustDraft(prev => ({ ...prev, existing_tcv: val }));
                                    else updateCustomer(customer.id, { existing_tcv: val });
                                }}
                            />
                        </label>
                        <label>
                            Potential TCV ($):
                            <input 
                                type="number" 
                                min="0" 
                                value={isNew ? newCustDraft.potential_tcv : customer.potential_tcv} 
                                onChange={e => {
                                    const val = parseInt(e.target.value) || 0;
                                    if (isNew) setNewCustDraft(prev => ({ ...prev, potential_tcv: val }));
                                    else updateCustomer(customer.id, { potential_tcv: val });
                                }}
                            />
                        </label>
                    </div>
                </section>

                <section className={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2>Targeted Work Items</h2>
                    </div>

                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Work Item</th>
                                <th>TCV Target</th>
                                <th>Priority</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {targetedWorkItems.map(workItem => {
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
                                            <button onClick={removeTarget} className={styles.dangerBtn}>Remove</button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {targetedWorkItems.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No targeted work items found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>

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
                                            tcv_type: 'potential',
                                            priority: 'Should-have'
                                        }]);
                                    } else {
                                        const workItem = data.workItems.find(f => f.id === workItemId);
                                        if (workItem) {
                                            const newTargets = [...(workItem.customer_targets || []), {
                                                customer_id: customerId,
                                                tcv_type: 'potential',
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
                </section>
            </div>
        </div>
    );
};
