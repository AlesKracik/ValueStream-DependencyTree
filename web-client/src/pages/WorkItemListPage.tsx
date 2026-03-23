import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ValueStreamData, WorkItem } from '../types/models';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
}

const STATUS_ORDER = ['Backlog', 'Planning', 'Development', 'Done'];

export const WorkItemListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();

    const sortOptions: SortOption<WorkItem>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (w) => w.name },
        { label: 'Score', key: 'score', getValue: (w) => w.calculated_score || 0 },
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
            getValue: (w) => data?.sprints.find(s => s.id === w.released_in_sprint_id)?.name || 'Not Released'
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
            render: (w) => data?.sprints.find(s => s.id === w.released_in_sprint_id)?.name || 'Not Released',
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
            loadingMessage="Loading work items..."
            emptyMessage="No work items found."
        />
    );
};



