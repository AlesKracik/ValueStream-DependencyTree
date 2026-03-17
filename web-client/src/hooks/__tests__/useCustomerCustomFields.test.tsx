import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCustomerCustomFields } from '../useCustomerCustomFields';
import { authorizedFetch } from '../../utils/api';
import type { Settings } from '../../types/models';

vi.mock('../../utils/api', () => ({
    authorizedFetch: vi.fn()
}));

const mockSettings: Settings = {
    general: {
        fiscal_year_start_month: 1,
        sprint_duration_days: 14
    },
    persistence: {
        mongo: {
            app: {
                uri: 'mongodb://localhost:27017',
                db: 'testdb',
                use_proxy: false,
                auth: { method: 'scram' }
            },
            customer: {
                uri: 'mongodb://localhost',
                db: 'testdb',
                use_proxy: false,
                tunnel_name: 'test-tunnel',
                custom_query: '{"customer_id": "{{CUSTOMER_ID}}"}',
                auth: { method: 'scram' }
            }
        }
    },
    jira: {
        base_url: 'https://jira.com',
        api_version: '3',
        api_token: 'token',
        customer: { jql_new: '', jql_in_progress: '', jql_noop: '' }
    },
    ai: {
        provider: 'openai',
        api_key: '',
        support: { prompt: '' }
    }
};

describe('useCustomerCustomFields', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty data if no customers or settings provided', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { result } = renderHook(() => useCustomerCustomFields([], null as any));
        expect(result.current.data).toEqual([]);
        expect(result.current.loading).toBe(false);
    });

    it('returns empty data if no custom query is configured', async () => {
        const settingsNoQuery = { 
            ...mockSettings, 
            persistence: { 
                ...mockSettings.persistence,
                mongo: {
                    ...mockSettings.persistence.mongo,
                    customer: { ...mockSettings.persistence.mongo.customer, custom_query: '' }
                }
            } 
        };
         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { result } = renderHook(() => useCustomerCustomFields([{ id: 'CUST-1' }] as any, settingsNoQuery as any));
        expect(result.current.data).toEqual([]);
    });

    it('fetches data for a single customer', async () => {
        const customer = { id: 'CUST-1' };
        const mockData = [{ custom_field: 'value', customer_id: 'CUST-1' }];
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (authorizedFetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, data: mockData })
        });

         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { result } = renderHook(() => useCustomerCustomFields(customer as any, mockSettings as any));

        await waitFor(() => {
            expect(result.current.data).toEqual(mockData);
            expect(result.current.loading).toBe(false);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [url, options] = (authorizedFetch as any).mock.calls[0];
        expect(url).toBe('/api/mongo/query');
        expect(options.method).toBe('POST');
        expect(options.headers).toMatchObject({ 'Content-Type': 'application/json' });
        
        const callBody = JSON.parse(options.body);
        expect(callBody.query).toContain('"customer_id"');
        expect(callBody.query).toContain('CUST-1');
    });

    it('fetches data for multiple customers using $in clause', async () => {
        const customers = [{ id: 'CUST-1' }, { id: 'CUST-2' }];
        const mockData = [
            { custom_field: 'value1', customer_id: 'CUST-1' },
            { custom_field: 'value2', customer_id: 'CUST-2' }
        ];
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (authorizedFetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, data: mockData })
        });

         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { result } = renderHook(() => useCustomerCustomFields(customers as any, mockSettings as any));

        await waitFor(() => {
            expect(result.current.data).toEqual(mockData);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fetchCall = (authorizedFetch as any).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.query).toContain('"$in":["CUST-1","CUST-2"]');
    });

    it('handles API errors', async () => {
        const customer = { id: 'CUST-1' };
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (authorizedFetch as any).mockResolvedValueOnce({
            ok: false,
            json: async () => ({ success: false, error: 'Database connection failed' })
        });

         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { result } = renderHook(() => useCustomerCustomFields(customer as any, mockSettings as any));

        await waitFor(() => {
            expect(result.current.error).toBe('Database connection failed');
            expect(result.current.data).toEqual([]);
        });
    });

    it('passes proxy configuration and connection_type to the API', async () => {
        const customer = { id: 'CUST-1' };
        const settings = {
            ...mockSettings,
            persistence: {
                ...mockSettings.persistence,
                mongo: {
                    ...mockSettings.persistence.mongo,
                    customer: {
                        ...mockSettings.persistence.mongo.customer,
                        use_proxy: true,
                        tunnel_name: 'test-tunnel'
                    }
                }
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (authorizedFetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, data: [] })
        });

         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderHook(() => useCustomerCustomFields(customer as any, settings as any));
        
        await waitFor(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fetchCall = (authorizedFetch as any).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.connection_type).toBe('customer');
            expect(body.persistence.mongo.customer.use_proxy).toBe(true);
            expect(body.persistence.mongo.customer.tunnel_name).toBe('test-tunnel');
        });
    });
});
