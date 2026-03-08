import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ValueStreamData, Team } from '../types/models';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
}

export const TeamListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();

    const sortOptions: SortOption<Team>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (t) => t.name },
        { label: 'Capacity', key: 'capacity', getValue: (t) => t.total_capacity_mds || 0 },
        { label: 'Country', key: 'country', getValue: (t) => t.country || '' }
    ], []);

    const columns: ListColumn<Team>[] = useMemo(() => [
        { header: 'Name', render: (t) => t.name, flex: 2, sortKey: 'name' },
        { header: 'Capacity', render: (t) => `${t.total_capacity_mds.toLocaleString()} MDs`, flex: 1, sortKey: 'capacity' },
        { header: 'Country', render: (t) => t.country || 'N/A', flex: 1, sortKey: 'country' }
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
            columns={columns}
            actionButton={{
                label: "+ New Team",
                onClick: () => navigate('/team/new')
            }}
            loadingMessage="Loading teams..."
            emptyMessage="No teams found."
        />
    );
};



