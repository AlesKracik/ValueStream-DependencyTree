import React, { useState } from 'react';
import type { DashboardData, DashboardEntity } from '../types/models';
import { useDashboardContext } from '../contexts/DashboardContext';
import styles from '../components/customers/CustomerPage.module.css';

export interface DashboardEditPageProps {
    dashboardId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    addDashboard: (d: DashboardEntity) => void;
    updateDashboard: (id: string, updates: Partial<DashboardEntity>) => void;
    deleteDashboard: (id: string) => void;
}

export const DashboardEditPage: React.FC<DashboardEditPageProps> = ({
    dashboardId,
    onBack,
    data,
    loading,
    error,
    addDashboard,
    updateDashboard,
    deleteDashboard
}) => {
    const { showConfirm } = useDashboardContext();
    const isNew = dashboardId === 'new';

    const [draft, setDraft] = useState<Partial<DashboardEntity>>({
        name: 'New Dashboard',
        description: '',
        parameters: {
            customerFilter: '',
            workItemFilter: '',
            releasedFilter: 'all',
            minTcvFilter: '',
            minScoreFilter: '',
            teamFilter: '',
            epicFilter: ''
        }
    });

    if (loading) return <div className={styles.pageContainer}>Loading dashboard details...</div>;
    if (error) return <div className={styles.pageContainer}>Error: {error.message}</div>;
    if (!data) return <div className={styles.pageContainer}>No data available.</div>;

    const dashboard = isNew ? draft as DashboardEntity : data.dashboards.find(d => d.id === dashboardId);
    if (!dashboard) return <div className={styles.pageContainer}>Dashboard not found.</div>;

    const handleCreate = () => {
        const newId = `d${Date.now()}`;
        const newDashboard: DashboardEntity = {
            id: newId,
            name: draft.name || 'New Dashboard',
            description: draft.description || '',
            parameters: (draft.parameters as any) || {
                customerFilter: '',
                workItemFilter: '',
                releasedFilter: 'all',
                minTcvFilter: '',
                minScoreFilter: '',
                teamFilter: '',
                epicFilter: ''
            }
        };
        addDashboard(newDashboard);
        onBack();
    };

    const handleDelete = async () => {
        const confirmed = await showConfirm('Delete Dashboard', `Are you sure you want to delete "${dashboard.name}"?`);
        if (confirmed) {
            deleteDashboard(dashboard.id);
            onBack();
        }
    };

    const updateParam = (key: string, value: any) => {
        if (isNew) {
            setDraft(prev => ({ ...prev, parameters: { ...prev.parameters!, [key]: value } }));
        } else {
            updateDashboard(dashboard.id, { parameters: { ...dashboard.parameters, [key]: value } });
        }
    };

    const getParam = (key: keyof DashboardEntity['parameters']) => {
        return isNew ? draft.parameters?.[key] : dashboard.parameters[key];
    };

    const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px' };
    const inputStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: '6px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff' };
    const sectionTitleStyle: React.CSSProperties = { fontSize: '14px', fontWeight: 'bold', color: '#60a5fa', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' };

    return (
        <div className={styles.pageContainer} style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className={styles.backBtn} onClick={onBack}>← Back</button>
                    <h1>{isNew ? 'Create Dashboard' : `Edit: ${dashboard.name}`}</h1>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                    {!isNew && (
                        <button className={styles.dangerBtn} onClick={handleDelete}>Delete Dashboard</button>
                    )}
                    {isNew && (
                        <button 
                            className={styles.saveBtn} 
                            style={{ backgroundColor: '#2563eb', borderColor: '#1d4ed8' }}
                            onClick={handleCreate}
                        >
                            Create
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.content}>
                <section className={styles.card}>
                    <h2>Dashboard Details</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <label style={labelStyle}>
                            Name:
                            <input
                                type="text"
                                value={isNew ? draft.name : dashboard.name}
                                onChange={e => {
                                    if (isNew) setDraft(prev => ({ ...prev, name: e.target.value }));
                                    else updateDashboard(dashboard.id, { name: e.target.value });
                                }}
                                style={inputStyle}
                            />
                        </label>
                        <label style={labelStyle}>
                            Description:
                            <input
                                type="text"
                                value={isNew ? draft.description : dashboard.description}
                                onChange={e => {
                                    if (isNew) setDraft(prev => ({ ...prev, description: e.target.value }));
                                    else updateDashboard(dashboard.id, { description: e.target.value });
                                }}
                                style={inputStyle}
                            />
                        </label>
                    </div>
                </section>

                <section className={styles.card} style={{ marginTop: '24px' }}>
                    <h2>Default Parameters (Filters)</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        
                        {/* Customer Group */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                            <div style={sectionTitleStyle}>Customer</div>
                            <div style={{ display: 'flex', gap: '20px' }}>
                                <label style={{ ...labelStyle, flex: 1 }}>
                                    Customer Name Filter:
                                    <input
                                        type="text"
                                        value={getParam('customerFilter')}
                                        onChange={e => updateParam('customerFilter', e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <label style={{ ...labelStyle, flex: 1 }}>
                                    Min TCV Filter:
                                    <input
                                        type="number"
                                        min="0"
                                        value={getParam('minTcvFilter')}
                                        onChange={e => updateParam('minTcvFilter', e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Work Item Group */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                            <div style={sectionTitleStyle}>Work Item</div>
                            <div style={{ display: 'flex', gap: '20px' }}>
                                <label style={{ ...labelStyle, flex: 1 }}>
                                    Work Item Name Filter:
                                    <input
                                        type="text"
                                        value={getParam('workItemFilter')}
                                        onChange={e => updateParam('workItemFilter', e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <label style={{ ...labelStyle, flex: 1 }}>
                                    Min Score Filter:
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={getParam('minScoreFilter')}
                                        onChange={e => updateParam('minScoreFilter', e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                            </div>
                            <label style={labelStyle}>
                                Release Filter:
                                <select
                                    value={getParam('releasedFilter')}
                                    onChange={e => updateParam('releasedFilter', e.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="all">All</option>
                                    <option value="released">Released Only</option>
                                    <option value="unreleased">Unreleased Only</option>
                                </select>
                            </label>
                        </div>

                        {/* Team Group */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                            <div style={sectionTitleStyle}>Team</div>
                            <label style={labelStyle}>
                                Team Name Filter:
                                <input
                                    type="text"
                                    value={getParam('teamFilter')}
                                    onChange={e => updateParam('teamFilter', e.target.value)}
                                    style={inputStyle}
                                />
                            </label>
                        </div>

                        {/* Epic Group */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                            <div style={sectionTitleStyle}>Epic</div>
                            <label style={labelStyle}>
                                Epic Name Filter:
                                <input
                                    type="text"
                                    value={getParam('epicFilter')}
                                    onChange={e => updateParam('epicFilter', e.target.value)}
                                    style={inputStyle}
                                />
                            </label>
                        </div>

                    </div>
                </section>
            </div>
        </div>
    );
};
