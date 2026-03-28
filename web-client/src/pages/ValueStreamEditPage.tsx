import React, { useState } from 'react';
import type { ValueStreamData, ValueStreamEntity } from '@valuestream/shared-types';
import { useNotificationContext } from '../contexts/NotificationContext';
import styles from '../components/customers/CustomerPage.module.css';
import { generateId } from '../utils/security';
import { PageWrapper } from '../components/layout/PageWrapper';

export interface ValueStreamEditPageProps {
    valueStreamId: string;
    onBack: () => void;
    data: ValueStreamData | null;
    loading: boolean;
    error: Error | null;
    addValueStream: (d: ValueStreamEntity) => void;
    updateValueStream: (id: string, updates: Partial<ValueStreamEntity>) => void;
    deleteValueStream: (id: string) => void;
}

export const ValueStreamEditPage: React.FC<ValueStreamEditPageProps> = ({
    valueStreamId,
    onBack,
    data,
    loading,
    error,
    addValueStream,
    updateValueStream,
    deleteValueStream
}) => {
    const { showConfirm } = useNotificationContext();
    const isNew = valueStreamId === 'new';

    const [draft, setDraft] = useState<Partial<ValueStreamEntity>>({
        name: '',
        description: '',
        parameters: {
            customerFilter: '',
            workItemFilter: '',
            releasedFilter: 'all',
            minTcvFilter: '',
            minScoreFilter: '',
            teamFilter: '',
            issueFilter: '',
            startSprintId: '',
            endSprintId: ''
        }
    });

    const ValueStream = isNew ? draft as ValueStreamEntity : data?.valueStreams.find(d => d.id === valueStreamId);

    const handleSave = () => {
        if (!data) return;
        if (isNew) {
            const newId = generateId('d');
            const newValueStream: ValueStreamEntity = {
                ...draft as ValueStreamEntity,
                id: newId,
                name: draft.name || 'New Value Stream'
            };
            addValueStream(newValueStream);
            onBack();
        }
    };

    const handleDelete = async () => {
        if (!ValueStream) return;
        const confirmed = await showConfirm('Delete Value Stream', `Are you sure you want to delete "${ValueStream.name}"?`);
        if (confirmed) {
            deleteValueStream(ValueStream.id);
            onBack();
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateParam = (key: keyof ValueStreamEntity['parameters'], value: any) => {
        if (!ValueStream) return;
        const newParams = { ...ValueStream.parameters, [key]: value };
        if (isNew) {
            setDraft({ ...draft, parameters: newParams });
        } else {
            updateValueStream(ValueStream.id, { parameters: newParams });
        }
    };

    return (
        <PageWrapper
            loading={loading}
            error={error}
            data={data}
            loadingMessage="Loading ValueStream details..."
            emptyMessage="No data available."
        >
            {!ValueStream ? (
                <div className={styles.empty}>ValueStream not found.</div>
            ) : (
                <>
                    <header className={styles.header}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            <button onClick={onBack} className="btn-secondary">← Back</button>
                            <h1>{isNew ? (draft.name || 'New Value Stream') : `Edit: ${ValueStream.name}`}</h1>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {isNew ? (
                                <button onClick={handleSave} className="btn-primary">Create</button>
                            ) : (
                                <button onClick={handleDelete} className="btn-danger">Delete Value Stream</button>
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
                                        value={ValueStream.name} 
                                        onChange={e => isNew ? setDraft({ ...draft, name: e.target.value }) : updateValueStream(ValueStream.id, { name: e.target.value })}
                                        placeholder="New Value Stream"
                                    />
                                </label>
                                <label>
                                    Description:
                                    <input 
                                        type="text" 
                                        value={ValueStream.description || ''} 
                                        onChange={e => isNew ? setDraft({ ...draft, description: e.target.value }) : updateValueStream(ValueStream.id, { description: e.target.value })}
                                    />
                                </label>
                            </div>
                        </section>

                        <section className={styles.card}>
                            <h2>Time Range</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
                                Limit the ValueStream to a specific range of sprints.
                            </p>
                            <div className={styles.formGrid}>
                                <label>
                                    Start Sprint:
                                    <select 
                                        value={ValueStream.parameters.startSprintId || ''} 
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
                                        value={ValueStream.parameters.endSprintId || ''} 
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
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
                                Pre-set filters for this ValueStream view.
                            </p>
                            <div className={styles.formGrid}>
                                <label>
                                    Customer Filter:
                                    <input type="text" value={ValueStream.parameters.customerFilter || ''} onChange={e => updateParam('customerFilter', e.target.value)} placeholder="Filter by customer name..." />
                                </label>
                                <label>
                                    Work Item Filter:
                                    <input type="text" value={ValueStream.parameters.workItemFilter || ''} onChange={e => updateParam('workItemFilter', e.target.value)} placeholder="Filter by work item name..." />
                                </label>
                            </div>
                            <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                                <label>
                                    Team Filter:
                                    <input type="text" value={ValueStream.parameters.teamFilter || ''} onChange={e => updateParam('teamFilter', e.target.value)} placeholder="Filter by team name..." />
                                </label>
                                <label>
                                    Issue Filter:
                                    <input type="text" value={ValueStream.parameters.issueFilter || ''} onChange={e => updateParam('issueFilter', e.target.value)} placeholder="Filter by issue name..." />
                                </label>
                            </div>
                            <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                                <label>
                                    Release Status:
                                    <select value={ValueStream.parameters.releasedFilter} onChange={e => updateParam('releasedFilter', e.target.value)}>
                                        <option value="all">All Items</option>
                                        <option value="released">Released Only</option>
                                        <option value="unreleased">Unreleased Only</option>
                                    </select>
                                </label>
                                <label>
                                    Min TCV Impact ($):
                                    <input type="number" value={ValueStream.parameters.minTcvFilter || ''} onChange={e => updateParam('minTcvFilter', e.target.value)} placeholder="0" />
                                </label>
                                <label>
                                    Min RICE Score:
                                    <input type="number" value={ValueStream.parameters.minScoreFilter || ''} onChange={e => updateParam('minScoreFilter', e.target.value)} placeholder="0" />
                                </label>
                            </div>
                        </section>

                    </div>
                </>
            )}
        </PageWrapper>
    );
};




