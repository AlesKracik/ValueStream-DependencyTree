import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ValueStreamData, ValueStreamEntity } from '@valuestream/shared-types';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
}

export const ValueStreamListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();

    const sortOptions: SortOption<ValueStreamEntity>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (d) => d.name }
    ], []);

    const columns: ListColumn<ValueStreamEntity>[] = useMemo(() => [
        { header: 'Name', render: (d) => d.name, flex: 1, sortKey: 'name' },
        { header: 'Description', render: (d) => d.description || "No description provided.", flex: 3 }
    ], []);

    return (
        <GenericListPage<ValueStreamEntity>
            pageId="valueStreams"
            title="Value Streams"
            items={data?.valueStreams || []}
            loading={loading}
            filterPlaceholder="Filter Value Streams..."
            filterPredicate={(d, query) => d.name.toLowerCase().includes(query.toLowerCase())}
            sortOptions={sortOptions}
            onItemClick={(d) => navigate(`/valueStream/${d.id}`)}
            columns={columns}
            actionButton={{
                label: "+ New Value Stream",
                onClick: () => navigate('/valueStream/new')
            }}
            loadingMessage="Loading Value Streams..."
            emptyMessage="No Value Streams found."
        />
    );
};





