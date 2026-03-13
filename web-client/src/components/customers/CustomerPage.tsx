import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { ValueStreamData, Customer, WorkItem, TcvHistoryEntry, SupportIssue, JiraIssue } from '../../types/models';
import { SearchableDropdown } from '../common/SearchableDropdown';
import { useValueStreamContext } from '../../contexts/ValueStreamContext';
import { generateId } from '../../utils/security';
import { calculateWorkItemEffort } from '../../utils/businessLogic';
import { useCustomerHealth } from '../../hooks/useCustomerHealth';
import { useCustomerCustomFields } from '../../hooks/useCustomerCustomFields';
import { GenericDetailPage, type DetailTab } from '../common/GenericDetailPage';
import customerStyles from './CustomerPage.module.css';

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

interface JiraKeysInputProps {
    value: string[];
    onChange: (newValue: string[]) => void;
    jiraBaseUrl?: string;
}

const JiraKeysInput: React.FC<JiraKeysInputProps> = ({ value, onChange, jiraBaseUrl }) => {
    const [inputValue, setInputValue] = useState(value.join(', '));
    const [prevValueJoined, setPrevValueJoined] = useState(value.join(', '));

    const valueJoined = value.join(', ');
    if (valueJoined !== prevValueJoined) {
        setPrevValueJoined(valueJoined);
        if (valueJoined !== inputValue && !inputValue.endsWith(',') && !inputValue.endsWith(', ')) {
            setInputValue(valueJoined);
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        const keys = val.split(',').map(s => s.trim()).filter(Boolean);
        onChange(keys);
    };

    return (
        <div style={{ flex: 1, marginRight: '16px' }}>
            <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Related Jiras (comma separated keys)</label>
            <input 
                type="text"
                value={inputValue}
                onChange={handleChange}
                placeholder="e.g. PROJ-123, PROJ-456"
                style={{ width: '100%', backgroundColor: 'var(--bg-primary)' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                {value.map(key => (
                    <a 
                        key={key}
                        href={`${jiraBaseUrl}/browse/${key}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '12px', color: 'var(--accent-text)', textDecoration: 'none', backgroundColor: 'var(--accent-primary-bg)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--accent-primary-bg)' }}
                    >
                        {key} ↗
                    </a>
                ))}
            </div>
        </div>
    );
};

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
    const { showConfirm } = useValueStreamContext();
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

    const handleLinkJira = async (jiraIssue: JiraIssue, targetId: string) => {
        if (!targetId || !customer) return;
        
        if (targetId === 'NEW') {
            const now = new Date().toISOString();
            const newIssue: SupportIssue = {
                id: generateId('issue'),
                description: jiraIssue.summary,
                status: 'to do',
                related_jiras: [jiraIssue.key],
                created_at: now,
                updated_at: now
            };
            const currentIssues = customer.support_issues || [];
            await updateCustomer(customer.id, { support_issues: [newIssue, ...currentIssues] });
        } else {
            const currentIssues = [...(customer.support_issues || [])];
            const issueIndex = currentIssues.findIndex(si => si.id === targetId);
            if (issueIndex > -1) {
                const existingJiras = currentIssues[issueIndex].related_jiras || [];
                if (!existingJiras.includes(jiraIssue.key)) {
                    currentIssues[issueIndex] = {
                        ...currentIssues[issueIndex],
                        related_jiras: [...existingJiras, jiraIssue.key],
                        updated_at: new Date().toISOString()
                    };
                    await updateCustomer(customer.id, { support_issues: currentIssues });
                }
            }
        }
    };

    const renderValue = (val: unknown): React.ReactNode => {
        if (val === null || val === undefined) return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>;
        if (Array.isArray(val)) {
            if (val.length === 0) return <span style={{ color: 'var(--text-muted)' }}>[]</span>;
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px', width: '100%' }}>
                    {val.map((item, idx) => (
                        <div key={idx} style={{
                            padding: '12px',
                            backgroundColor: 'var(--bg-page-muted)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '6px'
                        }}>
                            {renderValue(item)}
                        </div>
                    ))}
                </div>
            );
        }
        if (typeof val === 'object') {
            const obj = val as Record<string, unknown>;
            return (
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                    gap: '12px 24px', 
                    width: '100%' 
                }}>
                    {Object.entries(obj)
                        .filter(([k]) => {
                            const lower = k.toLowerCase();
                            const isId = lower === 'id' ||
                                         lower === '_id' ||
                                         lower.endsWith('_id') ||
                                         (k.endsWith('Id') && k.length > 2);
                            return !isId;
                        })
                        .map(([k, v]) => {
                            const isComplex = v !== null && typeof v === 'object';
                            return (
                                <div key={k} style={{ 
                                    display: 'flex', 
                                    flexDirection: isComplex ? 'column' : 'row', 
                                    gap: isComplex ? '4px' : '8px', 
                                    alignItems: isComplex ? 'flex-start' : 'baseline', 
                                    gridColumn: isComplex ? '1 / -1' : 'auto',
                                    marginTop: isComplex ? '8px' : '0'
                                }}>
                                    <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>{k}:</div>
                                    <div style={{ 
                                        fontSize: '14px', 
                                        wordBreak: 'break-all',
                                        marginLeft: isComplex ? '20px' : '0',
                                        width: isComplex ? 'calc(100% - 20px)' : 'auto'
                                    }}>
                                        {renderValue(v)}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            );
        }
        return String(val);
    };

    const mainDetails = (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                <label>
                    Name:
                    <input 
                        type="text" 
                        value={isNew ? newCustDraft.name : customer?.name} 
                        onChange={e => {
                            if (isNew) setNewCustDraft(prev => ({ ...prev, name: e.target.value }));
                            else if (customer) updateCustomer(customer.id, { name: e.target.value });
                        }}
                        placeholder="New Customer"
                    />
                </label>
                <label>
                    Customer ID:
                    <input 
                        type="text" 
                        value={isNew ? (newCustDraft.customer_id || '') : (customer?.customer_id || '')} 
                        onChange={e => {
                            if (isNew) setNewCustDraft(prev => ({ ...prev, customer_id: e.target.value }));
                            else if (customer) updateCustomer(customer.id, { customer_id: e.target.value });
                        }}
                        placeholder="e.g. CUST-123"
                    />
                </label>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <label>
                        Actual Existing TCV ($):
                        <input 
                            type={isNew ? "number" : "text"} 
                            readOnly={!isNew}
                            value={isNew ? (newCustDraft.existing_tcv ?? '') : (customer?.existing_tcv || 0).toLocaleString()} 
                            onChange={e => {
                                if (!isNew) return;
                                const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                setNewCustDraft(prev => ({ ...prev, existing_tcv: val }));
                            }}
                            placeholder="0"
                            style={!isNew ? { backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' } : {}}
                        />
                    </label>
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
                    <label>
                        Existing Valid From:
                        <input 
                            type="date" 
                            readOnly={!isNew}
                            value={isNew ? (newCustDraft.existing_tcv_valid_from || '') : (customer?.existing_tcv_valid_from || '')} 
                            onChange={e => {
                                if (!isNew) return;
                                setNewCustDraft(prev => ({ ...prev, existing_tcv_valid_from: e.target.value }));
                            }}
                            style={!isNew ? { backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' } : {}}
                        />
                    </label>
                    <label>
                        Potential Valid From:
                        <input 
                            type="date" 
                            value={isNew ? (newCustDraft.potential_tcv_valid_from || '') : (customer?.potential_tcv_valid_from || '')} 
                            onChange={e => {
                                if (isNew) setNewCustDraft(prev => ({ ...prev, potential_tcv_valid_from: e.target.value }));
                                else if (customer) updateCustomer(customer.id, { potential_tcv_valid_from: e.target.value });
                            }}
                        />
                    </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <label>
                        Existing Duration (mo):
                        <input 
                            type="number" 
                            readOnly={!isNew}
                            value={isNew ? (newCustDraft.existing_tcv_duration_months ?? '') : (customer?.existing_tcv_duration_months || 0)} 
                            onChange={e => {
                                if (!isNew) return;
                                const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                setNewCustDraft(prev => ({ ...prev, existing_tcv_duration_months: val }));
                            }}
                            min="0"
                            placeholder="12"
                            style={!isNew ? { backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' } : {}}
                        />
                    </label>
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
            content: (
                <>
                    {customFields.loading && <div style={{ color: 'var(--text-muted)' }}>Loading custom fields...</div>}
                    {customFields.error && (
                        <div style={{ color: 'var(--status-danger)', textAlign: 'center', padding: '40px', backgroundColor: 'var(--status-danger-bg)', borderRadius: '8px', border: '1px dashed var(--status-danger)' }}>
                            <div style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--status-danger)', fontWeight: 'bold' }}>Query Error</div>
                            <p style={{ margin: 0, fontSize: '14px' }}>{customFields.error}</p>
                        </div>
                    )}
                    {!customFields.loading && !customFields.error && (
                        <>
                            {!customer?.customer_id ? (
                                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border-primary)' }}>
                                    <div style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--text-highlight)' }}>Customer ID Not Defined</div>
                                    <p style={{ margin: 0, fontSize: '14px' }}>
                                        Please set the Customer ID above to fetch data.
                                    </p>
                                </div>
                            ) : customFields.data.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border-primary)' }}>
                                    <div style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--text-highlight)' }}>No Data Found</div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    {customFields.data.map((item, idx) => (
                                        <div key={idx} style={{ 
                                            padding: '20px', 
                                            backgroundColor: 'var(--bg-page-muted)', 
                                            border: '1px solid var(--border-primary)', 
                                            borderRadius: '8px' 
                                        }}>
                                            {renderValue(item)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </>
            )
        },
        {
            id: 'workItems',
            label: `Targeted Work Items (${targetedWorkItems.length})`,
            content: (
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
                                const workItemEpics = data ? data.epics.filter(e => e.work_item_id === workItem.id) : [];
                                const calculatedEffort = calculateWorkItemEffort(workItem, workItemEpics);
                                
                                const targetDef = isNew
                                    ? newCustomerWorkItems.find(ncf => ncf.workItemId === workItem.id)!
                                    : workItem.customer_targets.find(ct => ct.customer_id === customerId)!;

                                interface UpdateTargetParams {
                                    tcv_type?: 'existing' | 'potential';
                                    priority?: 'Must-have' | 'Should-have' | 'Nice-to-have';
                                    tcv_history_id?: string;
                                }

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
            )
        },
        {
            id: 'history',
            label: `TCV History (${customer?.tcv_history?.length || 0})`,
            content: (
                <table className={customerStyles.table}>
                    <thead>
                        <tr>
                            <th>Valid From</th>
                            <th>Value ($)</th>
                            <th>Duration (mo)</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {customer?.tcv_history?.map(entry => (
                            <tr key={entry.id}>
                                <td>{entry.valid_from}</td>
                                <td>{entry.value.toLocaleString()}</td>
                                <td>{entry.duration_months || '-'}</td>
                                <td>
                                    <button 
                                        className="btn-danger" 
                                        onClick={() => {
                                            if (customer) {
                                                const newHistory = customer.tcv_history?.filter(h => h.id !== entry.id);
                                                updateCustomer(customer.id, { tcv_history: newHistory });
                                            }
                                        }}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ border: 'none', margin: 0, fontSize: '18px', color: 'var(--text-highlight)' }}>Support Issues</h2>
                            <button 
                                className="btn-primary" 
                                onClick={() => {
                                    if (customer) {
                                        const now = new Date().toISOString();
                                        const newIssue: SupportIssue = {
                                            id: generateId('issue'),
                                            description: '',
                                            status: 'to do',
                                            related_jiras: [],
                                            expiration_date: undefined,
                                            created_at: now,
                                            updated_at: now
                                        };
                                        const currentIssues = customer.support_issues || [];
                                        updateCustomer(customer.id, { support_issues: [newIssue, ...currentIssues] });
                                    }
                                }}
                            >
                                + Add Issue
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {(customer?.support_issues || []).map((issue, idx) => {
                                const updateIssue = (updates: Partial<SupportIssue>) => {
                                    if (customer) {
                                        const newIssues = [...(customer.support_issues || [])];
                                        newIssues[idx] = { ...issue, ...updates, updated_at: new Date().toISOString() };
                                        updateCustomer(customer.id, { support_issues: newIssues });
                                    }
                                };

                                return (
                                    <div key={issue.id} id={`issue-${issue.id}`} className={customerStyles.addWorkItemBox} style={{ backgroundColor: 'var(--bg-tertiary)', padding: '20px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '16px' }}>
                                            <textarea 
                                                value={issue.description}
                                                onChange={e => updateIssue({ description: e.target.value })}
                                                placeholder="Describe the issue..."
                                                style={{ minHeight: '80px', backgroundColor: 'var(--bg-primary)' }}
                                            />
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Status</label>
                                                    <select 
                                                        value={issue.status} 
                                                        onChange={e => {
                                                            const newStatus = e.target.value as any;
                                                            const updates: Partial<SupportIssue> = { status: newStatus };
                                                            if (newStatus === 'done' && !issue.expiration_date) {
                                                                const expiry = new Date();
                                                                expiry.setDate(expiry.getDate() + 5);
                                                                updates.expiration_date = expiry.toISOString().split('T')[0];
                                                            }
                                                            updateIssue(updates);
                                                        }}
                                                    >
                                                        <option value="to do">To Do</option>
                                                        <option value="work in progress">Work in Progress</option>
                                                        <option value="noop">Noop</option>
                                                        <option value="waiting for customer">Waiting for Customer</option>
                                                        <option value="waiting for other party">Waiting for Other Party</option>
                                                        <option value="done">Done</option>
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Expiration Date</label>
                                                    <input type="date" value={issue.expiration_date || ''} onChange={e => updateIssue({ expiration_date: e.target.value || undefined })} />
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', borderTop: '1px solid var(--border-secondary)', paddingTop: '12px' }}>
                                            <JiraKeysInput value={issue.related_jiras || []} onChange={keys => updateIssue({ related_jiras: keys })} jiraBaseUrl={data?.settings.jira_base_url} />
                                            <button className="btn-danger" onClick={() => {
                                                if (customer) {
                                                    const newIssues = (customer.support_issues || []).filter((_, i) => i !== idx);
                                                    updateCustomer(customer.id, { support_issues: newIssues });
                                                }
                                            }}>Remove</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {healthData.healthStatus !== 'Unknown' && (
                        <div>
                            <h2 style={{ marginBottom: '16px', fontSize: '18px', color: 'var(--text-highlight)' }}>Support Overview (Jira)</h2>
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                                <div style={{ flex: 1, padding: '12px', borderRadius: '6px', backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)', border: '1px solid var(--status-danger)' }}>
                                    <strong>{healthData.newIssues.length}</strong> New / Untriaged
                                </div>
                                <div style={{ flex: 1, padding: '12px', borderRadius: '6px', backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning)', border: '1px solid var(--status-warning)' }}>
                                    <strong>{healthData.inProgressIssues.length}</strong> In Progress
                                </div>
                                <div style={{ flex: 1, padding: '12px', borderRadius: '6px', backgroundColor: 'var(--accent-primary-bg)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }}>
                                    <strong>{healthData.noopIssues.length}</strong> Blocked / Pending
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {[...healthData.newIssues, ...healthData.inProgressIssues, ...healthData.noopIssues].map(issue => {
                                    const isLinked = (customer?.support_issues || []).some(si => si.related_jiras?.includes(issue.key));
                                    
                                    return (
                                        <div key={issue.key} style={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between', 
                                            alignItems: 'center',
                                            padding: '12px',
                                            backgroundColor: 'var(--bg-secondary)',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border-primary)'
                                        }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <a href={issue.url} target="_blank" rel="noreferrer" style={{ fontWeight: 'bold', color: 'var(--accent-text)', textDecoration: 'none' }}>
                                                        {issue.key}
                                                    </a>
                                                    <span style={{ 
                                                        fontSize: '10px', 
                                                        padding: '2px 6px', 
                                                        borderRadius: '4px', 
                                                        backgroundColor: issue.category === 'new' ? 'var(--status-danger)' : (issue.category === 'in_progress' ? 'var(--status-warning)' : 'var(--accent-primary)'),
                                                        color: 'white',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        {issue.status}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '13px' }}>{issue.summary}</span>
                                            </div>
                                            
                                            {!isLinked && (
                                                <select 
                                                    style={{ width: '160px', fontSize: '12px' }}
                                                    value=""
                                                    onChange={(e) => handleLinkJira(issue, e.target.value)}
                                                >
                                                    <option value="" disabled>Link to...</option>
                                                    <option value="NEW">+ Create New Support Issue</option>
                                                    {customer?.support_issues?.map(si => (
                                                        <option key={si.id} value={si.id}>Link to: {si.description.substring(0, 20)}...</option>
                                                    ))}
                                                </select>
                                            )}
                                            {isLinked && (
                                                <span style={{ fontSize: '11px', color: 'var(--status-success)', fontWeight: 'bold' }}>✓ Linked</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
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
