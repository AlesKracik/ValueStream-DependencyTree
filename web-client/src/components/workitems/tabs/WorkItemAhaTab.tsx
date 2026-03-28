import React, { useState } from 'react';
import type { WorkItem, ValueStreamData } from '@valuestream/shared-types';
import { syncAhaFeature } from '../../../utils/api';
import { useValueStreamContext } from '../../../contexts/ValueStreamContext';

interface Props {
    workItem: WorkItem | undefined;
    isNew: boolean;
    workItemId: string;
    setNewWorkItemDraft: React.Dispatch<React.SetStateAction<Partial<WorkItem>>>;
    updateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
    data: ValueStreamData | null;
}

export const WorkItemAhaTab: React.FC<Props> = ({
    workItem,
    isNew,
    workItemId,
    setNewWorkItemDraft,
    updateWorkItem,
    data
}) => {
    const { showAlert, showConfirm } = useValueStreamContext();
    const [isSyncingAha, setIsSyncingAha] = useState(false);

    const stripHtml = (html: string) => {
        const tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    };

    const handleSyncAha = async () => {
        if (!workItem?.aha_reference?.reference_num) {
            await showAlert('Aha! Sync', 'Please provide an Aha! Reference Number first.');
            return;
        }

        setIsSyncingAha(true);
        try {
            const feature = await syncAhaFeature(workItem.aha_reference.reference_num, data?.settings?.aha || {});

            const syncedData: NonNullable<WorkItem['aha_synced_data']> = {
                name: feature.name,
                description: feature.description?.body || '',
                score: feature.score,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                requirements: feature.requirements?.map((r: any) => ({
                    id: r.id,
                    reference_num: r.reference_num,
                    name: r.name,
                    description: r.description?.body || '',
                    url: r.url
                })) || []
            };

            if (feature.original_estimate) {
                syncedData.total_effort_mds = Math.round(feature.original_estimate / 480);
            }

            const updates: Partial<WorkItem> = {
                aha_synced_data: syncedData,
                aha_reference: {
                    ...workItem.aha_reference,
                    id: feature.id,
                    url: feature.url,
                    reference_num: workItem.aha_reference.reference_num
                }
            };

            if (isNew) {
                setNewWorkItemDraft(prev => ({ ...prev, ...updates }));
            } else {
                updateWorkItem(workItemId, updates);
            }
            await showAlert('Aha! Sync', `Successfully synced data from ${feature.reference_num}.`);
        } catch (err: unknown) {
            console.error('Aha! Sync failed', err);
            const msg = err instanceof Error ? err.message : 'An unexpected error occurred during Aha! sync.';
            await showAlert('Aha! Sync Failed', msg);
        } finally {
            setIsSyncingAha(false);
        }
    };

    const applyAhaData = async () => {
        if (!workItem?.aha_synced_data) return;

        const confirmed = await showConfirm('Apply Aha! Data', 'This will overwrite the current name, description, baseline effort, and score with the values from Aha!. Are you sure?');
        if (!confirmed) return;

        const updates: Partial<WorkItem> = {};
        if (workItem.aha_synced_data.name) updates.name = workItem.aha_synced_data.name;
        if (workItem.aha_synced_data.description) updates.description = stripHtml(workItem.aha_synced_data.description);
        if (workItem.aha_synced_data.total_effort_mds !== undefined) updates.total_effort_mds = workItem.aha_synced_data.total_effort_mds;
        if (workItem.aha_synced_data.score !== undefined) updates.score = workItem.aha_synced_data.score;

        if (isNew) {
            setNewWorkItemDraft(prev => ({ ...prev, ...updates }));
        } else {
            updateWorkItem(workItemId, updates);
        }
        await showAlert('Aha! Data Applied', 'The work item has been updated with data from Aha!.');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Link to Aha! Feature</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    Enter the Aha! Reference Number (e.g., <code>PROD-123</code>) to link this work item and sync its details.
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ width: '120px' }}>
                        <input
                            type="text"
                            placeholder="PROD-123"
                            value={workItem?.aha_reference?.reference_num || ''}
                            onChange={e => {
                                const val = {
                                    id: workItem?.aha_reference?.id || '',
                                    url: workItem?.aha_reference?.url || '',
                                    reference_num: e.target.value
                                };
                                if (isNew) setNewWorkItemDraft(prev => ({ ...prev, aha_reference: val }));
                                else updateWorkItem(workItemId, { aha_reference: val });
                            }}
                            style={{ width: '100%' }}
                        />
                    </div>
                    {workItem?.aha_reference?.url && (
                        <a
                            href={workItem.aha_reference.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in Aha!"
                            style={{ color: 'var(--accent-text)', textDecoration: 'none', fontSize: '18px', fontWeight: 'bold' }}
                        >
                            ↗
                        </a>
                    )}
                    <button
                        className="btn-primary"
                        onClick={handleSyncAha}
                        disabled={isSyncingAha || !workItem?.aha_reference?.reference_num}
                        style={{ marginLeft: 'auto' }}
                    >
                        {isSyncingAha ? 'Syncing...' : 'Sync from Aha!'}
                    </button>
                </div>
            </div>

            {workItem?.aha_synced_data && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, fontSize: '15px' }}>Synced Information</h3>
                                <button className="btn-primary" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={applyAhaData}>
                                    Apply to Work Item
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Name</div>
                                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{workItem.aha_synced_data.name}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Description</div>
                                    {workItem.aha_synced_data.description ? (
                                        <div
                                            style={{ fontSize: '13px', maxHeight: '150px', overflowY: 'auto', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', padding: '8px', borderRadius: '4px' }}
                                            dangerouslySetInnerHTML={{ __html: workItem.aha_synced_data.description }}
                                        />
                                    ) : (
                                        <div style={{ fontSize: '13px', maxHeight: '150px', overflowY: 'auto', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', padding: '8px', borderRadius: '4px' }}>
                                            <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No description</span>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '32px' }}>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Effort (MDs)</div>
                                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-text)' }}>{workItem.aha_synced_data.total_effort_mds ?? '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Score</div>
                                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-text)' }}>{workItem.aha_synced_data.score ?? '-'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Requirements ({workItem.aha_synced_data.requirements?.length || 0})</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto', paddingRight: '4px' }}>
                                {workItem.aha_synced_data.requirements?.map(req => (
                                    <div key={req.id} style={{ padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-secondary)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--accent-text)' }}>{req.reference_num}</span>
                                            {req.url && (
                                                <a href={req.url} target="_blank" rel="noopener noreferrer" title="Open Requirement in Aha!" style={{ fontSize: '14px', color: 'var(--text-muted)', textDecoration: 'none' }}>↗</a>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>{req.name}</div>
                                        {req.description && (
                                            <div
                                                style={{ fontSize: '12px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', padding: '8px', borderRadius: '4px', borderLeft: '3px solid var(--border-secondary)' }}
                                                dangerouslySetInnerHTML={{ __html: req.description }}
                                            />
                                        )}
                                    </div>
                                ))}
                                {(!workItem.aha_synced_data.requirements || workItem.aha_synced_data.requirements.length === 0) && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '24px' }}>No requirements found.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
