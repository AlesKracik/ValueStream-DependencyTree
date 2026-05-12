import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ValueStreamData, WorkItem, WorkItemPriorityMetric, Issue } from '@valuestream/shared-types';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';
import { MultiSelectDropdown } from '../components/common/MultiSelectDropdown';
import { Pagination } from '../components/common/Pagination';
import { useNotificationContext } from '../contexts/NotificationContext';
import { useUIStateContext } from '../contexts/UIStateContext';
import { hasUnestimatedWorkItemEffort } from '../utils/businessLogic';
import { useFilteredWorkItems, type WorkItemFilters, type WorkItemSort } from '../hooks/useFilteredWorkItems';

const PAGE_ID = 'workItems';

const DEFAULT_PAGE_SIZE = 25;

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
    updateWorkItem?: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
}

const STATUSES = ['Backlog', 'Planning', 'Development', 'Done'];
const RANK_STEP = 1000;

const METRIC_LABEL: Record<WorkItemPriorityMetric, string> = {
    score: 'Score',
    aha_score: 'Product Value',
    stackrank: 'Stack Rank'
};

const METRIC_OPTIONS: WorkItemPriorityMetric[] = ['score', 'aha_score', 'stackrank'];

function renderMetricCell(w: WorkItem, metric: WorkItemPriorityMetric): React.ReactNode {
    if (metric === 'score') return Math.round(w.calculated_score || 0).toLocaleString();
    if (metric === 'aha_score') return w.aha_synced_data?.score ?? '—';
    return w.stackrank ?? '—';
}

/**
 * Same flag computation as `useGraphBuilder` so list and graph stay in sync.
 * Released-in-sprint icon is intentionally omitted — the list already has a Released column.
 */
function renderFlagIcons(w: WorkItem, issues: Issue[]): React.ReactNode {
    const issuesForWorkItem = issues.filter(i => i.work_item_id === w.id);
    const isGlobal = !!w.all_customers_target;
    const hasDatelessIssues = issuesForWorkItem.some(i => !i.target_start || !i.target_end);
    const hasUnestimatedEffort = hasUnestimatedWorkItemEffort(w, issues);

    if (!isGlobal && !hasDatelessIssues && !hasUnestimatedEffort) return null;

    return (
        <span style={{ display: 'inline-flex', gap: '4px', marginLeft: '8px', verticalAlign: 'middle', filter: 'var(--icon-filter)' }}>
            {isGlobal && (
                <span title="Relates to all existing customers" aria-label="Relates to all existing customers">🌐</span>
            )}
            {hasDatelessIssues && (
                <span title="Has issues without target dates" aria-label="Has issues without target dates" style={{ color: 'var(--status-danger)' }}>🕒</span>
            )}
            {hasUnestimatedEffort && (
                <span title="Effort is not estimated (0 MDs)" aria-label="Effort is not estimated (0 MDs)" style={{ color: 'var(--status-warning)' }}>📏</span>
            )}
        </span>
    );
}

const numberInputStyle: React.CSSProperties = {
    width: '90px',
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid var(--border-primary)',
    // --bg-tertiary so the input stands out against the band's --bg-secondary.
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
};

export const WorkItemListPage: React.FC<Props> = ({ data, loading: outerLoading, updateWorkItem }) => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useNotificationContext();
    const { viewState, setViewState, uiState, updateUiState } = useUIStateContext();
    const metric = viewState.prioritizationMetric;

    // --- Filter, sort, and page state ---
    // Seeded once from uiState so returning to this page (e.g. via back button
    // from a detail page) restores the user's spot. uiState lives in memory only,
    // so a browser refresh / new tab still gets a fresh page.
    const savedState = uiState[PAGE_ID];
    const [filters, setFilters] = useState<WorkItemFilters>(
        () => (savedState?.pageFilters as WorkItemFilters | undefined) || {}
    );
    const [sort, setSort] = useState<WorkItemSort>(() => ({
        sortBy: savedState?.sortBy ?? 'name',
        sortOrder: savedState?.sortOrder ?? 'asc',
    }));

    // pageSize comes from the user's "Items per page" setting (general.items_per_page).
    // page is reset to 1 whenever filters or sort change so the user doesn't end up
    // on an out-of-range page.
    const pageSize = data?.settings?.general?.items_per_page ?? DEFAULT_PAGE_SIZE;
    const [page, setPage] = useState<number>(() => savedState?.page ?? 1);

    // Persist filters + page back into uiState so subsequent in-app remounts
    // (i.e. coming back from a detail page) restore them.
    useEffect(() => {
        updateUiState(PAGE_ID, { pageFilters: filters, page });
    }, [filters, page, updateUiState]);

    const setFilterField = <K extends keyof WorkItemFilters>(key: K, value: WorkItemFilters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };
    const setArrayField = (key: 'status' | 'releasedSprintIds', next: string[]) => {
        setFilters(prev => ({ ...prev, [key]: next.length > 0 ? next : undefined }));
    };

    // Active filter count = 1 per active field (not per value).
    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (filters.name) n++;
        if (filters.minPriority || filters.maxPriority) n++;
        if (filters.minEffort || filters.maxEffort) n++;
        if (filters.minTcv || filters.maxTcv) n++;
        if (filters.status && filters.status.length > 0) n++;
        if (filters.releasedSprintIds && filters.releasedSprintIds.length > 0) n++;
        if ((filters.parentIds && filters.parentIds.length > 0) || (filters.subtreeOfIds && filters.subtreeOfIds.length > 0) || filters.rootsOnly) n++;
        return n;
    }, [filters]);

    // Hierarchy filter has two scopes: 'direct' children only, or 'subtree' (descendants).
    // We keep the picker state unified: `pickedParents` is whichever id list is set, and
    // `parentScope` flags which mode is active. Backend wiring picks the right query param.
    const pickedParents = (filters.parentIds && filters.parentIds.length > 0)
        ? filters.parentIds
        : (filters.subtreeOfIds || []);
    const parentScope: 'direct' | 'subtree' = (filters.subtreeOfIds && filters.subtreeOfIds.length > 0) ? 'subtree' : 'direct';
    const setHierarchyParents = (ids: string[], scope: 'direct' | 'subtree' = parentScope) => {
        const clean = ids.filter(Boolean);
        setFilters(prev => ({
            ...prev,
            parentIds: clean.length > 0 && scope === 'direct' ? clean : undefined,
            subtreeOfIds: clean.length > 0 && scope === 'subtree' ? clean : undefined,
            rootsOnly: undefined,
        }));
    };
    const setParentScope = (scope: 'direct' | 'subtree') => {
        if (pickedParents.length === 0) return; // toggle is moot until something is picked
        setHierarchyParents(pickedParents, scope);
    };

    // --- Data ---
    // Splat the active metric into the filter object so the backend uses the right
    // field for both the priority range filter and the 'priority' sort.
    const filtersWithMetric = useMemo<WorkItemFilters>(
        () => ({ ...filters, priorityMetric: metric }),
        [filters, metric]
    );
    const { workItems, total, loading: hookLoading, error } = useFilteredWorkItems(
        filtersWithMetric,
        sort,
        { page, pageSize }
    );
    const loading = outerLoading || hookLoading;

    // When filters/sort/pageSize change, snap back to the first page so the user
    // doesn't see "Page 5 of 1" after narrowing the result set.
    // We use the "adjust state during render" pattern (tracked via a previous-key
    // ref) instead of useEffect, per react-hooks/set-state-in-effect lint rule.
    const resetKey = `${JSON.stringify(filtersWithMetric)}|${sort.sortBy ?? ''}|${sort.sortOrder ?? ''}|${pageSize}`;
    const [prevResetKey, setPrevResetKey] = useState(resetKey);
    if (resetKey !== prevResetKey) {
        setPrevResetKey(resetKey);
        if (page !== 1) setPage(1);
    }

    const setMetric = (m: WorkItemPriorityMetric) => {
        setViewState(s => ({ ...s, prioritizationMetric: m }));
    };

    const handleCompactRanks = async () => {
        // Compact-Ranks operates on the FULL ranked set, not the filtered list,
        // so it stays sourced from `data.workItems` (unfiltered workspace).
        const ranked = (data?.workItems ?? [])
            .filter((w): w is WorkItem & { stackrank: number } => typeof w.stackrank === 'number')
            .slice()
            .sort((a, b) => a.stackrank - b.stackrank);

        if (ranked.length === 0) {
            await showAlert('Nothing to compact', 'No work items have a stack rank yet.');
            return;
        }

        const confirmed = await showConfirm(
            'Compact stack ranks?',
            `This will renumber the stack ranks of ${ranked.length} ranked work item${ranked.length === 1 ? '' : 's'} to ${RANK_STEP}, ${2 * RANK_STEP}, ${3 * RANK_STEP}, ... preserving their current order. Unranked items stay as-is.`
        );
        if (!confirmed || !updateWorkItem) return;

        for (let i = 0; i < ranked.length; i++) {
            const newRank = (i + 1) * RANK_STEP;
            if (ranked[i].stackrank !== newRank) {
                await updateWorkItem(ranked[i].id, { stackrank: newRank });
            }
        }
    };

    // Sort options drive the column-header indicators and the sort-key→server mapping.
    // The per-row getValue is unused in backend mode (disableClientSort=true) but kept
    // for type completeness.
    const sortOptions: SortOption<WorkItem>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (w) => w.name },
        { label: 'Priority', key: 'priority', getValue: (w) => w.calculated_score || 0 },
        { label: 'TCV', key: 'tcv', getValue: (w) => w.calculated_tcv || 0 },
        { label: 'Status', key: 'status', getValue: (w) => STATUSES.indexOf(w.status || 'Backlog') },
        { label: 'Effort', key: 'effort', getValue: (w) => w.calculated_effort || 0 },
    ], []);

    const columns: ListColumn<WorkItem>[] = useMemo(() => {
        const issues = data?.issues || [];
        return [
            {
                header: 'Name',
                render: (w) => (
                    <>
                        {w.name}
                        {renderFlagIcons(w, issues)}
                    </>
                ),
                flex: 2,
                sortKey: 'name'
            },
            {
                header: METRIC_LABEL[metric],
                render: (w) => renderMetricCell(w, metric),
                flex: 1,
                sortKey: 'priority'
            },
            {
                header: 'Effort',
                render: (w) => `${(w.calculated_effort || 0).toLocaleString()} MDs`,
                flex: 1,
                sortKey: 'effort'
            },
            {
                header: 'TCV',
                render: (w) => `$${(w.calculated_tcv || 0).toLocaleString()}`,
                flex: 1,
                sortKey: 'tcv'
            },
            {
                header: 'Status',
                render: (w) => w.status || 'Backlog',
                flex: 1,
                sortKey: 'status'
            },
            {
                // 'released' has no server-side sort: ordering by raw sprint id is meaningless
                // (Q1a). When pagination lands, this column header simply won't be sortable.
                header: 'Released',
                render: (w) => data?.sprints?.find(s => s.id === w.released_in_sprint_id)?.name || 'Not Released',
                flex: 1.5,
            }
        ];
    }, [data, metric]);

    const metricToggle = (
        <div
            role="radiogroup"
            aria-label="Prioritize by"
            style={{ display: 'inline-flex', border: '1px solid var(--border-primary)', borderRadius: '6px', overflow: 'hidden' }}
        >
            {METRIC_OPTIONS.map((m, i) => {
                const isActive = metric === m;
                return (
                    <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => setMetric(m)}
                        title={`Prioritize by ${METRIC_LABEL[m]}`}
                        style={{
                            padding: '6px 12px',
                            background: isActive ? 'var(--accent-primary)' : 'transparent',
                            color: isActive ? 'white' : 'var(--text-primary)',
                            border: 'none',
                            borderLeft: i === 0 ? 'none' : '1px solid var(--border-primary)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: isActive ? 600 : 400
                        }}
                    >
                        {METRIC_LABEL[m]}
                    </button>
                );
            })}
        </div>
    );

    // Released options: every non-archived sprint plus the 'unreleased' sentinel.
    const releasedOptions = useMemo(() => {
        const sprints = (data?.sprints || []).filter(s => !s.is_archived);
        return [
            { value: 'unreleased', label: 'Unreleased' },
            ...sprints.map(s => ({ value: s.id, label: s.name })),
        ];
    }, [data]);

    // Parent picker options: every other work item, sorted by name. Sourced from
    // `data?.workItems` (the unfiltered workspace) so the dropdown is stable
    // regardless of the current filtered view.
    const parentOptions = useMemo(() => {
        return (data?.workItems ?? [])
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(w => ({ value: w.id, label: w.name }));
    }, [data?.workItems]);

    const handleSortChange = useCallback((sortBy: string | undefined, sortOrder: 'asc' | 'desc') => {
        setSort({ sortBy, sortOrder });
    }, []);
    const handleFilterChange = useCallback((name: string) => {
        setFilters(prev => ({ ...prev, name: name || undefined }));
    }, []);

    const labelStyle: React.CSSProperties = {
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
    };
    const groupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px' };
    const rangeRowStyle: React.CSSProperties = { display: 'flex', gap: '6px', alignItems: 'center' };

    // Header row above the filter groups: the prioritization toggle.
    const renderFilterBarHeader = () => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={labelStyle}>Prioritize by</span>
            {metricToggle}
        </div>
    );

    // Per-attribute filter groups. They flow in the SAME row as GenericListPage's
    // built-in name filter, so the user sees one cohesive filter bar.
    const renderFilterGroups = () => (
        <>
            <div style={groupStyle}>
                <label style={labelStyle}>{METRIC_LABEL[metric]}</label>
                <div style={rangeRowStyle}>
                    <input aria-label={`Min ${METRIC_LABEL[metric]}`} type="number" placeholder="min" value={filters.minPriority || ''}
                        onChange={(e) => setFilterField('minPriority', e.target.value || undefined)} style={numberInputStyle} />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input aria-label={`Max ${METRIC_LABEL[metric]}`} type="number" placeholder="max" value={filters.maxPriority || ''}
                        onChange={(e) => setFilterField('maxPriority', e.target.value || undefined)} style={numberInputStyle} />
                </div>
            </div>

            <div style={groupStyle}>
                <label style={labelStyle}>Effort (MDs)</label>
                <div style={rangeRowStyle}>
                    <input aria-label="Min effort" type="number" placeholder="min" value={filters.minEffort || ''}
                        onChange={(e) => setFilterField('minEffort', e.target.value || undefined)} style={numberInputStyle} />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input aria-label="Max effort" type="number" placeholder="max" value={filters.maxEffort || ''}
                        onChange={(e) => setFilterField('maxEffort', e.target.value || undefined)} style={numberInputStyle} />
                </div>
            </div>

            <div style={groupStyle}>
                <label style={labelStyle}>TCV ($)</label>
                <div style={rangeRowStyle}>
                    <input aria-label="Min TCV" type="number" placeholder="min" value={filters.minTcv || ''}
                        onChange={(e) => setFilterField('minTcv', e.target.value || undefined)} style={numberInputStyle} />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input aria-label="Max TCV" type="number" placeholder="max" value={filters.maxTcv || ''}
                        onChange={(e) => setFilterField('maxTcv', e.target.value || undefined)} style={numberInputStyle} />
                </div>
            </div>

            <div style={groupStyle}>
                <label style={labelStyle}>Status</label>
                <MultiSelectDropdown
                    ariaLabel="Status filter"
                    placeholder="All statuses"
                    options={STATUSES.map(s => ({ value: s, label: s }))}
                    selected={filters.status || []}
                    onChange={(next) => setArrayField('status', next)}
                    width={180}
                />
            </div>

            <div style={groupStyle}>
                <label style={labelStyle}>Released in</label>
                <MultiSelectDropdown
                    ariaLabel="Released filter"
                    placeholder="All sprints"
                    options={releasedOptions}
                    selected={filters.releasedSprintIds || []}
                    onChange={(next) => setArrayField('releasedSprintIds', next)}
                    width={220}
                />
            </div>

            <div style={groupStyle}>
                <label style={labelStyle}>Hierarchy</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ opacity: filters.rootsOnly ? 0.5 : 1, pointerEvents: filters.rootsOnly ? 'none' : 'auto' }}>
                        <MultiSelectDropdown
                            ariaLabel="Hierarchy parents"
                            placeholder="Children of..."
                            options={parentOptions}
                            selected={pickedParents}
                            onChange={(next) => setHierarchyParents(next)}
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
                            opacity: pickedParents.length > 0 ? 1 : 0.5,
                            pointerEvents: pickedParents.length > 0 ? 'auto' : 'none',
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
                                    onClick={() => setParentScope(scope)}
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

                    {pickedParents.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setHierarchyParents([])}
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
                            checked={!!filters.rootsOnly}
                            onChange={(e) => setFilters(prev => ({
                                ...prev,
                                rootsOnly: e.target.checked || undefined,
                                parentIds: e.target.checked ? undefined : prev.parentIds,
                                subtreeOfIds: e.target.checked ? undefined : prev.subtreeOfIds,
                            }))}
                        />
                        Roots only
                    </label>
                </div>
            </div>

            {activeFilterCount > 0 && (
                <button
                    type="button"
                    onClick={() => setFilters({})}
                    className="btn-secondary"
                    style={{ alignSelf: 'flex-end', padding: '4px 12px', fontSize: '12px' }}
                >
                    Clear filters
                </button>
            )}
        </>
    );

    return (
        <GenericListPage<WorkItem>
            pageId="workItems"
            title="Work Items"
            items={workItems}
            loading={loading}
            error={error ? new Error(error) : null}
            filterPlaceholder="Filter by name..."
            // Backend already filtered — local predicate is a no-op match-all.
            filterPredicate={() => true}
            sortOptions={sortOptions}
            disableClientSort
            onSortChange={handleSortChange}
            onFilterChange={handleFilterChange}
            collapsible
            activeFilterCount={activeFilterCount}
            nameFilterLabel="Name"
            renderFilterBarHeader={renderFilterBarHeader}
            renderFilterGroups={renderFilterGroups}
            renderBelowList={() => (
                <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
            )}
            onItemClick={(w) => navigate(`/workitem/${w.id}`)}
            columns={columns}
            actionButton={{
                label: "+ New Work Item",
                onClick: () => navigate('/workitem/new')
            }}
            secondaryActions={metric === 'stackrank' ? [{
                label: 'Compact Ranks',
                onClick: handleCompactRanks,
                title: 'Renumber stack ranks to clean multiples of 1000, preserving order. Use this when gaps between ranks get too small to insert new items.'
            }] : undefined}
            loadingMessage="Loading work items..."
            emptyMessage="No work items found."
        />
    );
};
