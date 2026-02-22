import React, { useState, useEffect } from 'react';
import { parseISO, differenceInDays, min, max } from 'date-fns';
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
                    name: epic.name || '',
                    remaining_md: epic.remaining_md,
                    target_start: epic.target_start,
                    target_end: epic.target_end,
                    jira_key: epic.jira_key,
                    sprint_effort_overrides: { ...(epic.sprint_effort_overrides || {}) }
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

            // Clean up overrides with empty strings
            const cleanedOverrides = { ...formData.sprint_effort_overrides };
            for (const key in cleanedOverrides) {
                if (cleanedOverrides[key] === '' || cleanedOverrides[key] === null || cleanedOverrides[key] === undefined) {
                    delete cleanedOverrides[key];
                } else {
                    cleanedOverrides[key] = Number(cleanedOverrides[key]);
                }
            }

            onUpdateEpic(domainId, {
                name: formData.name ? formData.name.trim() : undefined,
                remaining_md: Number(formData.remaining_md),
                target_start: formData.target_start,
                target_end: formData.target_end,
                jira_key: formData.jira_key,
                sprint_effort_overrides: Object.keys(cleanedOverrides).length > 0 ? cleanedOverrides : undefined
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

            const handleOverrideChange = (sprintId: string, val: string) => {
                setFormData((prev: any) => ({
                    ...prev,
                    sprint_effort_overrides: {
                        ...(prev.sprint_effort_overrides || {}),
                        [sprintId]: val
                    }
                }));
            };

            const sStart = formData.target_start ? parseISO(formData.target_start) : null;
            const sEnd = formData.target_end ? parseISO(formData.target_end) : null;
            const totalMd = Number(formData.remaining_md) || 0;
            const overrides = formData.sprint_effort_overrides || {};

            let overlappingSprints: any[] = [];
            if (sStart && sEnd) {
                try {
                    const overlaps = (data.sprints || []).map(sprint => {
                        const spStart = parseISO(sprint.start_date);
                        const spEnd = parseISO(sprint.end_date);
                        const overlapStart = max([sStart, spStart]);
                        const overlapEnd = min([sEnd, spEnd]);
                        if (overlapStart <= overlapEnd) {
                            return { sprint, overlapDays: differenceInDays(overlapEnd, overlapStart) + 1 };
                        }
                        return null;
                    }).filter(Boolean) as { sprint: any, overlapDays: number }[];

                    let totalOverrideMd = 0;
                    let remainingDefaultDays = 0;

                    overlaps.forEach(({ sprint, overlapDays }) => {
                        const overrideStr = overrides[sprint.id];
                        const hasOverride = overrideStr !== undefined && overrideStr !== '' && overrideStr !== null;
                        if (hasOverride) {
                            const parsed = Number(overrideStr);
                            if (!isNaN(parsed) && parsed >= 0) {
                                totalOverrideMd += parsed;
                            }
                        } else {
                            remainingDefaultDays += overlapDays;
                        }
                    });

                    const remainingMdForDefaults = Math.max(0, totalMd - totalOverrideMd);

                    overlappingSprints = overlaps.map(({ sprint, overlapDays }) => {
                        const overrideStr = overrides[sprint.id];
                        const hasOverride = overrideStr !== undefined && overrideStr !== '' && overrideStr !== null;
                        let defaultEffort = 0;
                        if (!hasOverride && remainingDefaultDays > 0) {
                            defaultEffort = remainingMdForDefaults * (overlapDays / remainingDefaultDays);
                        } else if (hasOverride) {
                            const parsed = Number(overrideStr);
                            if (!isNaN(parsed) && parsed >= 0) defaultEffort = parsed;
                        }

                        return {
                            id: sprint.id,
                            name: sprint.name,
                            defaultEffort,
                            hasOverride
                        };
                    });
                } catch (e) {
                    // ignore invalid intermediate dates
                }
            }

            return (
                <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '8px' }}>
                    <h2 style={styles.title}>Edit Epic: {domainId}</h2>
                    <div style={styles.formContainer}>
                        <label style={styles.label}>
                            Custom Name (Optional):
                            <input
                                style={styles.input}
                                type="text"
                                value={formData.name || ''}
                                placeholder="Uses Feature Name by default"
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </label>
                        <label style={styles.label}>
                            Jira Key:
                            <input style={styles.input} type="text" value={formData.jira_key || ''} onChange={e => setFormData({ ...formData, jira_key: e.target.value })} required />
                        </label>
                        <label style={styles.label}>
                            Remaining Estimate (MDs):
                            <input style={styles.input} type="number" step="0.1" value={formData.remaining_md === undefined ? '' : formData.remaining_md} onChange={e => setFormData({ ...formData, remaining_md: e.target.value })} required />
                        </label>

                        {overlappingSprints.length > 0 && (
                            <div style={{ marginTop: '4px', marginBottom: '12px', paddingLeft: '12px', borderLeft: '2px solid #4b5563' }}>
                                <h3 style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '8px', fontWeight: 500 }}>Effort Breakdown</h3>
                                {overlappingSprints.map((sprint: any) => (
                                    <label key={sprint.id} style={{ ...styles.label, marginBottom: '6px', fontSize: '12px', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ color: sprint.hasOverride ? '#d1d5db' : '#9ca3af', flex: 1 }}>{sprint.name}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <input
                                                style={{ ...styles.input, width: '80px', padding: '4px 8px', fontSize: '13px', textAlign: 'right' }}
                                                type="number"
                                                step="0.1"
                                                placeholder={sprint.defaultEffort.toFixed(1)}
                                                value={formData.sprint_effort_overrides?.[sprint.id] ?? ''}
                                                onChange={e => handleOverrideChange(sprint.id, e.target.value)}
                                            />
                                            {sprint.hasOverride ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOverrideChange(sprint.id, '')}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: '#ef4444',
                                                        cursor: 'pointer',
                                                        padding: '2px 6px',
                                                        fontSize: '14px',
                                                        lineHeight: '1',
                                                        borderRadius: '4px'
                                                    }}
                                                    title="Reset to default"
                                                >
                                                    ×
                                                </button>
                                            ) : (
                                                <div style={{ width: '22px' }}></div> // Spacer to keep alignment
                                            )}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}

                        <label style={styles.label}>
                            Target Start:
                            <input style={styles.input} type="date" value={formData.target_start || ''} onChange={e => setFormData({ ...formData, target_start: e.target.value })} required />
                        </label>
                        <label style={styles.label}>
                            Target End:
                            <input style={styles.input} type="date" value={formData.target_end || ''} onChange={e => setFormData({ ...formData, target_end: e.target.value })} required />
                        </label>
                    </div>
                </div>
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
