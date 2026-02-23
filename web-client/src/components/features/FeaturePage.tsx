import React, { useState } from 'react';
import type { DashboardData, Feature, Epic } from '../../types/models';
import styles from '../customers/CustomerPage.module.css';

export interface FeaturePageProps {
    featureId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    addFeature: (f: Feature) => void;
    deleteFeature: (id: string) => void;
    updateFeature: (id: string, updates: Partial<Feature>) => void;
    addEpic: (e: Epic) => void;
    deleteEpic: (id: string) => void;
    updateEpic: (id: string, updates: Partial<Epic>) => void;
    saveDashboardData: (data: DashboardData) => Promise<void>;
}

export const FeaturePage: React.FC<FeaturePageProps> = ({
    featureId,
    onBack,
    data,
    loading,
    error,
    addFeature,
    deleteFeature,
    updateFeature,
    addEpic,
    deleteEpic,
    updateEpic,
    saveDashboardData
}) => {
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const isNew = featureId === 'new';

    // Draft states for new feature creation
    const [newFeatureDraft, setNewFeatureDraft] = useState<Partial<Feature>>({ name: 'New Feature', total_effort_mds: 0, customer_targets: [] });
    // Using the same mock state pattern as customers
    const [newFeatureCustomers, setNewFeatureCustomers] = useState<{ customerId: string, tcv_type: 'existing' | 'potential', priority: 'Must-have' | 'Should-have' | 'Nice-to-have' }[]>([]);
    const [newFeatureEpics, setNewFeatureEpics] = useState<Epic[]>([]);
    const [syncingId, setSyncingId] = useState<string | null>(null);

    if (loading) return <div className={styles.pageContainer}>Loading feature details...</div>;
    if (error) return <div className={styles.pageContainer}>Error: {error.message}</div>;
    if (!data) return <div className={styles.pageContainer}>No data available.</div>;

    const feature = isNew ? newFeatureDraft as Feature : data.features.find(f => f.id === featureId);
    if (!feature) return <div className={styles.pageContainer}>Feature not found.</div>;

    const targetedCustomers = isNew
        ? newFeatureCustomers.map(nfc => data.customers.find(c => c.id === nfc.customerId)!).filter(Boolean)
        : data.customers.filter(c => feature.customer_targets?.some(ct => ct.customer_id === c.id));

    const handleSave = async () => {
        setSaveStatus('saving');
        try {
            if (isNew) {
                const newId = `f${Date.now()}`;
                const newFeat: Feature = {
                    id: newId,
                    name: newFeatureDraft.name || 'New Feature',
                    total_effort_mds: newFeatureDraft.total_effort_mds || 0,
                    customer_targets: newFeatureCustomers.map(c => ({
                        customer_id: c.customerId,
                        tcv_type: c.tcv_type,
                        priority: c.priority
                    }))
                };

                const epicsToAdd = newFeatureEpics.map(e => ({
                    ...e,
                    id: `e${Math.random().toString(36).substr(2, 9)}`,
                    feature_id: newId
                }));

                addFeature(newFeat);
                epicsToAdd.forEach(e => addEpic(e));

                const newData = {
                    ...data,
                    features: [...data.features, newFeat],
                    epics: [...data.epics, ...epicsToAdd]
                };
                await saveDashboardData(newData);

                setSaveStatus('saved');
                setTimeout(() => {
                    setSaveStatus('idle');
                    onBack(); // Return to dashboard once fully saved and injected
                }, 1000);
            } else {
                await saveDashboardData(data);
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus('idle'), 2000);
            }
        } catch (err) {
            console.error('Save failed', err);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this feature? It will be removed from all associated epics.')) {
            setSaveStatus('saving');
            try {
                deleteFeature(featureId);
                const newData = {
                    ...data,
                    features: data.features.filter(f => f.id !== featureId),
                    epics: data.epics.filter(e => e.feature_id !== featureId)
                };
                await saveDashboardData(newData);
                onBack();
            } catch (err) {
                console.error('Delete failed', err);
                setSaveStatus('error');
            }
        }
    };

    const epics = isNew ? newFeatureEpics : data.epics.filter(e => e.feature_id === featureId);

    const handleAddEpic = () => {
        const tempId = `e-temp-${Date.now()}`;
        const draftEpic: Epic = {
            id: tempId,
            jira_key: 'TBD',
            feature_id: isNew ? 'new' : featureId,
            team_id: data.teams[0]?.id || '',
            remaining_md: 0,
            target_start: new Date().toISOString().split('T')[0],
            target_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            name: 'New Epic'
        };
        if (isNew) {
            setNewFeatureEpics(prev => [...prev, draftEpic]);
        } else {
            addEpic(draftEpic);
        }
    };

    const handleUpdateEpic = (id: string, updates: Partial<Epic>) => {
        if (isNew) {
            setNewFeatureEpics(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
        } else {
            updateEpic(id, updates);
        }
    };

    const handleRemoveEpic = (id: string) => {
        if (isNew) {
            setNewFeatureEpics(prev => prev.filter(e => e.id !== id));
        } else {
            deleteEpic(id);
        }
    };

    const handleSyncJira = async (epicId: string, jiraKey: string) => {
        if (!data.settings.jira_base_url) {
            alert('Please configure Jira Base URL in Settings first.');
            return;
        }
        setSyncingId(epicId);
        try {
            const response = await fetch('/api/jira/issue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jira_key: jiraKey,
                    jira_base_url: data.settings.jira_base_url,
                    jira_api_version: data.settings.jira_api_version || '3',
                    jira_api_token: data.settings.jira_api_token
                })
            });

            const resData = await response.json();
            if (!response.ok || !resData.success) {
                throw new Error(resData.error || 'Failed to fetch Jira data');
            }

            const issue = resData.data;
            const fields = issue.fields;
            const names = issue.names;

            let targetStartKey = '';
            let targetEndKey = '';
            let teamKey = '';

            Object.entries(names as Record<string, string>).forEach(([key, name]) => {
                if (name === 'Target start') targetStartKey = key;
                if (name === 'Target end') targetEndKey = key;
                if (name === 'Team') teamKey = key;
            });

            const updates: Partial<Epic> = {};
            if (fields.summary) updates.name = fields.summary;
            if (fields.timeestimate !== undefined && fields.timeestimate !== null) {
                updates.remaining_md = Math.round(fields.timeestimate / 28800);
            }

            if (targetStartKey && fields[targetStartKey]) updates.target_start = fields[targetStartKey];
            if (targetEndKey && fields[targetEndKey]) updates.target_end = fields[targetEndKey];

            if (teamKey && fields[teamKey]) {
                const teamField = fields[teamKey];
                const jiraTeamId = (teamField.id || teamField.value || teamField.toString()).toString();
                const jiraTeamName = teamField.name || '';

                const matchedTeam = data.teams.find(t =>
                    (t.jira_team_id && t.jira_team_id.toString() === jiraTeamId) ||
                    (t.name === jiraTeamId) ||
                    (jiraTeamName && t.name === jiraTeamName)
                );
                if (matchedTeam) updates.team_id = matchedTeam.id;
            }

            handleUpdateEpic(epicId, updates);
        } catch (err: any) {
            console.error('Jira sync error:', err);
            alert(`Error syncing from Jira: ${err.message}`);
        } finally {
            setSyncingId(null);
        }
    };

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className={styles.backBtn} onClick={onBack}>
                        ← Back to Dashboard
                    </button>
                    <h1>{isNew ? 'New Feature' : feature.name}</h1>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                    {!isNew && (
                        <button
                            className={styles.dangerBtn}
                            style={{ padding: '10px 20px', fontWeight: '600', fontSize: '14px', borderRadius: '6px' }}
                            onClick={handleDelete}
                        >
                            Delete Feature
                        </button>
                    )}
                    <button
                        className={styles.saveBtn}
                        style={{ backgroundColor: '#2563eb', borderColor: '#1d4ed8' }}
                        onClick={handleSave}
                        disabled={saveStatus === 'saving'}
                    >
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div className={styles.content}>
                <section className={styles.card}>
                    <h2>Feature Details</h2>
                    <div className={styles.formGrid}>
                        <label>
                            Name:
                            <input
                                type="text"
                                value={isNew ? newFeatureDraft.name : feature.name}
                                onChange={e => {
                                    if (isNew) {
                                        setNewFeatureDraft(prev => ({ ...prev, name: e.target.value }));
                                    } else {
                                        updateFeature(feature.id, { name: e.target.value });
                                    }
                                }}
                            />
                        </label>
                        <label>
                            Total Effort (MDs):
                            <input
                                type="number"
                                min="0"
                                value={isNew ? newFeatureDraft.total_effort_mds : feature.total_effort_mds}
                                onChange={e => {
                                    const val = parseInt(e.target.value) || 0;
                                    if (isNew) {
                                        setNewFeatureDraft(prev => ({ ...prev, total_effort_mds: val }));
                                    } else {
                                        updateFeature(feature.id, { total_effort_mds: val });
                                    }
                                }}
                            />
                        </label>
                    </div>
                </section>

                <section className={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2>Targeted Customers</h2>
                    </div>

                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>TCV Target</th>
                                <th>Priority</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {targetedCustomers.map(customer => {
                                const targetDef = isNew
                                    ? newFeatureCustomers.find(nfc => nfc.customerId === customer.id)!
                                    : feature.customer_targets?.find(ct => ct.customer_id === customer.id)!;

                                const updateTarget = (updates: Partial<typeof targetDef>) => {
                                    if (isNew) {
                                        setNewFeatureCustomers(prev => prev.map(nfc =>
                                            nfc.customerId === customer.id ? { ...nfc, ...updates } : nfc
                                        ));
                                    } else {
                                        const newTargets = feature.customer_targets!.map(ct =>
                                            ct.customer_id === customer.id ? { ...ct, ...updates } : ct
                                        );
                                        updateFeature(feature.id, { customer_targets: newTargets as any });
                                    }
                                };

                                const removeTarget = () => {
                                    if (isNew) {
                                        setNewFeatureCustomers(prev => prev.filter(nfc => nfc.customerId !== customer.id));
                                    } else {
                                        const newTargets = feature.customer_targets!.filter(ct => ct.customer_id !== customer.id);
                                        updateFeature(feature.id, { customer_targets: newTargets });
                                    }
                                };

                                return (
                                    <tr key={customer.id}>
                                        <td>{customer.name}</td>
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
                                            <button onClick={removeTarget} className={styles.dangerBtn}>Remove</button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {targetedCustomers.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No targeted customers found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    <div className={styles.addFeatureBox}>
                        <h3>Add Customer Target</h3>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <select id="newCustomerSelect" style={{ flex: 1, padding: '8px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }}>
                                <option value="">Select a customer to target...</option>
                                {data.customers.filter(c => !targetedCustomers.find(tc => tc.id === c.id)).map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <button
                                className={styles.primaryBtn}
                                onClick={() => {
                                    const selectEl = document.getElementById('newCustomerSelect') as HTMLSelectElement;
                                    const customerSelectId = selectEl?.value;
                                    if (customerSelectId) {
                                        const customer = data.customers.find(c => c.id === customerSelectId);
                                        if (customer) {
                                            if (isNew) {
                                                setNewFeatureCustomers(prev => [...prev, {
                                                    customerId: customerSelectId,
                                                    tcv_type: 'potential',
                                                    priority: 'Should-have'
                                                }]);
                                            } else {
                                                const newTargets = [...(feature.customer_targets || []), {
                                                    customer_id: customerSelectId,
                                                    tcv_type: 'potential',
                                                    priority: 'Should-have'
                                                }];
                                                updateFeature(featureId, { customer_targets: newTargets as any });
                                            }
                                            selectEl.value = ''; // reset
                                        }
                                    }
                                }}
                            >
                                Target Customer
                            </button>
                        </div>
                    </div>
                </section>

                <section className={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2>Epics</h2>
                        <button className={styles.primaryBtn} onClick={handleAddEpic}>+ Add Epic</button>
                    </div>

                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Jira Key</th>
                                <th>Team</th>
                                <th>Remaining (MDs)</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {epics.map(epic => (
                                <tr key={epic.id}>
                                    <td>
                                        <input type="text" value={epic.name || ''} onChange={e => handleUpdateEpic(epic.id, { name: e.target.value })} style={{ width: '100%', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }} />
                                    </td>
                                    <td>
                                        <input type="text" value={epic.jira_key} onChange={e => handleUpdateEpic(epic.id, { jira_key: e.target.value })} style={{ width: '100px', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }} />
                                    </td>
                                    <td>
                                        <select value={epic.team_id} onChange={e => handleUpdateEpic(epic.id, { team_id: e.target.value })} style={{ width: '100%', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }}>
                                            {data.teams.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <input type="number" min="0" value={epic.remaining_md} onChange={e => handleUpdateEpic(epic.id, { remaining_md: parseInt(e.target.value) || 0 })} style={{ width: '80px', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }} />
                                    </td>
                                    <td>
                                        <input type="date" value={epic.target_start} onChange={e => handleUpdateEpic(epic.id, { target_start: e.target.value })} style={{ width: '130px', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }} />
                                    </td>
                                    <td>
                                        <input type="date" value={epic.target_end} onChange={e => handleUpdateEpic(epic.id, { target_end: e.target.value })} style={{ width: '130px', padding: '6px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }} />
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => handleSyncJira(epic.id, epic.jira_key)}
                                                disabled={!epic.jira_key || epic.jira_key === 'TBD' || syncingId === epic.id}
                                                className={styles.saveBtn}
                                                style={{ backgroundColor: '#10b981', borderColor: '#059669', padding: '6px 12px' }}
                                            >
                                                {syncingId === epic.id ? 'Syncing...' : 'Sync'}
                                            </button>
                                            <button onClick={() => handleRemoveEpic(epic.id)} className={styles.dangerBtn} style={{ padding: '6px 12px' }}>Remove</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {epics.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No epics currently mapped to this feature.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </section>
            </div>
        </div>
    );
};
