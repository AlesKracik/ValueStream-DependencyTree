import React, { useMemo, useEffect } from 'react';
import type { ValueStreamData, Customer } from '../types/models';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';
import { useNavigate } from 'react-router-dom';

interface Props {
    data: ValueStreamData | null;
    loading: boolean;
    updateCustomer: (id: string, updates: Partial<Customer>, immediate?: boolean) => Promise<void>;
}

interface SupportIssueWithCustomer {
    id: string;
    description: string;
    status: string;
    customerName: string;
    customerId: string;
    category: number;
    activity: 'new' | 'updated' | 'none';
    isJira: boolean;
    linkedJiras?: { key: string; status: string; url: string }[];
    created_at?: string;
    priority?: string;
    url?: string;
}

const STATUS_ORDER: Record<string, number> = {
    'to do': 0,
    'new': 0,
    'work in progress': 1,
    'in progress': 1,
    'in_progress': 1,
    'noop': 2,
    'waiting for customer': 3,
    'waiting for other party': 4,
    'done': 5,
    'resolved': 5,
    'closed': 5
};

const ACTIVITY_ORDER: Record<string, number> = {
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
            let tcvCategory = 1;
            if (maxCombinedTcv > 0) {
                const bandSize = maxCombinedTcv / 3;
                if (combinedTcv > bandSize * 2) {
                    tcvCategory = 3;
                } else if (combinedTcv > bandSize) {
                    tcvCategory = 2;
                }
            }

            // Manual Support Issues
            (customer.support_issues || []).forEach(issue => {
                const isNewToday = issue.created_at?.startsWith(today);
                const isUpdatedToday = issue.updated_at?.startsWith(today);
                const activity = isNewToday ? 'new' : (isUpdatedToday ? 'updated' : 'none');

                // Find linked Jira details from customer.jira_support_issues
                const linkedJiras = (issue.related_jiras || []).map(key => {
                    const jira = (customer.jira_support_issues || []).find(j => j.key === key);
                    return jira ? { key: jira.key, status: jira.status, url: jira.url } : { key, status: 'Unknown', url: '' };
                });

                issues.push({
                    id: issue.id,
                    description: issue.description,
                    status: issue.status,
                    customerName: customer.name,
                    customerId: customer.id,
                    category: tcvCategory,
                    activity,
                    isJira: false,
                    linkedJiras: linkedJiras.length > 0 ? linkedJiras : undefined,
                    created_at: issue.created_at
                });
            });
        });
        return issues;
    }, [data]);

    const sortOptions: SortOption<SupportIssueWithCustomer>[] = useMemo(() => [
        { label: 'Customer', key: 'customerName', getValue: (d) => d.customerName },
        { label: '💰', key: 'category', getValue: (d) => d.category.toString() },
        { label: 'Activity', key: 'activity', getValue: (d) => ACTIVITY_ORDER[d.activity].toString() },
        { label: 'Description', key: 'description', getValue: (d) => d.description },
        { 
            label: 'Status', 
            key: 'status', 
            getValue: (d) => {
                const normalized = (d.status || '').trim().toLowerCase();
                const order = STATUS_ORDER[normalized] ?? 99;
                return order.toString().padStart(2, '0');
            }
        }
    ], []);

    const columns: ListColumn<SupportIssueWithCustomer>[] = useMemo(() => [
        { 
            header: 'Customer', 
            render: (d) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{d.customerName}</span>
                </div>
            ), 
            flex: 1.5,
            sortKey: 'customerName'
        },
        {
            header: '💰',
            render: (d) => (
                <span title={`TCV Category: ${d.category}`} style={{ fontSize: '14px' }}>
                    {'💰'.repeat(d.category)}
                </span>
            ),
            flex: 0.5,
            sortKey: 'category'
        },
        {
            header: 'Activity',
            render: (d) => {
                if (d.activity === 'none') return null;
                const isNew = d.activity === 'new';
                return (
                    <span style={{ 
                        fontSize: '10px', 
                        backgroundColor: isNew ? 'var(--status-success)' : 'var(--accent-primary)', 
                        color: 'white', 
                        padding: '2px 6px', 
                        borderRadius: '10px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase'
                    }}>{isNew ? 'New' : 'Updated'}</span>
                );
            },
            flex: 0.6,
            sortKey: 'activity'
        },
        { 
            header: 'Description', 
            render: (d) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontWeight: 'normal', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{d.description}</span>
                    {d.linkedJiras && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {d.linkedJiras.map(jira => (
                                <div 
                                    key={jira.key} 
                                    onClick={() => {
                                        if (jira.url) {
                                            window.open(jira.url, '_blank');
                                        }
                                    }}
                                    style={{ 
                                        fontSize: '10px', 
                                        backgroundColor: 'var(--bg-tertiary)', 
                                        border: '1px solid var(--border-secondary)',
                                        borderRadius: '4px',
                                        padding: '1px 6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        cursor: jira.url ? 'pointer' : 'default',
                                        color: 'var(--text-primary)'
                                    }}
                                    title={`Jira Status: ${jira.status}`}
                                >
                                    <span style={{ fontWeight: 'bold' }}>{jira.key}</span>
                                    <span style={{ 
                                        fontSize: '9px', 
                                        color: 'var(--text-muted)',
                                        borderLeft: '1px solid var(--border-secondary)',
                                        paddingLeft: '4px',
                                        fontWeight: 'bold'
                                    }}>{jira.status}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ), 
            flex: 3,
            sortKey: 'description'
        },
        { 
            header: 'Status', 
            render: (d) => {
                const status = (d.status || '').toLowerCase();
                return (
                    <span style={{ 
                        padding: '2px 8px', 
                        borderRadius: '4px', 
                        backgroundColor: (status === 'done' || status === 'resolved' || status === 'closed') ? 'var(--status-success)' : 
                                       (status === 'to do' || status === 'new' || status === 'open') ? 'var(--status-danger)' : 
                                       (status === 'work in progress' || status === 'in progress' || status === 'in_progress' || status === 'active') ? 'var(--status-warning)' : 'var(--accent-primary)',
                        fontSize: '11px',
                        color: 'white',
                        display: 'inline-block',
                        fontWeight: 'bold'
                    }}>
                        {d.status}
                    </span>
                );
            }, 
            flex: 1,
            sortKey: 'status'
        }
    ], []);

    return (
        <GenericListPage<SupportIssueWithCustomer>
            pageId="support"
            title="Support Issues"
            items={allIssues}
            loading={loading}
            filterPlaceholder="Filter issues by description or customer..."
            filterPredicate={(d, query) => 
                d.description.toLowerCase().includes(query.toLowerCase()) || 
                d.customerName.toLowerCase().includes(query.toLowerCase()) ||
                (d.priority || '').toLowerCase().includes(query.toLowerCase()) ||
                (d.status || '').toLowerCase().includes(query.toLowerCase())
            }
            sortOptions={sortOptions}
            onItemClick={(d) => {
                if (d.isJira && d.url) {
                    window.open(d.url, '_blank');
                } else {
                    navigate(`/customer/${d.customerId}?tab=support&issueId=${d.id}`);
                }
            }}
            columns={columns}
            emptyMessage="No support issues tracked."
            loadingMessage="Loading support issues..."
        />
    );
};
