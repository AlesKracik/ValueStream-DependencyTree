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

    const updateCustomer = (id: string, updates: Partial<Customer>) => {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                customers: prev.customers.map(c => c.id === id ? { ...c, ...updates } : c)
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

    return {
        data,
        loading,
        error,
        updateCustomer,
        updateFeature,
        updateTeam,
        updateEpic,
        updateSettings
    };
}
