import { Collection, Document, WithId } from 'mongodb';

export const DATA_THRESHOLD = 500;

export async function fetchWithThreshold<T extends Document>(
    collection: Collection<T>,
    query: any,
    collectionName: string,
    sort?: Record<string, 1 | -1> | null
): Promise<WithId<T>[]> {
    // Check if countDocuments is available (it might be mocked out in tests)
    let count = 0;
    if (typeof collection.countDocuments === 'function') {
        count = await collection.countDocuments(query);
    } else {
        // Fallback for tests or mocks that only implement find().toArray().
        // The unsorted fast-path returns the items directly so we don't double-fetch.
        // With sort, we still need a second fetch so the cursor is ordered.
        const items = await collection.find(query).toArray();
        count = items.length;
        if (count <= DATA_THRESHOLD && !sort) {
            return items;
        }
    }

    if (count > DATA_THRESHOLD) {
        const err: any = new Error(`Data set too large (${count} items in ${collectionName}). Please apply filters to reduce the results below ${DATA_THRESHOLD}.`);
        err.statusCode = 413;
        throw err;
    }

    const cursor = collection.find(query);
    return sort ? await cursor.sort(sort).toArray() : await cursor.toArray();
}

/**
 * Coerces a query param that may arrive as a single string, an array of strings,
 * or be missing entirely, into a clean string[]. Empty entries are dropped.
 */
function toArray(value: unknown): string[] {
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) return value.filter(v => typeof v === 'string' && v !== '') as string[];
    if (typeof value === 'string') return [value];
    return [];
}

/**
 * Maps the user-facing prioritization metric to its underlying MongoDB field.
 * Mirrors the metric toggle in WorkItemListPage so filter + sort + the displayed
 * column all reference the same value.
 */
const PRIORITY_METRIC_FIELD: Record<string, string> = {
    score: 'calculated_score',
    aha_score: 'aha_synced_data.score',
    stackrank: 'stackrank',
};

function priorityField(query: any): string {
    return PRIORITY_METRIC_FIELD[String(query?.priorityMetric || 'score')] || 'calculated_score';
}

/**
 * Maps a list-page sortBy key to the underlying MongoDB field. Returns null
 * for keys that can't be sorted at the DB level (e.g. 'released' would order
 * by raw sprint id, which is meaningless to the user — kept client-side).
 *
 * 'priority' is special: it routes to whichever field the active priorityMetric
 * selects (see priorityField).
 */
const WORK_ITEM_SORT_FIELDS: Record<string, string> = {
    name: 'name',
    score: 'calculated_score',
    effort: 'calculated_effort',
    tcv: 'calculated_tcv',
    status: 'status',
};

/**
 * Builds a MongoDB sort spec for the work-items list endpoint. Returns null
 * when no sort is requested or when sortBy maps to an unsupported field, in
 * which case the caller should leave the cursor unsorted.
 */
export function buildWorkItemSort(query: any): Record<string, 1 | -1> | null {
    if (!query) return null;
    const sortBy = String(query.sortBy || '');
    const field = sortBy === 'priority' ? priorityField(query) : WORK_ITEM_SORT_FIELDS[sortBy];
    if (!field) return null;
    const direction: 1 | -1 = query.sortOrder === 'desc' ? -1 : 1;
    return { [field]: direction };
}

/**
 * Builds a MongoDB query from frontend query parameters.
 * Only maps filters that correspond to actual stored fields for a given collection.
 *
 * Text-based cross-entity filters (customerFilter as name search, teamFilter as name search)
 * and computed-value filters (minTcvFilter, minScoreFilter) are handled post-fetch on the client.
 */
export function buildMongoQuery(query: any, collection: string): any {
    const mongoQuery: any = {};

    // --- Text/name filters ---
    if (collection === 'customers' && query.customerFilter) {
        mongoQuery.name = { $regex: query.customerFilter, $options: 'i' };
    }

    if (collection === 'teams' && query.teamFilter) {
        mongoQuery.name = { $regex: query.teamFilter, $options: 'i' };
    }

    if (collection === 'workItems') {
        // Legacy released filter (kept for workspace endpoint + other existing callers)
        if (query.releasedFilter && query.releasedFilter !== 'all') {
            if (query.releasedFilter === 'released') {
                mongoQuery.released_in_sprint_id = { $exists: true, $ne: '' };
            } else if (query.releasedFilter === 'unreleased') {
                mongoQuery.$or = [
                    { released_in_sprint_id: { $exists: false } },
                    { released_in_sprint_id: '' }
                ];
            }
        }

        // Legacy minScoreFilter (kept; new callers use minScore)
        const legacyMinScore = Number(query.minScoreFilter) || 0;
        if (legacyMinScore > 0) {
            mongoQuery.calculated_score = { $gte: legacyMinScore };
        }

        // --- Work-items list-page filters ---
        if (typeof query.name === 'string' && query.name.trim() !== '') {
            // Escape regex special chars so users don't accidentally type a regex.
            const safe = query.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            mongoQuery.name = { $regex: safe, $options: 'i' };
        }

        // Range filters on pre-computed scalar fields. Min and max may both be set.
        // If a previous block already wrote { $gte } for the same field (e.g. legacy
        // minScoreFilter), merge instead of overwrite.
        const applyRange = (field: string, minRaw: any, maxRaw: any) => {
            const min = minRaw !== undefined && minRaw !== '' ? Number(minRaw) : NaN;
            const max = maxRaw !== undefined && maxRaw !== '' ? Number(maxRaw) : NaN;
            if (Number.isNaN(min) && Number.isNaN(max)) return;
            const existing = mongoQuery[field] && typeof mongoQuery[field] === 'object' ? mongoQuery[field] : {};
            if (!Number.isNaN(min)) existing.$gte = min;
            if (!Number.isNaN(max)) existing.$lte = max;
            mongoQuery[field] = existing;
        };
        applyRange('calculated_score', query.minScore, query.maxScore);
        applyRange('calculated_effort', query.minEffort, query.maxEffort);
        applyRange('calculated_tcv', query.minTcv, query.maxTcv);

        // Priority range targets the active metric's field (calculated_score by default).
        // Lets the UI's metric toggle apply consistently to filter + sort + displayed value.
        applyRange(priorityField(query), query.minPriority, query.maxPriority);

        // Filter blocks below may each need their own $or (legacy releasedFilter
        // ↔ "unreleased", status ↔ "Backlog includes missing", sprints ↔ "unreleased").
        // Top-level $or can only be assigned once, so we collect each block's
        // branches and combine them at the end via $and (or a single $or when
        // there's only one block).
        const orGroups: any[][] = [];

        // Move any $or set by the legacy releasedFilter branch above into the
        // collection so it survives potential combination with new filters.
        if (Array.isArray(mongoQuery.$or)) {
            orGroups.push(mongoQuery.$or);
            delete mongoQuery.$or;
        }

        // Multi-select status. Fastify gives us either a single string or an array
        // depending on whether ?status=X appeared once or many times.
        // Special case: 'Backlog' is the UI default for items with no stored status
        // (WorkItemListPage renders `w.status || 'Backlog'`), so selecting Backlog
        // must also include docs whose status field is missing / empty / null —
        // otherwise legacy items show in the list but get filtered out by their
        // own filter chip.
        const statusList = toArray(query.status);
        if (statusList.length > 0) {
            const includesBacklog = statusList.includes('Backlog');
            if (includesBacklog) {
                orGroups.push([
                    { status: { $in: statusList } },
                    { status: { $exists: false } },
                    { status: null },
                    { status: '' },
                ]);
            } else {
                mongoQuery.status = { $in: statusList };
            }
        }

        // Multi-select released sprints. The literal 'unreleased' is a sentinel
        // meaning "matches docs without a released_in_sprint_id".
        const sprintIdList = toArray(query.releasedSprintIds);
        if (sprintIdList.length > 0) {
            const includesUnreleased = sprintIdList.includes('unreleased');
            const realIds = sprintIdList.filter(s => s !== 'unreleased');
            const branches: any[] = [];
            if (realIds.length > 0) branches.push({ released_in_sprint_id: { $in: realIds } });
            if (includesUnreleased) {
                branches.push({ released_in_sprint_id: { $exists: false } });
                branches.push({ released_in_sprint_id: '' });
            }
            // Drop any released_in_sprint_id constraint already set by the legacy
            // releasedFilter=released branch — the new releasedSprintIds is more
            // specific and supersedes it. (The legacy unreleased branch already had
            // its $or moved into orGroups; we drop it here so the new selection wins.)
            delete mongoQuery.released_in_sprint_id;
            // The new selection supersedes the legacy unreleased branch — pop the
            // legacy group we collected at the top so we don't double-OR.
            const legacyIdx = orGroups.findIndex(g => g.some(b => b.released_in_sprint_id?.$exists === false));
            if (legacyIdx >= 0) orGroups.splice(legacyIdx, 1);
            orGroups.push(branches);
        }

        // Combine the per-block $or groups: a single one goes into $or directly;
        // multiple are AND-ed together so each block's "OR" semantics are preserved
        // independently.
        if (orGroups.length === 1) {
            mongoQuery.$or = orGroups[0];
        } else if (orGroups.length > 1) {
            mongoQuery.$and = orGroups.map(branches => ({ $or: branches }));
        }
    }

    // --- Relational filters (for detail pages) ---

    // Filter workItems targeting a specific customer
    if (collection === 'workItems' && query.customerId) {
        mongoQuery['customer_targets.customer_id'] = query.customerId;
    }

    // Filter issues linked to a specific workItem
    if (collection === 'issues' && query.workItemId) {
        mongoQuery.work_item_id = query.workItemId;
    }

    // Filter issues belonging to a specific team (by ID, not name)
    if (collection === 'issues' && query.teamId) {
        mongoQuery.team_id = query.teamId;
    }

    return mongoQuery;
}

/**
 * Builds per-collection MongoDB queries from ValueStream parameters.
 * Used by the workspace endpoint to push filters to the DB layer.
 * Filters that CAN be expressed as MongoDB queries: name text, released status,
 * minScore (pre-computed), minTcv (via $expr).
 * Filters that CANNOT: cross-entity (issue team membership, sprint range) — handled in applyValueStreamFilters.
 */
export function buildWorkspaceQueries(params: any): { customers: any; workItems: any; teams: any; issues: any } {
    const customers: any = {};
    const workItems: any = {};
    const teams: any = {};
    const issues: any = {};

    // Customer filters
    if (params.customerFilter) {
        customers.name = { $regex: params.customerFilter, $options: 'i' };
    }
    const minTcv = Number(params.minTcvFilter) || 0;
    if (minTcv > 0) {
        customers.$expr = { $gte: [{ $add: [{ $ifNull: ['$existing_tcv', 0] }, { $ifNull: ['$potential_tcv', 0] }] }, minTcv] };
    }

    // WorkItem filters (scores are pre-computed on the document)
    if (params.workItemFilter) {
        workItems.name = { $regex: params.workItemFilter, $options: 'i' };
    }
    const minScore = Number(params.minScoreFilter) || 0;
    if (minScore > 0) {
        workItems.calculated_score = { $gte: minScore };
    }
    const rel = params.releasedFilter || 'all';
    if (rel === 'released') {
        workItems.released_in_sprint_id = { $exists: true, $ne: '' };
    } else if (rel === 'unreleased') {
        workItems.$or = [
            { released_in_sprint_id: { $exists: false } },
            { released_in_sprint_id: '' }
        ];
    }

    // Team filters
    if (params.teamFilter) {
        teams.name = { $regex: params.teamFilter, $options: 'i' };
    }

    // Issue name filter (team membership and sprint range handled in-memory)
    if (params.issueFilter) {
        issues.name = { $regex: params.issueFilter, $options: 'i' };
    }

    return { customers, workItems, teams, issues };
}

/**
 * Applies remaining in-memory filters that can't be expressed as MongoDB queries.
 * DB-level filters (name text, released, minScore, minTcv) are already applied via buildWorkspaceQueries.
 * This handles: cross-entity issue filtering (team membership + sprint range) and the post-filter threshold.
 */
export function applyValueStreamFilters(data: any, params: any): any {
    if (!params) return data;

    const tf = (params.teamFilter || '').toLowerCase();

    let { customers, workItems, teams, issues, sprints } = data;

    // Issue filter: team membership + sprint range (cross-entity, can't be done at DB level)
    const validTeamIds = tf ? new Set(teams.map((t: any) => t.id)) : null;

    if (validTeamIds || params.startSprintId || params.endSprintId) {
        const startSprint = params.startSprintId ? sprints.find((s: any) => s.id === params.startSprintId) : null;
        const endSprint = params.endSprintId ? sprints.find((s: any) => s.id === params.endSprintId) : null;
        const rangeStart = startSprint ? new Date(startSprint.start_date) : null;
        const rangeEnd = endSprint ? new Date(endSprint.end_date) : null;

        issues = issues.filter((e: any) => {
            if (validTeamIds && !validTeamIds.has(e.team_id)) return false;

            if (rangeStart || rangeEnd) {
                if (!e.target_start || !e.target_end) return false;
                const start = new Date(e.target_start);
                const end = new Date(e.target_end);
                if (rangeStart && end < rangeStart) return false;
                if (rangeEnd && start > rangeEnd) return false;
            }

            return true;
        });
    }

    const filtered = { ...data, customers, workItems, teams, issues };

    // Check total entity count after filtering — if still too large, reject
    const totalCount = customers.length + workItems.length + teams.length + issues.length;
    if (totalCount > DATA_THRESHOLD) {
        const breakdown = `${customers.length} customers, ${workItems.length} workItems, ${teams.length} teams, ${issues.length} issues`;
        const err: any = new Error(
            `Filtered data set still too large (${totalCount} total items: ${breakdown}). ` +
            `Please tighten the Value Stream parameters to reduce results below ${DATA_THRESHOLD}.`
        );
        err.statusCode = 413;
        throw err;
    }

    return filtered;
}
