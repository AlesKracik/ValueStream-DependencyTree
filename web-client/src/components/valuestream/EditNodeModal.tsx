import React, { useState, useEffect } from 'react';
import type { Node } from '@xyflow/react';
import type { ValueStreamData, Customer, WorkItem, Team } from '../../types/models';
import { SearchableDropdown } from '../common/SearchableDropdown';
import { calculateWorkItemEffort } from '../../utils/businessLogic';

interface EditNodeModalProps {
    node: Node;
    onClose: () => void;
    data: ValueStreamData;
    onUpdateCustomer: (id: string, updates: Partial<Customer>, immediate?: boolean) => Promise<void>;
    onUpdateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
    onUpdateTeam: (id: string, updates: Partial<Team>, immediate?: boolean) => Promise<void>;
    onUpdateEpic: (id: string, updates: Partial<any>, immediate?: boolean) => Promise<void>;
}

export const EditNodeModal: React.FC<EditNodeModalProps> = ({
    node,
    onClose,
    data,
    onUpdateCustomer,
    onUpdateWorkItem,
    onUpdateTeam,
    onUpdateEpic
}) => {
    // Extract domain ID from node ID (e.g., 'customer-c1' -> 'c1', 'gantt-a1' -> 'a1')
    const extractId = (nodeId: string) => {
        const parts = nodeId.split('-');
        // Handle parts like customer-c1, workitem-f1, team-t1
        if (['customerNode', 'workItemNode', 'teamNode'].includes(node.type || '')) {
            return parts.slice(1).join('-'); // handles 'c1' or 'c-1-2'
        }
        // Handle gantt-a1
        if (node.type === 'ganttBarNode') {
            return parts.slice(1).join('-');
        }
        if (node.type === 'sprintCapacityNode') {
            return nodeId;
        }
        return nodeId;
    };

    const domainId = extractId(node.id);

    const getInitialFormData = () => {
        if (node.type === 'customerNode') {
            const customer = data.customers.find(c => c.id === domainId);
            if (customer) {
                return {
                    name: customer.name,
                    existing_tcv: customer.existing_tcv,
                    potential_tcv: customer.potential_tcv
                };
            }
        } else if (node.type === 'workItemNode') {
            const workItem = data.workItems.find(f => f.id === domainId);
            if (workItem) {
                return {
                    name: workItem.name,
                    total_effort_mds: workItem.total_effort_mds,
                    released_in_sprint_id: workItem.released_in_sprint_id || '',
                    all_customers_target: workItem.all_customers_target ? { ...workItem.all_customers_target } : undefined,
                    customer_targets: workItem.customer_targets ? JSON.parse(JSON.stringify(workItem.customer_targets)) : []
                };
            }

        } else if (node.type === 'sprintCapacityNode') {
            const match = String(domainId).match(/^sprint-cap-(t\d+)-(s\d+)$/);
            if (match && data) {
                const teamId = match[1];
                const sprintId = match[2];
                const team = data.teams.find(t => t.id === teamId);
                const sprint = data.sprints.find(s => s.id === sprintId);
                if (team && sprint) {
                    const currentOverride = team.sprint_capacity_overrides?.[sprintId];
                    return {
                        teamId,
                        sprintId,
                        teamName: team.name,
                        sprintName: sprint.name,
                        override_capacity_mds: currentOverride !== undefined ? String(currentOverride) : ''
                    };
                }
            }
        }
        return {};
    };

    const [formData, setFormData] = useState<Record<string, any>>(() => getInitialFormData());
    const [prevNodeId, setPrevNodeId] = useState(node.id);

    if (node.id !== prevNodeId) {
        setPrevNodeId(node.id);
        setFormData(getInitialFormData());
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (node.type === 'customerNode') {
            await onUpdateCustomer(domainId, {
                name: formData.name,
                existing_tcv: Number(formData.existing_tcv),
                potential_tcv: Number(formData.potential_tcv)
            });
        } else if (node.type === 'workItemNode') {
            await onUpdateWorkItem(domainId, {
                name: formData.name,
                total_effort_mds: Number(formData.total_effort_mds),
                released_in_sprint_id: formData.released_in_sprint_id,
                all_customers_target: formData.all_customers_target,
                customer_targets: formData.customer_targets
            });

        } else if (node.type === 'sprintCapacityNode') {
            const team = data.teams.find(t => t.id === formData.teamId);
            if (team) {
                const overrides = { ...(team.sprint_capacity_overrides || {}) };
                const val = String(formData.override_capacity_mds).trim();
                if (val === '') {
                    delete overrides[formData.sprintId];
                } else {
                    const parsed = Number(val);
                    if (!isNaN(parsed) && parsed >= 0) {
                        overrides[formData.sprintId] = parsed;
                    }
                }
                await onUpdateTeam(formData.teamId, { sprint_capacity_overrides: overrides });
            }
        }

        onClose();
    };

    // Render forms based on active node
    const renderFormFields = () => {
        if (node.type === 'customerNode') {
            return (
                <>
                    <h2 style={styles.title}>Edit Customer: {domainId}</h2>
                    <label style={styles.label}>
                        Name:
                        <input style={styles.input} type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                    </label>
                    <label style={styles.label}>
                        Actual Existing TCV ($):
                        <input style={styles.input} type="number" value={formData.existing_tcv || 0} onChange={e => setFormData({ ...formData, existing_tcv: e.target.value })} required />
                    </label>
                    <label style={styles.label}>
                        Potential TCV ($):
                        <input style={styles.input} type="number" value={formData.potential_tcv || 0} onChange={e => setFormData({ ...formData, potential_tcv: e.target.value })} required />
                    </label>
                </>
            );
        }

        if (node.type === 'workItemNode') {
            return (
                <>
                    <h2 style={styles.title}>Edit Work Item: {domainId}</h2>
                    <label style={styles.label}>
                        Name:
                        <input style={styles.input} type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                    </label>
                    <label style={styles.label}>
                        Released in Sprint:
                        <SearchableDropdown
                            options={data.sprints.map(s => ({ id: s.id, label: s.name }))}
                            onSelect={(sprintId) => setFormData({ ...formData, released_in_sprint_id: sprintId })}
                            placeholder="Select release sprint..."
                            initialValue={data.sprints.find(s => s.id === formData.released_in_sprint_id)?.name || ''}
                            clearOnSelect={false}
                        />
                    </label>
                    <label style={styles.label}>
                        Total Effort (MDs):
                        <input style={styles.input} type="number" value={formData.total_effort_mds || 0} onChange={e => setFormData({ ...formData, total_effort_mds: e.target.value })} required />
                    </label>

                    {(() => {
                        const workItem = data.workItems.find(f => f.id === domainId);
                        if (!workItem) return null;
                        const workItemEpics = data.epics.filter(e => e.work_item_id === workItem.id);
                        const calculatedEffort = calculateWorkItemEffort(workItem, workItemEpics);
                        const epicSum = workItemEpics.reduce((sum, e) => sum + (e.effort_md || 0), 0);
                        
                        return (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-8px', padding: '0 4px' }}>
                                Effective total: <span style={{ color: 'var(--accent-text)', fontWeight: 'bold' }}>{calculatedEffort} MDs</span>
                                {epicSum > 0 && <span> (Epic sum: {epicSum} MDs takes precedence)</span>}
                            </div>
                        );
                    })()}
                    
                    <div style={{ padding: '12px', backgroundColor: 'var(--accent-primary-bg)', borderRadius: '6px', marginBottom: '16px', marginTop: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: formData.all_customers_target ? '12px' : '0' }}>
                            <input 
                                type="checkbox" 
                                checked={!!formData.all_customers_target} 
                                onChange={e => {
                                    const checked = e.target.checked;
                                    setFormData({ 
                                        ...formData, 
                                        all_customers_target: checked ? { tcv_type: 'existing', priority: 'Must-have' } : null 
                                    });
                                }} 
                            />
                            <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent-text)' }}>Relates to ALL Customers (Global)</span>
                        </label>

                        {formData.all_customers_target && (
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <select
                                        style={{ width: '100%', padding: '6px', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
                                        value={formData.all_customers_target.tcv_type}
                                        onChange={e => setFormData({ 
                                            ...formData, 
                                            all_customers_target: { ...formData.all_customers_target, tcv_type: e.target.value } 
                                        })}
                                    >
                                        <option value="existing">Existing TCV</option>
                                        <option value="potential">Potential TCV</option>
                                    </select>
                                    {formData.all_customers_target.tcv_type === 'existing' && (
                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Always uses latest actual TCV</span>
                                    )}
                                </div>
                                <select
                                    style={{ flex: 1, height: 'fit-content', padding: '6px', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
                                    value={formData.all_customers_target.priority || 'Must-have'}
                                    onChange={e => setFormData({ 
                                        ...formData, 
                                        all_customers_target: { ...formData.all_customers_target, priority: e.target.value } 
                                    })}
                                >
                                    <option value="Must-have">Must-have</option>
                                    <option value="Should-have">Should-have</option>
                                    <option value="Nice-to-have">Nice-to-have</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {!formData.all_customers_target && (
                        <div style={{ marginTop: '16px' }}>
                            <h3 style={{ fontSize: '14px', color: 'var(--text-highlight)', marginBottom: '8px' }}>Customer Targets Prioritization</h3>
                            {(formData.customer_targets || []).map((target: { customer_id: string; tcv_type: string; priority: string; tcv_history_id?: string }, idx: number) => {
                                const cst = data.customers.find(c => c.id === target.customer_id);
                                return (
                                    <div key={`${target.customer_id}-${target.tcv_type}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', padding: '8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                            <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                                                {cst?.name || target.customer_id} ({target.tcv_type})
                                            </span>
                                            <select
                                                style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', cursor: 'pointer' }}
                                                value={target.priority || 'Must-have'}
                                                onChange={e => {
                                                    const newTargets = [...formData.customer_targets];
                                                    newTargets[idx] = { ...newTargets[idx], priority: e.target.value };
                                                    setFormData({ ...formData, customer_targets: newTargets });
                                                }}
                                            >
                                                <option value="Must-have">Must-have</option>
                                                <option value="Should-have">Should-have</option>
                                                <option value="Nice-to-have">Nice-to-have</option>
                                            </select>
                                        </div>
                                        {target.tcv_type === 'existing' && cst?.tcv_history && cst.tcv_history.length > 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>History:</span>
                                                <select
                                                    style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', cursor: 'pointer', fontSize: '11px' }}
                                                    value={target.tcv_history_id || 'latest'}
                                                    onChange={e => {
                                                        const newTargets = [...formData.customer_targets];
                                                        newTargets[idx] = { 
                                                            ...newTargets[idx], 
                                                            tcv_history_id: e.target.value === 'latest' ? undefined : e.target.value 
                                                        };
                                                        setFormData({ ...formData, customer_targets: newTargets });
                                                    }}
                                                >
                                                    <option value="latest">Latest Actual (${cst.existing_tcv.toLocaleString()})</option>
                                                    {cst.tcv_history.map(h => (
                                                        <option key={h.id} value={h.id}>{h.valid_from}: ${h.value.toLocaleString()}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            );
        }



        if (node.type === 'sprintCapacityNode') {
            return (
                <>
                    <h2 style={styles.title}>Edit Capacity Override: {formData.teamName} / {formData.sprintName}</h2>
                    <label style={styles.label}>
                        Capacity Override (MDs) (Leave blank to clear):
                        <input style={styles.input} type="number" value={formData.override_capacity_mds} onChange={e => setFormData({ ...formData, override_capacity_mds: e.target.value })} />
                    </label>
                </>
            );
        }

        return <p>Unknown node type.</p>;
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit} style={styles.formContainer}>
                    {renderFormFields()}

                    <div style={styles.buttonGroup}>
                        <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
                        <button type="submit" style={styles.saveBtn}>Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
    },
    modal: {
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '8px',
        padding: '24px',
        width: '400px',
        maxWidth: '90%',
        color: 'var(--text-primary)',
        boxShadow: '0 20px 25px -5px var(--bg-shadow)'
    },
    title: {
        marginTop: 0,
        marginBottom: '20px',
        fontSize: '18px',
        borderBottom: '1px solid var(--border-primary)',
        paddingBottom: '10px'
    },
    formContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
    },
    label: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        fontSize: '14px',
        color: 'var(--text-secondary)'
    },
    input: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        fontSize: '14px'
    },
    buttonGroup: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        marginTop: '24px'
    },
    cancelBtn: {
        padding: '8px 16px',
        backgroundColor: 'transparent',
        border: '1px solid var(--border-hover)',
        color: 'var(--text-secondary)',
        borderRadius: '4px',
        cursor: 'pointer'
    },
    saveBtn: {
        padding: '8px 16px',
        backgroundColor: 'var(--accent-primary)',
        border: 'none',
        color: 'white',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 500
    }
};



