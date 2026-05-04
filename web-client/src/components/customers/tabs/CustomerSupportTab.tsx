import React, { useState } from 'react';
import type { Customer, SupportIssue, JiraIssue, ValueStreamData } from '@valuestream/shared-types';
import type { CustomerHealthData } from '../../../hooks/useCustomerHealth';
import { generateId } from '../../../utils/security';
import { buildSupportStatusPatch } from '../../../utils/businessLogic';
import customerStyles from '../CustomerPage.module.css';

interface JiraKeysInputProps {
    value: string[];
    onChange: (newValue: string[]) => void;
    jiraBaseUrl?: string;
}

const JiraKeysInput: React.FC<JiraKeysInputProps> = ({ value, onChange, jiraBaseUrl }) => {
    const [inputValue, setInputValue] = useState(value.join(', '));
    const [prevValueJoined, setPrevValueJoined] = useState(value.join(', '));

    const valueJoined = value.join(', ');
    if (valueJoined !== prevValueJoined) {
        setPrevValueJoined(valueJoined);
        if (valueJoined !== inputValue && !inputValue.endsWith(',') && !inputValue.endsWith(', ')) {
            setInputValue(valueJoined);
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        const keys = val.split(',').map(s => s.trim()).filter(Boolean);
        onChange(keys);
    };

    return (
        <div style={{ flex: 1, marginRight: '16px' }}>
            <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Related Jiras (comma separated keys)</label>
            <input
                type="text"
                value={inputValue}
                onChange={handleChange}
                placeholder="e.g. PROJ-123, PROJ-456"
                style={{ width: '100%', backgroundColor: 'var(--bg-primary)' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                {value.map(key => (
                    <a
                        key={key}
                        href={`${jiraBaseUrl}/browse/${key}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '12px', color: 'var(--accent-text)', textDecoration: 'none', backgroundColor: 'var(--accent-primary-bg)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--accent-primary-bg)' }}
                    >
                        {key} ↗
                    </a>
                ))}
            </div>
        </div>
    );
};

interface Props {
    customer: Customer | undefined;
    data: ValueStreamData | null;
    updateCustomer: (id: string, updates: Partial<Customer>, immediate?: boolean) => Promise<void>;
    healthData: CustomerHealthData;
}

export const CustomerSupportTab: React.FC<Props> = ({ customer, data, updateCustomer, healthData }) => {
    const handleLinkJira = async (jiraIssue: JiraIssue, targetId: string) => {
        if (!targetId || !customer) return;

        if (targetId === 'NEW') {
            const now = new Date().toISOString();
            const newIssue: SupportIssue = {
                id: generateId('issue'),
                description: jiraIssue.summary,
                status: 'to do',
                related_jiras: [jiraIssue.key],
                created_at: now,
                updated_at: now
            };
            const currentIssues = customer.support_issues || [];
            await updateCustomer(customer.id, { support_issues: [newIssue, ...currentIssues] });
        } else {
            const currentIssues = [...(customer.support_issues || [])];
            const issueIndex = currentIssues.findIndex(si => si.id === targetId);
            if (issueIndex > -1) {
                const existingJiras = currentIssues[issueIndex].related_jiras || [];
                if (!existingJiras.includes(jiraIssue.key)) {
                    currentIssues[issueIndex] = {
                        ...currentIssues[issueIndex],
                        related_jiras: [...existingJiras, jiraIssue.key],
                        updated_at: new Date().toISOString()
                    };
                    await updateCustomer(customer.id, { support_issues: currentIssues });
                }
            }
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ border: 'none', margin: 0, fontSize: '18px', color: 'var(--text-highlight)' }}>Support Issues</h2>
                    <button
                        className="btn-primary"
                        onClick={() => {
                            if (customer) {
                                const now = new Date().toISOString();
                                const newIssue: SupportIssue = {
                                    id: generateId('issue'),
                                    description: '',
                                    status: 'to do',
                                    related_jiras: [],
                                    expiration_date: undefined,
                                    created_at: now,
                                    updated_at: now
                                };
                                const currentIssues = customer.support_issues || [];
                                updateCustomer(customer.id, { support_issues: [newIssue, ...currentIssues] });
                            }
                        }}
                    >
                        + Add Issue
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {(customer?.support_issues || []).map((issue, idx) => {
                        const updateIssue = (updates: Partial<SupportIssue>) => {
                            if (customer) {
                                const newIssues = [...(customer.support_issues || [])];
                                newIssues[idx] = { ...issue, ...updates, updated_at: new Date().toISOString() };
                                updateCustomer(customer.id, { support_issues: newIssues });
                            }
                        };

                        return (
                            <div key={issue.id} id={`issue-${issue.id}`} className={customerStyles.addWorkItemBox} style={{ backgroundColor: 'var(--bg-tertiary)', padding: '20px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '16px' }}>
                                    <textarea
                                        value={issue.description}
                                        onChange={e => updateIssue({ description: e.target.value })}
                                        placeholder="Describe the issue..."
                                        style={{ minHeight: '80px', backgroundColor: 'var(--bg-primary)' }}
                                    ></textarea>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Status</label>
                                            <select
                                                value={issue.status}
                                                onChange={e => {
                                                    const newStatus = e.target.value as SupportIssue['status'];
                                                    updateIssue(buildSupportStatusPatch(issue, newStatus));
                                                }}
                                            >
                                                <option value="to do">To Do</option>
                                                <option value="work in progress">Work in Progress</option>
                                                <option value="noop">Noop</option>
                                                <option value="waiting for customer">Waiting for Customer</option>
                                                <option value="waiting for other party">Waiting for Other Party</option>
                                                <option value="done">Done</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Expiration Date</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <input
                                                    type="date"
                                                    value={issue.expiration_date || ''}
                                                    onChange={e => updateIssue({ expiration_date: e.target.value || undefined })}
                                                    style={{ flex: 1 }}
                                                />
                                                {issue.expiration_date && (
                                                    <button
                                                        className="btn-danger"
                                                        onClick={() => updateIssue({ expiration_date: undefined })}
                                                        title="Remove Expiration Date"
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: '14px',
                                                            minWidth: 'auto'
                                                        }}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', borderTop: '1px solid var(--border-secondary)', paddingTop: '12px' }}>
                                    <JiraKeysInput value={issue.related_jiras || []} onChange={keys => updateIssue({ related_jiras: keys })} jiraBaseUrl={data?.settings?.jira?.base_url} />
                                    <button className="btn-danger" onClick={() => {
                                        if (customer) {
                                            const newIssues = (customer.support_issues || []).filter((_, i) => i !== idx);
                                            updateCustomer(customer.id, { support_issues: newIssues });
                                        }
                                    }}>Remove</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {healthData.healthStatus !== 'Unknown' && (
                <div>
                    <h2 style={{ marginBottom: '16px', fontSize: '18px', color: 'var(--text-highlight)' }}>Support Overview (Jira)</h2>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ flex: 1, padding: '12px', borderRadius: '6px', backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)', border: '1px solid var(--status-danger)' }}>
                            <strong>{healthData.newIssues.length}</strong> New / Untriaged
                        </div>
                        <div style={{ flex: 1, padding: '12px', borderRadius: '6px', backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning)', border: '1px solid var(--status-warning)' }}>
                            <strong>{healthData.inProgressIssues.length}</strong> In Progress
                        </div>
                        <div style={{ flex: 1, padding: '12px', borderRadius: '6px', backgroundColor: 'var(--accent-primary-bg)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }}>
                            <strong>{healthData.noopIssues.length}</strong> Blocked / Pending
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[...healthData.newIssues, ...healthData.inProgressIssues, ...healthData.noopIssues].map(issue => {
                            const isLinked = (customer?.support_issues || []).some(si => si.related_jiras?.includes(issue.key));

                            return (
                                <div key={issue.key} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px',
                                    backgroundColor: 'var(--bg-secondary)',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-primary)'
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <a href={issue.url} target="_blank" rel="noreferrer" style={{ fontWeight: 'bold', color: 'var(--accent-text)', textDecoration: 'none' }}>
                                                {issue.key}
                                            </a>
                                            <span style={{
                                                fontSize: '10px',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                backgroundColor: issue.category === 'new' ? 'var(--status-danger)' : (issue.category === 'in_progress' ? 'var(--status-warning)' : 'var(--accent-primary)'),
                                                color: 'white',
                                                fontWeight: 'bold'
                                            }}>
                                                {issue.status}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '13px' }}>{issue.summary}</span>
                                    </div>

                                    {!isLinked && (
                                        <select
                                            style={{ width: '420px', maxWidth: '50%', fontSize: '12px' }}
                                            value=""
                                            onChange={(e) => handleLinkJira(issue, e.target.value)}
                                        >
                                            <option value="" disabled>Link to...</option>
                                            <option value="NEW">+ Create New Support Issue</option>
                                            {customer?.support_issues?.map(si => {
                                                const desc = (si.description || '').replace(/\s+/g, ' ').trim();
                                                const label = desc.length > 80 ? `${desc.slice(0, 80)}…` : (desc || '(no description)');
                                                return (
                                                    <option key={si.id} value={si.id} title={si.description}>Link to: {label}</option>
                                                );
                                            })}
                                        </select>
                                    )}
                                    {isLinked && (
                                        <span style={{ fontSize: '11px', color: 'var(--status-success)', fontWeight: 'bold' }}>✓ Linked</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
