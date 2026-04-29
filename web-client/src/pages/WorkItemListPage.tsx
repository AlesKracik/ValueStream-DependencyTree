import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ValueStreamData, WorkItem, WorkItemPriorityMetric } from '@valuestream/shared-types';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';
import { useNotificationContext } from '../contexts/NotificationContext';
import { useUIStateContext } from '../contexts/UIStateContext';

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
    updateWorkItem?: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
}

const STATUS_ORDER = ['Backlog', 'Planning', 'Development', 'Done'];
const RANK_STEP = 1000;

const METRIC_LABEL: Record<WorkItemPriorityMetric, string> = {
    score: 'Score',
    aha_score: 'Product Value',
    stackrank: 'Stack Rank'
};

const METRIC_OPTIONS: WorkItemPriorityMetric[] = ['score', 'aha_score', 'stackrank'];

/**
 * Sort value for the active metric. Convention:
 *   - score / aha_score: higher number = higher priority. Missing → 0.
 *   - stackrank: higher number = higher priority. Unranked → MIN_SAFE_INTEGER
 *     so they land at the least-prioritized end regardless of sort direction.
 */
function getMetricSortValue(w: WorkItem, metric: WorkItemPriorityMetric): number {
    if (metric === 'score') return w.calculated_score || 0;
    if (metric === 'aha_score') return w.aha_synced_data?.score ?? 0;
    return w.stackrank ?? Number.MIN_SAFE_INTEGER;
}

function renderMetricCell(w: WorkItem, metric: WorkItemPriorityMetric): React.ReactNode {
    if (metric === 'score') return Math.round(w.calculated_score || 0).toLocaleString();
    if (metric === 'aha_score') return w.aha_synced_data?.score ?? '—';
    return w.stackrank ?? '—';
}

export const WorkItemListPage: React.FC<Props> = ({ data, loading, updateWorkItem }) => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useNotificationContext();
    const { viewState, setViewState } = useUIStateContext();
    const metric = viewState.prioritizationMetric;

    const setMetric = (m: WorkItemPriorityMetric) => {
        setViewState(s => ({ ...s, prioritizationMetric: m }));
    };

    const handleCompactRanks = async () => {
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

    const sortOptions: SortOption<WorkItem>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (w) => w.name },
        {
            label: 'Priority',
            key: 'priority',
            getValue: (w) => getMetricSortValue(w, metric)
        },
        {
            label: 'TCV',
            key: 'tcv',
            getValue: (w) => w.calculated_tcv || 0
        },
        {
            label: 'Status',
            key: 'status',
            getValue: (w) => STATUS_ORDER.indexOf(w.status || 'Backlog')
        },
        {
            label: 'Effort',
            key: 'effort',
            getValue: (w) => w.calculated_effort || 0
        },
        {
            label: 'Released',
            key: 'released',
            getValue: (w) => data?.sprints?.find(s => s.id === w.released_in_sprint_id)?.name || 'Not Released'
        }
    ], [data, metric]);

    const columns: ListColumn<WorkItem>[] = useMemo(() => [
        { header: 'Name', render: (w) => w.name, flex: 2, sortKey: 'name' },
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
            header: 'Released',
            render: (w) => data?.sprints?.find(s => s.id === w.released_in_sprint_id)?.name || 'Not Released',
            flex: 1.5,
            sortKey: 'released'
        }
    ], [data, metric]);

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

    return (
        <GenericListPage<WorkItem>
            pageId="workItems"
            title="Work Items"
            items={data?.workItems || []}
            loading={loading}
            filterPlaceholder="Filter work items..."
            filterPredicate={(w, query) => w.name.toLowerCase().includes(query.toLowerCase())}
            sortOptions={sortOptions}
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
            additionalControls={metricToggle}
            loadingMessage="Loading work items..."
            emptyMessage="No work items found."
        />
    );
};



