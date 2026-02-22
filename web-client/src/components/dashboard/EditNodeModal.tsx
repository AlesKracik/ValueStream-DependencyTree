import React, { useState, useEffect } from 'react';
import type { Node } from '@xyflow/react';
import type { DashboardData, Customer, Feature, Team, Epic } from '../../types/models';

interface EditNodeModalProps {
    node: Node;
    onClose: () => void;
    data: DashboardData;
    onUpdateCustomer: (id: string, updates: Partial<Customer>) => void;
    onUpdateFeature: (id: string, updates: Partial<Feature>) => void;
    onUpdateTeam: (id: string, updates: Partial<Team>) => void;
    onUpdateEpic: (id: string, updates: Partial<Epic>) => void;
}

export const EditNodeModal: React.FC<EditNodeModalProps> = ({
    node,
    onClose,
    data,
    onUpdateCustomer,
    onUpdateFeature,
    onUpdateTeam,
    onUpdateEpic
}) => {
    // Extract domain ID from node ID (e.g., 'customer-c1' -> 'c1', 'gantt-a1' -> 'a1')
    const extractId = (nodeId: string) => {
        const parts = nodeId.split('-');
        // Handle parts like customer-c1, feature-f1, team-t1
        if (['customerNode', 'featureNode', 'teamNode'].includes(node.type || '')) {
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
        } else if (node.type === 'featureNode') {
            const feature = data.features.find(f => f.id === domainId);
            if (feature) {
                setFormData({
                    name: feature.name,
                    total_effort_mds: feature.total_effort_mds
                });
            }
        } else if (node.type === 'teamNode') {
            const team = data.teams.find(t => t.id === domainId);
            if (team) {
                setFormData({
                    name: team.name,
                    total_capacity_mds: team.total_capacity_mds,
                    jira_team_id: team.jira_team_id
                });
            }
        } else if (node.type === 'ganttBarNode') {
            const epic = data.epics.find(e => e.id === domainId);
            if (epic) {
                setFormData({
                    remaining_md: epic.remaining_md,
                    target_start: epic.target_start,
                    target_end: epic.target_end,
                    jira_key: epic.jira_key
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
        } else if (node.type === 'featureNode') {
            onUpdateFeature(domainId, {
                name: formData.name,
                total_effort_mds: Number(formData.total_effort_mds)
            });
        } else if (node.type === 'teamNode') {
            onUpdateTeam(domainId, {
                name: formData.name,
                total_capacity_mds: Number(formData.total_capacity_mds),
                jira_team_id: formData.jira_team_id
            });
        } else if (node.type === 'ganttBarNode') {
            onUpdateEpic(domainId, {
                remaining_md: Number(formData.remaining_md),
                target_start: formData.target_start,
                target_end: formData.target_end,
                jira_key: formData.jira_key
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
                        Existing TCV ($/yr):
                        <input style={styles.input} type="number" value={formData.existing_tcv || 0} onChange={e => setFormData({ ...formData, existing_tcv: e.target.value })} required />
                    </label>
                    <label style={styles.label}>
                        Potential TCV ($/yr):
                        <input style={styles.input} type="number" value={formData.potential_tcv || 0} onChange={e => setFormData({ ...formData, potential_tcv: e.target.value })} required />
                    </label>
                </>
            );
        }

        if (node.type === 'featureNode') {
            return (
                <>
                    <h2 style={styles.title}>Edit Feature: {domainId}</h2>
                    <label style={styles.label}>
                        Name:
                        <input style={styles.input} type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                    </label>
                    <label style={styles.label}>
                        Total Effort (MDs):
                        <input style={styles.input} type="number" value={formData.total_effort_mds || 0} onChange={e => setFormData({ ...formData, total_effort_mds: e.target.value })} required />
                    </label>
                </>
            );
        }

        if (node.type === 'teamNode') {
            return (
                <>
                    <h2 style={styles.title}>Edit Team: {domainId}</h2>
                    <label style={styles.label}>
                        Name:
                        <input style={styles.input} type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                    </label>
                    <label style={styles.label}>
                        Sprint Capacity (MDs):
                        <input style={styles.input} type="number" value={formData.total_capacity_mds || 0} onChange={e => setFormData({ ...formData, total_capacity_mds: e.target.value })} required />
                    </label>
                    <label style={styles.label}>
                        Jira Team ID:
                        <input style={styles.input} type="text" value={formData.jira_team_id || ''} onChange={e => setFormData({ ...formData, jira_team_id: e.target.value })} />
                    </label>
                </>
            );
        }

        if (node.type === 'ganttBarNode') {
            return (
                <>
                    <h2 style={styles.title}>Edit Epic: {domainId}</h2>
                    <label style={styles.label}>
                        Jira Key:
                        <input style={styles.input} type="text" value={formData.jira_key || ''} onChange={e => setFormData({ ...formData, jira_key: e.target.value })} required />
                    </label>
                    <label style={styles.label}>
                        Remaining Estimate (MDs):
                        <input style={styles.input} type="number" value={formData.remaining_md || 0} onChange={e => setFormData({ ...formData, remaining_md: e.target.value })} required />
                    </label>
                    <label style={styles.label}>
                        Target Start:
                        <input style={styles.input} type="date" value={formData.target_start || ''} onChange={e => setFormData({ ...formData, target_start: e.target.value })} required />
                    </label>
                    <label style={styles.label}>
                        Target End:
                        <input style={styles.input} type="date" value={formData.target_end || ''} onChange={e => setFormData({ ...formData, target_end: e.target.value })} required />
                    </label>
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
