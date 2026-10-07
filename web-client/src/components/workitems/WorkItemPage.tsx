import React, { useState } from 'react';
import type { ValueStreamData, WorkItem, Issue } from '@valuestream/shared-types';
import { SearchableDropdown } from '../common/SearchableDropdown';
import { useDeleteWithConfirm } from '../../hooks/useDeleteWithConfirm';
import { GenericDetailPage, type DetailTab } from '../common/GenericDetailPage';
import { FormTextField, FormNumberField, FormSelectField, FormTextArea } from '../common/FormFields';
import { WorkItemCustomersTab } from './tabs/WorkItemCustomersTab';
import { WorkItemIssuesTab } from './tabs/WorkItemIssuesTab';
import { WorkItemAhaTab } from './tabs/WorkItemAhaTab';
import { WorkItemHierarchyTab } from './tabs/WorkItemHierarchyTab';
import { isOwnedField } from '../../utils/workItemOrigin';
import { EFFORT_SIZE_OPTIONS, effortSizeUpdate } from '../../utils/effortSize';

export interface WorkItemPageProps {
    workItemId: string;
    onBack: () => void;
    data: ValueStreamData | null;
    loading: boolean;
    error: Error | null;
    addWorkItem: (f: Omit<WorkItem, 'id'> & { id?: string }) => Promise<WorkItem | undefined>;
    deleteWorkItem: (id: string) => void;
    updateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
    saveWorkItemTargets: (workItemId: string, targets: WorkItem['customer_targets']) => Promise<boolean>;
    addIssue: (e: Omit<Issue, 'id'> & { id?: string }) => Promise<Issue | undefined> | void;
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
    saveWorkItemTargets,
    addIssue,
    deleteIssue,
    updateIssue
}) => {
    const deleteWithConfirm = useDeleteWithConfirm();
    const isNew = workItemId === 'new';

    // Draft states for new workItem creation. stackrank defaults to the lowest priority slot
    // (max existing rank + 1000) so the user gets sparse spacing for free; they can clear it
    // to keep the item unranked or override with any integer.
    const [newWorkItemDraft, setNewWorkItemDraft] = useState<Partial<WorkItem>>(() => {
        const ranks = (data?.workItems ?? [])
            .map(w => w.stackrank)
            .filter((r): r is number => typeof r === 'number');
        const nextRank = ranks.length > 0 ? Math.max(...ranks) + 1000 : 1000;
        return { name: '', description: '', status: 'Backlog', total_effort_mds: 0, customer_targets: [], stackrank: nextRank };
    });
    const [newWorkItemCustomers, setNewWorkItemCustomers] = useState<{ customerId: string, tcv_type: 'existing' | 'potential', priority: 'Must-have' | 'Should-have' | 'Nice-to-have', tcv_history_id?: string }[]>([]);
    const [newWorkItemIssues, setNewWorkItemIssues] = useState<Issue[]>([]);

    const workItem = isNew ? newWorkItemDraft as WorkItem : data?.workItems.find(f => f.id === workItemId);

    const targetedCustomers = (isNew && data)
        ? newWorkItemCustomers.map(nfc => data.customers.find(c => c.id === nfc.customerId)!).filter(Boolean)
        : data?.customers.filter(c => workItem?.customer_targets?.some(ct => ct.customer_id === c.id)) || [];

    const issues = isNew ? newWorkItemIssues : (data?.issues || []).filter(e => e.work_item_id === workItemId);
    // Derived values are computed by the backend only (DEC-016); show the stored ones.
    const calculatedEffort = workItem?.calculated_effort ?? 0;
    const calculatedTcv = workItem?.calculated_tcv ?? 0;
    // Linked Jira issues override the T-shirt baseline once they carry effort.
    const jiraEffort = issues.reduce((sum, e) => sum + (e.effort_md || 0), 0);

    const handleSave = async () => {
        if (!data) return;
        try {
            if (isNew) {
                const newFeat: Omit<WorkItem, 'id'> = {
                    ...newWorkItemDraft,
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

                // REQ-018: the server names the work item; its issues need that id.
                const created = await addWorkItem(newFeat);
                if (!created) return;
                // Issues picked from the existing list are linked, not created again;
                // only the drafted ones are new records.
                const existingIds = new Set((data.issues || []).map(e => e.id));
                await Promise.all(newWorkItemIssues.map(({ id, ...e }) => existingIds.has(id)
                    ? updateIssue(id, { work_item_id: created.id }, true)
                    : addIssue({ ...e, work_item_id: created.id })));

                setTimeout(() => {
                    onBack();
                }, 1000);
            }
        } catch (err) {
            console.error('Save failed', err);
        }
    };

    const handleDelete = () => {
        deleteWithConfirm(
            'Delete Work Item',
            'Are you sure you want to delete this work item? It will be removed from all associated issues.',
            () => deleteWorkItem(workItemId),
            onBack
        );
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
                    readOnly={isOwnedField(workItem, 'name')}
                    helperText={isOwnedField(workItem, 'name') ? 'Managed in Aha!' : undefined}
                    placeholder="New Work Item"
                />
                <FormSelectField
                    label="Baseline Effort (T-shirt):"
                    helperText={jiraEffort > 0 ? `Overridden by linked Jira issues (${jiraEffort.toLocaleString()} MDs).` : undefined}
                    value={workItem?.effort_size ?? ''}
                    onChange={v => {
                        const updates = effortSizeUpdate(v);
                        if (isNew) setNewWorkItemDraft(prev => ({ ...prev, ...updates }));
                        else updateWorkItem(workItemId, updates);
                    }}
                    options={EFFORT_SIZE_OPTIONS}
                />
                <FormNumberField
                    label="Stack Rank:"
                    helperText="Higher = higher priority. Leave empty to keep the work item unranked."
                    value={workItem?.stackrank ?? ''}
                    onChange={v => {
                        if (isNew) setNewWorkItemDraft(prev => ({ ...prev, stackrank: v }));
                        else updateWorkItem(workItemId, { stackrank: v });
                    }}
                    min={0}
                />
                <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
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
                    </div>
                    <div style={{ flex: 1 }}>
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
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                <FormTextArea
                    label="Description:"
                    value={workItem?.description || ''}
                    onChange={v => {
                        if (isNew) setNewWorkItemDraft(prev => ({ ...prev, description: v }));
                        else updateWorkItem(workItemId, { description: v });
                    }}
                    readOnly={isOwnedField(workItem, 'description')}
                    helperText={isOwnedField(workItem, 'description') ? 'Managed in Aha!' : undefined}
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
                    saveWorkItemTargets={saveWorkItemTargets}
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
        },
        {
            id: 'hierarchy',
            label: (() => {
                const childCount = isNew ? 0 : (data?.workItems ?? []).filter(w => w.parent_id === workItemId).length;
                return `Hierarchy (${childCount})`;
            })(),
            content: (
                <WorkItemHierarchyTab
                    workItem={workItem}
                    isNew={isNew}
                    workItemId={workItemId}
                    data={data}
                    setNewWorkItemDraft={setNewWorkItemDraft}
                    updateWorkItem={updateWorkItem}
                />
            )
        }
    ];

    if (data?.settings?.aha?.subdomain) {
        const ahaCount = workItem?.links?.aha?.external_id ? 1 : 0;
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
