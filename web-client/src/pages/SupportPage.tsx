import React, { useMemo, useEffect, useState } from 'react';
import type { ValueStreamData, Customer, SupportIssue } from '@valuestream/shared-types';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';
import { useNavigate, useLocation } from 'react-router-dom';
import { llmGenerate, gleanAuthLogin, gleanAuthStatus, gleanChat } from '../utils/api';
import { generateId } from '../utils/security';
import { useNotificationContext } from '../contexts/NotificationContext';
import { extractFirstJSONObject } from '../utils/businessLogic';

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

interface LLMIssue {
    summary: string;
    impact: string;
    rootCause: string;
    jiraTickets?: string[];
}

interface LLMCustomer {
    name: string;
    customerId?: string;
    issues: LLMIssue[];
}

interface LLMResults {
    customers: LLMCustomer[];
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
    const location = useLocation();
    const { showAlert } = useNotificationContext();
    const [isAISearching, setIsAISearching] = useState(false);
    const [searchProgress, setSearchProgress] = useState<string | null>(null);
    const [streamingText, setStreamingText] = useState<string>('');
    const [aiResults, setAiResults] = useState<LLMResults | null>(null);
    const [showAIResults, setShowAIResults] = useState(false);
    const [isGleanAuthenticated, setIsGleanAuthenticated] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newIssueCustomerId, setNewIssueCustomerId] = useState('');
    const [newIssueDescription, setNewIssueDescription] = useState('');
    const [newIssueStatus, setNewIssueStatus] = useState<SupportIssue['status']>('to do');
    const [showCsvModal, setShowCsvModal] = useState(false);
    const [csvDeleteNotFound, setCsvDeleteNotFound] = useState(false);
    const [csvUploading, setCsvUploading] = useState(false);

    // Check Glean status on mount and when query params change
    useEffect(() => {
        const checkStatus = async () => {
            if (data?.settings?.ai?.provider === 'glean' && data?.settings?.ai?.glean_url) {
                try {
                    const status = await gleanAuthStatus(data.settings.ai.glean_url);
                    setIsGleanAuthenticated(status);
                } catch (err) {
                    console.error('Failed to check Glean status:', err);
                }
            }
        };

        const params = new URLSearchParams(location.search);
        if (params.get('glean_auth') === 'success') {
            showAlert('Successfully authenticated with Glean!', 'success');
            navigate('/support', { replace: true });
        } else if (params.get('glean_error')) {
            showAlert(`Glean authentication failed: ${params.get('glean_error')}`, 'error');
            navigate('/support', { replace: true });
        }

        checkStatus();
    }, [data?.settings?.ai, location.search, navigate, showAlert]);

    const handleGleanLogin = async () => {
        if (!data?.settings?.ai?.glean_url) {
            showAlert('Glean URL not configured.', 'error');
            return;
        }
        try {
            await gleanAuthLogin(data.settings.ai.glean_url);
        } catch (err) {
            showAlert(`Glean login failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
    };

    const sortedCustomers = useMemo(() => {
        if (!data) return [];
        return [...data.customers].sort((a, b) => a.name.localeCompare(b.name));
    }, [data]);

    const handleOpenCreateForm = () => {
        setNewIssueCustomerId(sortedCustomers[0]?.id || '');
        setNewIssueDescription('');
        setNewIssueStatus('to do');
        setShowCreateForm(true);
    };

    const handleCreateIssue = async () => {
        if (!newIssueCustomerId || !newIssueDescription.trim() || !data) return;
        const customer = data.customers.find(c => c.id === newIssueCustomerId);
        if (!customer) return;

        const now = new Date().toISOString();
        const newIssue: SupportIssue = {
            id: generateId('si'),
            description: newIssueDescription,
            status: newIssueStatus,
            related_jiras: [],
            created_at: now,
            updated_at: now
        };

        const currentIssues = customer.support_issues || [];
        await updateCustomer(customer.id, { support_issues: [newIssue, ...currentIssues] }, true);
        setShowCreateForm(false);
        showAlert(`Created support issue for ${customer.name}`, 'success');
    };

    const parseCsvRows = (text: string): string[][] => {
        const rows: string[][] = [];
        let current: string[] = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < text.length && text[i + 1] === '"') {
                        field += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                current.push(field.trim());
                field = '';
            } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
                if (ch === '\r') i++;
                current.push(field.trim());
                field = '';
                if (current.some(c => c !== '')) rows.push(current);
                current = [];
            } else {
                field += ch;
            }
        }
        current.push(field.trim());
        if (current.some(c => c !== '')) rows.push(current);
        return rows;
    };

    const handleCsvUpsert = async (file: File) => {
        if (!data) return;
        setCsvUploading(true);
        try {
            const text = await file.text();
            const rows = parseCsvRows(text);
            if (rows.length < 2) {
                showAlert('CSV must contain a header row and at least one data row.', 'error');
                return;
            }

            const headers = rows[0];
            const customerIdx = headers.findIndex(h => h.toUpperCase() === 'CUSTOMER');
            if (customerIdx === -1) {
                showAlert('CSV must contain a CUSTOMER column.', 'error');
                return;
            }

            const supportFields = ['description', 'status', 'related_jiras', 'expiration_date'];
            const fieldMap: { header: string; field: string; idx: number }[] = [];
            headers.forEach((h, idx) => {
                if (idx === customerIdx) return;
                const lower = h.toLowerCase();
                if (supportFields.includes(lower)) {
                    fieldMap.push({ header: h, field: lower, idx });
                }
            });

            // Parse CSV rows into per-customer issue lists
            const customerIssues = new Map<string, SupportIssue[]>();
            const now = new Date().toISOString();

            for (let i = 1; i < rows.length; i++) {
                const values = rows[i];
                const customerId = values[customerIdx];
                if (!customerId) continue;

                const issue: Record<string, unknown> = {};
                for (const fm of fieldMap) {
                    const val = values[fm.idx] || '';
                    if (fm.field === 'related_jiras') {
                        issue[fm.field] = val ? val.split(';').map(j => j.trim()).filter(Boolean) : [];
                    } else {
                        issue[fm.field] = val;
                    }
                }

                // Auto-generate id and apply defaults for missing columns
                issue.id = generateId('si');
                if (!issue.description) issue.description = '';
                if (!issue.status) issue.status = 'to do';
                if (!issue.related_jiras) issue.related_jiras = [];
                issue.created_at = now;
                issue.updated_at = now;

                const arr = customerIssues.get(customerId) || [];
                arr.push(issue as unknown as SupportIssue);
                customerIssues.set(customerId, arr);
            }

            // Upsert for each customer
            let imported = 0;
            let deleted = 0;
            for (const customer of data.customers) {
                const csvIssues = customerIssues.get(customer.id);
                const existing = customer.support_issues || [];

                if (csvIssues) {
                    // Replace existing issues with CSV content; keep existing if delete not checked
                    const merged = csvDeleteNotFound ? csvIssues : [...existing, ...csvIssues];
                    if (csvDeleteNotFound) deleted += existing.length;
                    imported += csvIssues.length;
                    await updateCustomer(customer.id, { support_issues: merged }, true);
                    customerIssues.delete(customer.id);
                } else if (csvDeleteNotFound && existing.length > 0) {
                    // Customer not in CSV — delete all their issues if checkbox checked
                    deleted += existing.length;
                    await updateCustomer(customer.id, { support_issues: [] }, true);
                }
            }

            // Report any customer IDs in CSV that don't match existing customers
            const unmatchedIds = Array.from(customerIssues.keys());
            let msg = `CSV import complete: ${imported} issues imported`;
            if (deleted > 0) msg += `, ${deleted} previous issues removed`;
            if (unmatchedIds.length > 0) msg += `. Unmatched customer IDs: ${unmatchedIds.join(', ')}`;
            showAlert(msg, unmatchedIds.length > 0 ? 'warning' : 'success');
            setShowCsvModal(false);
        } catch (err) {
            showAlert(`CSV import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        } finally {
            setCsvUploading(false);
        }
    };

    const handleExportCsv = () => {
        if (!data) return;
        const headers = ['CUSTOMER', 'description', 'status', 'related_jiras', 'expiration_date'];
        const escCsv = (val: string) => {
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        };

        const rows = [headers.join(',')];
        for (const customer of data.customers) {
            for (const issue of customer.support_issues || []) {
                rows.push([
                    escCsv(customer.id),
                    escCsv(issue.description || ''),
                    escCsv(issue.status || ''),
                    escCsv((issue.related_jiras || []).join(';')),
                    escCsv(issue.expiration_date || '')
                ].join(','));
            }
        }

        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'support_issues.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showAlert('CSV exported successfully.', 'success');
    };

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

    const handleAISearch = async () => {
        if (!data?.settings?.ai?.support?.prompt) {
            showAlert('AI Support prompt not defined in settings.', 'error');
            return;
        }

        if (data.settings.ai.provider === 'glean' && !isGleanAuthenticated) {
            showAlert('Please connect to Glean first.', 'error');
            return;
        }

        setIsAISearching(true);
        setSearchProgress('Preparing search prompt...');
        setStreamingText('');
        try {
            const schema = {
                "$schema": "https://json-schema.org/draft/2020-12/schema",
                "title": "CustomerIssues",
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "customers": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["name", "issues"],
                            "properties": {
                                "name": { "type": "string", "description": "Customer display name" },
                                "customerId": { "type": "string", "description": "Unique organization identifier" },
                                "issues": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": false,
                                        "required": ["summary", "impact", "rootCause"],
                                        "properties": {
                                            "summary": { "type": "string", "description": "Short description of the issue" },
                                            "impact": { "type": "string", "description": "Business/technical impact of the issue" },
                                            "rootCause": { "type": "string", "description": "Root cause analysis" },
                                            "jiraTickets": {
                                                "type": "array",
                                                "description": "Associated Jira ticket keys",
                                                "items": { "type": "string", "pattern": "^[A-Z][A-Z0-9_]+-[0-9]+$" }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                "required": ["customers"]
            };

            const prompt = `${data.settings.ai.support.prompt}\n\nReturn ONLY a JSON object matching this schema. IMPORTANT: DO NOT use ellipses (...) in your response; provide complete data or omit the field if unknown.\n\nSchema:\n${JSON.stringify(schema, null, 2)}`;
            
            let resultText: string;
            if (data.settings.ai.provider === 'glean' && data.settings.ai.glean_url) {
                setSearchProgress('Contacting Glean AI...');
                const chatRes = await gleanChat(data.settings.ai.glean_url, prompt, (text) => {
                    setStreamingText(text);
                });
                const aiMessage = chatRes.messages?.reverse().find((m: { author: string; fragments?: { text: string }[] }) => m.author === 'GLEAN_AI');
                resultText = aiMessage?.fragments?.[0]?.text || JSON.stringify(chatRes);
            } else {
                setSearchProgress(`Contacting ${data.settings.ai.provider} LLM...`);
                resultText = await llmGenerate(prompt, data.settings);
            }
            
            setSearchProgress('Analyzing and parsing results...');
            if (!resultText) {
                throw new Error('AI returned an empty response.');
            }

            // Extract JSON from potential markdown code blocks or raw text
            const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/);
            const jsonStr = extractFirstJSONObject(jsonMatch ? jsonMatch[1] : resultText);
            
            try {
                const results: LLMResults = JSON.parse(jsonStr);
                setSearchProgress(`Found issues for ${results.customers?.length || 0} customers.`);
                setAiResults(results);
                setShowAIResults(true);
            } catch (e) {
                console.error('Failed to parse AI JSON:', e, 'Original text:', resultText);
                throw new Error(`Failed to parse AI response as JSON: ${e instanceof Error ? e.message : String(e)}`);
            }
        } catch (err) {
            console.error('AI search failed:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            showAlert(`AI Search failed: ${errorMessage}`, 'error');
        } finally {
            setIsAISearching(false);
            setSearchProgress(null);
        }
    };

    const removeProcessedIssue = (customerId: string | undefined, summary: string) => {
        if (!aiResults) return;
        
        const updatedCustomers = aiResults.customers.map(c => {
            if (c.customerId === customerId) {
                return {
                    ...c,
                    issues: c.issues.filter(i => i.summary !== summary)
                };
            }
            return c;
        }).filter(c => c.issues.length > 0);

        setAiResults({ customers: updatedCustomers });
    };

    const handleCreateSupportItem = async (customer: Customer, llmIssue: LLMIssue, customerId: string | undefined) => {
        const newIssue: SupportIssue = {
            id: generateId('si'),
            description: `${llmIssue.summary}\n\nImpact: ${llmIssue.impact}\nRoot Cause: ${llmIssue.rootCause}`,
            status: 'to do',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            related_jiras: llmIssue.jiraTickets || []
        };

        const updatedIssues = [...(customer.support_issues || []), newIssue];
        await updateCustomer(customer.id, { support_issues: updatedIssues }, true);
        removeProcessedIssue(customerId, llmIssue.summary);
        showAlert(`Created support item for ${customer.name}`, 'success');
    };

    const handleUpdateSupportItem = async (customer: Customer, issueId: string, llmIssue: LLMIssue, customerId: string | undefined) => {
        const updatedIssues = (customer.support_issues || []).map(issue => {
            if (issue.id === issueId) {
                return {
                    ...issue,
                    description: `${issue.description}\n\n--- AI Update ---\n${llmIssue.summary}\n\nImpact: ${llmIssue.impact}\nRoot Cause: ${llmIssue.rootCause}`,
                    updated_at: new Date().toISOString(),
                    related_jiras: Array.from(new Set([...(issue.related_jiras || []), ...(llmIssue.jiraTickets || [])]))
                };
            }
            return issue;
        });

        await updateCustomer(customer.id, { support_issues: updatedIssues }, true);
        removeProcessedIssue(customerId, llmIssue.summary);
        showAlert(`Updated support item for ${customer.name}`, 'success');
    };

    const findCustomerMatch = (llmCustomer: LLMCustomer) => {
        if (!data) return null;
        
        const lName = llmCustomer.name.toLowerCase().trim();
        
        // Try pairing by customerId (customer_id in our model)
        if (llmCustomer.customerId && llmCustomer.customerId.trim() !== '') {
            const match = data.customers.find(c => c.customer_id === llmCustomer.customerId);
            if (match) return match;
        }
        
        // Try pairing by name
        const match = data.customers.find(c => {
            const cName = c.name.toLowerCase().trim();
            return cName === lName || cName.includes(lName) || lName.includes(cName);
        });

        return match || null;
    };

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

    const renderAIResults = () => {
        if (!isAISearching && (!showAIResults || !aiResults)) return null;

        return (
            <div style={{ 
                marginTop: '16px', 
                backgroundColor: 'var(--bg-secondary)', 
                borderRadius: '8px', 
                border: '1px solid var(--border-primary)',
                padding: '16px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, color: 'var(--accent-primary)' }}>
                        {isAISearching ? `AI Search in Progress: ${searchProgress || ''}` : 'AI Search Results'}
                    </h3>
                    {!isAISearching && (
                        <button 
                            className="btn-secondary" 
                            onClick={() => setShowAIResults(false)}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                            Hide
                        </button>
                    )}
                </div>

                {isAISearching && streamingText && (
                    <div style={{ 
                        marginBottom: '20px', 
                        padding: '12px', 
                        backgroundColor: 'rgba(0,0,0,0.2)', 
                        borderRadius: '6px',
                        border: '1px dashed var(--border-secondary)',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        color: 'var(--text-secondary)'
                    }}>
                        <div style={{ color: 'var(--accent-primary)', marginBottom: '8px', fontWeight: 'bold', fontSize: '10px', textTransform: 'uppercase' }}>
                            Raw Stream:
                        </div>
                        {streamingText}
                    </div>
                )}
                
                {!isAISearching && aiResults && (
                    <>
                        {!aiResults.customers ? (
                            <div style={{ padding: '20px', backgroundColor: 'rgba(255,0,0,0.1)', borderRadius: '6px', border: '1px solid var(--status-danger)' }}>
                                <div style={{ color: 'var(--status-danger)', fontWeight: 'bold', marginBottom: '8px' }}>Invalid AI Response Format</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '12px' }}>
                                    The AI returned a response but it did not match the required JSON schema (missing "customers" property).
                                </div>
                                <div style={{ fontSize: '12px', fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '4px', overflowX: 'auto' }}>
                                    {JSON.stringify(aiResults, null, 2)}
                                </div>
                            </div>
                        ) : aiResults.customers.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No new issues found by AI.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {aiResults.customers.map((lc, i) => {
                                    const match = findCustomerMatch(lc);
                                    return (
                                        <div key={i} style={{ borderBottom: '1px solid var(--border-secondary)', paddingBottom: '16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{lc.name}</span>
                                                {lc.customerId && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({lc.customerId})</span>}
                                                {match ? (
                                                    <span style={{ fontSize: '10px', backgroundColor: 'var(--status-success)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>MATCHED: {match.name}</span>
                                                ) : (
                                                    <span style={{ fontSize: '10px', backgroundColor: 'var(--status-danger)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>NO MATCH</span>
                                                )}
                                            </div>
                                            
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginLeft: '16px' }}>
                                                {lc.issues.map((issue, j) => (
                                                    <div key={j} style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '6px', borderLeft: '3px solid var(--accent-primary)' }}>
                                                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '4px' }}>{issue.summary}</div>
                                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                                            <strong>Impact:</strong> {issue.impact}<br/>
                                                            <strong>Root Cause:</strong> {issue.rootCause}
                                                        </div>
                                                        {issue.jiraTickets && issue.jiraTickets.length > 0 && (
                                                            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                                                                {issue.jiraTickets.map(key => (
                                                                    <span key={key} style={{ fontSize: '10px', backgroundColor: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>{key}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <button
                                                                className="btn-danger"
                                                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                onClick={() => removeProcessedIssue(lc.customerId, issue.summary)}
                                                            >
                                                                Dismiss
                                                            </button>
                                                            {match && (
                                                                <>
                                                                    <button
                                                                        className="btn-primary"
                                                                        style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                        onClick={() => handleCreateSupportItem(match, issue, lc.customerId)}
                                                                    >
                                                                        Create New
                                                                    </button>

                                                                    {match.support_issues && match.support_issues.length > 0 && (
                                                                        <select
                                                                            style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                            onChange={(e) => {
                                                                                if (e.target.value) {
                                                                                    handleUpdateSupportItem(match, e.target.value, issue, lc.customerId);
                                                                                    e.target.value = '';
                                                                                }
                                                                            }}
                                                                        >
                                                                            <option value="">Update existing...</option>
                                                                            {match.support_issues.map(si => (
                                                                                <option key={si.id} value={si.id}>{si.description.substring(0, 40)}...</option>
                                                                            ))}
                                                                        </select>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    const renderCreateForm = () => {
        if (!showCreateForm) return null;
        return (
            <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '2px solid var(--accent-primary)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '8px',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start'
            }}>
                <div style={{ minWidth: '180px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Customer</label>
                    <select
                        value={newIssueCustomerId}
                        onChange={e => setNewIssueCustomerId(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-hover)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' }}
                    >
                        {sortedCustomers.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</label>
                    <textarea
                        value={newIssueDescription}
                        onChange={e => setNewIssueDescription(e.target.value)}
                        rows={2}
                        placeholder="Describe the support issue..."
                        autoFocus
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-hover)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit', fontSize: '13px' }}
                    />
                </div>
                <div style={{ minWidth: '160px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</label>
                    <select
                        value={newIssueStatus}
                        onChange={e => setNewIssueStatus(e.target.value as SupportIssue['status'])}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-hover)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' }}
                    >
                        <option value="to do">To Do</option>
                        <option value="work in progress">Work in Progress</option>
                        <option value="noop">No-op</option>
                        <option value="waiting for customer">Waiting for Customer</option>
                        <option value="waiting for other party">Waiting for Other Party</option>
                        <option value="done">Done</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: '8px', paddingTop: '18px' }}>
                    <button
                        className="btn-primary"
                        onClick={handleCreateIssue}
                        disabled={!newIssueCustomerId || !newIssueDescription.trim()}
                    >
                        Save
                    </button>
                    <button
                        className="btn-secondary"
                        onClick={() => setShowCreateForm(false)}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    };

    const renderCsvModal = () => {
        if (!showCsvModal) return null;
        const fileInputRef = React.createRef<HTMLInputElement>();
        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'var(--bg-shadow)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', zIndex: 2000
            }} onClick={() => setShowCsvModal(false)}>
                <div style={{
                    backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                    borderRadius: '8px', padding: '24px', width: '440px', maxWidth: '90%',
                    color: 'var(--text-primary)', boxShadow: '0 20px 25px -5px var(--bg-shadow)'
                }} onClick={e => e.stopPropagation()}>
                    <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '10px' }}>
                        Upsert Support Issues from CSV
                    </h2>
                    <div style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        CSV must have a header row with a <strong>CUSTOMER</strong> column.
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', cursor: 'pointer', fontSize: '14px' }}>
                        <input
                            type="checkbox"
                            checked={csvDeleteNotFound}
                            onChange={e => setCsvDeleteNotFound(e.target.checked)}
                        />
                        Delete support issues not found in CSV
                    </label>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button className="btn-secondary" onClick={() => setShowCsvModal(false)}>Cancel</button>
                        <button
                            className="btn-primary"
                            disabled={csvUploading}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {csvUploading ? 'Uploading...' : 'Select CSV File'}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            style={{ display: 'none' }}
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleCsvUpsert(file);
                                e.target.value = '';
                            }}
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
        {renderCsvModal()}
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
            additionalControls={
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className="btn-primary"
                        onClick={handleOpenCreateForm}
                        style={{ minWidth: '130px' }}
                    >
                        + Create Issue
                    </button>
                    <button
                        className="btn-primary"
                        onClick={() => { setCsvDeleteNotFound(false); setShowCsvModal(true); }}
                        style={{ minWidth: '130px' }}
                    >
                        Upsert from CSV
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleExportCsv}
                        style={{ minWidth: '130px' }}
                    >
                        Export CSV
                    </button>
                    {data?.settings?.ai?.provider && data?.settings?.ai?.support?.prompt && (
                        <>
                            {data.settings.ai.provider === 'glean' && !isGleanAuthenticated && (
                                <button
                                    className="btn-primary"
                                    onClick={handleGleanLogin}
                                    style={{ minWidth: '160px' }}
                                >
                                    Connect Glean
                                </button>
                            )}
                            <button
                                className="btn-primary"
                                onClick={handleAISearch}
                                disabled={isAISearching || (data.settings.ai.provider === 'glean' && !isGleanAuthenticated)}
                                style={{ minWidth: '160px' }}
                            >
                                {isAISearching ? (searchProgress || 'AI Searching...') : 'AI Support Search'}
                            </button>
                        </>
                    )}
                </div>
            }
            renderBelowControls={renderAIResults}
            renderAboveList={renderCreateForm}
            emptyMessage="No support issues tracked."
            loadingMessage="Loading support issues..."
        />
        </>
    );
};
