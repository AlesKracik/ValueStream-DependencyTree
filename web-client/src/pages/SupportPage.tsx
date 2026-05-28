import React, { useMemo, useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react';
import type { ValueStreamData, Customer, SupportIssue } from '@valuestream/shared-types';
import { GenericListPage } from '../components/common/GenericListPage';
import type { SortOption, ListColumn } from '../components/common/GenericListPage';
import { MultiSelectDropdown } from '../components/common/MultiSelectDropdown';
import { Pagination } from '../components/common/Pagination';
import { SettingsLink } from '../components/common/SettingsLink';
import { JiraLink } from '../components/common/JiraLink';
import { useNavigate, useLocation } from 'react-router-dom';
import { llmGenerate, gleanAuthLogin, gleanAuthStatus, gleanChat } from '../utils/api';
import { generateId } from '../utils/security';
import { useNotificationContext } from '../contexts/NotificationContext';
import { useUIStateContext } from '../contexts/UIStateContext';
import { extractFirstJSONObject, buildSupportStatusPatch, customerMoneyBagTcv, moneyBagFillRatio } from '../utils/businessLogic';

const DEFAULT_PAGE_SIZE = 25;
const SUPPORT_PAGE_ID = 'support';

interface SupportFilters {
    /** Free-text substring matched against the issue description AND the customer name. */
    name?: string;
    /** Customer combined-TCV range. */
    minTcv?: string;
    maxTcv?: string;
    /** Issue status (raw values from STATUS_OPTIONS). */
    status?: string[];
    /** 'new' | 'updated' | 'none' */
    activity?: string[];
}

interface SupportSort {
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

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
    /** Customer's money-bag TCV: existing TCV, or potential TCV when existing is 0.
     *  Drives sort and visible bag fill. See customerMoneyBagTcv. */
    totalTcv: number;
    /** The largest EXISTING TCV across all customers — the scale "whale" (for
     *  tooltip context). Potentials never raise this, so a prospect's bag is
     *  measured against realised revenue. */
    maxTcv: number;
    /** Sqrt-scaled bag fill: sqrt(totalTcv / maxTcv). Sqrt sits between linear
     *  (which crushes small customers near 0) and log (which crushes everyone near max),
     *  giving a usable spread across all three bag slots even with wide TCV ranges.
     *  Usually ∈ [0, 1], but a prospect whose potential exceeds the max existing TCV
     *  can exceed 1 — the three-slot render clamps each slot, capping at 3 bags. */
    tcvRatio: number;
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
    'waiting for release': 5,
    'done': 6,
    'resolved': 6,
    'closed': 6
};

const ACTIVITY_ORDER: Record<string, number> = {
    'new': 0,
    'updated': 1,
    'none': 2
};

const STATUS_OPTIONS: { value: SupportIssue['status']; label: string }[] = [
    { value: 'to do', label: 'To Do' },
    { value: 'work in progress', label: 'Work in Progress' },
    { value: 'noop', label: 'No-op' },
    { value: 'waiting for customer', label: 'Waiting for Customer' },
    { value: 'waiting for other party', label: 'Waiting for Other Party' },
    { value: 'waiting for release', label: 'Waiting for Release' },
    { value: 'done', label: 'Done' },
];

const statusBadgeColor = (status: string): string => {
    const s = (status || '').toLowerCase();
    if (s === 'done' || s === 'resolved' || s === 'closed') return 'var(--status-success)';
    if (s === 'to do' || s === 'new' || s === 'open') return 'var(--status-danger)';
    if (s === 'work in progress' || s === 'in progress' || s === 'in_progress' || s === 'active') return 'var(--status-warning)';
    if (s === 'noop' || s.startsWith('waiting')) return 'var(--status-info)';
    return 'var(--accent-primary)';
};

// Textarea that resizes itself to fit its content. Using `rows` would only count
// explicit "\n" — it can't see word-wrapped lines, so long single-line descriptions
// got clipped. scrollHeight reflects the actual rendered content height (including
// wrapped lines) so the textarea grows to show everything.
const AutoGrowTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [props.value]);
    return <textarea ref={ref} {...props} />;
};

export const SupportPage: React.FC<Props> = ({ data, loading, updateCustomer }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { showAlert } = useNotificationContext();
    const { uiState: uiStateForSupport, updateUiState: updateUiStateForSupport } = useUIStateContext();
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
    const [showImportModal, setShowImportModal] = useState(false);
    const [deleteNotFound, setDeleteNotFound] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Per-row drafts for the inline-editable description textarea. The textarea reads from
    // the draft if present, else from the underlying issue. Drafts are cleared on commit.
    const [descriptionDrafts, setDescriptionDrafts] = useState<Record<string, string>>({});

    const updateIssueOnCustomer = useCallback(async (
        customerId: string,
        issueId: string,
        patch: Partial<SupportIssue>
    ) => {
        const customer = data?.customers.find(c => c.id === customerId);
        if (!customer) return;
        const updated = (customer.support_issues || []).map(si =>
            si.id === issueId
                ? { ...si, ...patch, updated_at: new Date().toISOString() }
                : si
        );
        await updateCustomer(customerId, { support_issues: updated }, true);
    }, [data, updateCustomer]);

    const commitDescription = useCallback(async (customerId: string, issueId: string, currentValue: string) => {
        const draft = descriptionDrafts[issueId];
        // Drop the draft regardless so the field re-syncs with server state on next render.
        setDescriptionDrafts(prev => {
            const next = { ...prev };
            delete next[issueId];
            return next;
        });
        if (draft === undefined || draft === currentValue) return;
        await updateIssueOnCustomer(customerId, issueId, { description: draft });
    }, [descriptionDrafts, updateIssueOnCustomer]);

    const handleStatusChange = useCallback(async (
        customerId: string,
        issueId: string,
        newStatus: SupportIssue['status']
    ) => {
        const customer = data?.customers.find(c => c.id === customerId);
        const issue = customer?.support_issues?.find(si => si.id === issueId);
        if (!issue) return;
        // Use the shared helper so the inline list and the customer detail page apply
        // the same "moving to Done schedules an auto-expiration" rule.
        await updateIssueOnCustomer(customerId, issueId, buildSupportStatusPatch(issue, newStatus));
    }, [data, updateIssueOnCustomer]);

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

    const handleJsonUpsert = async (file: File) => {
        if (!data) return;
        setUploading(true);
        try {
            const text = await file.text();
            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                showAlert('Invalid JSON file.', 'error');
                return;
            }

            if (!Array.isArray(parsed)) {
                showAlert('JSON must be an array of issue objects with a "customer" field.', 'error');
                return;
            }

            const customerIssues = new Map<string, SupportIssue[]>();
            const now = new Date().toISOString();

            for (const raw of parsed) {
                const customerId = raw.customer;
                if (!customerId || typeof customerId !== 'string') continue;

                const issue: SupportIssue = {
                    id: generateId('si'),
                    description: raw.description || '',
                    status: raw.status || 'to do',
                    related_jiras: raw.related_jiras || [],
                    expiration_date: raw.expiration_date,
                    created_at: now,
                    updated_at: now,
                } as SupportIssue;

                const arr = customerIssues.get(customerId) || [];
                arr.push(issue);
                customerIssues.set(customerId, arr);
            }

            // Upsert for each customer (with substring matching on customer name)
            let imported = 0;
            let deleted = 0;
            for (const customer of data.customers) {
                // Substring match on customer name
                let matchedKey: string | undefined;
                const cName = customer.name.toLowerCase().trim();
                for (const key of customerIssues.keys()) {
                    const kLower = key.toLowerCase().trim();
                    if (cName.includes(kLower) || kLower.includes(cName)) {
                        matchedKey = key;
                        break;
                    }
                }

                const jsonIssues = matchedKey ? customerIssues.get(matchedKey) : undefined;
                const existing = customer.support_issues || [];

                if (jsonIssues) {
                    imported += jsonIssues.length;
                    await updateCustomer(customer.id, { support_issues: jsonIssues }, true);
                    customerIssues.delete(matchedKey!);
                } else if (deleteNotFound && existing.length > 0) {
                    deleted += existing.length;
                    await updateCustomer(customer.id, { support_issues: [] }, true);
                }
            }

            const unmatchedIds = Array.from(customerIssues.keys());
            let msg = `JSON import complete: ${imported} issues imported`;
            if (deleted > 0) msg += `, ${deleted} previous issues removed`;
            if (unmatchedIds.length > 0) msg += `. Unmatched customer IDs: ${unmatchedIds.join(', ')}`;
            showAlert(msg, unmatchedIds.length > 0 ? 'warning' : 'success');
            setShowImportModal(false);
        } catch (err) {
            showAlert(`JSON import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleExportJson = () => {
        if (!data) return;
        const result: { customer: string; description: string; status: string; related_jiras: string[]; expiration_date: string }[] = [];
        for (const customer of data.customers) {
            for (const issue of customer.support_issues || []) {
                result.push({
                    customer: customer.name,
                    description: issue.description || '',
                    status: issue.status || '',
                    related_jiras: issue.related_jiras || [],
                    expiration_date: issue.expiration_date || '',
                });
            }
        }

        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'support_issues.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showAlert('JSON exported successfully.', 'success');
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
        
        // Money-bag scale is anchored to realised contract value: the reference
        // "whale" is always the largest EXISTING TCV — potentials never inflate
        // the scale. A customer's own bag value, though, falls back to potential
        // TCV when it has no existing TCV (see customerMoneyBagTcv), so prospects
        // still show a bag. A prospect whose potential exceeds the largest
        // existing TCV yields a ratio > 1; the three-slot fill clamps each slot
        // to [0,1], so it simply maxes out at 3 bags.
        const maxExistingTcv = Math.max(
            ...data.customers.map(c => c.existing_tcv || 0),
            0
        );

        data.customers.forEach(customer => {
            const bagTcv = customerMoneyBagTcv(customer);
            const tcvRatio = moneyBagFillRatio(bagTcv, maxExistingTcv);

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
                    totalTcv: bagTcv,
                    maxTcv: maxExistingTcv,
                    tcvRatio,
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
        { label: '💰', key: 'tcv', getValue: (d) => d.totalTcv },
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

    // ── Filter / sort / pagination state ────────────────────────────────────
    // Source data is derived from data.customers (workspace endpoint), so all
    // three concerns are handled client-side here — no backend round-trip like
    // Customers / WorkItems list pages.
    //
    // Initial values come from uiState['support'] when the page is being remounted
    // mid-session (e.g. user clicked a row, went to the customer page, hit back).
    // uiState lives in memory only, so a browser refresh / new tab still gets a
    // fresh page.
    const savedSupportState = uiStateForSupport[SUPPORT_PAGE_ID];
    const [filters, setFilters] = useState<SupportFilters>(
        () => (savedSupportState?.pageFilters as SupportFilters | undefined) || {}
    );
    const [sort, setSort] = useState<SupportSort>(() => ({
        sortBy: savedSupportState?.sortBy ?? 'customerName',
        sortOrder: savedSupportState?.sortOrder ?? 'asc',
    }));
    const pageSize = data?.settings?.general?.items_per_page ?? DEFAULT_PAGE_SIZE;
    const [page, setPage] = useState<number>(() => savedSupportState?.page ?? 1);

    // Sync filters + page back into uiState so subsequent in-app remounts
    // restore them. (sortBy/sortOrder + the built-in name filter are persisted
    // by GenericListPage already.)
    useEffect(() => {
        updateUiStateForSupport(SUPPORT_PAGE_ID, { pageFilters: filters, page });
    }, [filters, page, updateUiStateForSupport]);

    const setFilterField = <K extends keyof SupportFilters>(key: K, value: SupportFilters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };
    const setArrayField = (key: 'status' | 'activity', next: string[]) => {
        setFilters(prev => ({ ...prev, [key]: next.length > 0 ? next : undefined }));
    };

    // 1 per active field — matches the WorkItem / Customer pages.
    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (filters.name) n++;
        if (filters.minTcv || filters.maxTcv) n++;
        if (filters.status && filters.status.length > 0) n++;
        if (filters.activity && filters.activity.length > 0) n++;
        return n;
    }, [filters]);

    // Apply filters → sort → paginate. Each step is its own memo so paging
    // changes don't recompute the filter pass.
    const filteredIssues = useMemo(() => {
        const name = (filters.name || '').toLowerCase().trim();
        const minTcv = filters.minTcv && filters.minTcv !== '' ? Number(filters.minTcv) : -Infinity;
        const maxTcv = filters.maxTcv && filters.maxTcv !== '' ? Number(filters.maxTcv) : Infinity;
        const statusSet = filters.status && filters.status.length > 0 ? new Set(filters.status) : null;
        const activitySet = filters.activity && filters.activity.length > 0 ? new Set(filters.activity) : null;

        return allIssues.filter(d => {
            if (name) {
                const desc = (d.description || '').toLowerCase();
                const cust = (d.customerName || '').toLowerCase();
                if (!desc.includes(name) && !cust.includes(name)) return false;
            }
            if (d.totalTcv < minTcv || d.totalTcv > maxTcv) return false;
            if (statusSet && !statusSet.has(d.status)) return false;
            if (activitySet && !activitySet.has(d.activity)) return false;
            return true;
        });
    }, [allIssues, filters]);

    const sortedIssues = useMemo(() => {
        if (!sort.sortBy) return filteredIssues;
        const opt = sortOptions.find(o => o.key === sort.sortBy);
        if (!opt) return filteredIssues;
        const arr = [...filteredIssues].sort((a, b) => {
            const va = opt.getValue(a);
            const vb = opt.getValue(b);
            let cmp = 0;
            if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb);
            else cmp = (Number(va) || 0) - (Number(vb) || 0);
            return sort.sortOrder === 'desc' ? -cmp : cmp;
        });
        return arr;
    }, [filteredIssues, sort, sortOptions]);

    const total = sortedIssues.length;
    const pagedIssues = useMemo(
        () => sortedIssues.slice((page - 1) * pageSize, page * pageSize),
        [sortedIssues, page, pageSize]
    );

    // Snap back to page 1 when filters / sort / pageSize change. Same
    // "adjust state during render" pattern the other list pages use.
    const resetKey = `${JSON.stringify(filters)}|${sort.sortBy ?? ''}|${sort.sortOrder ?? ''}|${pageSize}`;
    const [prevResetKey, setPrevResetKey] = useState(resetKey);
    if (resetKey !== prevResetKey) {
        setPrevResetKey(resetKey);
        if (page !== 1) setPage(1);
    }

    const handleSortChange = useCallback((sortBy: string | undefined, sortOrder: 'asc' | 'desc') => {
        setSort({ sortBy, sortOrder });
    }, []);
    const handleFilterChange = useCallback((name: string) => {
        setFilters(prev => ({ ...prev, name: name || undefined }));
    }, []);

    // Inline styles shared with the filter groups (mirrors WorkItem / Customer
    // list pages so the bar reads as the same family).
    const labelStyle: React.CSSProperties = {
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
    };
    const groupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px' };
    const rangeRowStyle: React.CSSProperties = { display: 'flex', gap: '6px', alignItems: 'center' };
    const numberInputStyle: React.CSSProperties = {
        width: '90px',
        padding: '6px 8px',
        borderRadius: '4px',
        border: '1px solid var(--border-primary)',
        background: 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        fontSize: '13px',
    };

    const renderFilterGroups = () => (
        <>
            <div style={groupStyle}>
                <label style={labelStyle}>Customer TCV ($)</label>
                <div style={rangeRowStyle}>
                    <input aria-label="Min TCV" type="number" placeholder="min" value={filters.minTcv || ''}
                        onChange={(e) => setFilterField('minTcv', e.target.value || undefined)} style={numberInputStyle} />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input aria-label="Max TCV" type="number" placeholder="max" value={filters.maxTcv || ''}
                        onChange={(e) => setFilterField('maxTcv', e.target.value || undefined)} style={numberInputStyle} />
                </div>
            </div>

            <div style={groupStyle}>
                <label style={labelStyle}>Status</label>
                <MultiSelectDropdown
                    ariaLabel="Status filter"
                    placeholder="All statuses"
                    options={STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
                    selected={filters.status || []}
                    onChange={(next) => setArrayField('status', next)}
                    width={200}
                    size="compact"
                />
            </div>

            <div style={groupStyle}>
                <label style={labelStyle}>Activity</label>
                <MultiSelectDropdown
                    ariaLabel="Activity filter"
                    placeholder="All"
                    options={[
                        { value: 'new', label: 'New' },
                        { value: 'updated', label: 'Updated' },
                        { value: 'none', label: 'Other' },
                    ]}
                    selected={filters.activity || []}
                    onChange={(next) => setArrayField('activity', next)}
                    width={160}
                    size="compact"
                />
            </div>

            {activeFilterCount > 0 && (
                <button
                    type="button"
                    onClick={() => setFilters({})}
                    className="btn-secondary"
                    style={{ alignSelf: 'flex-end', padding: '4px 12px', fontSize: '12px' }}
                >
                    Clear filters
                </button>
            )}
        </>
    );

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
            render: (d) => {
                // Three-slot continuous fill: bags[i] = how much of slot i is filled (0..1).
                // Bag fill is sqrt-scaled (see tcvRatio doc) so all three slots get used;
                // tooltip % is intentionally linear so the raw $-share remains accurate.
                const bags = d.tcvRatio * 3;
                const slotFills = [0, 1, 2].map(i => Math.max(0, Math.min(1, bags - i)));
                const pct = d.maxTcv > 0 ? Math.round((d.totalTcv / d.maxTcv) * 100) : 0;
                const tooltip = d.maxTcv > 0
                    ? `TCV: $${d.totalTcv.toLocaleString()} (${pct}% of max $${d.maxTcv.toLocaleString()})`
                    : `TCV: $${d.totalTcv.toLocaleString()}`;
                return (
                    <span
                        data-testid="tcv-bags"
                        data-tcv-ratio={d.tcvRatio.toFixed(3)}
                        title={tooltip}
                        style={{ fontSize: '14px', whiteSpace: 'nowrap' }}
                    >
                        {slotFills.map((fill, i) => (
                            <span
                                key={i}
                                data-testid={`tcv-bag-slot-${i}`}
                                data-fill={fill.toFixed(3)}
                                // Baseline opacity 0.15 keeps an empty-slot outline so the column
                                // stays visually consistent even for low-TCV customers.
                                style={{ opacity: 0.15 + 0.85 * fill }}
                            >💰</span>
                        ))}
                    </span>
                );
            },
            flex: 0.5,
            sortKey: 'tcv'
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
            render: (d) => {
                const draftValue = descriptionDrafts[d.id];
                const value = draftValue !== undefined ? draftValue : d.description;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <AutoGrowTextarea
                            aria-label={`Description for issue ${d.id}`}
                            value={value}
                            onChange={e => setDescriptionDrafts(prev => ({ ...prev, [d.id]: e.target.value }))}
                            onBlur={() => commitDescription(d.customerId, d.id, d.description)}
                            onClick={e => e.stopPropagation()}
                            onMouseDown={e => e.stopPropagation()}
                            onKeyDown={e => e.stopPropagation()}
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: '4px',
                                border: '1px solid var(--border-hover)',
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                resize: 'none',
                                overflow: 'hidden',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit',
                                fontSize: '13px',
                                lineHeight: '1.5',
                                whiteSpace: 'pre-wrap'
                            }}
                        />
                        {d.linkedJiras && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                                {d.linkedJiras.map(jira => (
                                    <JiraLink
                                        key={jira.key}
                                        issueKey={jira.key}
                                        directUrl={jira.url}
                                        variant="pill"
                                        status={jira.status}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            },
            flex: 3.2,
            sortKey: 'description'
        },
        {
            header: 'Status',
            render: (d) => {
                const isKnown = STATUS_OPTIONS.some(o => o.value === d.status);
                return (
                    <select
                        aria-label={`Status for issue ${d.id}`}
                        value={d.status}
                        onChange={e => handleStatusChange(d.customerId, d.id, e.target.value as SupportIssue['status'])}
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        onKeyDown={e => e.stopPropagation()}
                        style={{
                            width: '100%',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: statusBadgeColor(d.status),
                            color: 'white',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            border: 'none',
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                        }}
                    >
                        {!isKnown && <option value={d.status}>{d.status}</option>}
                        {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                );
            },
            flex: 0.8,
            sortKey: 'status'
        }
    ], [descriptionDrafts, commitDescription, handleStatusChange]);

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
                                                                    <JiraLink
                                                                        key={key}
                                                                        issueKey={key}
                                                                        baseUrl={data?.settings?.jira?.base_url}
                                                                        variant="pill"
                                                                    />
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
            <div data-testid="create-issue-form" style={{
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
                        <option value="waiting for release">Waiting for Release</option>
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

    const renderJsonModal = () => {
        if (!showImportModal) return null;
        const fileInputRef = React.createRef<HTMLInputElement>();
        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'var(--bg-shadow)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', zIndex: 2000
            }} onClick={() => setShowImportModal(false)}>
                <div style={{
                    backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                    borderRadius: '8px', padding: '24px', width: '440px', maxWidth: '90%',
                    color: 'var(--text-primary)', boxShadow: '0 20px 25px -5px var(--bg-shadow)'
                }} onClick={e => e.stopPropagation()}>
                    <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '10px' }}>
                        Upsert Support Issues from JSON
                    </h2>
                    <div style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        JSON must be an array of issue objects, each with a <strong>customer</strong> field. Matching is done by substring match on customer name.
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', cursor: 'pointer', fontSize: '14px' }}>
                        <input
                            type="checkbox"
                            checked={deleteNotFound}
                            onChange={e => setDeleteNotFound(e.target.checked)}
                        />
                        Delete support issues not found in JSON
                    </label>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button className="btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
                        <button
                            className="btn-primary"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {uploading ? 'Uploading...' : 'Select JSON File'}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            style={{ display: 'none' }}
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleJsonUpsert(file);
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
        {renderJsonModal()}
        <GenericListPage<SupportIssueWithCustomer>
            pageId="support"
            title="Support Issues"
            titleAction={<SettingsLink tab="jira" subtab="customer" title="Configure Jira support sync (JQLs)" />}
            // Items are already filtered/sorted/paged here in the page so the
            // pagination total reflects the full filtered set, not the page slice.
            items={pagedIssues}
            loading={loading}
            filterPlaceholder="Filter issues by description or customer..."
            // Filter + sort are owned by SupportPage (see filteredIssues / sortedIssues
            // memos above) — GenericListPage just passes the input/header events
            // through to onFilterChange / onSortChange.
            filterPredicate={() => true}
            sortOptions={sortOptions}
            disableClientSort
            onSortChange={handleSortChange}
            onFilterChange={handleFilterChange}
            collapsible
            activeFilterCount={activeFilterCount}
            nameFilterLabel="Filter"
            renderFilterGroups={renderFilterGroups}
            onItemClick={(d) => {
                if (d.isJira && d.url) {
                    window.open(d.url, '_blank');
                } else {
                    navigate(`/customer/${d.customerId}?tab=support&issueId=${d.id}`);
                }
            }}
            columns={columns}
            actionButton={{
                label: '+ Create Issue',
                onClick: handleOpenCreateForm
            }}
            secondaryActions={[
                {
                    label: 'Upsert from JSON',
                    onClick: () => { setDeleteNotFound(false); setShowImportModal(true); }
                },
                {
                    label: 'Export JSON',
                    onClick: handleExportJson
                },
                ...(data?.settings?.ai?.provider && data?.settings?.ai?.support?.prompt
                    ? [
                        ...(data.settings.ai.provider === 'glean' && !isGleanAuthenticated
                            ? [{ label: 'Connect Glean', onClick: handleGleanLogin }]
                            : []
                        ),
                        {
                            label: isAISearching ? (searchProgress || 'AI Searching...') : 'AI Support Search',
                            onClick: handleAISearch,
                            disabled: isAISearching || (data.settings.ai.provider === 'glean' && !isGleanAuthenticated)
                        }
                    ]
                    : []
                )
            ]}
            // Create form + AI results render ABOVE the list (outside the
            // collapsible filter region) so they remain visible when filters
            // are hidden via the chevron / pull-tab.
            renderAboveList={() => (
                <>
                    {renderCreateForm()}
                    {renderAIResults()}
                </>
            )}
            renderBelowList={() => (
                <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
            )}
            emptyMessage="No support issues tracked."
            loadingMessage="Loading support issues..."
        />
        </>
    );
};
