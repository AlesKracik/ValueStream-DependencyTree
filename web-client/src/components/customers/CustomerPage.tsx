import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { ValueStreamData, Customer, WorkItem, TcvHistoryEntry } from '@valuestream/shared-types';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { useDeleteWithConfirm } from '../../hooks/useDeleteWithConfirm';
import { generateId } from '../../utils/security';
import { useCustomerHealth } from '../../hooks/useCustomerHealth';
import { useCustomerCustomFields } from '../../hooks/useCustomerCustomFields';
import { GenericDetailPage, type DetailTab } from '../common/GenericDetailPage';
import { FormTextField, FormNumberField, FormDateField } from '../common/FormFields';
import { CustomerCustomFieldsTab } from './tabs/CustomerCustomFieldsTab';
import { CustomerWorkItemsTab } from './tabs/CustomerWorkItemsTab';
import { CustomerTcvHistoryTab } from './tabs/CustomerTcvHistoryTab';
import { CustomerSupportTab } from './tabs/CustomerSupportTab';

export interface CustomerPageProps {
    customerId: string;
    onBack: () => void;
    data: ValueStreamData | null;
    loading: boolean;
    error: Error | null;
    updateCustomer: (id: string, updates: Partial<Customer>, immediate?: boolean) => Promise<void>;
    deleteCustomer: (id: string) => void;
    addCustomer: (customer: Customer) => void;
    updateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
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
    const { showConfirm } = useNotificationContext();
    const deleteWithConfirm = useDeleteWithConfirm();
    const isNew = customerId === 'new';

    // Draft states for new customer creation
    const [newCustDraft, setNewCustDraft] = useState<Partial<Customer>>({ 
        name: '', 
        existing_tcv: undefined, 
        existing_tcv_valid_from: undefined,
        existing_tcv_duration_months: undefined,
        potential_tcv: undefined,
        potential_tcv_valid_from: undefined,
        potential_tcv_duration_months: undefined
    });
    const [newCustomerWorkItems, setNewCustomerWorkItems] = useState<{ workItemId: string, tcv_type: 'existing' | 'potential', priority: 'Must-have' | 'Should-have' | 'Nice-to-have', tcv_history_id?: string }[]>([]);

    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const focusedIssueId = queryParams.get('issueId');

    const customer = isNew ? newCustDraft as Customer : data?.customers.find(c => c.id === customerId);

    const healthData = useCustomerHealth(customer, data?.settings);
    const customFields = useCustomerCustomFields(customer, data?.settings);

    // Sync fetched Jira issues to the database
    useEffect(() => {
        if (isNew || loading || healthData.loading || healthData.error || !customer) return;

        const allFetchedIssues = [
            ...healthData.newIssues,
            ...healthData.inProgressIssues,
            ...healthData.noopIssues,
            ...healthData.linkedIssues
        ];

        const existingJiraIssues = customer.jira_support_issues || [];

        const hasChanged = allFetchedIssues.length !== existingJiraIssues.length ||
            allFetchedIssues.some(fetched => {
                const existing = existingJiraIssues.find(e => e.key === fetched.key);
                if (!existing) return true;
                return existing.status !== fetched.status || 
                       existing.summary !== fetched.summary || 
                       existing.priority !== fetched.priority ||
                       existing.category !== fetched.category;
            });

        if (hasChanged) {
            updateCustomer(customer.id, { jira_support_issues: allFetchedIssues }, true);
        }
    }, [healthData.newIssues, healthData.inProgressIssues, healthData.noopIssues, healthData.linkedIssues, healthData.loading, healthData.error, customer, isNew, loading, updateCustomer]);

    // Automatic cleanup of expired support issues
    useEffect(() => {
        if (isNew || loading || !customer || !customer.support_issues) return;

        const today = new Date().toISOString().split('T')[0];
        const validIssues = customer.support_issues.filter(issue => {
            if (!issue.expiration_date) return true;
            return issue.expiration_date >= today;
        });

        if (validIssues.length !== customer.support_issues.length) {
            updateCustomer(customer.id, { support_issues: validIssues }, true);
        }
    }, [customer, isNew, loading, updateCustomer]);

    // Handle scrolling to a focused support issue
    useEffect(() => {
        if (focusedIssueId) {
            const timer = setTimeout(() => {
                const element = document.getElementById(`issue-${focusedIssueId}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Visual highlight
                    const originalOutline = element.style.outline;
                    element.style.outline = '2px solid var(--accent-primary)';
                    element.style.outlineOffset = '4px';
                    setTimeout(() => {
                        element.style.outline = originalOutline;
                    }, 3000);
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [focusedIssueId]);

    if (!customer && !loading) {
        return <GenericDetailPage entityTitle="Customer Not Found" onBack={onBack} mainDetails={<div>Customer not found.</div>} loading={loading} data={data} />;
    }

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
                    customer_id: newCustDraft.customer_id,
                    existing_tcv: newCustDraft.existing_tcv || 0,
                    existing_tcv_valid_from: newCustDraft.existing_tcv_valid_from,
                    existing_tcv_duration_months: newCustDraft.existing_tcv_duration_months,
                    potential_tcv: newCustDraft.potential_tcv || 0,
                    potential_tcv_valid_from: newCustDraft.potential_tcv_valid_from,
                    potential_tcv_duration_months: newCustDraft.potential_tcv_duration_months
                };

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

    const handlePromotePotentialToExisting = async () => {
        if (!customer) return;
        const targetDate = customer.potential_tcv_valid_from || new Date().toISOString().split('T')[0];
        const confirmed = await showConfirm(
            'Promote Potential TCV', 
            `This will move current Existing TCV ($${customer.existing_tcv.toLocaleString()}) to history and promote Potential TCV ($${customer.potential_tcv.toLocaleString()}) to be the new Actual Existing TCV valid from ${targetDate}. Continue?`
        );
        if (!confirmed) return;

        const historyEntry: TcvHistoryEntry = {
            id: generateId('h'),
            value: customer.existing_tcv,
            valid_from: customer.existing_tcv_valid_from || '2000-01-01',
            duration_months: customer.existing_tcv_duration_months
        };

        const newHistory = [...(customer.tcv_history || []), historyEntry].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
        
        updateCustomer(customer.id, {
            existing_tcv: customer.potential_tcv,
            existing_tcv_duration_months: customer.potential_tcv_duration_months,
            existing_tcv_valid_from: targetDate,
            potential_tcv: 0,
            potential_tcv_duration_months: 12,
            tcv_history: newHistory
        });
    };

    const handleDelete = () => {
        if (!customer) return;
        deleteWithConfirm(
            'Delete Customer',
            `Are you sure you want to delete ${customer.name}? This will remove all their work item impact.`,
            () => deleteCustomer(customerId),
            onBack
        );
    };

    const mainDetails = (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                <FormTextField
                    label="Name:"
                    value={isNew ? (newCustDraft.name || '') : (customer?.name || '')}
                    onChange={v => {
                        if (isNew) setNewCustDraft(prev => ({ ...prev, name: v }));
                        else if (customer) updateCustomer(customer.id, { name: v });
                    }}
                    placeholder="New Customer"
                />
                <FormTextField
                    label="Customer ID:"
                    value={isNew ? (newCustDraft.customer_id || '') : (customer?.customer_id || '')}
                    onChange={v => {
                        if (isNew) setNewCustDraft(prev => ({ ...prev, customer_id: v }));
                        else if (customer) updateCustomer(customer.id, { customer_id: v });
                    }}
                    placeholder="e.g. CUST-123"
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {isNew ? (
                        <FormNumberField
                            label="Actual Existing TCV ($):"
                            value={newCustDraft.existing_tcv ?? ''}
                            onChange={v => setNewCustDraft(prev => ({ ...prev, existing_tcv: v }))}
                            placeholder="0"
                        />
                    ) : (
                        <FormTextField
                            label="Actual Existing TCV ($):"
                            value={(customer?.existing_tcv || 0).toLocaleString()}
                            onChange={() => {}}
                            readOnly
                        />
                    )}
                    <label>
                        Potential TCV ($):
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="number"
                                value={isNew ? (newCustDraft.potential_tcv ?? '') : (customer?.potential_tcv || 0)}
                                onChange={e => {
                                    const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                    if (isNew) setNewCustDraft(prev => ({ ...prev, potential_tcv: val }));
                                    else if (customer) updateCustomer(customer.id, { potential_tcv: val || 0 });
                                }}
                                placeholder="0"
                                style={{ flex: 1 }}
                            />
                            {!isNew && customer && (
                                <button className="btn-primary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={handlePromotePotentialToExisting}>
                                    Promote
                                </button>
                            )}
                        </div>
                    </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormDateField
                        label="Existing Valid From:"
                        value={isNew ? (newCustDraft.existing_tcv_valid_from || '') : (customer?.existing_tcv_valid_from || '')}
                        onChange={v => {
                            if (!isNew) return;
                            setNewCustDraft(prev => ({ ...prev, existing_tcv_valid_from: v }));
                        }}
                        readOnly={!isNew}
                    />
                    <FormDateField
                        label="Potential Valid From:"
                        value={isNew ? (newCustDraft.potential_tcv_valid_from || '') : (customer?.potential_tcv_valid_from || '')}
                        onChange={v => {
                            if (isNew) setNewCustDraft(prev => ({ ...prev, potential_tcv_valid_from: v }));
                            else if (customer) updateCustomer(customer.id, { potential_tcv_valid_from: v });
                        }}
                    />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormNumberField
                        label="Existing Duration (mo):"
                        value={isNew ? (newCustDraft.existing_tcv_duration_months ?? '') : (customer?.existing_tcv_duration_months || 0)}
                        onChange={v => {
                            if (!isNew) return;
                            setNewCustDraft(prev => ({ ...prev, existing_tcv_duration_months: v }));
                        }}
                        min={0}
                        placeholder="12"
                        readOnly={!isNew}
                    />
                    <label>
                        Potential Duration (mo):
                        <input
                            type="number"
                            value={isNew ? (newCustDraft.potential_tcv_duration_months ?? '') : (customer?.potential_tcv_duration_months || 0)}
                            onChange={e => {
                                const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                if (isNew) setNewCustDraft(prev => ({ ...prev, potential_tcv_duration_months: val }));
                                else if (customer) updateCustomer(customer.id, { potential_tcv_duration_months: val || 0 });
                            }}
                            min="0"
                            placeholder="12"
                        />
                    </label>
                </div>
            </div>
        </>
    );

    const tabs: DetailTab[] = [
        {
            id: 'customFields',
            label: `Custom Fields (${customFields.data.length})`,
            content: <CustomerCustomFieldsTab customer={customer} customFields={customFields} />
        },
        {
            id: 'workItems',
            label: `Targeted Work Items (${targetedWorkItems.length})`,
            content: (
                <CustomerWorkItemsTab
                    customer={customer}
                    customerId={customerId}
                    isNew={isNew}
                    targetedWorkItems={targetedWorkItems}
                    newCustomerWorkItems={newCustomerWorkItems}
                    setNewCustomerWorkItems={setNewCustomerWorkItems}
                    updateWorkItem={updateWorkItem}
                    data={data}
                />
            )
        },
        {
            id: 'history',
            label: `TCV History (${customer?.tcv_history?.length || 0})`,
            content: <CustomerTcvHistoryTab customer={customer} updateCustomer={updateCustomer} />
        },
        {
            id: 'support',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Support & Health ({customer?.support_issues?.length || 0})
                    {healthData.healthStatus !== 'Unknown' && healthData.healthStatus !== 'Healthy' && (
                        <span
                            title={healthData.healthStatus}
                            style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: healthData.healthStatus === 'New / Untriaged' ? 'var(--status-danger)' :
                                               (healthData.healthStatus === 'Active Work' ? 'var(--status-warning)' : 'var(--accent-primary)'),
                                display: 'inline-block'
                            }}
                        />
                    )}
                </div>
            ),
            content: (
                <CustomerSupportTab
                    customer={customer}
                    data={data}
                    updateCustomer={updateCustomer}
                    healthData={healthData}
                />
            )
        }
    ];

    return (
        <GenericDetailPage
            entityTitle={isNew ? 'Create New Customer' : `Customer: ${customer?.name}`}
            onBack={onBack}
            mainDetails={mainDetails}
            tabs={isNew ? [] : tabs}
            loading={loading}
            error={error}
            data={data}
            initialTabId={focusedIssueId ? 'support' : undefined}
            actions={
                <div style={{ display: 'flex', gap: '12px' }}>
                    {!isNew && <button className="btn-danger" onClick={handleDelete}>Delete</button>}
                    {isNew && <button className="btn-primary" onClick={handleSave}>Create</button>}
                </div>
            }
        />
    );
};
