import React, { useState } from 'react';
import type { DashboardData, Customer, Feature } from '../../types/models';
import styles from './CustomerPage.module.css';

export interface CustomerPageProps {
    customerId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateCustomer: (id: string, updates: Partial<Customer>) => void;
    updateFeature: (id: string, updates: Partial<Feature>) => void;
    saveDashboardData: (data: DashboardData) => Promise<void>;
}

export const CustomerPage: React.FC<CustomerPageProps> = ({
    customerId,
    onBack,
    data,
    loading,
    error,
    updateCustomer,
    updateFeature,
    saveDashboardData
}) => {
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    if (loading) return <div>Loading customer details...</div>;
    if (error) return <div>Error: {error.message}</div>;
    if (!data) return <div>No data available</div>;

    const customer = data.customers.find(c => c.id === customerId);
    if (!customer) return <div>Customer not found.</div>;

    const targetedFeatures = data.features.filter(f =>
        f.customer_targets.some(ct => ct.customer_id === customerId)
    );

    const handleSave = async () => {
        setSaveStatus('saving');
        try {
            await saveDashboardData(data);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (err) {
            console.error('Failed to save data:', err);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    return (
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <button onClick={onBack} className={styles.backBtn}>← Back to Dashboard</button>
                    <h1>{customer.name}</h1>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saveStatus === 'saving'}
                    className={styles.saveBtn}
                    style={{
                        backgroundColor: saveStatus === 'saved' ? '#10b981' : saveStatus === 'error' ? '#ef4444' : '#3b82f6',
                        borderColor: saveStatus === 'saved' ? '#059669' : saveStatus === 'error' ? '#b91c1c' : '#2563eb'
                    }}
                >
                    {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Error!' : 'Save Changes'}
                </button>
            </div>

            <div className={styles.content}>
                <section className={styles.card}>
                    <h2>Customer Details</h2>
                    <div className={styles.formGrid}>
                        <label>
                            Name:
                            <input
                                type="text"
                                value={customer.name}
                                onChange={e => updateCustomer(customerId, { name: e.target.value })}
                            />
                        </label>
                        <label>
                            Existing TCV ($):
                            <input
                                type="number"
                                value={customer.existing_tcv || 0}
                                onChange={e => updateCustomer(customerId, { existing_tcv: Number(e.target.value) })}
                            />
                        </label>
                        <label>
                            Potential TCV ($):
                            <input
                                type="number"
                                value={customer.potential_tcv || 0}
                                onChange={e => updateCustomer(customerId, { potential_tcv: Number(e.target.value) })}
                            />
                        </label>
                    </div>
                </section>

                <section className={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2>Targeted Features</h2>
                    </div>

                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Feature</th>
                                <th>TCV Target</th>
                                <th>Priority</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {targetedFeatures.map(feature => {
                                const targetDef = feature.customer_targets.find(ct => ct.customer_id === customerId)!;

                                const updateTarget = (updates: Partial<typeof targetDef>) => {
                                    const newTargets = feature.customer_targets.map(ct =>
                                        ct.customer_id === customerId ? { ...ct, ...updates } : ct
                                    );
                                    updateFeature(feature.id, { customer_targets: newTargets });
                                };

                                const removeTarget = () => {
                                    const newTargets = feature.customer_targets.filter(ct => ct.customer_id !== customerId);
                                    updateFeature(feature.id, { customer_targets: newTargets });
                                };

                                return (
                                    <tr key={feature.id}>
                                        <td>{feature.name}</td>
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
                            {targetedFeatures.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No targeted features found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    <div className={styles.addFeatureBox}>
                        <h3>Add Feature Target</h3>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <select id="newFeatureSelect" style={{ flex: 1, padding: '8px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' }}>
                                <option value="">Select a feature to add...</option>
                                {data.features.filter(f => !targetedFeatures.find(tf => tf.id === f.id)).map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                            </select>
                            <button
                                className={styles.primaryBtn}
                                onClick={() => {
                                    const selectEl = document.getElementById('newFeatureSelect') as HTMLSelectElement;
                                    const featureId = selectEl?.value;
                                    if (featureId) {
                                        const feature = data.features.find(f => f.id === featureId);
                                        if (feature) {
                                            const newTargets = [...(feature.customer_targets || []), {
                                                customer_id: customerId,
                                                tcv_type: 'potential',
                                                priority: 'Should-have'
                                            }];
                                            updateFeature(featureId, { customer_targets: newTargets as any });
                                            selectEl.value = ''; // reset
                                        }
                                    }
                                }}
                            >
                                Assign Feature
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};
