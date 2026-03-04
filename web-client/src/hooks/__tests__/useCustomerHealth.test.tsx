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
    jira_base_url: 'https://jira.test',
    jira_api_version: '3',
    jira_api_token: 'test-token',
    customer_jql_new: 'project = TEST AND cf[123] = "{{CUSTOMER_ID}}" AND status = New',
    customer_jql_in_progress: 'project = TEST AND cf[123] = "{{CUSTOMER_ID}}" AND status = "In Progress"',
    customer_jql_noop: 'project = TEST AND cf[123] = "{{CUSTOMER_ID}}" AND status = Blocked'
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
            body: expect.stringContaining('"jira_base_url":"https://jira.test"')
        }));
        
        expect(api.authorizedFetch).toHaveBeenCalledWith('/api/jira/search', expect.objectContaining({
            body: expect.stringContaining('"jira_api_token":"test-token"')
        }));

        expect(result.current.newIssues).toHaveLength(1);
        expect(result.current.healthStatus).toBe('New / Untriaged');
    });

    it('should handle API errors gracefully', async () => {
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
});
