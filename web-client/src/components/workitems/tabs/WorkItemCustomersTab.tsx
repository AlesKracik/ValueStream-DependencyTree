import React from 'react';
import type { Customer, WorkItem, ValueStreamData } from '@valuestream/shared-types';
import { SearchableDropdown } from '../../common/SearchableDropdown';
import customerStyles from '../../customers/CustomerPage.module.css';

interface WorkItemCustomerTarget {
    customerId: string;
    tcv_type: 'existing' | 'potential';
    priority: 'Must-have' | 'Should-have' | 'Nice-to-have';
    tcv_history_id?: string;
}

interface Props {
    workItem: WorkItem | undefined;
    isNew: boolean;
    workItemId: string;
    targetedCustomers: Customer[];
    newWorkItemCustomers: WorkItemCustomerTarget[];
    setNewWorkItemCustomers: React.Dispatch<React.SetStateAction<WorkItemCustomerTarget[]>>;
    setNewWorkItemDraft?: React.Dispatch<React.SetStateAction<Partial<WorkItem>>>;
    updateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
    data: ValueStreamData | null;
}

export const WorkItemCustomersTab: React.FC<Props> = ({
    workItem,
    isNew,
    workItemId,
    targetedCustomers,
    newWorkItemCustomers,
    setNewWorkItemCustomers,
    setNewWorkItemDraft,
    updateWorkItem,
    data
}) => {
    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <input
                    type="checkbox"
                    id="global-checkbox"
                    checked={!!workItem?.all_customers_target}
                    onChange={e => {
                        const val = e.target.checked ? { tcv_type: 'existing' as const, priority: 'Must-have' as const } : null;
                        if (isNew && setNewWorkItemDraft) setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: val }));
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
                                    if (isNew && setNewWorkItemDraft) setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: val }));
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
                                    if (isNew && setNewWorkItemDraft) setNewWorkItemDraft(prev => ({ ...prev, all_customers_target: val }));
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
    );
};
