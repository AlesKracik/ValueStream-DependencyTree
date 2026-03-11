import { useState, useEffect, useMemo } from 'react';
import { authorizedFetch } from '../utils/api';
import type { Settings, Customer } from '../types/models';

export function useCustomerCustomFields(customerOrCustomers: Customer | Customer[] | undefined, settings: Settings | undefined) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Create a stable key for the customer IDs to use as a dependency
    const customerIds = useMemo(() => {
        const customers = Array.isArray(customerOrCustomers) ? customerOrCustomers : (customerOrCustomers ? [customerOrCustomers] : []);
        return customers.map(c => c.customer_id).filter(Boolean) as string[];
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

                const response = await authorizedFetch('/api/mongo/query', {
                    method: 'POST',
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
                }
            } catch (err: any) {
                setError(err.message || 'Network error fetching custom fields');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [customerIdsKey, settings]);

    return { data, loading, error };
}
