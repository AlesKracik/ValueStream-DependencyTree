import React, { useState } from 'react';
import type { DashboardData, Feature } from '../../types/models';
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
    saveDashboardData
}) => {
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const isNew = featureId === 'new';

    // Draft states for new feature creation
    const [newFeatureDraft, setNewFeatureDraft] = useState<Partial<Feature>>({ name: 'New Feature', total_effort_mds: 0, customer_targets: [] });
    // Using the same mock state pattern as customers
    const [newFeatureCustomers, setNewFeatureCustomers] = useState<{ customerId: string, tcv_type: 'existing' | 'potential', priority: 'Must-have' | 'Should-have' | 'Nice-to-have' }[]>([]);

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

                addFeature(newFeat);
                const newData = { ...data, features: [...data.features, newFeat] };
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
            </div>
        </div>
    );
};
