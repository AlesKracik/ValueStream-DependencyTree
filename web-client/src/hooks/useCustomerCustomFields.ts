import { useState, useEffect, useMemo } from 'react';
import { authorizedFetch } from '../utils/api';
import type { Settings, Customer } from '../types/models';

export function useCustomerCustomFields(customerOrCustomers: Customer | Customer[] | null | undefined, settings: Settings | null | undefined) {
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const customerIds = useMemo(() => {
        const ids = Array.isArray(customerOrCustomers) 
            ? customerOrCustomers.map(c => c.customer_id || c.id).filter(Boolean)
            : (customerOrCustomers?.customer_id || customerOrCustomers?.id) ? [customerOrCustomers!.customer_id || customerOrCustomers!.id] : [];
        return ids;
    }, [customerOrCustomers]);

    const customerIdsKey = customerIds.join(',');

    useEffect(() => {
        async function fetchData() {
            const customerMongo = settings?.persistence?.mongo?.customer;
            if (customerIds.length === 0 || !customerMongo?.uri || !customerMongo?.custom_query) {
                setData([]);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                // Replace {{CUSTOMER_ID}} with either a single string or an $in clause
                const replacementValue = customerIds.length === 1 
                    ? customerIds[0] 
                    : { $in: customerIds };
                
                const queryStr = customerMongo.custom_query.replace(/"?{{CUSTOMER_ID}}"?/g, JSON.stringify(replacementValue));

                const response = await authorizedFetch('/api/mongo/query', {                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        persistence: {
                            mongo: {
                                customer: customerMongo
                            }
                        },
                        connection_type: 'customer',
                        query: queryStr
                    })
                });

                const resData = await response.json();
                if (response.ok && resData.success) {
                    setData(resData.data || []);
                } else {
                    setError(resData.error || 'Failed to fetch custom fields');
                    setData([]);
                }
            } catch (err: unknown) {
                console.error('Error fetching custom fields:', err);
                const msg = err instanceof Error ? err.message : 'Network error fetching custom fields';
                setError(msg);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [customerIdsKey, customerIds, settings]);

    return { data, loading, error };
}
