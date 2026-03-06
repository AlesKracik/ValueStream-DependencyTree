import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData, WorkItem } from '../types/models';
import { calculateWorkItemEffort, calculateWorkItemTcv } from '../utils/businessLogic';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption } from '../components/common/GenericListPage';
import { ListAttributeGrid, ListAttribute } from '../components/common/ListAttributeGrid';

interface Props {
    data: DashboardData | null;
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
            getValue: (w) => data ? calculateWorkItemTcv(w, data.customers) : 0 
        },
        { 
            label: 'Effort', 
            key: 'effort', 
            getValue: (w) => data ? calculateWorkItemEffort(w, data.epics) : 0 
        }
    ], [data]);

    return (
        <GenericListPage<WorkItem>
            title="Work Items"
            items={data?.workItems || []}
            loading={loading}
            filterPlaceholder="Filter work items..."
            filterPredicate={(w, query) => w.name.toLowerCase().includes(query.toLowerCase())}
            sortOptions={sortOptions}
            onItemClick={(w) => navigate(`/workitem/${w.id}`)}
            renderItemTitle={(w) => w.name}
            renderItemDetails={(w) => {
                if (!data) return null;
                const effort = calculateWorkItemEffort(w, data.epics);
                const tcv = calculateWorkItemTcv(w, data.customers);
                const sprint = data.sprints.find(s => s.id === w.released_in_sprint_id);
                return (
                    <ListAttributeGrid columns={4} columnWidth="180px">
                        <ListAttribute label="Score" value={Math.round(w.score || 0).toLocaleString()} />
                        <ListAttribute label="Effort" value={`${effort.toLocaleString()} MDs`} />
                        <ListAttribute label="TCV" value={`$${tcv.toLocaleString()}`} />
                        <ListAttribute label="Released" value={sprint?.name || 'Not Released'} />
                    </ListAttributeGrid>
                );
            }}
            actionButton={{
                label: "+ New Work Item",
                onClick: () => navigate('/workitem/new')
            }}
            loadingMessage="Loading work items..."
            emptyMessage="No work items found."
        />
    );
};
