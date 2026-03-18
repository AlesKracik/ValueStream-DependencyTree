import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCustomerHealth } from '../useCustomerHealth';
import * as api from '../../utils/api';
import type { Customer, Settings } from '../../types/models';

vi.mock('../../utils/api', () => ({
    authorizedFetch: vi.fn()
}));

const mockCustomer: Customer = {
    id: 'c1',
    name: 'Test Customer',
    customer_id: 'CUST-123',
    existing_tcv: 1000,
    potential_tcv: 500
};

const mockSettings: Settings = {
    general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
    persistence: { 
        mongo: { 
            app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
            customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
        }
    },
    jira: {
        base_url: 'https://jira.test',
        api_version: '3',
        api_token: 'test-token',
        customer: {
            jql_new: 'project = TEST AND cf[123] = "{{CUSTOMER_ID}}" AND status = New',
            jql_in_progress: 'project = TEST AND cf[123] = "{{CUSTOMER_ID}}" AND status = "In Progress"',
            jql_noop: 'project = TEST AND cf[123] = "{{CUSTOMER_ID}}" AND status = Blocked'
        }
    },
    aha: { subdomain: '', api_key: '' },
    ai: { provider: 'openai', support: { prompt: '' } }
};

describe('useCustomerHealth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return default state when customer or settings are missing', () => {
        const { result } = renderHook(() => useCustomerHealth(undefined, undefined));
        expect(result.current.healthStatus).toBe('Unknown');
        expect(result.current.loading).toBe(false);
    });

    it('should fetch Jira issues with correct parameters and settings in body', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.authorizedFetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                data: {
                    issues: [
                        {
                            key: 'TEST-1',
                            fields: {
                                summary: 'Test Issue',
                                status: { name: 'New' },
                                priority: { name: 'High' },
                                description: 'Test Description',
                                comment: { comments: [] }
                            }
                        }
                    ]
                }
            })
        });

        const { result } = renderHook(() => useCustomerHealth(mockCustomer, mockSettings));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(api.authorizedFetch).toHaveBeenCalledWith('/api/jira/search', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"jql":"project = TEST AND cf[123] = \\"CUST-123\\" AND status = New"')
        }));

        expect(api.authorizedFetch).toHaveBeenCalledWith('/api/jira/search', expect.objectContaining({
            body: expect.stringContaining('"jira":{"base_url":"https://jira.test"')
        }));
        
        expect(api.authorizedFetch).toHaveBeenCalledWith('/api/jira/search', expect.objectContaining({
            body: expect.stringContaining('"api_token":"test-token"')
        }));

        expect(result.current.newIssues).toHaveLength(1);
        expect(result.current.healthStatus).toBe('New / Untriaged');
    });

    it('should handle API errors gracefully', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.authorizedFetch as any).mockResolvedValue({
            ok: false,
            json: async () => ({ success: false, error: 'Jira API Error' })
        });

        const { result } = renderHook(() => useCustomerHealth(mockCustomer, mockSettings));

        await waitFor(() => expect(result.current.loading).toBe(false));

        // In the current implementation of useCustomerHealth, if one fetch fails, it might still return others or catch at a higher level.
        // Looking at the implementation, it catches errors and sets error state.
        expect(result.current.error).toBeDefined();
    });

    it('should fetch additional Jira issues mentioned in support_issues that were missed by JQL', async () => {
        const customerWithSupport: Customer = {
            ...mockCustomer,
            support_issues: [
                { id: 'i1', description: 'Problem', status: 'work in progress', related_jiras: ['MISSING-101', 'ALREADY-FOUND'] }
            ]
        };

         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.authorizedFetch as any).mockImplementation(async (_url: string, options: any) => {
            const body = JSON.parse(options.body);
            const jql = body.jql;

            if (jql.includes('status = New')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        data: {
                            issues: [{ key: 'ALREADY-FOUND', fields: { summary: 'Found by JQL', status: { name: 'New' } } }]
                        }
                    })
                };
            }

            if (jql.includes('key IN ("MISSING-101")')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        data: {
                            issues: [{ key: 'MISSING-101', fields: { summary: 'Fetched by Key', status: { name: 'In Progress' } } }]
                        }
                    })
                };
            }

            // Default for other JQLs (InProgress, Noop)
            return {
                ok: true,
                json: async () => ({ success: true, data: { issues: [] } })
            };
        });

        const { result } = renderHook(() => useCustomerHealth(customerWithSupport, mockSettings));

        await waitFor(() => expect(result.current.loading).toBe(false));

        // Should have found ALREADY-FOUND in newIssues
        expect(result.current.newIssues.some(i => i.key === 'ALREADY-FOUND')).toBe(true);

        // Should have fetched MISSING-101 separately and put it in linkedIssues
        expect(result.current.linkedIssues.some(i => i.key === 'MISSING-101')).toBe(true);
        expect(result.current.linkedIssues.find(i => i.key === 'MISSING-101')?.summary).toBe('Fetched by Key');
        
        // noopIssues should be empty in this mock scenario
        expect(result.current.noopIssues).toHaveLength(0);

        // Check that the specific key fetch was actually called
        expect(api.authorizedFetch).toHaveBeenCalledWith('/api/jira/search', expect.objectContaining({
            body: expect.stringContaining('"jql":"key IN (\\"MISSING-101\\")"')
        }));
    });

    it('should prioritize health status correctly (New > In Progress > Blocked)', async () => {
         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.authorizedFetch as any).mockImplementation(async (_url: string, options: any) => {
            const body = JSON.parse(options.body);
            const jql = body.jql;

            if (jql.includes('status = New')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        data: { issues: [{ key: 'NEW-1', fields: { summary: 'New', status: { name: 'New' } } }] }
                    })
                };
            }
            if (jql.includes('status = "In Progress"')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        data: { issues: [{ key: 'IP-1', fields: { summary: 'IP', status: { name: 'In Progress' } } }] }
                    })
                };
            }
            if (jql.includes('status = Blocked')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        data: { issues: [{ key: 'BLOCKED-1', fields: { summary: 'Blocked', status: { name: 'Blocked' } } }] }
                    })
                };
            }
            return { ok: true, json: async () => ({ success: true, data: { issues: [] } }) };
        });

        const { result } = renderHook(() => useCustomerHealth(mockCustomer, mockSettings));
        await waitFor(() => expect(result.current.loading).toBe(false));

        // When all types are present, New / Untriaged should win
        expect(result.current.healthStatus).toBe('New / Untriaged');
    });
});
