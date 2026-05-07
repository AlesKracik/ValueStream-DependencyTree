import React, { useState } from 'react';
import type { ValueStreamData, ValueStreamEntity } from '@valuestream/shared-types';
import { useDeleteWithConfirm } from '../hooks/useDeleteWithConfirm';
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
    const deleteWithConfirm = useDeleteWithConfirm();
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
            endSprintId: '',
            parentId: '',
            subtreeOf: '',
            rootsOnly: false,
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

    const handleDelete = () => {
        if (!ValueStream) return;
        deleteWithConfirm(
            'Delete Value Stream',
            `Are you sure you want to delete "${ValueStream.name}"?`,
            () => deleteValueStream(ValueStream.id),
            onBack
        );
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

    /**
     * Hierarchy filter is presented as a single picker + scope toggle, but
     * stored as two mutually-exclusive fields (parentId / subtreeOf). Setting
     * one always clears the other and clears rootsOnly so the three filters
     * remain mutually exclusive on the server too.
     */
    const setHierarchyParent = (id: string, scope: 'direct' | 'subtree') => {
        if (!ValueStream) return;
        const newParams = {
            ...ValueStream.parameters,
            parentId: id && scope === 'direct' ? id : '',
            subtreeOf: id && scope === 'subtree' ? id : '',
            rootsOnly: false,
        };
        if (isNew) setDraft({ ...draft, parameters: newParams });
        else updateValueStream(ValueStream.id, { parameters: newParams });
    };
    const setRootsOnly = (rootsOnly: boolean) => {
        if (!ValueStream) return;
        const newParams = {
            ...ValueStream.parameters,
            rootsOnly,
            parentId: rootsOnly ? '' : ValueStream.parameters.parentId,
            subtreeOf: rootsOnly ? '' : ValueStream.parameters.subtreeOf,
        };
        if (isNew) setDraft({ ...draft, parameters: newParams });
        else updateValueStream(ValueStream.id, { parameters: newParams });
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

                            {(() => {
                                const params = ValueStream.parameters;
                                const pickedParent = params.parentId || params.subtreeOf || '';
                                const parentScope: 'direct' | 'subtree' = params.subtreeOf ? 'subtree' : 'direct';
                                const sortedWorkItems = (data?.workItems ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
                                const pickerDisabled = !!params.rootsOnly;
                                return (
                                    <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-secondary)', paddingTop: '16px' }}>
                                        <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Hierarchy</h3>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '12px' }}>
                                            Limit the dashboard to part of the work-item tree. The three controls are mutually exclusive.
                                        </div>
                                        <div className={styles.formGrid}>
                                            <label>
                                                Parent Work Item:
                                                <select
                                                    value={pickedParent}
                                                    disabled={pickerDisabled}
                                                    onChange={e => setHierarchyParent(e.target.value, parentScope)}
                                                >
                                                    <option value="">— None —</option>
                                                    {sortedWorkItems.map(w => (
                                                        <option key={w.id} value={w.id}>{w.name}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label>
                                                Scope:
                                                <select
                                                    value={parentScope}
                                                    disabled={!pickedParent || pickerDisabled}
                                                    onChange={e => setHierarchyParent(pickedParent, e.target.value as 'direct' | 'subtree')}
                                                >
                                                    <option value="direct">Direct children only</option>
                                                    <option value="subtree">Entire subtree (all descendants)</option>
                                                </select>
                                            </label>
                                            <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!params.rootsOnly}
                                                    onChange={e => setRootsOnly(e.target.checked)}
                                                />
                                                Roots only (no parent)
                                            </label>
                                        </div>
                                    </div>
                                );
                            })()}
                        </section>

                    </div>
                </>
            )}
        </PageWrapper>
    );
};




