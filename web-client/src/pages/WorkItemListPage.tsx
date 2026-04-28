import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ValueStreamData, WorkItem } from '@valuestream/shared-types';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';
import { useNotificationContext } from '../contexts/NotificationContext';

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
    updateWorkItem?: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
}

const STATUS_ORDER = ['Backlog', 'Planning', 'Development', 'Done'];
const RANK_STEP = 1000;

export const WorkItemListPage: React.FC<Props> = ({ data, loading, updateWorkItem }) => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useNotificationContext();

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
        { label: 'Score', key: 'score', getValue: (w) => w.calculated_score || 0 },
        {
            label: 'Stack Rank',
            key: 'stackrank',
            // Higher number = higher priority; unranked items use MIN_SAFE_INTEGER so they
            // land at the least-prioritized end regardless of sort direction.
            getValue: (w) => w.stackrank ?? Number.MIN_SAFE_INTEGER
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
    ], [data]);

    const columns: ListColumn<WorkItem>[] = useMemo(() => [
        { header: 'Name', render: (w) => w.name, flex: 2, sortKey: 'name' },
        {
            header: 'Score',
            render: (w) => Math.round(w.calculated_score || 0).toLocaleString(),
            flex: 1,
            sortKey: 'score'
        },
        {
            header: 'Stack Rank',
            render: (w) => w.stackrank ?? '—',
            flex: 1,
            sortKey: 'stackrank'
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
    ], [data]);

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
            additionalControls={
                <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleCompactRanks}
                    title="Renumber stack ranks to clean multiples of 1000, preserving order. Use this when gaps between ranks get too small to insert new items."
                >
                    Compact Ranks
                </button>
            }
            loadingMessage="Loading work items..."
            emptyMessage="No work items found."
        />
    );
};



