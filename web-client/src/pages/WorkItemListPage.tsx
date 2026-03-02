import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData, WorkItem } from '../types/models';
import { calculateWorkItemEffort, calculateWorkItemTcv } from '../utils/businessLogic';
import { GenericListPage, SortOption } from '../components/common/GenericListPage';

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
                return `Effort: ${effort} MDs | TCV: $${tcv.toLocaleString()} | Released in: ${sprint?.name || 'Not Released'}`;
            }}
            renderItemRight={(w) => (
                <div style={{ 
                    fontSize: '12px', 
                    color: '#60a5fa', 
                    fontWeight: 'bold', 
                    backgroundColor: 'rgba(96, 165, 250, 0.1)', 
                    padding: '2px 8px', 
                    borderRadius: '12px' 
                }}>
                    Score: {Math.round(w.score || 0)}
                </div>
            )}
            actionButton={{
                label: "+ New Work Item",
                onClick: () => navigate('/workitem/new')
            }}
            loadingMessage="Loading work items..."
            emptyMessage="No work items found."
        />
    );
};
