import { useState, useEffect, useMemo } from 'react';
import type { ValueStreamData, Customer, WorkItem, Team, Issue, Settings, Sprint, ValueStreamEntity, ValueStreamParameters } from '@valuestream/shared-types';
import { partitionSettings } from '@valuestream/shared-types';
import { authorizedFetch, debounce, getUserRole } from '../utils/api';
import { calculateQuarter } from '../utils/dateHelpers';
import { applyTheme } from '../utils/themeApply';
import { mergeForRetry, findContestedKeys, type AnyEntity } from '../utils/entityMerge';

const CLIENT_SETTINGS_FALLBACK_KEY = 'vst-client-settings-pending';

async function loadClientSettings(): Promise<Partial<Settings>> {
    // Always read localStorage fallback first
    let pendingSettings: Partial<Settings> = {};
    try {
        const raw = localStorage.getItem(CLIENT_SETTINGS_FALLBACK_KEY);
        if (raw) pendingSettings = JSON.parse(raw);
    } catch { /* ignore */ }

    // Try DB
    try {
        const res = await authorizedFetch('/api/auth/me/settings');
        if (res.ok) {
            const data = await res.json();
            const dbSettings = data.client_settings || {};
            const hasPending = Object.keys(pendingSettings).length > 0;


            if (hasPending) {
                // Merge pending localStorage into DB settings
                const merged = { ...dbSettings };
                for (const key of Object.keys(pendingSettings)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (typeof (pendingSettings as any)[key] === 'object' && typeof (merged as any)[key] === 'object') {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (merged as any)[key] = { ...(merged as any)[key], ...(pendingSettings as any)[key] };
                    } else {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (merged as any)[key] = (pendingSettings as any)[key];
                    }
                }

                // Try to sync merged settings to DB; only clear localStorage if actually persisted
                try {
                    const syncRes = await authorizedFetch('/api/auth/me/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(merged),
                    });
                    if (syncRes.ok) {
                        const syncData = await syncRes.json().catch(() => ({}));
                        if (syncData.persisted) {
                            localStorage.removeItem(CLIENT_SETTINGS_FALLBACK_KEY);
                        }
                    }
                } catch { /* keep localStorage as fallback */ }

                return merged;
            }

            return dbSettings;
        }
    } catch { /* DB unavailable */ }

    // DB unavailable — return localStorage fallback
    return pendingSettings;
}

async function saveClientSettingsToServer(settings: Partial<Settings>): Promise<void> {
    try {
        const res = await authorizedFetch('/api/auth/me/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        });
        if (res.ok) {
            const resData = await res.json().catch(() => ({}));
            if (resData.persisted) {
                localStorage.removeItem(CLIENT_SETTINGS_FALLBACK_KEY);
            } else {
                // Not persisted to DB — keep in localStorage
                localStorage.setItem(CLIENT_SETTINGS_FALLBACK_KEY, JSON.stringify(settings));
            }
            return;
        }
    } catch { /* DB unavailable */ }

    // Fall back to localStorage
    localStorage.setItem(CLIENT_SETTINGS_FALLBACK_KEY, JSON.stringify(settings));
}

/**
 * Outcome of a persistEntity call. Callers (the CRUD wrappers) use this to
 * back-write the new `_version` into local state so the next mutation doesn't
 * collide phantom-style against a version the server has already bumped past.
 */
export type PersistResult =
    | { ok: true; method: 'POST' | 'PATCH'; newVersion: number; merged?: AnyEntity }
    | { ok: true; method: 'DELETE' }
    | { ok: false; error: string };

/**
 * Persist an entity mutation. On 409, deep-merges the client's `changedKeys`
 * onto the server's current document and retries once. Surfaces a conflict
 * notification only when the retry itself fails or when the contested fields
 * are something the user would care about losing.
 *
 * `changedKeys` tells us *which* fields the caller actually edited; on 409
 * those fields win over the server's version. Pass `undefined` to mean
 * "the whole entity is the caller's edit" — used for creates.
 */
const persistEntity = async (
    collection: string,
    method: 'POST' | 'DELETE',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entity: any,
    showAlert?: (title: string, message: string) => Promise<void>,
    options?: {
        changedKeys?: string[];
        // The version of the doc the caller started from. Used to detect contested
        // fields on 409 so we can warn the user when their edit clobbered another.
        baseline?: AnyEntity;
    }
): Promise<PersistResult> => {
    const url = `/api/entity/${collection}${method === 'DELETE' ? `/${entity.id}` : ''}`;

    const doFetch = async (payload: AnyEntity | undefined) => {
        return authorizedFetch(url, {
            method,
            headers: method === 'DELETE' ? undefined : { 'Content-Type': 'application/json' },
            body: method === 'DELETE' ? undefined : JSON.stringify(payload),
        });
    };

    // For POST, ensure _version is set. Newly-constructed entities won't have
    // one yet; default to 0 so the server takes the insert path.
    const payload = method === 'POST'
        ? { _version: 0, ...entity }
        : entity;

    try {
        const response = await doFetch(method === 'DELETE' ? undefined : payload);

        if (response.ok) {
            if (method === 'DELETE') return { ok: true, method: 'DELETE' };
            const json = await response.json().catch(() => ({}));
            const newVersion = typeof json._version === 'number' ? json._version : 0;
            return { ok: true, method: 'POST', newVersion };
        }

        // 409 Conflict — server returned the current document. Merge our pending
        // changes onto it (field-level LWW) and retry once.
        if (response.status === 409 && method === 'POST') {
            const conflictData = await response.json().catch(() => ({}));
            const current = conflictData.current as AnyEntity | undefined;
            if (current && options?.changedKeys?.length) {
                // Build the patch from the entity using only the keys the caller edited.
                const ourPatch: AnyEntity = {};
                for (const k of options.changedKeys) ourPatch[k] = entity[k];
                const merged = mergeForRetry(current, ourPatch);

                const retry = await doFetch(merged);
                if (retry.ok) {
                    const json = await retry.json().catch(() => ({}));
                    const newVersion = typeof json._version === 'number' ? json._version : 0;

                    const contested = findContestedKeys(current, ourPatch, options.baseline);
                    if (contested.length > 0 && showAlert) {
                        showAlert(
                            'Concurrent edit',
                            `Someone else also edited ${humanList(contested)} on this ${singularize(collection)}. Your changes were applied on top.`
                        );
                    }
                    return { ok: true, method: 'POST', newVersion, merged };
                }
                // Retry failed — fall through to error reporting below.
                const retryErr = await retry.json().catch(() => ({}));
                const message = retryErr.error || `Failed to resolve conflict on ${collection}`;
                if (showAlert) showAlert('Conflict', message);
                return { ok: false, error: message };
            }
            // No changedKeys (e.g. a create that collided) or no `current` — can't merge.
            const message = conflictData.error || `Conflict on ${collection} — please reload.`;
            if (showAlert) showAlert('Conflict', message);
            return { ok: false, error: message };
        }

        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error || `Failed to ${method} entity in ${collection}`;
        console.error(message);
        if (showAlert) {
            showAlert('Error', message);
        }
        return { ok: false, error: message };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`Failed to ${method} entity in ${collection}`, e);
        if (showAlert) {
            showAlert('Network Error', `Could not connect to server while saving to ${collection}: ${message}`);
        }
        return { ok: false, error: message };
    }
};

/**
 * PATCH-style update: send only the fields the caller changed. Server `$set`s
 * exactly those keys, leaving everything else on the document untouched.
 *
 * On 409 (version mismatch), the PATCH is replayed against the server's
 * current `_version` — no merge math needed because the patch already
 * encodes "just these fields". Two clients editing different fields on the
 * same entity both win.
 *
 * On 409 we also call `findContestedKeys` against the optional `baseline` so
 * we can warn the user when the server changed a field they were also editing.
 */
const patchEntity = async (
    collection: string,
    id: string,
    clientVersion: number,
    patch: AnyEntity,
    showAlert?: (title: string, message: string) => Promise<void>,
    options?: { baseline?: AnyEntity }
): Promise<PersistResult> => {
    const url = `/api/entity/${collection}/${id}`;

    const send = async (version: number) => {
        return authorizedFetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ _version: version, patch }),
        });
    };

    try {
        const response = await send(clientVersion);

        if (response.ok) {
            const json = await response.json().catch(() => ({}));
            const newVersion = typeof json._version === 'number' ? json._version : 0;
            return { ok: true, method: 'PATCH', newVersion };
        }

        if (response.status === 409) {
            const conflictData = await response.json().catch(() => ({}));
            const current = conflictData.current as AnyEntity | undefined;
            const serverVersion = current?._version ?? 0;

            const retry = await send(serverVersion);
            if (retry.ok) {
                const json = await retry.json().catch(() => ({}));
                const newVersion = typeof json._version === 'number' ? json._version : 0;

                if (current) {
                    const contested = findContestedKeys(current, patch, options?.baseline);
                    if (contested.length > 0 && showAlert) {
                        showAlert(
                            'Concurrent edit',
                            `Someone else also edited ${humanList(contested)} on this ${singularize(collection)}. Your changes were applied on top.`
                        );
                    }
                }
                return { ok: true, method: 'PATCH', newVersion };
            }
            const retryErr = await retry.json().catch(() => ({}));
            const message = retryErr.error || `Failed to resolve conflict on ${collection}`;
            if (showAlert) showAlert('Conflict', message);
            return { ok: false, error: message };
        }

        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error || `Failed to PATCH entity in ${collection}`;
        console.error(message);
        if (showAlert) showAlert('Error', message);
        return { ok: false, error: message };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`Failed to PATCH entity in ${collection}`, e);
        if (showAlert) {
            showAlert('Network Error', `Could not connect to server while saving to ${collection}: ${message}`);
        }
        return { ok: false, error: message };
    }
};

/**
 * Element-level operations on a whitelisted nested array (Phase 3).
 *
 * Concurrent edits to different elements of the same array (e.g. two users
 * each editing a different `support_issue` on the same customer) no longer
 * collide — the server $sets only the targeted element. The parent's
 * `_version` still moves on each operation, so a 409-and-retry can fire if
 * something genuinely structural happened.
 */
const addArrayItem = async (
    collection: string,
    parentId: string,
    parentVersion: number,
    arrayPath: string,
    item: AnyEntity,
    showAlert?: (title: string, message: string) => Promise<void>
): Promise<ArrayOpResult> => {
    const url = `/api/entity/${collection}/${parentId}/items/${arrayPath}`;
    const send = (version: number) => authorizedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _version: version, item }),
    });
    return runArrayOp(collection, parentVersion, send, 'add', showAlert);
};

const patchArrayItem = async (
    collection: string,
    parentId: string,
    parentVersion: number,
    arrayPath: string,
    itemId: string,
    patch: AnyEntity,
    showAlert?: (title: string, message: string) => Promise<void>
): Promise<ArrayOpResult> => {
    const url = `/api/entity/${collection}/${parentId}/items/${arrayPath}/${itemId}`;
    const send = (version: number) => authorizedFetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _version: version, patch }),
    });
    return runArrayOp(collection, parentVersion, send, 'patch', showAlert);
};

const deleteArrayItem = async (
    collection: string,
    parentId: string,
    parentVersion: number,
    arrayPath: string,
    itemId: string,
    showAlert?: (title: string, message: string) => Promise<void>
): Promise<ArrayOpResult> => {
    const send = (version: number) => authorizedFetch(
        `/api/entity/${collection}/${parentId}/items/${arrayPath}/${itemId}?_version=${version}`,
        { method: 'DELETE' }
    );
    return runArrayOp(collection, parentVersion, send, 'delete', showAlert);
};

// Array-op result. Array-element operations always return a new parent
// `_version`, regardless of which HTTP verb the underlying request used.
export type ArrayOpResult =
    | { ok: true; newVersion: number; item?: AnyEntity }
    | { ok: false; error: string };

/**
 * Shared "send, on 409 retry once with the server's version" loop for the
 * three array-element operations.
 */
async function runArrayOp(
    collection: string,
    clientVersion: number,
    send: (version: number) => Promise<Response>,
    opName: 'add' | 'patch' | 'delete',
    showAlert?: (title: string, message: string) => Promise<void>
): Promise<ArrayOpResult> {
    try {
        const response = await send(clientVersion);

        if (response.ok) {
            const json = await response.json().catch(() => ({}));
            const newVersion = typeof json._version === 'number' ? json._version : 0;
            return { ok: true, newVersion, item: json.item };
        }

        if (response.status === 409) {
            const conflictData = await response.json().catch(() => ({}));
            const current = conflictData.current as AnyEntity | undefined;
            const serverVersion = current?._version ?? 0;
            const retry = await send(serverVersion);
            if (retry.ok) {
                const json = await retry.json().catch(() => ({}));
                const newVersion = typeof json._version === 'number' ? json._version : 0;
                return { ok: true, newVersion, item: json.item };
            }
            const retryErr = await retry.json().catch(() => ({}));
            const message = retryErr.error || `Failed to resolve conflict on ${collection} (${opName})`;
            if (showAlert) showAlert('Conflict', message);
            return { ok: false, error: message };
        }

        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error || `Failed to ${opName} array item in ${collection}`;
        console.error(message);
        if (showAlert) showAlert('Error', message);
        return { ok: false, error: message };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`Failed to ${opName} array item in ${collection}`, e);
        if (showAlert) {
            showAlert('Network Error', `Could not connect to server: ${message}`);
        }
        return { ok: false, error: message };
    }
}

function humanList(items: string[]): string {
    if (items.length === 1) return `"${items[0]}"`;
    if (items.length === 2) return `"${items[0]}" and "${items[1]}"`;
    return items.slice(0, -1).map(x => `"${x}"`).join(', ') + `, and "${items[items.length - 1]}"`;
}

function singularize(collection: string): string {
    return collection.endsWith('s') ? collection.slice(0, -1) : collection;
}

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

    // Debounced PATCH: field-level updates with coalescing per entity.
    // Coalesces successive edits to the same entity, sending one PATCH with the
    // most recent values per key. We rebuild the patch at fire time from the
    // accumulated `pendingPatch` map so coalesced updates merge cleanly.
    const debouncedPatch = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const timeouts = new Map<string, any>();
        const pendingPatches = new Map<string, AnyEntity>();
        const baselines = new Map<string, AnyEntity>();
        return (
            col: string,
            id: string,
            currentVersion: number,
            patch: AnyEntity,
            opts?: { baseline?: AnyEntity; onVersion?: (v: number) => void }
        ) => {
            const key = `${col}-PATCH-${id}`;
            // Merge into any pending patch so consecutive edits coalesce.
            const merged = { ...(pendingPatches.get(key) || {}), ...patch };
            pendingPatches.set(key, merged);
            // Keep the earliest baseline — that's the snapshot the user started from.
            if (opts?.baseline && !baselines.has(key)) baselines.set(key, opts.baseline);

            if (timeouts.has(key)) clearTimeout(timeouts.get(key));
            timeouts.set(key, setTimeout(async () => {
                timeouts.delete(key);
                const toSend = pendingPatches.get(key) || {};
                const baseline = baselines.get(key);
                pendingPatches.delete(key);
                baselines.delete(key);

                const result = await patchEntity(col, id, currentVersion, toSend, showAlert, { baseline });
                if (result.ok && result.method === 'PATCH' && opts?.onVersion) {
                    opts.onVersion(result.newVersion);
                }
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
                    // /api/data/customers returns { customers, total } since the list page got
                    // backend filtering/paging. Tolerate both shapes so a stale backend or the
                    // legacy collections (teams/issues/sprints/valueStreams) keep working.
                    if (collection === 'customers') return { customers: Array.isArray(json) ? json : (json.customers || []) };
                    return { [collection]: json };
                });

                const results = await Promise.all(fetchPromises);
                results.forEach(res => {
                    finalData = { ...finalData, ...res };
                });

            }

            // Deep-merge client-scoped settings from user profile into the server response
            if (finalData.settings) {
                const clientSettings = await loadClientSettings();
                // Deep merge client settings into server settings.
                // Skip empty client values so they don't overwrite populated server values
                // (e.g. SSO config set by admin shouldn't be wiped by a new user's empty defaults)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const deepMergeClientSettings = (target: any, source: any): any => {
                    if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
                    const result = { ...target };
                    for (const key of Object.keys(source)) {
                        if (target && typeof target[key] === 'object' && typeof source[key] === 'object'
                            && !Array.isArray(target[key]) && !Array.isArray(source[key])) {
                            result[key] = deepMergeClientSettings(target[key], source[key]);
                        } else {
                            // Only override if client value is non-empty, or server has no value
                            const clientVal = source[key];
                            const serverVal = target?.[key];
                            if (clientVal !== '' && clientVal !== undefined && clientVal !== null) {
                                result[key] = clientVal;
                            } else if (serverVal === undefined || serverVal === null) {
                                result[key] = clientVal;
                            }
                            // else: keep server value (client is empty, server has data)
                        }
                    }
                    return result;
                };
                finalData.settings = deepMergeClientSettings(finalData.settings, clientSettings);
            }

            if (requestedCollections.includes('workspace')) {
                setData(finalData as ValueStreamData);
            } else {
                // Granular: merge into existing data, preserving un-fetched collections
                setData(prev => {
                    const base = prev || {
                        customers: [], workItems: [], issues: [], sprints: [], teams: [], valueStreams: [], settings: {}
                    } as unknown as ValueStreamData;
                    return { ...base, ...finalData };
                });
            }

            // Apply theme from settings
            const general = finalData.settings?.general;
            if (general?.theme) {
                localStorage.setItem('vst-theme', general.theme);
                applyTheme(general.theme, general.theme_definitions);
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
    function createEntityCRUD<T extends { id: string; _version?: number }>(
        collection: string,
        key: 'customers' | 'workItems' | 'teams' | 'issues' | 'valueStreams',
        onDeleteCascade?: (prev: ValueStreamData, id: string) => Partial<ValueStreamData>
    ) {
        // Apply a new `_version` returned by the server to whichever entity is in
        // local state right now. Done after persistEntity resolves so the next
        // mutation sends the bumped version (avoids phantom 409s).
        const applyVersionToState = (id: string, newVersion: number) => {
            setData(prev => {
                if (!prev) return prev;
                const list = (prev[key] as unknown as T[]) || [];
                const idx = list.findIndex(e => e.id === id);
                if (idx === -1) return prev;
                const next = [...list];
                next[idx] = { ...next[idx], _version: newVersion };
                return { ...prev, [key]: next };
            });
        };

        const add = async (entity: T) => {
            // Initialise with `_version: 0` so the local copy has it from the start.
            const withVersion = { _version: 0, ...entity } as T;
            setData(prev => {
                if (!prev) return prev;
                return { ...prev, [key]: [...((prev[key] as unknown as T[]) || []), withVersion] };
            });
            const result = await persistEntity(collection, 'POST', withVersion, showAlert);
            if (result.ok && result.method === 'POST') {
                applyVersionToState(entity.id, result.newVersion);
            }
        };

        const update = async (id: string, updates: Partial<T>, immediate = false) => {
            const existing = (data?.[key] as T[] | undefined)?.find(entity => entity.id === id);
            if (!existing) return;
            // Snapshot the doc the caller's edit was based on so OCC can identify
            // contested fields when the server's version moved on under us.
            const baseline = { ...existing } as AnyEntity;
            const updated = { ...existing, ...updates };

            setData(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    [key]: ((prev[key] as unknown as T[]) || []).map(entity => entity.id === id ? updated : entity)
                };
            });

            // Build the PATCH body: only the keys the caller actually edited,
            // minus identity/version fields owned by the server.
            const patch: AnyEntity = {};
            for (const k of Object.keys(updates)) {
                if (k === 'id' || k === '_version') continue;
                patch[k] = (updates as AnyEntity)[k];
            }
            if (Object.keys(patch).length === 0) return;

            const clientVersion = existing._version ?? 0;

            if (immediate) {
                const result = await patchEntity(collection, id, clientVersion, patch, showAlert, { baseline });
                if (result.ok && result.method === 'PATCH') {
                    applyVersionToState(id, result.newVersion);
                }
            } else {
                debouncedPatch(collection, id, clientVersion, patch, {
                    baseline,
                    onVersion: v => applyVersionToState(id, v),
                });
            }
        };

        const remove = (id: string) => {
            persistEntity(collection, 'DELETE', { id }, showAlert);
            setData(prev => {
                if (!prev) return prev;
                const base: ValueStreamData = {
                    ...prev,
                    [key]: ((prev[key] as unknown as T[]) || []).filter(entity => entity.id !== id)
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

    // ── Customer nested-array helpers (Phase 3) ────────────────────────────
    // These route through the array-element endpoints rather than rewriting
    // the whole `support_issues` / `tcv_history` array. Two users editing
    // different entries on the same customer no longer step on each other.

    // Find a customer + writeback the bumped _version after a successful op.
    const applyCustomerVersion = (customerId: string, newVersion: number) => {
        setData(prev => {
            if (!prev) return prev;
            const customers = prev.customers || [];
            const idx = customers.findIndex(c => c.id === customerId);
            if (idx === -1) return prev;
            const next = [...customers];
            next[idx] = { ...next[idx], _version: newVersion };
            return { ...prev, customers: next };
        });
    };

    const addCustomerArrayItem = async (
        customerId: string,
        arrayPath: 'support_issues' | 'tcv_history',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        item: any
    ) => {
        const customer = data?.customers.find(c => c.id === customerId);
        if (!customer) return undefined;
        const parentVersion = customer._version ?? 0;
        const result = await addArrayItem('customers', customerId, parentVersion, arrayPath, item, showAlert);
        if (!result.ok) return undefined;
        applyCustomerVersion(customerId, result.newVersion);

        // Mirror the new element into local state. The server returned the
        // canonical item (with any server-stamped id).
        const stamped = result.item ?? item;
        setData(prev => {
            if (!prev) return prev;
            const customers = (prev.customers || []).map(c =>
                c.id === customerId
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ? { ...c, [arrayPath]: [...((c as any)[arrayPath] || []), stamped] }
                    : c
            );
            return { ...prev, customers };
        });
        return stamped;
    };

    const patchCustomerArrayItem = async (
        customerId: string,
        arrayPath: 'support_issues' | 'tcv_history',
        itemId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patch: any
    ) => {
        const customer = data?.customers.find(c => c.id === customerId);
        if (!customer) return false;
        const parentVersion = customer._version ?? 0;

        // Apply optimistically so the UI reflects the edit before the round-trip.
        setData(prev => {
            if (!prev) return prev;
            const customers = (prev.customers || []).map(c => {
                if (c.id !== customerId) return c;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const arr = ((c as any)[arrayPath] || []) as any[];
                return { ...c, [arrayPath]: arr.map(el => el?.id === itemId ? { ...el, ...patch } : el) };
            });
            return { ...prev, customers };
        });

        const result = await patchArrayItem('customers', customerId, parentVersion, arrayPath, itemId, patch, showAlert);
        if (result.ok) {
            applyCustomerVersion(customerId, result.newVersion);
            return true;
        }
        return false;
    };

    const deleteCustomerArrayItem = async (
        customerId: string,
        arrayPath: 'support_issues' | 'tcv_history',
        itemId: string
    ) => {
        const customer = data?.customers.find(c => c.id === customerId);
        if (!customer) return false;
        const parentVersion = customer._version ?? 0;

        setData(prev => {
            if (!prev) return prev;
            const customers = (prev.customers || []).map(c => {
                if (c.id !== customerId) return c;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const arr = ((c as any)[arrayPath] || []) as any[];
                return { ...c, [arrayPath]: arr.filter(el => el?.id !== itemId) };
            });
            return { ...prev, customers };
        });

        const result = await deleteArrayItem('customers', customerId, parentVersion, arrayPath, itemId, showAlert);
        if (result.ok) {
            applyCustomerVersion(customerId, result.newVersion);
            return true;
        }
        return false;
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

            // Re-apply theme whenever the active selection or theme_definitions change.
            const themeChanged = updates.general?.theme !== undefined;
            const definitionsChanged = updates.general?.theme_definitions !== undefined;
            if (themeChanged || definitionsChanged) {
                if (updates.general?.theme) {
                    localStorage.setItem('vst-theme', updates.general.theme);
                }
                applyTheme(newSettings.general?.theme, newSettings.general?.theme_definitions);
            }

            let newSprints = prev.sprints || [];
            const oldFiscalMonth = prev.settings?.general?.fiscal_year_start_month;
            const newFiscalMonth = newSettings.general?.fiscal_year_start_month;

            if (newFiscalMonth !== undefined && newFiscalMonth !== oldFiscalMonth) {
                newSprints = newSprints.map(s => ({
                    ...s,
                    quarter: calculateQuarter(s.end_date, newFiscalMonth)
                }));
                // PATCH each sprint with only the recomputed `quarter` — concurrent
                // edits to name/start_date/end_date on the same sprint coexist cleanly.
                newSprints.forEach(s => {
                    patchEntity('sprints', s.id, s._version ?? 0, { quarter: s.quarter }, showAlert)
                        .then(result => {
                            if (result.ok && result.method === 'PATCH') applySprintVersion(s.id, result.newVersion);
                        });
                });
            }

            // Only refresh when connection-affecting fields actually changed from their previous values
            const prevMongo = prev.settings?.persistence?.mongo;
            const newMongo = newSettings.persistence?.mongo;
            const needsRefresh = (
                (newMongo?.app?.uri !== prevMongo?.app?.uri) ||
                (newMongo?.app?.db !== prevMongo?.app?.db) ||
                (newMongo?.app?.auth?.method !== prevMongo?.app?.auth?.method) ||
                (newMongo?.app?.auth?.aws_auth_type !== prevMongo?.app?.auth?.aws_auth_type) ||
                (newMongo?.customer?.uri !== prevMongo?.customer?.uri) ||
                (newMongo?.customer?.db !== prevMongo?.customer?.db) ||
                (newSettings.jira?.base_url !== prev.settings?.jira?.base_url) ||
                (newSettings.jira?.api_token !== prev.settings?.jira?.api_token)
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

    // Update the _version of a single sprint in local state after a successful persist.
    const applySprintVersion = (id: string, newVersion: number) => {
        setData(prev => {
            if (!prev) return prev;
            const sprints = prev.sprints || [];
            const idx = sprints.findIndex(s => s.id === id);
            if (idx === -1) return prev;
            const next = [...sprints];
            next[idx] = { ...next[idx], _version: newVersion };
            return { ...prev, sprints: next };
        });
    };

    const addSprint = (sprint: Sprint) => {
        setData(prev => {
            if (!prev) return prev;
            const newSprint = {
                _version: 0,
                ...sprint,
                quarter: calculateQuarter(sprint.end_date, prev.settings?.general?.fiscal_year_start_month || 1)
            };
            persistEntity('sprints', 'POST', newSprint, showAlert).then(result => {
                if (result.ok && result.method === 'POST') applySprintVersion(newSprint.id, result.newVersion);
            });
            return {
                ...prev,
                sprints: [...(prev.sprints || []), newSprint].sort((a, b) => a.start_date.localeCompare(b.start_date))
            };
        });
    };

    const updateSprint = async (id: string, updates: Partial<Sprint>, immediate = false) => {
        const existing = data?.sprints?.find(s => s.id === id);
        if (!existing) return;

        const baseline = { ...existing } as AnyEntity;
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

        // Build the PATCH body from the caller's updates, plus any server-derived
        // fields we recomputed (currently just `quarter`).
        const patch: AnyEntity = {};
        for (const k of Object.keys(updates)) {
            if (k === 'id' || k === '_version') continue;
            patch[k] = (updates as AnyEntity)[k];
        }
        if ((updates.end_date || updates.start_date) && !('quarter' in patch)) {
            patch.quarter = updatedSprint.quarter;
        }
        if (Object.keys(patch).length === 0) return;

        const clientVersion = existing._version ?? 0;

        if (immediate) {
            const result = await patchEntity('sprints', id, clientVersion, patch, showAlert, { baseline });
            if (result.ok && result.method === 'PATCH') applySprintVersion(id, result.newVersion);
        } else {
            debouncedPatch('sprints', id, clientVersion, patch, {
                baseline,
                onVersion: v => applySprintVersion(id, v),
            });
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
        deleteValueStream: valueStreamCRUD.remove,
        addCustomerArrayItem,
        patchCustomerArrayItem,
        deleteCustomerArrayItem,
    };
}
