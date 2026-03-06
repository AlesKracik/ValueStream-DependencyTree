import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData, Customer } from '../types/models';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption } from '../components/common/GenericListPage';
import { ListAttributeGrid, ListAttribute } from '../components/common/ListAttributeGrid';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

export const CustomerListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();

    const sortOptions: SortOption<Customer>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (c) => c.name },
        { label: 'Existing', key: 'existing', getValue: (c) => c.existing_tcv || 0 },
        { label: 'Potential', key: 'potential', getValue: (c) => c.potential_tcv || 0 }
    ], []);

    return (
        <GenericListPage<Customer>
            title="Customers"
            items={data?.customers || []}
            loading={loading}
            filterPlaceholder="Filter customers..."
            filterPredicate={(c, query) => c.name.toLowerCase().includes(query.toLowerCase())}
            sortOptions={sortOptions}
            onItemClick={(c) => navigate(`/customer/${c.id}`)}
            renderItemTitle={(c) => c.name}
            renderItemDetails={(c) => (
                <ListAttributeGrid>
                    <ListAttribute 
                        label="Existing" 
                        value={`$${c.existing_tcv.toLocaleString()}${c.existing_tcv_duration_months ? ` (${c.existing_tcv_duration_months}mo)` : ''}`} 
                    />
                    <ListAttribute 
                        label="Potential" 
                        value={`$${c.potential_tcv.toLocaleString()}${c.potential_tcv_duration_months ? ` (${c.potential_tcv_duration_months}mo)` : ''}`} 
                    />
                </ListAttributeGrid>
            )}
            actionButton={{
                label: "+ New Customer",
                onClick: () => navigate('/customer/new')
            }}
            loadingMessage="Loading customers..."
            emptyMessage="No customers found."
        />
    );
};
