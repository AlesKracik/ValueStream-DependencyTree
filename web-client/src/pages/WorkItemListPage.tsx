import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ValueStreamData, WorkItem } from '../types/models';
import { calculateWorkItemEffort, calculateWorkItemTcv } from '../utils/businessLogic';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
}

export const WorkItemListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();

    const sortOptions: SortOption<WorkItem>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (w) => w.name },
        { label: 'Score', key: 'score', getValue: (w) => w.score || 0 },
        { 
            label: 'TCV', 
            key: 'tcv', 
            getValue: (w) => data ? calculateWorkItemTcv(w, data.customers, data.workItems) : 0 
        },
        { 
            label: 'Effort', 
            key: 'effort', 
            getValue: (w) => data ? calculateWorkItemEffort(w, data.issues) : 0 
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
            render: (w) => Math.round(w.score || 0).toLocaleString(),
            flex: 1,
            sortKey: 'score'
        },
        { 
            header: 'Effort', 
            render: (w) => data ? `${calculateWorkItemEffort(w, data.issues).toLocaleString()} MDs` : '0 MDs',
            flex: 1,
            sortKey: 'effort'
        },
        { 
            header: 'TCV', 
            render: (w) => data ? `$${calculateWorkItemTcv(w, data.customers, data.workItems).toLocaleString()}` : '$0',
            flex: 1,
            sortKey: 'tcv'
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



