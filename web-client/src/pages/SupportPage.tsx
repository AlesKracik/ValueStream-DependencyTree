import React, { useMemo, useEffect } from 'react';
import type { ValueStreamData, SupportIssue, Customer } from '../types/models';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';
import { useNavigate } from 'react-router-dom';

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
    updateCustomer: (id: string, updates: Partial<Customer>, immediate?: boolean) => Promise<void>;
}

interface SupportIssueWithCustomer extends SupportIssue {
    customerName: string;
    customerId: string;
    category: number;
    activity: 'new' | 'updated' | 'none';
}

const STATUS_ORDER: Record<SupportIssue['status'], number> = {
    'to do': 0,
    'work in progress': 1,
    'noop': 2,
    'waiting for customer': 3,
    'waiting for other party': 4,
    'done': 5
};

const ACTIVITY_ORDER: Record<SupportIssueWithCustomer['activity'], number> = {
    'new': 0,
    'updated': 1,
    'none': 2
};

export const SupportPage: React.FC<Props> = ({ data, loading, updateCustomer }) => {
    const navigate = useNavigate();

    // Automatic cleanup of expired issues
    useEffect(() => {
        if (!data || loading) return;

        const today = new Date().toISOString().split('T')[0];
        
        data.customers.forEach(customer => {
            if (!customer.support_issues || customer.support_issues.length === 0) return;

            const validIssues = customer.support_issues.filter(issue => {
                if (!issue.expiration_date) return true;
                return issue.expiration_date >= today;
            });

            if (validIssues.length !== customer.support_issues.length) {
                console.log(`Cleaning up ${customer.support_issues.length - validIssues.length} expired issues for customer ${customer.name}`);
                updateCustomer(customer.id, { support_issues: validIssues }, true);
            }
        });
    }, [data, loading, updateCustomer]);

    const allIssues = useMemo(() => {
        if (!data) return [];
        const issues: SupportIssueWithCustomer[] = [];
        const today = new Date().toISOString().split('T')[0];
        
        // Find customer with highest combined TCV
        const maxCombinedTcv = Math.max(
            ...data.customers.map(c => (c.existing_tcv || 0) + (c.potential_tcv || 0)),
            0
        );

        data.customers.forEach(customer => {
            const combinedTcv = (customer.existing_tcv || 0) + (customer.potential_tcv || 0);
            let category = 1;
            if (maxCombinedTcv > 0) {
                const bandSize = maxCombinedTcv / 3;
                if (combinedTcv > bandSize * 2) {
                    category = 3;
                } else if (combinedTcv > bandSize) {
                    category = 2;
                }
            }

            (customer.support_issues || []).forEach(issue => {
                const isNewToday = issue.created_at?.startsWith(today);
                const isUpdatedToday = issue.updated_at?.startsWith(today);
                const activity = isNewToday ? 'new' : (isUpdatedToday ? 'updated' : 'none');

                issues.push({
                    ...issue,
                    customerName: customer.name,
                    customerId: customer.id,
                    category,
                    activity
                });
            });
        });
        return issues;
    }, [data]);

    const sortOptions: SortOption<SupportIssueWithCustomer>[] = useMemo(() => [
        { label: 'Customer', key: 'customerName', getValue: (d) => d.customerName },
        { label: 'TCV Rank', key: 'category', getValue: (d) => d.category.toString() },
        { label: 'Activity', key: 'activity', getValue: (d) => ACTIVITY_ORDER[d.activity].toString() },
        { label: 'Description', key: 'description', getValue: (d) => d.description },
        { 
            label: 'Status', 
            key: 'status', 
            getValue: (d) => {
                const normalized = (d.status || '').trim().toLowerCase();
                const order = STATUS_ORDER[normalized as SupportIssue['status']] ?? 99;
                return order.toString().padStart(2, '0');
            }
        }
    ], []);

    const columns: ListColumn<SupportIssueWithCustomer>[] = useMemo(() => [
        { 
            header: 'Customer', 
            render: (d) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{d.customerName}</span>
                    <span title={`TCV Category: ${d.category}`} style={{ fontSize: '14px', filter: 'grayscale(0.2)' }}>
                        {'💰'.repeat(d.category)}
                    </span>
                </div>
            ), 
            flex: 1.5 
        },
        {
            header: 'Activity',
            render: (d) => {
                if (d.activity === 'none') return null;
                const isNew = d.activity === 'new';
                return (
                    <span style={{ 
                        fontSize: '10px', 
                        backgroundColor: isNew ? '#10b981' : '#3b82f6', 
                        color: 'white', 
                        padding: '2px 6px', 
                        borderRadius: '10px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase'
                    }}>{isNew ? 'New' : 'Updated'}</span>
                );
            },
            flex: 0.6
        },
        { 
            header: 'Description', 
            render: (d) => d.description, 
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
