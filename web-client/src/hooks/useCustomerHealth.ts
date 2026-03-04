import { useState, useEffect } from 'react';
import type { Customer, Settings } from '../types/models';
import { authorizedFetch } from '../utils/api';

export interface JiraIssue {
    key: string;
    summary: string;
    description?: string;
    lastComment?: string;
    status: string;
    priority: string;
    url: string;
}

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

            const fetchIssues = async (jql: string): Promise<JiraIssue[]> => {
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

                    return (resData.data.issues || []).map((issue: any) => {
                        const fields = issue.fields || {};
                        const comments = fields.comment?.comments || [];
                        const lastComment = comments.length > 0 ? comments[comments.length - 1].body : undefined;
                        
                        // Handle potential Atlassian Document Format (ADF) or plain string for description
                        let description = '';
                        if (typeof fields.description === 'string') {
                            description = fields.description;
                        } else if (fields.description?.content) {
                            // Basic extraction from ADF
                            description = fields.description.content
                                .map((c: any) => c.content?.map((inner: any) => inner.text).join('') || '')
                                .join(' ');
                        }

                        return {
                            key: issue.key,
                            summary: fields.summary || 'Unknown',
                            description: description ? (description.length > 500 ? description.substring(0, 500) + '...' : description) : undefined,
                            lastComment: lastComment ? (typeof lastComment === 'string' ? (lastComment.length > 300 ? lastComment.substring(0, 300) + '...' : lastComment) : 'Complex comment format') : undefined,
                            status: fields.status?.name || 'Unknown',
                            priority: fields.priority?.name || 'Default',
                            url: `${jira_base_url}/browse/${issue.key}`
                        };
                    });
                } catch (e: any) {
                    console.error("Error fetching Jira issues:", e);
                    return [];
                }
            };

            try {
                const [newIssues, inProgressIssues, noopIssues] = await Promise.all([
                    fetchIssues(jqlNew),
                    fetchIssues(jqlInProgress),
                    fetchIssues(jqlNoop)
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
    }, [customer, settings]);

    return healthData;
};
