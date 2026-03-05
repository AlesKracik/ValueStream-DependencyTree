import React, { useState } from 'react';
import type { DashboardData, DashboardEntity } from '../types/models';
import { useDashboardContext } from '../contexts/DashboardContext';
import styles from '../components/customers/CustomerPage.module.css';
import { generateId } from '../utils/security';
import { PageWrapper } from '../components/layout/PageWrapper';

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
        name: '',
        description: '',
        parameters: {
            customerFilter: '',
            workItemFilter: '',
            releasedFilter: 'all',
            minTcvFilter: '',
            minScoreFilter: '',
            teamFilter: '',
            epicFilter: '',
            startSprintId: '',
            endSprintId: ''
        }
    });

    const dashboard = isNew ? draft as DashboardEntity : data?.dashboards.find(d => d.id === dashboardId);

    const handleSave = () => {
        if (!data) return;
        if (isNew) {
            const newId = generateId('d');
            const newDashboard: DashboardEntity = {
                ...draft as DashboardEntity,
                id: newId,
                name: draft.name || 'New Dashboard'
            };
            addDashboard(newDashboard);
            onBack();
        }
    };

    const handleDelete = async () => {
        if (!dashboard) return;
        const confirmed = await showConfirm('Delete Dashboard', `Are you sure you want to delete "${dashboard.name}"?`);
        if (confirmed) {
            deleteDashboard(dashboard.id);
            onBack();
        }
    };

    const updateParam = (key: keyof DashboardEntity['parameters'], value: any) => {
        if (!dashboard) return;
        const newParams = { ...dashboard.parameters, [key]: value };
        if (isNew) {
            setDraft({ ...draft, parameters: newParams });
        } else {
            updateDashboard(dashboard.id, { parameters: newParams });
        }
    };

    return (
        <PageWrapper
            loading={loading}
            error={error}
            data={data}
            loadingMessage="Loading dashboard details..."
            emptyMessage="No data available."
        >
            {!dashboard ? (
                <div className={styles.empty}>Dashboard not found.</div>
            ) : (
                <>
                    <header className={styles.header}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            <button onClick={onBack} className="btn-secondary">← Back</button>
                            <h1>{isNew ? (draft.name || 'New Dashboard') : `Edit: ${dashboard.name}`}</h1>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {isNew ? (
                                <button onClick={handleSave} className="btn-primary">Create</button>
                            ) : (
                                <button onClick={handleDelete} className="btn-danger">Delete Dashboard</button>
                            )}
                        </div>
                    </header>

                    <div className={styles.content}>
                        <section className={styles.card}>
                            <h2>General</h2>
                            <div className={styles.formGrid}>
                                <label>
                                    Name:
                                    <input 
                                        type="text" 
                                        value={dashboard.name} 
                                        onChange={e => isNew ? setDraft({ ...draft, name: e.target.value }) : updateDashboard(dashboard.id, { name: e.target.value })}
                                        placeholder="New Dashboard"
                                    />
                                </label>
                                <label>
                                    Description:
                                    <input 
                                        type="text" 
                                        value={dashboard.description || ''} 
                                        onChange={e => isNew ? setDraft({ ...draft, description: e.target.value }) : updateDashboard(dashboard.id, { description: e.target.value })}
                                    />
                                </label>
                            </div>
                        </section>

                        <section className={styles.card}>
                            <h2>Time Range</h2>
                            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '16px' }}>
                                Limit the dashboard to a specific range of sprints.
                            </p>
                            <div className={styles.formGrid}>
                                <label>
                                    Start Sprint:
                                    <select 
                                        value={dashboard.parameters.startSprintId || ''} 
                                        onChange={e => updateParam('startSprintId', e.target.value)}
                                    >
                                        <option value="">Beginning of time</option>
                                        {data?.sprints.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.start_date})</option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    End Sprint:
                                    <select 
                                        value={dashboard.parameters.endSprintId || ''} 
                                        onChange={e => updateParam('endSprintId', e.target.value)}
                                    >
                                        <option value="">End of time</option>
                                        {data?.sprints.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.start_date})</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </section>

                        <section className={styles.card}>
                            <h2>Structural Filters</h2>
                            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '16px' }}>
                                Pre-set filters for this dashboard view.
                            </p>
                            <div className={styles.formGrid}>
                                <label>
                                    Customer Filter:
                                    <input type="text" value={dashboard.parameters.customerFilter || ''} onChange={e => updateParam('customerFilter', e.target.value)} placeholder="Filter by customer name..." />
                                </label>
                                <label>
                                    Work Item Filter:
                                    <input type="text" value={dashboard.parameters.workItemFilter || ''} onChange={e => updateParam('workItemFilter', e.target.value)} placeholder="Filter by work item name..." />
                                </label>
                            </div>
                            <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                                <label>
                                    Team Filter:
                                    <input type="text" value={dashboard.parameters.teamFilter || ''} onChange={e => updateParam('teamFilter', e.target.value)} placeholder="Filter by team name..." />
                                </label>
                                <label>
                                    Epic Filter:
                                    <input type="text" value={dashboard.parameters.epicFilter || ''} onChange={e => updateParam('epicFilter', e.target.value)} placeholder="Filter by epic name..." />
                                </label>
                            </div>
                            <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                                <label>
                                    Release Status:
                                    <select value={dashboard.parameters.releasedFilter} onChange={e => updateParam('releasedFilter', e.target.value)}>
                                        <option value="all">All Items</option>
                                        <option value="released">Released Only</option>
                                        <option value="unreleased">Unreleased Only</option>
                                    </select>
                                </label>
                                <label>
                                    Min TCV Impact ($):
                                    <input type="number" value={dashboard.parameters.minTcvFilter || ''} onChange={e => updateParam('minTcvFilter', e.target.value)} placeholder="0" />
                                </label>
                                <label>
                                    Min RICE Score:
                                    <input type="number" value={dashboard.parameters.minScoreFilter || ''} onChange={e => updateParam('minScoreFilter', e.target.value)} placeholder="0" />
                                </label>
                            </div>
                        </section>

                    </div>
                </>
            )}
        </PageWrapper>
    );
};
