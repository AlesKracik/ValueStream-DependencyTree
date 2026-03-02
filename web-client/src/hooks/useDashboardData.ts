import { useState, useEffect, useMemo, useCallback } from 'react';
import { parseISO } from 'date-fns';
import type { DashboardData, Customer, WorkItem, Team, Epic, Settings, Sprint, DashboardEntity, DashboardParameters } from '../types/models';
import { authorizedFetch, debounce } from '../utils/api';
import { calculateQuarter } from '../utils/dateHelpers';

const persistEntity = async (collection: string, method: 'POST' | 'DELETE', entity: any) => {
    try {
        await authorizedFetch(`/api/entity/${collection}${method === 'DELETE' ? `/${entity.id}` : ''}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method === 'DELETE' ? undefined : JSON.stringify(entity)
        });
    } catch (e) {
        console.error(`Failed to ${method} entity in ${collection}`, e);
    }
};

const persistSettings = async (settings: any) => {
    try {
        await authorizedFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
    } catch (e) {
        console.error("Failed to persist settings", e);
    }
};

export function useDashboardData(dashboardId?: string, filters?: Partial<DashboardParameters>, persistenceDebounceMs = 1000) {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    // Debounced persistence functions
    const debouncedPersist = useMemo(() => debounce(persistEntity, persistenceDebounceMs), [persistenceDebounceMs]);
    const debouncedSettings = useMemo(() => debounce(persistSettings, persistenceDebounceMs), [persistenceDebounceMs]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (dashboardId) params.append('dashboardId', dashboardId);
            if (filters) {
                Object.entries(filters).forEach(([key, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        params.append(key, String(value));
                    }
                });
            }
            const queryString = params.toString();
            const response = await authorizedFetch(`/api/loadData${queryString ? `?${queryString}` : ''}`);
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
    };

    useEffect(() => {
        fetchData();
    }, [dashboardId, JSON.stringify(filters)]);

    const refreshData = () => {
        fetchData();
    };

    const addCustomer = (customer: Customer) => {
        persistEntity('customers', 'POST', customer);
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, customers: [...prev.customers, customer] };
        });
    };

    const deleteCustomer = (id: string) => {
        setData(prev => {
            if (!prev) return prev;
            
            const updatedWorkItems = prev.workItems.map(f => ({
                ...f,
                customer_targets: f.customer_targets.filter(ct => ct.customer_id !== id)
            }));
            
            persistEntity('customers', 'DELETE', { id });
            
            // Persist cascaded updates
            prev.workItems.forEach((oldW, i) => {
                if (oldW.customer_targets.length !== updatedWorkItems[i].customer_targets.length) {
                    persistEntity('workItems', 'POST', updatedWorkItems[i]);
                }
            });

            return {
                ...prev,
                customers: prev.customers.filter(c => c.id !== id),
                workItems: updatedWorkItems
            };
        });
    };

    const updateCustomer = (id: string, updates: Partial<Customer>) => {
        setData(prev => {
            if (!prev) return prev;
            const existing = prev.customers.find(c => c.id === id);
            if (existing) {
                debouncedPersist('customers', 'POST', { ...existing, ...updates });
            }
            return {
                ...prev,
                customers: prev.customers.map(c => c.id === id ? { ...c, ...updates } : c)
            };
        });
    };

    const addWorkItem = (workItem: WorkItem) => {
        persistEntity('workItems', 'POST', workItem);
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, workItems: [...prev.workItems, workItem] };
        });
    };

    const deleteWorkItem = (id: string) => {
        setData(prev => {
            if (!prev) return prev;
            
            const updatedEpics = prev.epics.map(e => e.work_item_id === id ? { ...e, work_item_id: undefined } : e);
            
            persistEntity('workItems', 'DELETE', { id });
            
            prev.epics.forEach((oldE, i) => {
                if (oldE.work_item_id === id) {
                    persistEntity('epics', 'POST', updatedEpics[i]);
                }
            });

            return {
                ...prev,
                workItems: prev.workItems.filter(f => f.id !== id),
                epics: updatedEpics
            };
        });
    };

    const updateWorkItem = (id: string, updates: Partial<WorkItem>) => {
        setData(prev => {
            if (!prev) return prev;
            const existing = prev.workItems.find(w => w.id === id);
            if (existing) {
                debouncedPersist('workItems', 'POST', { ...existing, ...updates });
            }
            return {
                ...prev,
                workItems: prev.workItems.map(f => f.id === id ? { ...f, ...updates } : f)
            };
        });
    };

    const updateTeam = (id: string, updates: Partial<Team>) => {
        setData(prev => {
            if (!prev) return prev;
            const existing = prev.teams.find(t => t.id === id);
            if (existing) {
                debouncedPersist('teams', 'POST', { ...existing, ...updates });
            }
            return {
                ...prev,
                teams: prev.teams.map(t => t.id === id ? { ...t, ...updates } : t)
            };
        });
    };

    const addEpic = (epic: Epic) => {
        persistEntity('epics', 'POST', epic);
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, epics: [...prev.epics, epic] };
        });
    };

    const deleteEpic = (id: string) => {
        persistEntity('epics', 'DELETE', { id });
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, epics: prev.epics.filter(e => e.id !== id) };
        });
    };

    const updateEpic = (id: string, updates: Partial<Epic>) => {
        setData(prev => {
            if (!prev) return prev;
            const existing = prev.epics.find(e => e.id === id);
            if (existing) {
                debouncedPersist('epics', 'POST', { ...existing, ...updates });
            }
            return {
                ...prev,
                epics: prev.epics.map(e => e.id === id ? { ...e, ...updates } : e)
            };
        });
    };

    const updateSettings = (updates: Partial<Settings>) => {
        setData(prev => {
            if (!prev) return prev;
            const newSettings = { ...prev.settings, ...updates };
            
            let newSprints = prev.sprints;
            // If fiscal start month changed, recompute all sprint quarters
            if (updates.fiscal_year_start_month !== undefined && updates.fiscal_year_start_month !== prev.settings.fiscal_year_start_month) {
                newSprints = prev.sprints.map(s => ({
                    ...s,
                    quarter: calculateQuarter(s.end_date, updates.fiscal_year_start_month!)
                }));
                // Persist all updated sprints immediately (important consistency change)
                newSprints.forEach(s => persistEntity('sprints', 'POST', s));
            }

            debouncedSettings(newSettings);
            
            // If connection string, integration keys, or database creation flag changed, re-fetch everything from the new source
            if (updates.mongo_uri !== undefined || updates.mongo_db !== undefined || updates.mongo_auth_method !== undefined ||
                updates.mongo_create_if_not_exists !== undefined ||
                updates.jira_base_url !== undefined || updates.jira_api_token !== undefined) {
                refreshData();
            }

            return { ...prev, settings: newSettings, sprints: newSprints };
        });
    };

    const addSprint = (sprint: Sprint) => {
        setData(prev => {
            if (!prev) return prev;
            const newSprint = {
                ...sprint,
                quarter: calculateQuarter(sprint.end_date, prev.settings.fiscal_year_start_month || 1)
            };
            persistEntity('sprints', 'POST', newSprint);
            return {
                ...prev,
                sprints: [...prev.sprints, newSprint].sort((a, b) => a.start_date.localeCompare(b.start_date))
            };
        });
    };

    const updateSprint = (id: string, updates: Partial<Sprint>) => {
        setData(prev => {
            if (!prev) return prev;
            const existing = prev.sprints.find(s => s.id === id);
            if (!existing) return prev;

            const updatedSprint = { ...existing, ...updates };
            // If end date is provided (or start date, though quarter is based on end), recompute quarter
            if (updates.end_date || updates.start_date) {
                updatedSprint.quarter = calculateQuarter(updatedSprint.end_date, prev.settings.fiscal_year_start_month || 1);
            }

            debouncedPersist('sprints', 'POST', updatedSprint);
            
            return {
                ...prev,
                sprints: prev.sprints.map(s => s.id === id ? updatedSprint : s).sort((a, b) => a.start_date.localeCompare(b.start_date))
            };
        });
    };

    const deleteSprint = (id: string) => {
        persistEntity('sprints', 'DELETE', { id });
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                sprints: prev.sprints.filter(s => s.id !== id)
            };
        });
    };

    const addDashboard = (dashboard: DashboardEntity) => {
        persistEntity('dashboards', 'POST', dashboard);
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, dashboards: [...prev.dashboards, dashboard] };
        });
    };

    const updateDashboard = (id: string, updates: Partial<DashboardEntity>) => {
        setData(prev => {
            if (!prev) return prev;
            const existing = prev.dashboards.find(d => d.id === id);
            if (existing) {
                debouncedPersist('dashboards', 'POST', { ...existing, ...updates });
            }
            return {
                ...prev,
                dashboards: prev.dashboards.map(d => d.id === id ? { ...d, ...updates } : d)
            };
        });
    };

    const deleteDashboard = (id: string) => {
        persistEntity('dashboards', 'DELETE', { id });
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, dashboards: prev.dashboards.filter(d => d.id !== id) };
        });
    };

    return {
        data,
        loading,
        error,
        refreshData,
        addCustomer,
        deleteCustomer,
        updateCustomer,
        addWorkItem,
        deleteWorkItem,
        updateWorkItem,
        addEpic,
        deleteEpic,
        updateTeam,
        updateEpic,
        addSprint,
        updateSprint,
        deleteSprint,
        updateSettings,
        addDashboard,
        updateDashboard,
        deleteDashboard
    };
}
