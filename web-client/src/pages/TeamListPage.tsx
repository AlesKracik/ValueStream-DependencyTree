import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData, Team } from '../types/models';
import { GenericListPage, SortOption } from '../components/common/GenericListPage';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

export const TeamListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();

    const sortOptions: SortOption<Team>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (t) => t.name },
        { label: 'Capacity', key: 'capacity', getValue: (t) => t.total_capacity_mds || 0 }
    ], []);

    return (
        <GenericListPage<Team>
            title="Teams"
            items={data?.teams || []}
            loading={loading}
            filterPlaceholder="Filter teams..."
            filterPredicate={(t, query) => t.name.toLowerCase().includes(query.toLowerCase())}
            sortOptions={sortOptions}
            onItemClick={(t) => navigate(`/team/${t.id}`)}
            renderItemTitle={(t) => t.name}
            renderItemDetails={(t) => `Capacity (MDs): ${t.total_capacity_mds} | Country: ${t.country || 'N/A'}`}
            loadingMessage="Loading teams..."
            emptyMessage="No teams found."
        />
    );
};
