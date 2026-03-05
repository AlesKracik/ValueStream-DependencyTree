import React, { useState } from 'react';
import type { DashboardData, Customer, WorkItem, TcvHistoryEntry } from '../../types/models';
import { SearchableDropdown } from '../common/SearchableDropdown';
import { useDashboardContext } from '../../contexts/DashboardContext';
import styles from './CustomerPage.module.css';
import { generateId } from '../../utils/security';
import { calculateWorkItemEffort } from '../../utils/businessLogic';
import { PageWrapper } from '../layout/PageWrapper';
import { useCustomerHealth } from '../../hooks/useCustomerHealth';
import { useCustomerCustomFields } from '../../hooks/useCustomerCustomFields';
import { authorizedFetch } from '../../utils/api';

export interface CustomerPageProps {
    customerId: string;
    onBack: () => void;
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateCustomer: (id: string, updates: Partial<Customer>, immediate?: boolean) => Promise<void>;
    deleteCustomer: (id: string) => void;
    addCustomer: (customer: Customer) => void;
    updateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
}

export const CustomerPage: React.FC<CustomerPageProps> = ({
    customerId,
    onBack,
    data,
    loading,
    error,
    updateCustomer,
    deleteCustomer,
    addCustomer,
    updateWorkItem
}) => {
    const { showConfirm } = useDashboardContext();
    const isNew = customerId === 'new';

    // Draft states for new customer creation
    const [newCustDraft, setNewCustDraft] = useState<Partial<Customer>>({ 
        name: '', 
        existing_tcv: undefined, 
        existing_tcv_valid_from: undefined,
        existing_tcv_duration_months: undefined,
        potential_tcv: undefined,
        potential_tcv_valid_from: undefined,
        potential_tcv_duration_months: undefined
    });
    const [newCustomerWorkItems, setNewCustomerWorkItems] = useState<{ workItemId: string, tcv_type: 'existing' | 'potential', priority: 'Must-have' | 'Should-have' | 'Nice-to-have', tcv_history_id?: string }[]>([]);

    const [activeTab, setActiveTab] = useState<'customFields' | 'workItems' | 'history' | 'support'>('customFields');

    const customer = isNew ? newCustDraft as Customer : data?.customers.find(c => c.id === customerId);

    const healthData = useCustomerHealth(customer, data?.settings);
    const customFields = useCustomerCustomFields(customer, data?.settings);
    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [chatSessionId] = useState(() => generateId('sess'));

    const getBasePrompt = () => {
        if (!customer) return '';
        return `Analyze the following Jira support tickets for customer ${customer.name}. Summarize the root causes if any and try to find correlations between them.
        Pay special attention to 'New / Untriaged' issues as they are the most critical.
        For each issue, you have the summary, description, and the last comment to help you understand the context and recent activity. The output should be short - 2-3 sentences for the findings, 1 sentence for the conclusion.

        Data:
        New / Untriaged Issues: ${JSON.stringify(healthData.newIssues.map(i => ({ key: i.key, summary: i.summary, description: i.description, lastComment: i.lastComment, priority: i.priority })))}
        Active Work Issues: ${JSON.stringify(healthData.inProgressIssues.map(i => ({ key: i.key, summary: i.summary, description: i.description, lastComment: i.lastComment, priority: i.priority })))}
        Blocked / Pending Issues: ${JSON.stringify(healthData.noopIssues.map(i => ({ key: i.key, summary: i.summary, description: i.description, lastComment: i.lastComment, priority: i.priority })))}`;
    };

    const handleGenerateSummary = async () => {
        if (!data?.settings) return;
        setIsGeneratingSummary(true);
        setChatMessages([]);
        try {
            const prompt = getBasePrompt();
            const res = await authorizedFetch('/api/llm/generate', {                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, config: data.settings, stream: true, sessionId: chatSessionId })
            });

            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            
            setChatMessages([{ role: 'assistant', content: '' }]);
            
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(line.slice(6));
                            if (json.error) throw new Error(json.error);
                            if (json.text) {
                                accumulatedText += json.text;
                                setChatMessages([{ role: 'assistant', content: accumulatedText }]);
                            }
                        } catch (e) {
                            if (e instanceof Error && e.message.includes('API error')) throw e;
                        }
                    }
                }
            }
        } catch (e: any) {
            setChatMessages([{ role: 'assistant', content: `Error: ${e.message}` }]);
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    const handleSendChatMessage = async () => {
        if (!data?.settings || !chatInput.trim() || isGeneratingSummary) return;
        
        const userMsg = chatInput.trim();
        setChatInput('');
        const newHistory: { role: 'user' | 'assistant', content: string }[] = [...chatMessages, { role: 'user', content: userMsg }];
        setChatMessages(newHistory);
        setIsGeneratingSummary(true);

        try {
            const basePrompt = getBasePrompt();
            const history = newHistory.slice(0, -1).map(m => `${m.role === 'assistant' ? 'AI' : 'User'}: ${m.content}`).join('\n\n');
            const prompt = `${basePrompt}\n\nPrevious Conversation:\n${history}\n\nUser Question: ${userMsg}\n\nAI Response:`;

            const res = await authorizedFetch('/api/llm/generate', {                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, config: data.settings, stream: true, sessionId: chatSessionId })
            });

            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

            setChatMessages([...newHistory, { role: 'assistant', content: '' }]);
            
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(line.slice(6));
                            if (json.error) throw new Error(json.error);
                            if (json.text) {
                                accumulatedText += json.text;
                                setChatMessages([...newHistory, { role: 'assistant', content: accumulatedText }]);
                            }
                        } catch (e) {
                            if (e instanceof Error && e.message.includes('API error')) throw e;
                        }
                    }
                }
            }
        } catch (e: any) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    const targetedWorkItems = (isNew && data)
        ? newCustomerWorkItems.map(ncf => data.workItems.find(f => f.id === ncf.workItemId)!).filter(Boolean)
        : data?.workItems.filter(f => f.customer_targets.some(ct => ct.customer_id === customerId)) || [];

    const handleSave = async () => {
        if (!data) return;
        try {
            if (isNew) {
                const newId = generateId('c');
                const newCust: Customer = {
                    id: newId,
                    name: newCustDraft.name || 'New Customer',
                    customer_id: newCustDraft.customer_id,
                    existing_tcv: newCustDraft.existing_tcv || 0,
                    existing_tcv_valid_from: newCustDraft.existing_tcv_valid_from,
                    existing_tcv_duration_months: newCustDraft.existing_tcv_duration_months,
                    potential_tcv: newCustDraft.potential_tcv || 0,
                    potential_tcv_valid_from: newCustDraft.potential_tcv_valid_from,
                    potential_tcv_duration_months: newCustDraft.potential_tcv_duration_months
                };

                // Inject the drafted work items
                const updatedWorkItems = data.workItems.map(f => {
                    const draftTarget = newCustomerWorkItems.find(ncf => ncf.workItemId === f.id);
                    if (draftTarget) {
                        return {
                            ...f,
                            customer_targets: [
                                ...(f.customer_targets || []),
                                {
                                    customer_id: newId,
                                    tcv_type: draftTarget.tcv_type,
                                    priority: draftTarget.priority,
                                    tcv_history_id: draftTarget.tcv_history_id
                                }
                            ]
                        };
                    }
                    return f;
                });

                addCustomer(newCust);
                updatedWorkItems.forEach((f, i) => {
                    const oldF = data.workItems[i];
                    if (oldF.customer_targets.length !== f.customer_targets.length) {
                        updateWorkItem(f.id, { customer_targets: f.customer_targets });
                    }
                });

                setTimeout(() => { onBack(); }, 1000);
            }
        } catch (err) {
            console.error('Save failed', err);
        }
    };

    const handlePromotePotentialToExisting = async () => {
        if (!customer) return;
        const targetDate = customer.potential_tcv_valid_from || new Date().toISOString().split('T')[0];
        const confirmed = await showConfirm(
            'Promote Potential TCV', 
            `This will move current Existing TCV ($${customer.existing_tcv.toLocaleString()}) to history and promote Potential TCV ($${customer.potential_tcv.toLocaleString()}) to be the new Actual Existing TCV valid from ${targetDate}. Continue?`
        );
        if (!confirmed) return;

        const historyEntry: TcvHistoryEntry = {
            id: generateId('h'),
            value: customer.existing_tcv,
            valid_from: customer.existing_tcv_valid_from || '2000-01-01',
            duration_months: customer.existing_tcv_duration_months
        };

        const newHistory = [...(customer.tcv_history || []), historyEntry].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
        
        updateCustomer(customer.id, {
            existing_tcv: customer.potential_tcv,
            existing_tcv_duration_months: customer.potential_tcv_duration_months,
            existing_tcv_valid_from: targetDate,
            potential_tcv: 0,
            potential_tcv_duration_months: 12,
            tcv_history: newHistory
        });
    };

    const handleDelete = async () => {
        if (!customer) return;
        const confirmed = await showConfirm('Delete Customer', `Are you sure you want to delete ${customer.name}? This will remove all their work item impact.`);
        if (!confirmed) return;
        try {
            deleteCustomer(customerId);
            onBack();
        } catch (err) {
            console.error('Delete failed', err);
        }
    };

    const renderValue = (val: any): React.ReactNode => {
        if (val === null || val === undefined) return <span style={{ color: '#64748b', fontStyle: 'italic' }}>null</span>;
        if (Array.isArray(val)) {
            if (val.length === 0) return <span style={{ color: '#64748b' }}>[]</span>;
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                    {val.map((item, idx) => (
                        <div key={idx} style={{ 
                            padding: '12px', 
                            backgroundColor: 'rgba(255,255,255,0.02)', 
                            border: '1px solid #334155', 
                            borderRadius: '6px' 
                        }}>
                            {renderValue(item)}
                        </div>
                    ))}
                </div>
            );
        }
        if (typeof val === 'object') {
            return (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, auto) 1fr', gap: '8px 16px' }}>
                    {Object.entries(val)
                        .filter(([k]) => {
                            const lower = k.toLowerCase();
                            // Skip IDs: exact 'id', '_id', or suffixes like '_id' or camelCase 'Id'
                            const isId = lower === 'id' || 
                                         lower === '_id' || 
                                         lower.endsWith('_id') || 
                                         (k.endsWith('Id') && k.length > 2);
                            return !isId;
                        })
                        .map(([k, v]) => (
                            <React.Fragment key={k}>
                                <div style={{ fontWeight: 'bold', color: '#94a3b8', fontSize: '13px' }}>{k}:</div>
                                <div style={{ fontSize: '14px', wordBreak: 'break-all' }}>{renderValue(v)}</div>
                            </React.Fragment>
                        ))}
                </div>
            );
        }
        return String(val);
    };

    return (
        <PageWrapper 
            loading={loading} 
            error={error} 
            data={data} 
            loadingMessage="Loading customer details..."
            emptyMessage="No data available."
        >
            {!customer ? (
                <div className={styles.empty}>Customer not found.</div>
            ) : (
                <>
                    <div className={styles.header}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <button className="btn-secondary" onClick={onBack}>
                                ← Back
                            </button>
                            <h1>{isNew ? (newCustDraft.name || 'New Customer') : customer.name}</h1>
                        </div>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            {!isNew && (
                                <button className="btn-danger" onClick={handleDelete}>
                                    Delete Customer
                                </button>
                            )}
                            {isNew ? (
                                <button className="btn-primary" onClick={handleSave}>
                                    Create
                                </button>
                            ) : null}
                        </div>
                    </div>

                    <div className={styles.content}>
                        <section className={styles.card}>
                            <h2>Customer Details</h2>
                            <div className={styles.formGrid}>
                                <label>
                                    Name:
                                    <input 
                                        type="text" 
                                        value={isNew ? newCustDraft.name : customer.name} 
                                        onChange={e => {
                                            if (isNew) setNewCustDraft(prev => ({ ...prev, name: e.target.value }));
                                            else updateCustomer(customer.id, { name: e.target.value });
                                        }}
                                        placeholder="New Customer"
                                    />
                                </label>

                                <label>
                                    Customer ID:
                                    <input 
                                        type="text" 
                                        value={isNew ? (newCustDraft.customer_id || '') : (customer.customer_id || '')} 
                                        onChange={e => {
                                            if (isNew) setNewCustDraft(prev => ({ ...prev, customer_id: e.target.value }));
                                            else updateCustomer(customer.id, { customer_id: e.target.value });
                                        }}
                                        placeholder="e.g. CUST-123"
                                    />
                                </label>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label>
                                        Actual Existing TCV ($):
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input 
                                                type={isNew ? "number" : "text"} 
                                                readOnly={!isNew}
                                                value={isNew ? (newCustDraft.existing_tcv ?? '') : (customer.existing_tcv || 0).toLocaleString()} 
                                                onChange={e => {
                                                    if (!isNew) return;
                                                    const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                                    setNewCustDraft(prev => ({ ...prev, existing_tcv: val }));
                                                }}
                                                placeholder="0"
                                                style={!isNew ? { backgroundColor: '#1e293b', border: 'none' } : {}}
                                            />
                                        </div>
                                    </label>
                                    <label>
                                        Valid From:
                                        <input 
                                            type="date" 
                                            readOnly={!isNew}
                                            value={isNew ? (newCustDraft.existing_tcv_valid_from || '') : (customer.existing_tcv_valid_from || '')} 
                                            onChange={e => {
                                                if (!isNew) return;
                                                setNewCustDraft(prev => ({ ...prev, existing_tcv_valid_from: e.target.value }));
                                            }}
                                            style={!isNew ? { backgroundColor: '#1e293b', border: 'none' } : {}}
                                        />
                                    </label>
                                    <label>
                                        Existing Duration (mo):
                                        <input 
                                            type="number" 
                                            readOnly={!isNew}
                                            value={isNew ? (newCustDraft.existing_tcv_duration_months ?? '') : (customer.existing_tcv_duration_months || 0)} 
                                            onChange={e => {
                                                if (!isNew) return;
                                                const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                                setNewCustDraft(prev => ({ ...prev, existing_tcv_duration_months: val }));
                                            }}
                                            min="0"
                                            placeholder="12"
                                            style={!isNew ? { backgroundColor: '#1e293b', border: 'none' } : {}}
                                        />
                                    </label>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label>
                                        Potential TCV ($):
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input 
                                                type="number" 
                                                value={isNew ? (newCustDraft.potential_tcv ?? '') : (customer.potential_tcv || 0)} 
                                                onChange={e => {
                                                    const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                                    if (isNew) setNewCustDraft(prev => ({ ...prev, potential_tcv: val }));
                                                    else updateCustomer(customer.id, { potential_tcv: val || 0 });
                                                }}
                                                placeholder="0"
                                            />
                                            {!isNew && (
                                                <button 
                                                    className="btn-primary" 
                                                    style={{ padding: '4px 8px', fontSize: '12px', whiteSpace: 'nowrap' }} 
                                                    onClick={handlePromotePotentialToExisting}
                                                >
                                                    Promote to Actual
                                                </button>
                                            )}
                                        </div>
                                    </label>
                                    <label>
                                        Valid From:
                                        <input 
                                            type="date" 
                                            value={isNew ? (newCustDraft.potential_tcv_valid_from || '') : (customer.potential_tcv_valid_from || '')} 
                                            onChange={e => {
                                                if (isNew) setNewCustDraft(prev => ({ ...prev, potential_tcv_valid_from: e.target.value }));
                                                else updateCustomer(customer.id, { potential_tcv_valid_from: e.target.value });
                                            }}
                                        />
                                    </label>
                                    <label>
                                        Potential Duration (mo):
                                        <input 
                                            type="number" 
                                            value={isNew ? (newCustDraft.potential_tcv_duration_months ?? '') : (customer.potential_tcv_duration_months || 0)} 
                                            onChange={e => {
                                                const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                                if (isNew) setNewCustDraft(prev => ({ ...prev, potential_tcv_duration_months: val }));
                                                else updateCustomer(customer.id, { potential_tcv_duration_months: val || 0 });
                                            }}
                                            min="0"
                                            placeholder="12"
                                        />
                                    </label>
                                </div>
                            </div>
                        </section>

                        <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #334155', marginBottom: '24px', marginTop: '24px' }}>
                            {!isNew && (
                                <button
                                    onClick={() => setActiveTab('customFields')}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: '12px 16px',
                                        color: activeTab === 'customFields' ? '#60a5fa' : '#94a3b8',
                                        borderBottom: activeTab === 'customFields' ? '2px solid #60a5fa' : '2px solid transparent',
                                        cursor: 'pointer',
                                        fontSize: '15px',
                                        fontWeight: activeTab === 'customFields' ? 'bold' : '500',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Custom Fields ({customFields.data.length})
                                </button>
                            )}
                            <button
                                onClick={() => setActiveTab('workItems')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '12px 16px',
                                    color: activeTab === 'workItems' ? '#60a5fa' : '#94a3b8',
                                    borderBottom: activeTab === 'workItems' ? '2px solid #60a5fa' : '2px solid transparent',
                                    cursor: 'pointer',
                                    fontSize: '15px',
                                    fontWeight: activeTab === 'workItems' ? 'bold' : '500',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Targeted Work Items ({targetedWorkItems.length})
                            </button>
                            {!isNew && (
                                <>
                                    <button
                                        onClick={() => setActiveTab('history')}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: '12px 16px',
                                            color: activeTab === 'history' ? '#60a5fa' : '#94a3b8',
                                            borderBottom: activeTab === 'history' ? '2px solid #60a5fa' : '2px solid transparent',
                                            cursor: 'pointer',
                                            fontSize: '15px',
                                            fontWeight: activeTab === 'history' ? 'bold' : '500',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        TCV History ({customer.tcv_history?.length || 0})
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('support')}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: '12px 16px',
                                            color: activeTab === 'support' ? '#60a5fa' : '#94a3b8',
                                            borderBottom: activeTab === 'support' ? '2px solid #60a5fa' : '2px solid transparent',
                                            cursor: 'pointer',
                                            fontSize: '15px',
                                            fontWeight: activeTab === 'support' ? 'bold' : '500',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        Support Health
                                        {healthData.healthStatus === 'New / Untriaged' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>}
                                        {healthData.healthStatus === 'Active Work' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></span>}
                                        {healthData.healthStatus === 'Blocked / Pending' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6' }}></span>}
                                        {healthData.healthStatus === 'Healthy' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>}
                                    </button>
                                </>
                            )}
                        </div>

                        {activeTab === 'customFields' && !isNew && (
                            <section className={styles.card}>
                                <h2>MongoDB Custom Data</h2>
                                {customFields.loading && <div style={{ color: '#9ca3af' }}>Loading custom fields...</div>}
                                {customFields.error && (
                                    <div style={{ color: '#fca5a5', textAlign: 'center', padding: '40px', backgroundColor: '#451a1a', borderRadius: '8px', border: '1px dashed #ef4444' }}>
                                        <div style={{ fontSize: '16px', marginBottom: '8px', color: '#fecaca', fontWeight: 'bold' }}>Query Error</div>
                                        <p style={{ margin: 0, fontSize: '14px' }}>{customFields.error}</p>
                                    </div>
                                )}
                                {!customFields.loading && !customFields.error && (
                                    <>
                                        {customFields.data.length === 0 ? (
                                            <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px dashed #334155' }}>
                                                <div style={{ fontSize: '16px', marginBottom: '8px', color: '#e2e8f0' }}>No Data Found</div>
                                                <p style={{ margin: 0, fontSize: '14px' }}>
                                                    The custom MongoDB query returned no results for this customer ID (<strong>{customer.customer_id}</strong>).
                                                    Check your query in the Persistence settings.
                                                </p>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                                {customFields.data.map((item, idx) => (
                                                    <div key={idx} style={{ 
                                                        padding: '20px', 
                                                        backgroundColor: 'rgba(255,255,255,0.03)', 
                                                        border: '1px solid #334155', 
                                                        borderRadius: '8px' 
                                                    }}>
                                                        {renderValue(item)}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </section>
                        )}

                        {activeTab === 'support' && !isNew && (
                            <section className={styles.card}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h2>Support Health Overview</h2>
                                    {healthData.healthStatus !== 'Unknown' && (
                                        <div style={{ display: 'flex', gap: '16px' }}>
                                            <div style={{ textAlign: 'center', padding: '8px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid #ef4444' }}>
                                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>{healthData.newIssues.length}</div>
                                                <div style={{ fontSize: '12px', color: '#fca5a5' }}>New / Untriaged</div>
                                            </div>
                                            <div style={{ textAlign: 'center', padding: '8px 16px', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', border: '1px solid #f59e0b' }}>
                                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{healthData.inProgressIssues.length}</div>
                                                <div style={{ fontSize: '12px', color: '#fcd34d' }}>Active Work</div>
                                            </div>
                                            <div style={{ textAlign: 'center', padding: '8px 16px', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid #3b82f6' }}>
                                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>{healthData.noopIssues.length}</div>
                                                <div style={{ fontSize: '12px', color: '#93c5fd' }}>Blocked / Pending</div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {healthData.loading && <div style={{ color: '#9ca3af' }}>Loading Jira data...</div>}
                                {healthData.error && (
                                    <div style={{ color: '#fca5a5', textAlign: 'center', padding: '40px', backgroundColor: '#451a1a', borderRadius: '8px', border: '1px dashed #ef4444' }}>
                                        <div style={{ fontSize: '16px', marginBottom: '8px', color: '#fecaca', fontWeight: 'bold' }}>Jira Integration Error</div>
                                        <p style={{ margin: 0, fontSize: '14px' }}>
                                            {healthData.error}
                                        </p>
                                    </div>
                                )}

                                {healthData.healthStatus === 'Unknown' && !healthData.loading && !healthData.error && (
                                    <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px dashed #334155' }}>
                                        <div style={{ fontSize: '16px', marginBottom: '8px', color: '#e2e8f0' }}>Support Tracking Not Configured</div>
                                        <p style={{ margin: 0, fontSize: '14px' }}>
                                            To see Jira bugs here, please provide a <strong>Customer ID</strong> in the Customer Details section above, 
                                            and ensure <strong>Customer Issue Tracking JQLs</strong> are configured in the <strong>Settings</strong>.
                                        </p>
                                    </div>
                                )}

                                {!healthData.loading && !healthData.error && healthData.healthStatus !== 'Unknown' && (
                                    <>
                                        <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                <h3 style={{ margin: 0, fontSize: '16px' }}>AI Health Assistant</h3>
                                                <button 
                                                    className="btn-primary" 
                                                    onClick={handleGenerateSummary}
                                                    disabled={isGeneratingSummary}
                                                    style={{ fontSize: '12px', padding: '6px 12px' }}
                                                >
                                                    {chatMessages.length > 0 ? 'Restart Analysis' : 'Generate AI Summary'}
                                                </button>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: chatMessages.length > 0 ? '16px' : '0' }}>
                                                {chatMessages.length === 0 && !isGeneratingSummary && (
                                                    <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                                                        Click the button to generate an AI summary of the current support situation.
                                                    </div>
                                                )}
                                                
                                                {chatMessages.map((msg, idx) => (
                                                    <div key={idx} style={{
                                                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                                        maxWidth: '85%',
                                                        padding: '12px 16px',
                                                        borderRadius: '12px',
                                                        backgroundColor: msg.role === 'user' ? '#3b82f6' : '#334155',
                                                        color: '#f8fafc',
                                                        lineHeight: '1.5',
                                                        fontSize: '14px',
                                                        whiteSpace: 'pre-wrap',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                    }}>
                                                        <div style={{ fontSize: '11px', marginBottom: '4px', opacity: 0.8, fontWeight: 'bold' }}>
                                                            {msg.role === 'user' ? 'You' : 'AI Assistant'}
                                                        </div>
                                                        {msg.content}
                                                    </div>
                                                ))}

                                                {isGeneratingSummary && (
                                                    <div style={{ alignSelf: 'flex-start', padding: '12px 16px', borderRadius: '12px', backgroundColor: '#334155', color: '#94a3b8', fontStyle: 'italic', fontSize: '14px' }}>
                                                        AI is thinking...
                                                    </div>
                                                )}
                                            </div>

                                            {chatMessages.length > 0 && (
                                                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #334155', paddingTop: '16px' }}>
                                                    <input 
                                                        type="text"
                                                        value={chatInput}
                                                        onChange={e => setChatInput(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && handleSendChatMessage()}
                                                        placeholder="Ask a follow-up question..."
                                                        style={{ flex: 1, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '8px 12px' }}
                                                    />
                                                    <button 
                                                        className="btn-primary" 
                                                        onClick={handleSendChatMessage}
                                                        disabled={isGeneratingSummary || !chatInput.trim()}
                                                    >
                                                        Send
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px' }}>Issue List</h3>
                                        <table className={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th>Key</th>
                                                    <th>Summary</th>
                                                    <th>Status</th>
                                                    <th>Priority</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...healthData.newIssues, ...healthData.inProgressIssues, ...healthData.noopIssues].map(issue => (
                                                    <tr key={issue.key}>
                                                        <td><a href={issue.url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>{issue.key}</a></td>
                                                        <td>{issue.summary}</td>
                                                        <td>
                                                            <span style={{ 
                                                                padding: '2px 6px', 
                                                                borderRadius: '4px', 
                                                                fontSize: '12px',
                                                                backgroundColor: healthData.newIssues.includes(issue) ? 'rgba(239, 68, 68, 0.2)' : 
                                                                                healthData.inProgressIssues.includes(issue) ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                                                color: healthData.newIssues.includes(issue) ? '#f87171' : 
                                                                      healthData.inProgressIssues.includes(issue) ? '#fbbf24' : '#60a5fa'
                                                            }}>
                                                                {issue.status}
                                                            </span>
                                                        </td>
                                                        <td>{issue.priority}</td>
                                                    </tr>
                                                ))}
                                                {healthData.newIssues.length === 0 && healthData.inProgressIssues.length === 0 && healthData.noopIssues.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No issues found matching the JQL queries.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </>
                                )}
                            </section>
                        )}

                        {activeTab === 'workItems' && (
                            <section className={styles.card}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h2>Targeted Work Items</h2>
                                </div>

                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Work Item</th>
                                            <th>Effort (MDs)</th>
                                            <th>TCV Type</th>
                                            <th>TCV Selection</th>
                                            <th>Priority</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {targetedWorkItems.map(workItem => {
                                            const workItemEpics = data ? data.epics.filter(e => e.work_item_id === workItem.id) : [];
                                            const calculatedEffort = calculateWorkItemEffort(workItem, workItemEpics);
                                            
                                            const targetDef = isNew
                                                ? newCustomerWorkItems.find(ncf => ncf.workItemId === workItem.id)!
                                                : workItem.customer_targets.find(ct => ct.customer_id === customerId)!;

                                            const updateTarget = (updates: Partial<typeof targetDef>) => {
                                                if (isNew) {
                                                    setNewCustomerWorkItems(prev => prev.map(ncf => 
                                                        ncf.workItemId === workItem.id ? { ...ncf, ...updates } : ncf
                                                    ));
                                                } else {
                                                    const newTargets = workItem.customer_targets.map(ct => 
                                                        ct.customer_id === customerId ? { ...ct, ...updates } : ct
                                                    );
                                                    updateWorkItem(workItem.id, { customer_targets: newTargets as any });
                                                }
                                            };

                                            const removeTarget = () => {
                                                if (isNew) {
                                                    setNewCustomerWorkItems(prev => prev.filter(ncf => ncf.workItemId !== workItem.id));
                                                } else {
                                                    const newTargets = workItem.customer_targets.filter(ct => ct.customer_id !== customerId);
                                                    updateWorkItem(workItem.id, { customer_targets: newTargets });
                                                }
                                            };

                                            return (
                                                <tr key={workItem.id}>
                                                    <td>{workItem.name}</td>
                                                    <td>{calculatedEffort.toLocaleString()}</td>
                                                    <td>
                                                        <select 
                                                            value={targetDef.tcv_type}
                                                            onChange={e => updateTarget({ tcv_type: e.target.value as 'existing' | 'potential' })}
                                                        >
                                                            <option value="existing">Existing</option>
                                                            <option value="potential">Potential</option>
                                                        </select>
                                                    </td>
                                                    <td>
                                                        {targetDef.tcv_type === 'existing' ? (
                                                            <select
                                                                value={targetDef.tcv_history_id || 'latest'}
                                                                onChange={e => updateTarget({ tcv_history_id: e.target.value === 'latest' ? undefined : e.target.value })}
                                                            >
                                                                <option value="latest">Latest Actual (${customer.existing_tcv.toLocaleString()})</option>
                                                                {customer.tcv_history?.map(h => (
                                                                    <option key={h.id} value={h.id}>{h.valid_from} (${h.value.toLocaleString()})</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <span style={{ color: '#94a3b8' }}>${customer.potential_tcv.toLocaleString()}</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <select 
                                                            value={targetDef.priority || 'Must-have'}
                                                            onChange={e => updateTarget({ priority: e.target.value as 'Must-have' | 'Should-have' | 'Nice-to-have' })}
                                                        >
                                                            <option value="Must-have">Must-have</option>
                                                            <option value="Should-have">Should-have</option>
                                                            <option value="Nice-to-have">Nice-to-have</option>
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <button onClick={removeTarget} className="btn-danger">Remove</button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {targetedWorkItems.length === 0 && (
                                            <tr>
                                                <td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No targeted work items found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>

                                {data && (
                                    <div className={styles.addWorkItemBox}>
                                        <h3>Add Work Item Target</h3>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <SearchableDropdown
                                                options={data.workItems
                                                    .filter(f => !targetedWorkItems.find(tf => tf.id === f.id))
                                                    .map(f => ({ id: f.id, label: f.name }))
                                                }
                                                onSelect={(workItemId) => {
                                                    if (isNew) {
                                                        setNewCustomerWorkItems(prev => [...prev, {
                                                            workItemId,
                                                            tcv_type: 'existing',
                                                            priority: 'Should-have'
                                                        }]);
                                                    } else {
                                                        const workItem = data.workItems.find(f => f.id === workItemId);
                                                        if (workItem) {
                                                            const newTargets = [...(workItem.customer_targets || []), {
                                                                customer_id: customerId,
                                                                tcv_type: 'existing',
                                                                priority: 'Should-have'
                                                            }];
                                                            updateWorkItem(workItemId, { customer_targets: newTargets as any });
                                                        }
                                                    }
                                                }}
                                                placeholder="Search for a work item to add..."
                                            />
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {activeTab === 'history' && !isNew && (
                            <section className={styles.card}>
                                <h2>Existing TCV History</h2>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Valid From</th>
                                            <th>Value ($)</th>
                                            <th>Duration (mo)</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {customer.tcv_history?.map(entry => (
                                            <tr key={entry.id}>
                                                <td>{entry.valid_from}</td>
                                                <td>{entry.value.toLocaleString()}</td>
                                                <td>{entry.duration_months || '-'}</td>
                                                <td>
                                                    <button 
                                                        className="btn-danger" 
                                                        onClick={() => {
                                                            const newHistory = customer.tcv_history?.filter(h => h.id !== entry.id);
                                                            updateCustomer(customer.id, { tcv_history: newHistory });
                                                        }}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {(!customer.tcv_history || customer.tcv_history.length === 0) && (
                                            <tr>
                                                <td colSpan={3} style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>No historical entries. Update the Actual TCV to populate history.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </section>
                        )}

                    </div>
                </>
            )}
        </PageWrapper>
    );
};
