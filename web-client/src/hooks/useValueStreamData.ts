import { useState, useEffect, useMemo } from 'react';
import type { ValueStreamData, Customer, WorkItem, Team, Epic, Settings, Sprint, ValueStreamEntity, ValueStreamParameters } from '../types/models';
import { authorizedFetch, debounce } from '../utils/api';
import { calculateQuarter } from '../utils/dateHelpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const persistEntity = async (collection: string, method: 'POST' | 'DELETE', entity: any, showAlert?: (title: string, message: string) => Promise<void>) => {
    try {
        const response = await authorizedFetch(`/api/entity/${collection}${method === 'DELETE' ? `/${entity.id}` : ''}`, {
            method,
            headers: method === 'DELETE' ? undefined : { 'Content-Type': 'application/json' },
            body: method === 'DELETE' ? undefined : JSON.stringify(entity)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData.error || `Failed to ${method} entity in ${collection}`;
            console.error(message);
            if (showAlert) {
                showAlert(response.status === 409 ? 'Conflict' : 'Error', message);
            }
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`Failed to ${method} entity in ${collection}`, e);
        if (showAlert) {
            showAlert('Network Error', `Could not connect to server while saving to ${collection}: ${message}`);
        }
    }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const persistSettings = async (settings: any, showAlert?: (title: string, message: string) => Promise<void>) => {
    try {
        const response = await authorizedFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData.error || "Failed to persist settings";
            console.error(message);
            if (showAlert) {
                showAlert('Error', message);
            }
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("Failed to persist settings", e);
        if (showAlert) {
            showAlert('Network Error', `Could not connect to server while saving settings: ${message}`);
        }
    }
};

export function useValueStreamData(
    valueStreamId?: string, 
    filters?: Partial<ValueStreamParameters>, 
    persistenceDebounceMs = 1000,
    showAlert?: (title: string, message: string) => Promise<void>,
    requestedCollections: string[] = ['workspace'] // Default to full workspace for backward compatibility
) {
    const [data, setData] = useState<ValueStreamData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    // Debounced persistence functions
    const debouncedPersist = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const timeouts = new Map<string, any>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (col: string, meth: 'POST' | 'DELETE', ent: any) => {
            const key = `${col}-${meth}-${ent.id}`;
            if (timeouts.has(key)) clearTimeout(timeouts.get(key));
            timeouts.set(key, setTimeout(() => {
                timeouts.delete(key);
                persistEntity(col, meth, ent, showAlert);
            }, persistenceDebounceMs));
        };
    }, [persistenceDebounceMs, showAlert]);

    const debouncedSettings = useMemo(() => debounce(async (sets, needsRefresh) => {
        await persistSettings(sets, showAlert);
        if (needsRefresh) {
            refreshData();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, persistenceDebounceMs), [persistenceDebounceMs, showAlert]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (valueStreamId) params.append('valueStreamId', valueStreamId);
            if (filters) {
                Object.entries(filters).forEach(([key, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        params.append(key, String(value));
                    }
                });
            }
            const queryString = params.toString();
            
            let finalData: Partial<ValueStreamData> = {};

            // If workspace is requested, fetch the composite endpoint (simulating the old loadData)
            if (requestedCollections.includes('workspace')) {
                const response = await authorizedFetch(`/api/workspace${queryString ? `?${queryString}` : ''}`);
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || 'Failed to fetch workspace data');
                }
                finalData = await response.json();
            } else {
                // Otherwise, fetch granular endpoints in parallel
                const fetchPromises = requestedCollections.map(async (collection) => {
                    const endpoint = collection === 'settings' ? '/api/settings' : `/api/data/${collection}`;
                    const res = await authorizedFetch(endpoint);
                    if (!res.ok) throw new Error(`Failed to fetch ${collection}`);
                    const json = await res.json();
                    
                    if (collection === 'settings') return { settings: json.settings };
                    if (collection === 'workItems') return { workItems: json.workItems, metrics: json.metrics };
                    return { [collection]: json };
                });

                const results = await Promise.all(fetchPromises);
                results.forEach(res => {
                    finalData = { ...finalData, ...res };
                });

                // Preserve existing un-fetched data in the state context so we don't wipe it out
                setData(prev => {
                    const base = prev || { 
                        customers: [], workItems: [], epics: [], sprints: [], teams: [], valueStreams: [], settings: {} 
                    } as unknown as ValueStreamData;
                    return { ...base, ...finalData };
                });
            }

            if (requestedCollections.includes('workspace')) {
                setData(finalData as ValueStreamData);
            }

            // Cache theme immediately if available
            const theme = finalData.settings?.general?.theme;
            if (theme) {
                localStorage.setItem('vst-theme', theme);
                document.documentElement.setAttribute('data-theme', theme);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(err as Error);
            if (showAlert) {
                showAlert('Load Error', `Failed to load data: ${message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
     
     
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [valueStreamId, JSON.stringify(filters), JSON.stringify(requestedCollections)]);

    const refreshData = () => {
        fetchData();
    };

    const addCustomer = (customer: Customer) => {
        persistEntity('customers', 'POST', customer, showAlert);
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, customers: [...(prev.customers || []), customer] };
        });
    };

    const deleteCustomer = (id: string) => {
        setData(prev => {
            if (!prev) return prev;
            
            const updatedWorkItems = (prev.workItems || []).map(f => ({
                ...f,
                customer_targets: f.customer_targets.filter(ct => ct.customer_id !== id)
            }));
            
            persistEntity('customers', 'DELETE', { id }, showAlert);
            
            // Persist cascaded updates
            (prev.workItems || []).forEach((oldW, i) => {
                if (oldW.customer_targets.length !== updatedWorkItems[i].customer_targets.length) {
                    persistEntity('workItems', 'POST', updatedWorkItems[i], showAlert);
                }
            });

            return {
                ...prev,
                customers: (prev.customers || []).filter(c => c.id !== id),
                workItems: updatedWorkItems
            };
        });
    };

    const updateCustomer = async (id: string, updates: Partial<Customer>, immediate = false) => {
        const existing = data?.customers?.find(c => c.id === id);
        if (!existing) return;
        const updated = { ...existing, ...updates };

        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                customers: (prev.customers || []).map(c => c.id === id ? updated : c)
            };
        });

        if (immediate) {
            await persistEntity('customers', 'POST', updated, showAlert);
        } else {
            debouncedPersist('customers', 'POST', updated);
        }
    };

    const addWorkItem = (workItem: WorkItem) => {
        persistEntity('workItems', 'POST', workItem, showAlert);
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, workItems: [...(prev.workItems || []), workItem] };
        });
    };

    const deleteWorkItem = (id: string) => {
        setData(prev => {
            if (!prev) return prev;
            
            const updatedEpics = (prev.epics || []).map(e => e.work_item_id === id ? { ...e, work_item_id: undefined } : e);
            
            persistEntity('workItems', 'DELETE', { id }, showAlert);
            
            (prev.epics || []).forEach((oldE, i) => {
                if (oldE.work_item_id === id) {
                    persistEntity('epics', 'POST', updatedEpics[i], showAlert);
                }
            });

            return {
                ...prev,
                workItems: (prev.workItems || []).filter(f => f.id !== id),
                epics: updatedEpics
            };
        });
    };

    const updateWorkItem = async (id: string, updates: Partial<WorkItem>, immediate = false) => {
        const existing = data?.workItems?.find(w => w.id === id);
        if (!existing) return;
        const updated = { ...existing, ...updates };

        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                workItems: (prev.workItems || []).map(f => f.id === id ? updated : f)
            };
        });

        if (immediate) {
            await persistEntity('workItems', 'POST', updated, showAlert);
        } else {
            debouncedPersist('workItems', 'POST', updated);
        }
    };

    const updateTeam = async (id: string, updates: Partial<Team>, immediate = false) => {
        const existing = data?.teams?.find(t => t.id === id);
        if (!existing) return;
        const updated = { ...existing, ...updates };

        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                teams: (prev.teams || []).map(t => t.id === id ? updated : t)
            };
        });

        if (immediate) {
            await persistEntity('teams', 'POST', updated, showAlert);
        } else {
            debouncedPersist('teams', 'POST', updated);
        }
    };

    const addTeam = (team: Team) => {
        persistEntity('teams', 'POST', team, showAlert);
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, teams: [...(prev.teams || []), team] };
        });
    };

    const deleteTeam = (id: string) => {
        setData(prev => {
            if (!prev) return prev;
            
            const updatedEpics = (prev.epics || []).map(e => e.team_id === id ? { ...e, team_id: '' } : e);
            
            persistEntity('teams', 'DELETE', { id }, showAlert);
            
            (prev.epics || []).forEach((oldE, i) => {
                if (oldE.team_id === id) {
                    persistEntity('epics', 'POST', updatedEpics[i], showAlert);
                }
            });

            return {
                ...prev,
                teams: (prev.teams || []).filter(t => t.id !== id),
                epics: updatedEpics
            };
        });
    };

    const addEpic = (epic: Epic) => {
        persistEntity('epics', 'POST', epic, showAlert);
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, epics: [...(prev.epics || []), epic] };
        });
    };

    const deleteEpic = (id: string) => {
        persistEntity('epics', 'DELETE', { id }, showAlert);
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, epics: (prev.epics || []).filter(e => e.id !== id) };
        });
    };

    const updateEpic = async (id: string, updates: Partial<Epic>, immediate = false) => {
        const existing = data?.epics?.find(e => e.id === id);
        if (!existing) return;
        const updated = { ...existing, ...updates };

        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                epics: (prev.epics || []).map(e => e.id === id ? updated : e)
            };
        });

        if (immediate) {
            await persistEntity('epics', 'POST', updated, showAlert);
        } else {
            debouncedPersist('epics', 'POST', updated);
        }
    };

    const updateSettings = (updates: Partial<Settings>) => {
        setData(prev => {
            if (!prev) return prev;
            
            // Deep merge updates into settings
             
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const deepMerge = (target: any, source: any) => {
                const result = { ...target };
                Object.keys(source).forEach(key => {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        result[key] = deepMerge(target[key] || {}, source[key]);
                    } else {
                        result[key] = source[key];
                    }
                });
                return result;
            };

            const newSettings = deepMerge(prev.settings || {}, updates);
            
            if (updates.general?.theme) {
                localStorage.setItem('vst-theme', updates.general.theme);
                document.documentElement.setAttribute('data-theme', updates.general.theme);
            }

            let newSprints = prev.sprints || [];
            const oldFiscalMonth = prev.settings?.general?.fiscal_year_start_month;
            const newFiscalMonth = newSettings.general?.fiscal_year_start_month;

            if (newFiscalMonth !== undefined && newFiscalMonth !== oldFiscalMonth) {
                newSprints = newSprints.map(s => ({
                    ...s,
                    quarter: calculateQuarter(s.end_date, newFiscalMonth)
                }));
                newSprints.forEach(s => persistEntity('sprints', 'POST', s, showAlert));
            }

            const needsRefresh = (
                updates.persistence?.mongo?.app?.uri !== undefined || 
                updates.persistence?.mongo?.app?.db !== undefined ||
                updates.persistence?.mongo?.app?.auth?.method !== undefined ||
                updates.persistence?.mongo?.customer?.uri !== undefined ||
                updates.persistence?.mongo?.customer?.db !== undefined ||
                updates.jira?.base_url !== undefined || 
                updates.jira?.api_token !== undefined
            );

            if (needsRefresh) {
                persistSettings(newSettings, showAlert).then(() => {
                    refreshData();
                });
            } else {
                debouncedSettings(newSettings, false);
            }

            return { ...prev, settings: newSettings, sprints: newSprints };
        });
    };

    const addSprint = (sprint: Sprint) => {
        setData(prev => {
            if (!prev) return prev;
            const newSprint = {
                ...sprint,
                quarter: calculateQuarter(sprint.end_date, prev.settings?.general?.fiscal_year_start_month || 1)
            };
            persistEntity('sprints', 'POST', newSprint, showAlert);
            return {
                ...prev,
                sprints: [...(prev.sprints || []), newSprint].sort((a, b) => a.start_date.localeCompare(b.start_date))
            };
        });
    };

    const updateSprint = async (id: string, updates: Partial<Sprint>, immediate = false) => {
        const existing = data?.sprints?.find(s => s.id === id);
        if (!existing) return;

        const updatedSprint = { ...existing, ...updates };
        if (updates.end_date || updates.start_date) {
            updatedSprint.quarter = calculateQuarter(updatedSprint.end_date, data?.settings?.general?.fiscal_year_start_month || 1);
        }

        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                sprints: (prev.sprints || [])
                    .map(s => s.id === id ? updatedSprint : s)
                    .filter(s => !s.is_archived)
                    .sort((a, b) => a.start_date.localeCompare(b.start_date))
            };
        });

        if (immediate) {
            await persistEntity('sprints', 'POST', updatedSprint, showAlert);
        } else {
            debouncedPersist('sprints', 'POST', updatedSprint);
        }
    };

    const deleteSprint = (id: string) => {
        persistEntity('sprints', 'DELETE', { id }, showAlert);
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                sprints: (prev.sprints || []).filter(s => s.id !== id)
            };
        });
    };

    const addValueStream = (valueStream: ValueStreamEntity) => {
        persistEntity('valueStreams', 'POST', valueStream, showAlert);
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, valueStreams: [...(prev.valueStreams || []), valueStream] };
        });
    };

    const updateValueStream = async (id: string, updates: Partial<ValueStreamEntity>, immediate = false) => {
        const existing = data?.valueStreams?.find(d => d.id === id);
        if (!existing) return;
        const updated = { ...existing, ...updates };

        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                valueStreams: (prev.valueStreams || []).map(d => d.id === id ? updated : d)
            };
        });

        if (immediate) {
            await persistEntity('valueStreams', 'POST', updated, showAlert);
        } else {
            debouncedPersist('valueStreams', 'POST', updated);
        }
    };

    const deleteValueStream = (id: string) => {
        persistEntity('valueStreams', 'DELETE', { id }, showAlert);
        setData(prev => {
            if (!prev) return prev;
            return { ...prev, valueStreams: (prev.valueStreams || []).filter(d => d.id !== id) };
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
        addTeam,
        deleteTeam,
        updateEpic,
        addSprint,
        updateSprint,
        deleteSprint,
        updateSettings,
        addValueStream,
        updateValueStream,
        deleteValueStream
    };
}
