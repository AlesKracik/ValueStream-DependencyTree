import { useState, useEffect } from 'react';
import type { Customer, Settings, JiraIssue } from '../types/models';
import { authorizedFetch } from '../utils/api';

export interface CustomerHealthData {
    newIssues: JiraIssue[];
    inProgressIssues: JiraIssue[];
    noopIssues: JiraIssue[];
    linkedIssues: JiraIssue[];
    healthStatus: 'Healthy' | 'Blocked / Pending' | 'Active Work' | 'New / Untriaged' | 'Unknown';
    loading: boolean;
    error: string | null;
}

interface InternalJiraIssue {
    key: string;
    fields: {
        summary?: string;
        status?: { name: string };
        priority?: { name: string };
    };
}

export const useCustomerHealth = (customer: Customer | undefined, settings: Settings | undefined) => {
    const [healthData, setHealthData] = useState<CustomerHealthData>({
        newIssues: [],
        inProgressIssues: [],
        noopIssues: [],
        linkedIssues: [],
        healthStatus: 'Unknown',
        loading: false,
        error: null,
    });

    useEffect(() => {
        const fetchHealth = async () => {
            if (!customer || !customer.customer_id || !settings) {
                setHealthData(prev => ({ ...prev, loading: false, healthStatus: 'Unknown' }));
                return;
            }

            const { 
                customer_jql_new, 
                customer_jql_in_progress, 
                customer_jql_noop, 
                jira_base_url, 
                jira_api_version, 
                jira_api_token 
            } = settings;

            if (!jira_base_url || (!customer_jql_new && !customer_jql_in_progress && !customer_jql_noop)) {
                setHealthData(prev => ({ ...prev, loading: false, error: 'Jira or JQL settings not configured.' }));
                return;
            }

            setHealthData(prev => ({ ...prev, loading: true, error: null }));

            const replacePlaceholders = (jql: string | undefined) => {
                if (!jql) return '';
                return jql.replace(/\{\{CUSTOMER_ID\}\}/g, customer.customer_id || '');
            };

            const jqlNew = replacePlaceholders(customer_jql_new);
            const jqlInProgress = replacePlaceholders(customer_jql_in_progress);
            const jqlNoop = replacePlaceholders(customer_jql_noop);

            const fetchIssues = async (jql: string, category: JiraIssue['category']): Promise<JiraIssue[]> => {
                if (!jql) return [];
                try {
                    const response = await authorizedFetch('/api/jira/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            jql, 
                            jira_base_url, 
                            jira_api_version, 
                            jira_api_token 
                        })
                    });
                    const resData = await response.json();
                    if (!response.ok || !resData.success) throw new Error(resData.error || 'Failed to fetch issues');

                    const now = new Date().toISOString();
                    return (resData.data.issues || []).map((issue: InternalJiraIssue) => {
                        const fields = issue.fields || {};
                        
                        return {
                            key: issue.key,
                            summary: fields.summary || 'Unknown',
                            status: fields.status?.name || 'Unknown',
                            priority: fields.priority?.name || 'Default',
                            url: `${jira_base_url}/browse/${issue.key}`,
                            last_updated: now,
                            category
                        };
                    });
                } catch (e: unknown) {
                    console.error("Error fetching Jira issues:", e);
                    return [];
                }
            };

            const fetchByKeys = async (keys: string[]): Promise<JiraIssue[]> => {
                if (keys.length === 0) return [];
                // JQL to fetch specific keys: key IN ("KEY-1", "KEY-2")
                const jql = `key IN (${keys.map(k => `"${k}"`).join(',')})`;
                return fetchIssues(jql, 'noop'); // Category 'noop' is fine for the JiraIssue object itself
            };

            try {
                const [newIssues, inProgressIssues, noopIssues] = await Promise.all([
                    fetchIssues(jqlNew, 'new'),
                    fetchIssues(jqlInProgress, 'in_progress'),
                    fetchIssues(jqlNoop, 'noop')
                ]);

                // Collect all keys from support_issues that aren't in any of the fetched results
                const fetchedKeys = new Set([
                    ...newIssues.map(i => i.key),
                    ...inProgressIssues.map(i => i.key),
                    ...noopIssues.map(i => i.key)
                ]);

                const missingKeys = (customer.support_issues || [])
                    .flatMap(issue => issue.related_jiras || [])
                    .filter(key => key && key !== 'TBD' && !fetchedKeys.has(key));

                const uniqueMissingKeys = Array.from(new Set(missingKeys));
                const linkedIssues = await fetchByKeys(uniqueMissingKeys);

                let healthStatus: CustomerHealthData['healthStatus'] = 'Healthy';
                if (newIssues.length > 0) {
                    healthStatus = 'New / Untriaged'; 
                } else if (inProgressIssues.length > 0) {
                    healthStatus = 'Active Work';
                } else if (noopIssues.length > 0) {
                    healthStatus = 'Blocked / Pending';
                }

                setHealthData({
                    newIssues,
                    inProgressIssues,
                    noopIssues,
                    linkedIssues,
                    healthStatus,
                    loading: false,
                    error: null
                });
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : 'Error loading health data.';
                setHealthData(prev => ({
                    ...prev,
                    loading: false,
                    error: msg
                }));
            }
        };

        fetchHealth();
    }, [customer, settings]);

    return healthData;
};
