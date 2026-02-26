import { useState, useEffect } from 'react';
import type { DashboardData, Customer, Feature, Team, Epic, Settings } from '../types/models';

export function useDashboardData() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const response = await fetch('/mockData.json');
                if (!response.ok) {
                    throw new Error('Failed to fetch data');
                }
                const json = await response.json();
                setData(json);
            } catch (err) {
                setError(err as Error);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    const addCustomer = (customer: Customer) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                customers: [...prev.customers, customer]
            };
        });
    };

    const deleteCustomer = (id: string) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                customers: prev.customers.filter(c => c.id !== id),
                features: prev.features.map(f => ({
                    ...f,
                    customer_targets: f.customer_targets.filter(ct => ct.customer_id !== id)
                }))
            };
        });
    };

    const updateCustomer = (id: string, updates: Partial<Customer>) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                customers: prev.customers.map(c => c.id === id ? { ...c, ...updates } : c)
            };
        });
    };

    const addFeature = (feature: Feature) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                features: [...prev.features, feature]
            };
        });
    };

    const deleteFeature = (id: string) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                features: prev.features.filter(f => f.id !== id),
                epics: prev.epics.map(e => e.feature_id === id ? { ...e, feature_id: undefined } : e)
            };
        });
    };

    const updateFeature = (id: string, updates: Partial<Feature>) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                features: prev.features.map(f => f.id === id ? { ...f, ...updates } : f)
            };
        });
    };

    const updateTeam = (id: string, updates: Partial<Team>) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                teams: prev.teams.map(t => t.id === id ? { ...t, ...updates } : t)
            };
        });
    };

    const addEpic = (epic: Epic) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                epics: [...prev.epics, epic]
            };
        });
    };

    const deleteEpic = (id: string) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                epics: prev.epics.filter(e => e.id !== id)
            };
        });
    };

    const updateEpic = (id: string, updates: Partial<Epic>) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                epics: prev.epics.map(e => e.id === id ? { ...e, ...updates } : e)
            };
        });
    };

    const updateSettings = (updates: Partial<Settings>) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                settings: { ...prev.settings, ...updates }
            };
        });
    };

    const saveDashboardData = async (newData: DashboardData) => {
        try {
            const response = await fetch('/api/saveData', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newData)
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to save data');
            }
        } catch (err) {
            console.error('Error saving dashboard data:', err);
            throw err;
        }
    };

    return {
        data,
        loading,
        error,
        addCustomer,
        deleteCustomer,
        updateCustomer,
        addFeature,
        deleteFeature,
        updateFeature,
        addEpic,
        deleteEpic,
        updateTeam,
        updateEpic,
        updateSettings,
        saveDashboardData
    };
}
