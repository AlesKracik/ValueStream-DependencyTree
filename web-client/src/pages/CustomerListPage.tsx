import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData, Customer } from '../types/models';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption } from '../components/common/GenericListPage';
import { useCustomerCustomFields } from '../hooks/useCustomerCustomFields';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

export const CustomerListPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();
    const customFields = useCustomerCustomFields(data?.customers, data?.settings);

    const sortOptions: SortOption<Customer>[] = useMemo(() => [
        { label: 'Name', key: 'name', getValue: (c) => c.name },
        { label: 'Existing', key: 'existing', getValue: (c) => c.existing_tcv || 0 },
        { label: 'Potential', key: 'potential', getValue: (c) => c.potential_tcv || 0 },
        { label: 'Total', key: 'total', getValue: (c) => (c.existing_tcv || 0) + (c.potential_tcv || 0) }
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
            renderItemTitle={(c) => {
                const total = (c.existing_tcv || 0) + (c.potential_tcv || 0);
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', width: '100%', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#f1f5f9' }}>{c.name}</span>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#94a3b8' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>Existing:</span>
                                <span style={{ color: '#cbd5e1' }}>${c.existing_tcv.toLocaleString()}{c.existing_tcv_duration_months ? ` (${c.existing_tcv_duration_months}mo)` : ''}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>Potential:</span>
                                <span style={{ color: '#cbd5e1' }}>${c.potential_tcv.toLocaleString()}{c.potential_tcv_duration_months ? ` (${c.potential_tcv_duration_months}mo)` : ''}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>Total:</span>
                                <span style={{ fontWeight: 'bold', color: '#f8fafc' }}>${total.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                );
            }}
            renderItemDetails={(c) => {
                const customData = c.customer_id ? customFields.data.find(d => d.customer_id === c.customer_id) : null;
                if (!customData) return null;

                const entries = Object.entries(customData).filter(([k]) => {
                    const lower = k.toLowerCase();
                    return !(lower === 'id' || lower === '_id' || lower.endsWith('_id') || (k.endsWith('Id') && k.length > 2));
                });

                const simpleFields = entries.filter(([_, v]) => !Array.isArray(v));
                const collections = entries.filter(([_, v]) => Array.isArray(v));

                const renderCompactValue = (val: any): React.ReactNode => {
                    if (val === null || val === undefined) return <span style={{ color: '#64748b', fontStyle: 'italic' }}>null</span>;
                    if (typeof val === 'object' && !Array.isArray(val)) {
                        const subEntries = Object.entries(val).filter(([k]) => !k.toLowerCase().endsWith('id'));
                        return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                                {subEntries.map(([k, v]) => (
                                    <div key={k} style={{ fontSize: '12px' }}>
                                        <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>{k.replace(/_/g, ' ')}:</span> {String(v)}
                                    </div>
                                ))}
                            </div>
                        );
                    }
                    return String(val);
                };

                return (
                    <div style={{ marginTop: '6px', width: '100%' }}>
                        {/* Horizontal Simple Custom Fields */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', marginBottom: collections.length > 0 ? '12px' : '0' }}>
                            {simpleFields.map(([key, value]) => (
                                <div key={key} style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {key.replace(/_/g, ' ')}:
                                    </span>
                                    <span style={{ fontSize: '13px', color: '#cbd5e1' }}>
                                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Vertical Collections */}
                        {collections.map(([key, value]) => (
                            <div key={key} style={{ marginTop: '12px' }}>
                                <div style={{ fontSize: '10px', color: '#60a5fa', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                    {key.replace(/_/g, ' ')}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginLeft: '8px' }}>
                                    {(value as any[]).map((item, idx) => (
                                        <div key={idx} style={{ 
                                            padding: '8px 12px', 
                                            backgroundColor: 'rgba(255,255,255,0.02)', 
                                            border: '1px solid #334155', 
                                            borderRadius: '6px',
                                            width: '100%',
                                            boxSizing: 'border-box'
                                        }}>
                                            {renderCompactValue(item)}
                                        </div>
                                    ))}
                                    {(value as any[]).length === 0 && (
                                        <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', marginLeft: '4px' }}>No items</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                );
            }}
            actionButton={{
                label: "+ New Customer",
                onClick: () => navigate('/customer/new')
            }}
            loadingMessage="Loading customers..."
            emptyMessage="No customers found."
        />
    );
};
