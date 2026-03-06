import { useState, useEffect } from 'react';
import type { Customer, Settings, JiraIssue } from '../types/models';
import { authorizedFetch } from '../utils/api';

export interface CustomerHealthData {
    newIssues: JiraIssue[];
    inProgressIssues: JiraIssue[];
    noopIssues: JiraIssue[];
    healthStatus: 'Healthy' | 'Blocked / Pending' | 'Active Work' | 'New / Untriaged' | 'Unknown';
    loading: boolean;
    error: string | null;
}

export const useCustomerHealth = (customer: Customer | undefined, settings: Settings | undefined) => {
    const [healthData, setHealthData] = useState<CustomerHealthData>({
        newIssues: [],
        inProgressIssues: [],
        noopIssues: [],
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
                    return (resData.data.issues || []).map((issue: any) => {
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
                } catch (e: any) {
                    console.error("Error fetching Jira issues:", e);
                    return [];
                }
            };

            try {
                const [newIssues, inProgressIssues, noopIssues] = await Promise.all([
                    fetchIssues(jqlNew, 'new'),
                    fetchIssues(jqlInProgress, 'in_progress'),
                    fetchIssues(jqlNoop, 'noop')
                ]);

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
                    healthStatus,
                    loading: false,
                    error: null
                });
            } catch (error: any) {
                setHealthData(prev => ({
                    ...prev,
                    loading: false,
                    error: error.message || 'Error loading health data.'
                }));
            }
        };

        fetchHealth();
    }, [customer?.customer_id, settings]); // Reduced dependency surface

    return healthData;
};
