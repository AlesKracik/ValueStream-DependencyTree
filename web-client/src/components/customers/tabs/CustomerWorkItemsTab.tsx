import React from 'react';
import type { Customer, WorkItem, ValueStreamData } from '@valuestream/shared-types';
import { SearchableDropdown } from '../../common/SearchableDropdown';
import { calculateWorkItemEffort } from '../../../utils/businessLogic';
import customerStyles from '../CustomerPage.module.css';

interface CustomerWorkItemTarget {
    workItemId: string;
    tcv_type: 'existing' | 'potential';
    priority: 'Must-have' | 'Should-have' | 'Nice-to-have';
    tcv_history_id?: string;
}

interface Props {
    customer: Customer | undefined;
    customerId: string;
    isNew: boolean;
    targetedWorkItems: WorkItem[];
    newCustomerWorkItems: CustomerWorkItemTarget[];
    setNewCustomerWorkItems: React.Dispatch<React.SetStateAction<CustomerWorkItemTarget[]>>;
    updateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
    data: ValueStreamData | null;
}

interface UpdateTargetParams {
    tcv_type?: 'existing' | 'potential';
    priority?: 'Must-have' | 'Should-have' | 'Nice-to-have';
    tcv_history_id?: string;
}

export const CustomerWorkItemsTab: React.FC<Props> = ({
    customer,
    customerId,
    isNew,
    targetedWorkItems,
    newCustomerWorkItems,
    setNewCustomerWorkItems,
    updateWorkItem,
    data
}) => {
    return (
        <>
            <table className={customerStyles.table}>
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
                        const workItemIssues = data ? data.issues.filter(e => e.work_item_id === workItem.id) : [];
                        const calculatedEffort = calculateWorkItemEffort(workItem, workItemIssues);

                        const targetDef = isNew
                            ? newCustomerWorkItems.find(ncf => ncf.workItemId === workItem.id)!
                            : workItem.customer_targets.find(ct => ct.customer_id === customerId)!;

                        const updateTarget = (updates: UpdateTargetParams) => {
                            if (isNew) {
                                setNewCustomerWorkItems(prev => prev.map(ncf =>
                                    ncf.workItemId === workItem.id ? { ...ncf, ...updates } : ncf
                                ));
                            } else {
                                const newTargets = workItem.customer_targets.map(ct =>
                                    ct.customer_id === customerId ? { ...ct, ...updates } : ct
                                );
                                updateWorkItem(workItem.id, { customer_targets: newTargets });
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
                                            <option value="latest">Latest Actual (${customer?.existing_tcv.toLocaleString()})</option>
                                            {customer?.tcv_history?.map(h => (
                                                <option key={h.id} value={h.id}>{h.valid_from} (${h.value.toLocaleString()})</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span style={{ color: 'var(--text-muted)' }}>${customer?.potential_tcv.toLocaleString()}</span>
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
                </tbody>
            </table>

            {data && (
                <div className={customerStyles.addWorkItemBox}>
                    <h3>Add Work Item Target</h3>
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
                                        tcv_type: 'existing' as const,
                                        priority: 'Should-have' as const
                                    }];
                                    updateWorkItem(workItemId, { customer_targets: newTargets });
                                }
                            }
                        }}
                        placeholder="Search for a work item to add..."
                    />
                </div>
            )}
        </>
    );
};
