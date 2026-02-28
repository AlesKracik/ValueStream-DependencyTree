import { useState, useEffect } from 'react';
import type { DashboardData, Customer, WorkItem, Team, Epic, Settings, Sprint, DashboardEntity } from '../types/models';
import { calculateWorkItemScores } from './scoreCalculator';

const persistEntity = async (collection: string, method: 'POST' | 'DELETE', entity: any) => {
    try {
        await fetch(`/api/entity/${collection}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entity)
        });
    } catch (e) {
        console.error(`Failed to ${method} entity in ${collection}`, e);
    }
};

const persistSettings = async (settings: any) => {
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
    } catch (e) {
        console.error("Failed to persist settings", e);
    }
};

export function useDashboardData() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const response = await fetch('/api/loadData');
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

    // Automatic score recalculation and persistence
    useEffect(() => {
        if (!data || loading) return;

        const workItemsWithNewScores = calculateWorkItemScores(data);
        
        // Find which work items actually had their score changed
        const updatesToPersist: WorkItem[] = [];
        let localStateNeedsUpdate = false;

        workItemsWithNewScores.forEach((newItem) => {
            const oldItem = data.workItems.find(w => w.id === newItem.id);
            if (!oldItem || oldItem.score !== newItem.score) {
                updatesToPersist.push(newItem);
                localStateNeedsUpdate = true;
            }
        });

        if (localStateNeedsUpdate) {
            // Update local state once
            setData(prev => {
                if (!prev) return prev;
                
                // Avoid infinite loops by checking if update is still needed against latest prev
                const stillNeedsUpdate = workItemsWithNewScores.some((newItem) => {
                    const currentItem = prev.workItems.find(w => w.id === newItem.id);
                    return !currentItem || currentItem.score !== newItem.score;
                });
                if (!stillNeedsUpdate) return prev;

                return { ...prev, workItems: workItemsWithNewScores };
            });

            // Persist changes to DB
            updatesToPersist.forEach(item => {
                persistEntity('workItems', 'POST', item);
            });
        }
    }, [data?.customers, data?.workItems, data?.epics, loading]);

    const addCustomer = (customer: Customer) => {
        setData(prev => {
            if (!prev) return prev;
            persistEntity('customers', 'POST', customer);
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
                persistEntity('customers', 'POST', { ...existing, ...updates });
            }
            return {
                ...prev,
                customers: prev.customers.map(c => c.id === id ? { ...c, ...updates } : c)
            };
        });
    };

    const addWorkItem = (workItem: WorkItem) => {
        setData(prev => {
            if (!prev) return prev;
            persistEntity('workItems', 'POST', workItem);
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
                persistEntity('workItems', 'POST', { ...existing, ...updates });
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
                persistEntity('teams', 'POST', { ...existing, ...updates });
            }
            return {
                ...prev,
                teams: prev.teams.map(t => t.id === id ? { ...t, ...updates } : t)
            };
        });
    };

    const addEpic = (epic: Epic) => {
        setData(prev => {
            if (!prev) return prev;
            persistEntity('epics', 'POST', epic);
            return { ...prev, epics: [...prev.epics, epic] };
        });
    };

    const deleteEpic = (id: string) => {
        setData(prev => {
            if (!prev) return prev;
            persistEntity('epics', 'DELETE', { id });
            return { ...prev, epics: prev.epics.filter(e => e.id !== id) };
        });
    };

    const updateEpic = (id: string, updates: Partial<Epic>) => {
        setData(prev => {
            if (!prev) return prev;
            const existing = prev.epics.find(e => e.id === id);
            if (existing) {
                persistEntity('epics', 'POST', { ...existing, ...updates });
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
            persistSettings(newSettings);
            return { ...prev, settings: newSettings };
        });
    };

    const addSprint = (sprint: Sprint) => {
        setData(prev => {
            if (!prev) return prev;
            persistEntity('sprints', 'POST', sprint);
            return {
                ...prev,
                sprints: [...prev.sprints, sprint].sort((a, b) => a.start_date.localeCompare(b.start_date))
            };
        });
    };

    const updateSprint = (id: string, updates: Partial<Sprint>) => {
        setData(prev => {
            if (!prev) return prev;
            const existing = prev.sprints.find(s => s.id === id);
            if (existing) {
                persistEntity('sprints', 'POST', { ...existing, ...updates });
            }
            return {
                ...prev,
                sprints: prev.sprints.map(s => s.id === id ? { ...s, ...updates } : s).sort((a, b) => a.start_date.localeCompare(b.start_date))
            };
        });
    };

    const deleteSprint = (id: string) => {
        setData(prev => {
            if (!prev) return prev;
            persistEntity('sprints', 'DELETE', { id });
            return {
                ...prev,
                sprints: prev.sprints.filter(s => s.id !== id)
            };
        });
    };

    const addDashboard = (dashboard: DashboardEntity) => {
        setData(prev => {
            if (!prev) return prev;
            persistEntity('dashboards', 'POST', dashboard);
            return { ...prev, dashboards: [...prev.dashboards, dashboard] };
        });
    };

    const updateDashboard = (id: string, updates: Partial<DashboardEntity>) => {
        setData(prev => {
            if (!prev) return prev;
            const existing = prev.dashboards.find(d => d.id === id);
            if (existing) {
                persistEntity('dashboards', 'POST', { ...existing, ...updates });
            }
            return {
                ...prev,
                dashboards: prev.dashboards.map(d => d.id === id ? { ...d, ...updates } : d)
            };
        });
    };

    const deleteDashboard = (id: string) => {
        setData(prev => {
            if (!prev) return prev;
            persistEntity('dashboards', 'DELETE', { id });
            return { ...prev, dashboards: prev.dashboards.filter(d => d.id !== id) };
        });
    };

    return {
        data,
        loading,
        error,
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
