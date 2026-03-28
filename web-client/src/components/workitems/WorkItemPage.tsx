import React, { useState } from 'react';
import type { ValueStreamData, WorkItem, Issue } from '@valuestream/shared-types';
import { SearchableDropdown } from '../common/SearchableDropdown';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { generateId } from '../../utils/security';
import { calculateWorkItemEffort, calculateWorkItemTcv } from '../../utils/businessLogic';
import { GenericDetailPage, type DetailTab } from '../common/GenericDetailPage';
import { FormTextField, FormNumberField, FormSelectField, FormTextArea } from '../common/FormFields';
import { WorkItemCustomersTab } from './tabs/WorkItemCustomersTab';
import { WorkItemIssuesTab } from './tabs/WorkItemIssuesTab';
import { WorkItemAhaTab } from './tabs/WorkItemAhaTab';

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
    const { showConfirm } = useNotificationContext();
    const isNew = workItemId === 'new';

    // Draft states for new workItem creation
    const [newWorkItemDraft, setNewWorkItemDraft] = useState<Partial<WorkItem>>({ name: '', description: '', status: 'Backlog', total_effort_mds: 0, customer_targets: [] });
    const [newWorkItemCustomers, setNewWorkItemCustomers] = useState<{ customerId: string, tcv_type: 'existing' | 'potential', priority: 'Must-have' | 'Should-have' | 'Nice-to-have', tcv_history_id?: string }[]>([]);
    const [newWorkItemIssues, setNewWorkItemIssues] = useState<Issue[]>([]);

    const workItem = isNew ? newWorkItemDraft as WorkItem : data?.workItems.find(f => f.id === workItemId);

    const targetedCustomers = (isNew && data)
        ? newWorkItemCustomers.map(nfc => data.customers.find(c => c.id === nfc.customerId)!).filter(Boolean)
        : data?.customers.filter(c => workItem?.customer_targets?.some(ct => ct.customer_id === c.id)) || [];

    const issues = isNew ? newWorkItemIssues : (data?.issues || []).filter(e => e.work_item_id === workItemId);
    const calculatedEffort = workItem && data ? calculateWorkItemEffort(workItem, issues) : 0;
    const calculatedTcv = workItem && data ? calculateWorkItemTcv(workItem, data.customers, data.workItems) : 0;

    const handleSave = async () => {
        if (!data) return;
        try {
            if (isNew) {
                const newId = generateId('f');
                const newFeat: WorkItem = {
                    id: newId,
                    name: newWorkItemDraft.name || 'New Work Item',
                    description: newWorkItemDraft.description || '',
                    status: (newWorkItemDraft.status as WorkItem['status']) || 'Backlog',
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

    if (!workItem && !loading) {
        return <GenericDetailPage entityTitle="Work Item Not Found" onBack={onBack} mainDetails={<div>Work Item not found.</div>} loading={loading} data={data} />;
    }

    const mainDetails = (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                <FormTextField
                    label="Name:"
                    value={workItem?.name || ''}
                    onChange={v => {
                        if (isNew) setNewWorkItemDraft(prev => ({ ...prev, name: v }));
                        else updateWorkItem(workItemId, { name: v });
                    }}
                    placeholder="New Work Item"
                />
                <FormNumberField
                    label="Baseline Effort (MDs):"
                    value={workItem?.total_effort_mds || 0}
                    onChange={v => {
                        const val = v ?? 0;
                        if (isNew) setNewWorkItemDraft(prev => ({ ...prev, total_effort_mds: val }));
                        else updateWorkItem(workItemId, { total_effort_mds: val });
                    }}
                    min={0}
                />
                <FormSelectField
                    label="Status:"
                    value={workItem?.status || 'Backlog'}
                    onChange={v => {
                        const val = v as WorkItem['status'];
                        if (isNew) setNewWorkItemDraft(prev => ({ ...prev, status: val }));
                        else updateWorkItem(workItemId, { status: val });
                    }}
                    options={[
                        { value: 'Backlog', label: 'Backlog' },
                        { value: 'Planning', label: 'Planning' },
                        { value: 'Development', label: 'Development' },
                        { value: 'Done', label: 'Done' },
                    ]}
                />
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
                <FormTextArea
                    label="Description:"
                    value={workItem?.description || ''}
                    onChange={v => {
                        if (isNew) setNewWorkItemDraft(prev => ({ ...prev, description: v }));
                        else updateWorkItem(workItemId, { description: v });
                    }}
                    rows={4}
                    placeholder="Add a detailed description for this work item..."
                    style={{ flex: 1 }}
                    textareaStyle={{ resize: 'none', minHeight: '100px', backgroundColor: 'var(--bg-primary)' }}
                />
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
                <WorkItemCustomersTab
                    workItem={workItem}
                    isNew={isNew}
                    workItemId={workItemId}
                    targetedCustomers={targetedCustomers}
                    newWorkItemCustomers={newWorkItemCustomers}
                    setNewWorkItemCustomers={setNewWorkItemCustomers}
                    setNewWorkItemDraft={setNewWorkItemDraft}
                    updateWorkItem={updateWorkItem}
                    data={data}
                />
            )
        },
        {
            id: 'issues',
            label: `Engineering Issues (${issues.length})`,
            content: (
                <WorkItemIssuesTab
                    isNew={isNew}
                    workItemId={workItemId}
                    issues={issues}
                    data={data}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    deleteIssue={deleteIssue}
                    setNewWorkItemIssues={setNewWorkItemIssues}
                />
            )
        }
    ];

    if (data?.settings?.aha?.subdomain) {
        const ahaCount = workItem?.aha_synced_data?.requirements?.length || 0;
        tabs.push({
            id: 'aha',
            label: `Aha! Integration (${ahaCount})`,
            content: (
                <WorkItemAhaTab
                    workItem={workItem}
                    isNew={isNew}
                    workItemId={workItemId}
                    setNewWorkItemDraft={setNewWorkItemDraft}
                    updateWorkItem={updateWorkItem}
                    data={data}
                />
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
