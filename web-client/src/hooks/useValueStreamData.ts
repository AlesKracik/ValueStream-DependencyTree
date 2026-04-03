import { useState, useEffect, useMemo } from 'react';
import type { ValueStreamData, Customer, WorkItem, Team, Issue, Settings, Sprint, ValueStreamEntity, ValueStreamParameters } from '@valuestream/shared-types';
import { partitionSettings } from '@valuestream/shared-types';
import { authorizedFetch, debounce, getUserRole } from '../utils/api';
import { calculateQuarter } from '../utils/dateHelpers';

async function loadClientSettings(): Promise<Partial<Settings>> {
    try {
        const res = await authorizedFetch('/api/auth/me/settings');
        if (res.ok) {
            const data = await res.json();
            return data.client_settings || {};
        }
    } catch { /* ignore */ }
    return {};
}

async function saveClientSettingsToServer(settings: Partial<Settings>): Promise<void> {
    try {
        await authorizedFetch('/api/auth/me/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        });
    } catch { /* ignore — non-critical */ }
}

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
const persistSettingsToServer = async (settings: any, showAlert?: (title: string, message: string) => Promise<void>) => {
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

/** Partition and persist settings: server portion to settings API, client portion to user profile */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const persistSettings = async (settings: any, showAlert?: (title: string, message: string) => Promise<void>) => {
    const { server, client } = partitionSettings(settings);

    // Save client-scoped settings to user profile in DB
    if (Object.keys(client).length > 0) {
        const existing = await loadClientSettings();
        const merged = { ...existing };
        for (const key of Object.keys(client)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (merged as any)[key] = (client as any)[key];
        }
        await saveClientSettingsToServer(merged);
    }

    // Send server-scoped settings to backend (admin only)
    if (Object.keys(server).length > 0 && getUserRole() === 'admin') {
        await persistSettingsToServer(server, showAlert);
    }
};

export function useValueStreamData(
    valueStreamId?: string,
    _filters?: Partial<ValueStreamParameters>,
    persistenceDebounceMs = 1000,
    showAlert?: (title: string, message: string) => Promise<void>,
    requestedCollections: string[] = ['workspace'], // Default to full workspace for backward compatibility
    // Per-collection query params for relational filtering on granular endpoints
    // e.g. { workItems: { customerId: 'c1' }, issues: { workItemId: 'w1' } }
    collectionQueryParams: Record<string, Record<string, string>> = {}
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
            // Only send valueStreamId — the backend looks up the ValueStream's saved parameters
            // and applies them as hard filters. Dynamic/transient filters are applied client-side.
            const params = new URLSearchParams();
            if (valueStreamId) params.append('valueStreamId', valueStreamId);
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
                    let endpoint = collection === 'settings' ? '/api/settings' : `/api/data/${collection}`;
                    // Append per-collection query params for relational filtering
                    const qp = collectionQueryParams[collection];
                    if (qp && Object.keys(qp).length > 0) {
                        const qs = new URLSearchParams(qp).toString();
                        endpoint += `?${qs}`;
                    }
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
                        customers: [], workItems: [], issues: [], sprints: [], teams: [], valueStreams: [], settings: {} 
                    } as unknown as ValueStreamData;
                    return { ...base, ...finalData };
                });
            }

            // Merge client-scoped settings from user profile into the server response
            if (finalData.settings) {
                const clientSettings = await loadClientSettings();
                for (const key of Object.keys(clientSettings)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const serverSection = (finalData.settings as any)[key];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const clientSection = (clientSettings as any)[key];
                    if (serverSection && typeof serverSection === 'object' && typeof clientSection === 'object') {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (finalData.settings as any)[key] = { ...serverSection, ...clientSection };
                    } else {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (finalData.settings as any)[key] = clientSection;
                    }
                }
            }

            if (requestedCollections.includes('workspace')) {
                setData(finalData as ValueStreamData);
            }

            // Apply theme from settings
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
     
     
    // Re-fetch when valueStreamId changes (backend applies its static filters)
    // or when requestedCollections change. Dynamic filters are applied client-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [valueStreamId, JSON.stringify(requestedCollections), JSON.stringify(collectionQueryParams)]);

    const refreshData = () => {
        fetchData();
    };

    // Generic CRUD factory for entities with { id: string }
    // Eliminates repeated add/update/delete boilerplate across entity types
    function createEntityCRUD<T extends { id: string }>(
        collection: string,
        key: 'customers' | 'workItems' | 'teams' | 'issues' | 'valueStreams',
        onDeleteCascade?: (prev: ValueStreamData, id: string) => Partial<ValueStreamData>
    ) {
        const add = (entity: T) => {
            persistEntity(collection, 'POST', entity, showAlert);
            setData(prev => {
                if (!prev) return prev;
                return { ...prev, [key]: [...((prev[key] as T[]) || []), entity] };
            });
        };

        const update = async (id: string, updates: Partial<T>, immediate = false) => {
            const existing = (data?.[key] as T[] | undefined)?.find(entity => entity.id === id);
            if (!existing) return;
            const updated = { ...existing, ...updates };

            setData(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    [key]: ((prev[key] as T[]) || []).map(entity => entity.id === id ? updated : entity)
                };
            });

            if (immediate) {
                await persistEntity(collection, 'POST', updated, showAlert);
            } else {
                debouncedPersist(collection, 'POST', updated);
            }
        };

        const remove = (id: string) => {
            persistEntity(collection, 'DELETE', { id }, showAlert);
            setData(prev => {
                if (!prev) return prev;
                const base: ValueStreamData = {
                    ...prev,
                    [key]: ((prev[key] as T[]) || []).filter(entity => entity.id !== id)
                };
                return onDeleteCascade ? { ...base, ...onDeleteCascade(prev, id) } : base;
            });
        };

        return { add, update, remove };
    }

    // Backend handles cascade: removes customer_targets referencing this customer from all workItems
    const customerCRUD = createEntityCRUD<Customer>('customers', 'customers', (prev, id) => ({
        workItems: (prev.workItems || []).map(workItem => ({
            ...workItem,
            customer_targets: workItem.customer_targets.filter(ct => ct.customer_id !== id)
        }))
    }));

    // Backend handles cascade: clears work_item_id from all issues referencing this workItem
    const workItemCRUD = createEntityCRUD<WorkItem>('workItems', 'workItems', (prev, id) => ({
        issues: (prev.issues || []).map(issue => issue.work_item_id === id ? { ...issue, work_item_id: undefined } : issue)
    }));

    // Backend handles cascade: clears team_id from all issues referencing this team
    const teamCRUD = createEntityCRUD<Team>('teams', 'teams', (prev, id) => ({
        issues: (prev.issues || []).map(issue => issue.team_id === id ? { ...issue, team_id: '' } : issue)
    }));

    const issueCRUD = createEntityCRUD<Issue>('issues', 'issues');

    const valueStreamCRUD = createEntityCRUD<ValueStreamEntity>('valueStreams', 'valueStreams');

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

    return {
        data,
        loading,
        error,
        refreshData,
        addCustomer: customerCRUD.add,
        deleteCustomer: customerCRUD.remove,
        updateCustomer: customerCRUD.update,
        addWorkItem: workItemCRUD.add,
        deleteWorkItem: workItemCRUD.remove,
        updateWorkItem: workItemCRUD.update,
        addTeam: teamCRUD.add,
        deleteTeam: teamCRUD.remove,
        updateTeam: teamCRUD.update,
        addIssue: issueCRUD.add,
        deleteIssue: issueCRUD.remove,
        updateIssue: issueCRUD.update,
        addSprint,
        updateSprint,
        deleteSprint,
        updateSettings,
        addValueStream: valueStreamCRUD.add,
        updateValueStream: valueStreamCRUD.update,
        deleteValueStream: valueStreamCRUD.remove
    };
}
