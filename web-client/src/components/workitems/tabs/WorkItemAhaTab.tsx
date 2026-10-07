import React, { useState } from 'react';
import type { WorkItem, ValueStreamData, ExternalLink } from '@valuestream/shared-types';
import { syncAhaFeature, syncAhaEpic } from '../../../utils/api';
import { parseAhaFeature, parseAhaEpic } from '../../../utils/businessLogic';
import { withAhaLink, ahaRecordTypeForKey } from '../../../utils/workItemOrigin';
import { useNotificationContext } from '../../../contexts/NotificationContext';
import { SettingsLink } from '../../common/SettingsLink';

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
    const { showAlert, showConfirm } = useNotificationContext();
    const [isSyncingAha, setIsSyncingAha] = useState(false);

    const link = workItem?.links?.aha ?? undefined;
    // Synced data is shown only once the link points at a real Aha! record.
    const synced = link?.external_id ? link.data : undefined;
    // Aha! epic ("feature set") or feature — Aha! terms, not the work item hierarchy.
    const isEpic = link?.record_type === 'epic';

    // Every write of the link goes through here, so the origin and the
    // Aha!-owned fields stay in step with what the server derives.
    const applyLink = (next: ExternalLink | null) => {
        const updates = withAhaLink(workItem, next, data?.workItems);
        if (isNew) {
            setNewWorkItemDraft(prev => ({ ...prev, ...updates }));
        } else {
            updateWorkItem(workItemId, updates);
        }
    };

    const handleSyncAha = async () => {
        if (!link?.key) {
            await showAlert('Aha! Sync', 'Please provide an Aha! Reference Number first.');
            return;
        }

        setIsSyncingAha(true);
        try {
            const aha = data?.settings?.aha || {};
            const record = isEpic ? await syncAhaEpic(link.key, aha) : await syncAhaFeature(link.key, aha);
            // Preserve the user-typed key verbatim — Aha! sometimes returns a
            // normalized casing that diverges from what's stored.
            applyLink({ ...(isEpic ? parseAhaEpic(record) : parseAhaFeature(record)), key: link.key });
            await showAlert('Aha! Sync', `Successfully synced data from ${record.reference_num}.`);
        } catch (err: unknown) {
            console.error('Aha! Sync failed', err);
            const msg = err instanceof Error ? err.message : 'An unexpected error occurred during Aha! sync.';
            await showAlert('Aha! Sync Failed', msg);
        } finally {
            setIsSyncingAha(false);
        }
    };

    const clearAhaLink = (silent: boolean) => {
        // null (not undefined): JSON.stringify drops undefined, so only null
        // reaches the PATCH body and clears the stored link.
        applyLink(null);
        if (!silent) {
            void showAlert('Aha! Unlinked', 'The Aha! link has been removed. This work item is now local.');
        }
    };

    const handleDeleteAhaLink = async () => {
        const confirmed = await showConfirm('Unlink Aha!', 'Remove the Aha! link? The work item keeps its current values and becomes local.');
        if (!confirmed) return;
        clearAhaLink(false);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', display: 'flex', alignItems: 'center' }}>
                    Link to Aha! Feature or Epic
                    <SettingsLink tab="aha" title="Configure Aha! integration" />
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    Enter the Aha! Reference Number of a feature (e.g., <code>PROD-123</code>) or an epic (e.g., <code>PROD-E-12</code>) to link this work item and sync its details. A synced feature sits under the work item of its Aha! epic.
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ width: '120px' }}>
                        <input
                            type="text"
                            placeholder="PROD-123"
                            value={link?.key || ''}
                            onChange={e => {
                                const next = e.target.value;
                                if (next === '') {
                                    // Emptying the field is treated the same as the Delete button:
                                    // a dangling synced_data without a reference would mislead the user.
                                    clearAhaLink(true);
                                    return;
                                }
                                // A new key no longer names the synced record: keep only the key.
                                applyLink({ key: next, record_type: ahaRecordTypeForKey(next) });
                            }}
                            style={{ width: '100%' }}
                        />
                    </div>
                    {link?.url && (
                        <a
                            href={link.url}
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
                        disabled={isSyncingAha || !link?.key}
                        style={{ marginLeft: 'auto' }}
                    >
                        {isSyncingAha ? 'Syncing...' : 'Sync from Aha!'}
                    </button>
                    {link && (
                        <button
                            className="btn-danger"
                            onClick={handleDeleteAhaLink}
                            disabled={isSyncingAha}
                            title="Remove the Aha! link; the work item keeps its current values and becomes local"
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>

            {synced && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                            <div style={{ marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, fontSize: '15px' }}>Synced Information</h3>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    Name and description of this work item are managed in Aha!
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Name</div>
                                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{synced.name}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Description</div>
                                    {synced.description ? (
                                        <div
                                            style={{ fontSize: '13px', maxHeight: '150px', overflowY: 'auto', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', padding: '8px', borderRadius: '4px' }}
                                            dangerouslySetInnerHTML={{ __html: synced.description }}
                                        />
                                    ) : (
                                        <div style={{ fontSize: '13px', maxHeight: '150px', overflowY: 'auto', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', padding: '8px', borderRadius: '4px' }}>
                                            <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No description</span>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '32px' }}>
                                    <div>
                                        <div
                                            style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}
                                            title="Informational only: the work item's effort is engineering data and is not taken from Aha!"
                                        >Aha! Estimate (MDs)</div>
                                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-text)' }}>{synced.estimate_mds ?? '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Product Value</div>
                                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-text)' }}>{synced.score ?? '-'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {isEpic ? (
                    <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-secondary)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        This work item is an Aha! epic. Its Aha! features are its child work items (see the Hierarchy tab).
                    </div>
                    ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Requirements ({synced.requirements?.length || 0})</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto', paddingRight: '4px' }}>
                                {synced.requirements?.map(req => (
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
                                {(!synced.requirements || synced.requirements.length === 0) && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '24px' }}>No requirements found.</div>
                                )}
                            </div>
                        </div>
                    </div>
                    )}
                </div>
            )}
        </div>
    );
};
