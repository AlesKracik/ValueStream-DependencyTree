import { Collection, Document, WithId } from 'mongodb';

export const DATA_THRESHOLD = 500;

export async function fetchWithThreshold<T extends Document>(
    collection: Collection<T>,
    query: any,
    collectionName: string
): Promise<WithId<T>[]> {
    // Check if countDocuments is available (it might be mocked out in tests)
    let count = 0;
    if (typeof collection.countDocuments === 'function') {
        count = await collection.countDocuments(query);
    } else {
        // Fallback for tests or mocks that only implement find().toArray()
        const items = await collection.find(query).toArray();
        count = items.length;
        if (count <= DATA_THRESHOLD) {
            return items;
        }
    }

    if (count > DATA_THRESHOLD) {
        const err: any = new Error(`Data set too large (${count} items in ${collectionName}). Please apply filters to reduce the results below ${DATA_THRESHOLD}.`);
        err.statusCode = 413;
        throw err;
    }

    return await collection.find(query).toArray();
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
        const minScore = Number(query.minScoreFilter) || 0;
        if (minScore > 0) {
            mongoQuery.calculated_score = { $gte: minScore };
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
