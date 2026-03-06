import React, { useMemo } from 'react';
import type { ValueStreamData, SupportIssue } from '../types/models';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';
import { useNavigate } from 'react-router-dom';

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
}

interface SupportIssueWithCustomer extends SupportIssue {
    customerName: string;
    customerId: string;
}

export const SupportPage: React.FC<Props> = ({ data, loading }) => {
    const navigate = useNavigate();

    const allIssues = useMemo(() => {
        if (!data) return [];
        const issues: SupportIssueWithCustomer[] = [];
        data.customers.forEach(customer => {
            (customer.support_issues || []).forEach(issue => {
                issues.push({
                    ...issue,
                    customerName: customer.name,
                    customerId: customer.id
                });
            });
        });
        return issues;
    }, [data]);

    const sortOptions: SortOption<SupportIssueWithCustomer>[] = useMemo(() => [
        { label: 'Customer', key: 'customerName', getValue: (d) => d.customerName },
        { label: 'Description', key: 'description', getValue: (d) => d.description },
        { label: 'Status', key: 'status', getValue: (d) => d.status }
    ], []);

    const columns: ListColumn<SupportIssueWithCustomer>[] = useMemo(() => [
        { header: 'Customer', render: (d) => d.customerName, flex: 1.5 },
        { 
            header: 'Description', 
            render: (d) => {
                const today = new Date().toISOString().split('T')[0];
                const isNewToday = d.created_at?.startsWith(today);
                const isUpdatedToday = d.updated_at?.startsWith(today);
                
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{d.description}</span>
                        {isNewToday && (
                            <span style={{ 
                                fontSize: '10px', 
                                backgroundColor: '#10b981', 
                                color: 'white', 
                                padding: '2px 6px', 
                                borderRadius: '10px',
                                fontWeight: 'bold',
                                textTransform: 'uppercase'
                            }}>New</span>
                        )}
                        {!isNewToday && isUpdatedToday && (
                            <span style={{ 
                                fontSize: '10px', 
                                backgroundColor: '#3b82f6', 
                                color: 'white', 
                                padding: '2px 6px', 
                                borderRadius: '10px',
                                fontWeight: 'bold',
                                textTransform: 'uppercase'
                            }}>Updated</span>
                        )}
                    </div>
                );
            }, 
            flex: 3 
        },
        { 
            header: 'Status', 
            render: (d) => (
                <span style={{ 
                    padding: '2px 8px', 
                    borderRadius: '4px', 
                    backgroundColor: d.status === 'done' ? '#22c55e' : 
                                   d.status === 'to do' ? '#ef4444' : 
                                   d.status === 'work in progress' ? '#f59e0b' : '#3b82f6',
                    fontSize: '11px',
                    color: 'white',
                    display: 'inline-block'
                }}>
                    {d.status}
                </span>
            ), 
            flex: 1 
        },
        {
            header: 'Updated',
            render: (d) => d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '-',
            flex: 1
        }
    ], []);

    return (
        <GenericListPage<SupportIssueWithCustomer>
            title="Support Issues"
            items={allIssues}
            loading={loading}
            filterPlaceholder="Filter issues by description or customer..."
            filterPredicate={(d, query) => 
                d.description.toLowerCase().includes(query.toLowerCase()) || 
                d.customerName.toLowerCase().includes(query.toLowerCase())
            }
            sortOptions={sortOptions}
            onItemClick={(d) => navigate(`/customer/${d.customerId}?tab=support&issueId=${d.id}`)}
            columns={columns}
            emptyMessage="No manual support issues tracked."
            loadingMessage="Loading support issues..."
        />
    );
};
