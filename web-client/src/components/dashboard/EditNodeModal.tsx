import React, { useState, useEffect } from 'react';
import type { Node } from '@xyflow/react';
import type { DashboardData, Customer, WorkItem, Team } from '../../types/models';

interface EditNodeModalProps {
    node: Node;
    onClose: () => void;
    data: DashboardData;
    onUpdateCustomer: (id: string, updates: Partial<Customer>) => void;
    onUpdateWorkItem: (id: string, updates: Partial<WorkItem>) => void;
    onUpdateTeam: (id: string, updates: Partial<Team>) => void;
}

export const EditNodeModal: React.FC<EditNodeModalProps> = ({
    node,
    onClose,
    data,
    onUpdateCustomer,
    onUpdateWorkItem,
    onUpdateTeam
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
    const [formData, setFormData] = useState<any>({});

    // Initialize form data based on node type
    useEffect(() => {
        if (node.type === 'customerNode') {
            const customer = data.customers.find(c => c.id === domainId);
            if (customer) {
                setFormData({
                    name: customer.name,
                    existing_tcv: customer.existing_tcv,
                    potential_tcv: customer.potential_tcv
                });
            }
        } else if (node.type === 'workItemNode') {
            const workItem = data.workItems.find(f => f.id === domainId);
            if (workItem) {
                setFormData({
                    name: workItem.name,
                    total_effort_mds: workItem.total_effort_mds,
                    relates_to_all_existing_customers: !!workItem.relates_to_all_existing_customers,
                    customer_targets: workItem.customer_targets ? JSON.parse(JSON.stringify(workItem.customer_targets)) : []
                });
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
                    setFormData({
                        teamId,
                        sprintId,
                        teamName: team.name,
                        sprintName: sprint.name,
                        override_capacity_mds: currentOverride !== undefined ? String(currentOverride) : ''
                    });
                }
            }
        }
    }, [node, domainId, data]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (node.type === 'customerNode') {
            onUpdateCustomer(domainId, {
                name: formData.name,
                existing_tcv: Number(formData.existing_tcv),
                potential_tcv: Number(formData.potential_tcv)
            });
        } else if (node.type === 'workItemNode') {
            onUpdateWorkItem(domainId, {
                name: formData.name,
                total_effort_mds: Number(formData.total_effort_mds),
                relates_to_all_existing_customers: !!formData.relates_to_all_existing_customers,
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
                onUpdateTeam(formData.teamId, { sprint_capacity_overrides: overrides });
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
                        Existing TCV ($):
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
                        Total Effort (MDs):
                        <input style={styles.input} type="number" value={formData.total_effort_mds || 0} onChange={e => setFormData({ ...formData, total_effort_mds: e.target.value })} required />
                    </label>
                    <label style={{ ...styles.label, flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={!!formData.relates_to_all_existing_customers} 
                            onChange={e => setFormData({ ...formData, relates_to_all_existing_customers: e.target.checked })} 
                        />
                        <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Relates to ALL existing customers</span>
                    </label>

                    {!formData.relates_to_all_existing_customers && (
                        <div style={{ marginTop: '16px' }}>
                            <h3 style={{ fontSize: '14px', color: '#e2e8f0', marginBottom: '8px' }}>Customer Targets Prioritization</h3>
                            {(formData.customer_targets || []).map((target: any, idx: number) => {
                                const cst = data.customers.find(c => c.id === target.customer_id);
                                return (
                                    <div key={`${target.customer_id}-${target.tcv_type}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '13px', color: '#cbd5e1' }}>
                                        <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {cst?.name || target.customer_id} ({target.tcv_type})
                                        </span>
                                        <select
                                            style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', cursor: 'pointer' }}
                                            value={target.priority || 'Must-have'}
                                            onChange={e => {
                                                const newTargets = [...formData.customer_targets];
                                                newTargets[idx].priority = e.target.value;
                                                setFormData({ ...formData, customer_targets: newTargets });
                                            }}
                                        >
                                            <option value="Must-have">Must-have</option>
                                            <option value="Should-have">Should-have</option>
                                            <option value="Nice-to-have">Nice-to-have</option>
                                        </select>
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
        backgroundColor: '#1f2937',
        border: '1px solid #374151',
        borderRadius: '8px',
        padding: '24px',
        width: '400px',
        maxWidth: '90%',
        color: '#f9fafb',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
    },
    title: {
        marginTop: 0,
        marginBottom: '20px',
        fontSize: '18px',
        borderBottom: '1px solid #374151',
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
        color: '#d1d5db'
    },
    input: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid #4b5563',
        backgroundColor: '#111827',
        color: '#f9fafb',
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
        border: '1px solid #4b5563',
        color: '#d1d5db',
        borderRadius: '4px',
        cursor: 'pointer'
    },
    saveBtn: {
        padding: '8px 16px',
        backgroundColor: '#8b5cf6',
        border: 'none',
        color: 'white',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 500
    }
};
