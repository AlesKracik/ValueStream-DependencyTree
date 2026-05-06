import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ValueStreamData, WorkItem, WorkItemPriorityMetric, Issue } from '@valuestream/shared-types';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';
import { MultiSelectDropdown } from '../components/common/MultiSelectDropdown';
import { useNotificationContext } from '../contexts/NotificationContext';
import { useUIStateContext } from '../contexts/UIStateContext';
import { calculateWorkItemEffort } from '../utils/businessLogic';
import { useFilteredWorkItems, type WorkItemFilters, type WorkItemSort } from '../hooks/useFilteredWorkItems';

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
    const totalEffort = calculateWorkItemEffort(w, issues);
    const isGlobal = !!w.all_customers_target;
    const hasDatelessIssues = issuesForWorkItem.some(i => !i.target_start || !i.target_end);
    const hasUnestimatedEffort = totalEffort === 0 || issuesForWorkItem.some(i => (i.effort_md || 0) === 0);

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
    const { viewState, setViewState } = useUIStateContext();
    const metric = viewState.prioritizationMetric;

    // --- Filter & sort state ---
    // Held in component state — not yet persisted across full-page refreshes.
    // Per-page collapse state still survives via uiState[pageId].filtersCollapsed.
    const [filters, setFilters] = useState<WorkItemFilters>({});
    const [sort, setSort] = useState<WorkItemSort>({ sortBy: 'name', sortOrder: 'asc' });

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
        return n;
    }, [filters]);

    // --- Data ---
    // Splat the active metric into the filter object so the backend uses the right
    // field for both the priority range filter and the 'priority' sort.
    const filtersWithMetric = useMemo<WorkItemFilters>(
        () => ({ ...filters, priorityMetric: metric }),
        [filters, metric]
    );
    const { workItems, loading: hookLoading, error } = useFilteredWorkItems(filtersWithMetric, sort);
    const loading = outerLoading || hookLoading;

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
