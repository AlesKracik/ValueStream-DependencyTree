import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCustomerCustomFields } from '../useCustomerCustomFields';
import { authorizedFetch } from '../../utils/api';

vi.mock('../../utils/api', () => ({
    authorizedFetch: vi.fn()
}));

describe('useCustomerCustomFields', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty data if no customers or settings provided', async () => {
        const { result } = renderHook(() => useCustomerCustomFields(undefined, undefined));
        
        expect(result.current.data).toEqual([]);
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('returns empty data if no custom query is configured', async () => {
        const customer = { customer_id: 'CUST-1', id: '1', name: 'Test' };
        const settings = { customer_mongo_uri: 'mongodb://localhost' }; // missing query
        
        const { result } = renderHook(() => useCustomerCustomFields(customer as any, settings as any));
        
        expect(result.current.data).toEqual([]);
    });

    it('fetches data for a single customer', async () => {
        const customer = { customer_id: 'CUST-1', id: '1', name: 'Test' };
        const settings = { 
            customer_mongo_uri: 'mongodb://localhost',
            customer_mongo_custom_query: '[{"$match": {"customer_id": "{{CUSTOMER_ID}}"}}]'
        };

        const mockData = [{ customer_id: 'CUST-1', custom_field: 'value' }];
        
        (authorizedFetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, data: mockData })
        });

        const { result } = renderHook(() => useCustomerCustomFields(customer as any, settings as any));
        
        expect(result.current.loading).toBe(true);
        
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.data).toEqual(mockData);
        expect(authorizedFetch).toHaveBeenCalledWith('/api/mongo/query', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('\\"CUST-1\\"')
        }));
    });

    it('fetches data for multiple customers using $in clause', async () => {
        const customers = [
            { customer_id: 'CUST-1', id: '1', name: 'Test1' },
            { customer_id: 'CUST-2', id: '2', name: 'Test2' }
        ];
        const settings = { 
            customer_mongo_uri: 'mongodb://localhost',
            customer_mongo_custom_query: '[{"$match": {"customer_id": "{{CUSTOMER_ID}}"}}]'
        };

        const mockData = [
            { customer_id: 'CUST-1', custom_field: 'value1' },
            { customer_id: 'CUST-2', custom_field: 'value2' }
        ];
        
        (authorizedFetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, data: mockData })
        });

        const { result } = renderHook(() => useCustomerCustomFields(customers as any, settings as any));
        
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.data).toEqual(mockData);
        
        // Ensure the payload contains the $in clause properly stringified
        const fetchCall = (authorizedFetch as any).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.query).toContain('{"$in":["CUST-1","CUST-2"]}');
    });

    it('handles API errors', async () => {
        const customer = { customer_id: 'CUST-1', id: '1', name: 'Test' };
        const settings = { 
            customer_mongo_uri: 'mongodb://localhost',
            customer_mongo_custom_query: '[{"$match": {"customer_id": "{{CUSTOMER_ID}}"}}]'
        };

        (authorizedFetch as any).mockResolvedValueOnce({
            ok: false,
            json: async () => ({ success: false, error: 'Database connection failed' })
        });

        const { result } = renderHook(() => useCustomerCustomFields(customer as any, settings as any));
        
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.error).toBe('Database connection failed');
        expect(result.current.data).toEqual([]);
    });

    it('passes proxy configuration and connection_type to the API', async () => {
        const customer = { customer_id: 'CUST-1', id: '1', name: 'Test' };
        const settings = { 
            customer_mongo_uri: 'mongodb://localhost',
            customer_mongo_custom_query: '[{"$match": {"customer_id": "{{CUSTOMER_ID}}"}}]',
            customer_mongo_use_proxy: true,
        };

        (authorizedFetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, data: [] })
        });

        renderHook(() => useCustomerCustomFields(customer as any, settings as any));
        
        await waitFor(() => {
            const fetchCall = (authorizedFetch as any).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.connection_type).toBe('customer');
            expect(body.customer_mongo_use_proxy).toBe(true);
            expect(body.customer_mongo_uri).toBe('mongodb://localhost');
        });
    });
});
