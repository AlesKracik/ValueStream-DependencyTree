import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ValueStreamData, Customer } from '../types/models';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
}

export const CustomerListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();

    const sortOptions: SortOption<Customer>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (c) => c.name },
        { label: 'Existing', key: 'existing', getValue: (c) => c.existing_tcv || 0 },
        { label: 'Potential', key: 'potential', getValue: (c) => c.potential_tcv || 0 }
    ], []);

    const columns: ListColumn<Customer>[] = useMemo(() => [
        { header: 'Name', render: (c) => c.name, flex: 2, sortKey: 'name' },
        { 
            header: 'Existing TCV', 
            render: (c) => `$${c.existing_tcv.toLocaleString()}${c.existing_tcv_duration_months ? ` (${c.existing_tcv_duration_months}mo)` : ''}`,
            flex: 1.5,
            sortKey: 'existing'
        },
        { 
            header: 'Potential TCV', 
            render: (c) => `$${c.potential_tcv.toLocaleString()}${c.potential_tcv_duration_months ? ` (${c.potential_tcv_duration_months}mo)` : ''}`,
            flex: 1.5,
            sortKey: 'potential'
        }
    ], []);

    return (
        <GenericListPage<Customer>
            pageId="customers"
            title="Customers"
            items={data?.customers || []}
            loading={loading}
            filterPlaceholder="Filter customers..."
            filterPredicate={(c, query) => c.name.toLowerCase().includes(query.toLowerCase())}
            sortOptions={sortOptions}
            onItemClick={(c) => navigate(`/customer/${c.id}`)}
            columns={columns}
            actionButton={{
                label: "+ New Customer",
                onClick: () => navigate('/customer/new')
            }}
            loadingMessage="Loading customers..."
            emptyMessage="No customers found."
        />
    );
};



