import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData, DashboardEntity } from '../types/models';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption } from '../components/common/GenericListPage';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

export const DashboardListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();

    const sortOptions: SortOption<DashboardEntity>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (d) => d.name }
    ], []);

    return (
        <GenericListPage<DashboardEntity>
            title="Dashboards"
            items={data?.dashboards || []}
            loading={loading}
            filterPlaceholder="Filter dashboards..."
            filterPredicate={(d, query) => d.name.toLowerCase().includes(query.toLowerCase())}
            sortOptions={sortOptions}
            onItemClick={(d) => navigate(`/dashboard/${d.id}`)}
            renderItemTitle={(d) => d.name}
            renderItemDetails={(d) => d.description || "No description provided."}
            actionButton={{
                label: "+ New Dashboard",
                onClick: () => navigate('/dashboard/new')
            }}
            loadingMessage="Loading dashboards..."
            emptyMessage="No dashboards found."
        />
    );
};
