import React, { useMemo, useState } from 'react';
import type { ValueStreamData, ValueStreamEntity } from '@valuestream/shared-types';
import { useDeleteWithConfirm } from '../hooks/useDeleteWithConfirm';
import { MultiSelectDropdown } from '../components/common/MultiSelectDropdown';
import styles from '../components/customers/CustomerPage.module.css';
import { generateId } from '../utils/security';
import { PageWrapper } from '../components/layout/PageWrapper';

interface HierarchyParamsEditorProps {
    params: ValueStreamEntity['parameters'];
    workItems: { id: string; name: string }[];
    onChange: (ids: string[], scope: 'direct' | 'subtree') => void;
    onChangeRootsOnly: (rootsOnly: boolean) => void;
}

// Inline styles mirror the WorkItem list page so the three Hierarchy filters
// (saved ValueStream definition, live dashboard, WorkItem list) render with
// identical visuals. The page's own `.formGrid label` styling would otherwise
// add per-control labels and a different vertical rhythm.
const hierarchyLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    letterSpacing: 'normal',
};
const hierarchyGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px' };

const HierarchyParamsEditor: React.FC<HierarchyParamsEditorProps> = ({ params, workItems, onChange, onChangeRootsOnly }) => {
    // Prefer the new array fields; fall back to legacy singular fields so saved
    // ValueStreams created before the multi-select rollout still hydrate correctly.
    const pickedIds = useMemo(() => {
        if (params.parentIds && params.parentIds.length > 0) return params.parentIds;
        if (params.parentId) return [params.parentId];
        if (params.subtreeOfIds && params.subtreeOfIds.length > 0) return params.subtreeOfIds;
        if (params.subtreeOf) return [params.subtreeOf];
        return [];
    }, [params.parentIds, params.subtreeOfIds, params.parentId, params.subtreeOf]);

    const parentScope: 'direct' | 'subtree' = useMemo(() => {
        const hasSubtree = (params.subtreeOfIds && params.subtreeOfIds.length > 0) || !!params.subtreeOf;
        return hasSubtree ? 'subtree' : 'direct';
    }, [params.subtreeOfIds, params.subtreeOf]);

    const options = useMemo(
        () => workItems.slice().sort((a, b) => a.name.localeCompare(b.name)).map(w => ({ value: w.id, label: w.name })),
        [workItems],
    );
    const pickerDisabled = !!params.rootsOnly;

    return (
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-secondary)', paddingTop: '16px' }}>
            <div style={hierarchyGroupStyle}>
                <label style={hierarchyLabelStyle}>Hierarchy</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ opacity: pickerDisabled ? 0.5 : 1, pointerEvents: pickerDisabled ? 'none' : 'auto' }}>
                        <MultiSelectDropdown
                            ariaLabel="Hierarchy parents"
                            placeholder="Children of..."
                            options={options}
                            selected={pickedIds}
                            onChange={(next) => onChange(next, parentScope)}
                            width={220}
                        />
                    </div>

                    {/* Scope toggle — only meaningful while at least one parent is picked. */}
                    <div
                        role="radiogroup"
                        aria-label="Hierarchy scope"
                        style={{
                            display: 'inline-flex',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 4,
                            overflow: 'hidden',
                            opacity: pickedIds.length > 0 && !pickerDisabled ? 1 : 0.5,
                            pointerEvents: pickedIds.length > 0 && !pickerDisabled ? 'auto' : 'none',
                        }}
                    >
                        {(['direct', 'subtree'] as const).map((scope, i) => {
                            const active = parentScope === scope;
                            return (
                                <button
                                    key={scope}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    aria-label={scope === 'direct' ? 'Direct children only' : 'Entire subtree'}
                                    onClick={() => onChange(pickedIds, scope)}
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: '12px',
                                        background: active ? 'var(--accent-primary)' : 'transparent',
                                        color: active ? 'white' : 'var(--text-primary)',
                                        border: 'none',
                                        borderLeft: i === 0 ? 'none' : '1px solid var(--border-primary)',
                                        cursor: 'pointer',
                                        fontWeight: active ? 600 : 400,
                                    }}
                                    title={scope === 'direct' ? 'Direct children only' : 'Entire subtree (all descendants)'}
                                >
                                    {scope === 'direct' ? 'Direct' : 'Subtree'}
                                </button>
                            );
                        })}
                    </div>

                    {pickedIds.length > 0 && !pickerDisabled && (
                        <button
                            type="button"
                            onClick={() => onChange([], parentScope)}
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            title="Clear parent filter"
                        >
                            ×
                        </button>
                    )}

                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={!!params.rootsOnly}
                            onChange={e => onChangeRootsOnly(e.target.checked)}
                        />
                        Roots only
                    </label>
                </div>
            </div>
        </div>
    );
};

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
            parentIds: [],
            subtreeOfIds: [],
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
     * Hierarchy filter is presented as a multi-select picker + scope toggle,
     * stored as two mutually-exclusive arrays (parentIds / subtreeOfIds).
     * Setting one always clears the other (and the legacy singular fields)
     * and clears rootsOnly so the three filters remain mutually exclusive on
     * the server too.
     */
    const setHierarchyParents = (ids: string[], scope: 'direct' | 'subtree') => {
        if (!ValueStream) return;
        const clean = ids.filter(Boolean);
        const newParams = {
            ...ValueStream.parameters,
            parentIds: clean.length > 0 && scope === 'direct' ? clean : [],
            subtreeOfIds: clean.length > 0 && scope === 'subtree' ? clean : [],
            // Drop legacy singular fields so the new array shape is authoritative once
            // the user touches the picker — avoids a half-migrated document.
            parentId: '',
            subtreeOf: '',
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
            parentIds: rootsOnly ? [] : ValueStream.parameters.parentIds,
            subtreeOfIds: rootsOnly ? [] : ValueStream.parameters.subtreeOfIds,
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

                            <HierarchyParamsEditor
                                params={ValueStream.parameters}
                                workItems={data?.workItems ?? []}
                                onChange={setHierarchyParents}
                                onChangeRootsOnly={setRootsOnly}
                            />
                        </section>

                    </div>
                </>
            )}
        </PageWrapper>
    );
};




