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
 * Applies a ValueStream's saved (static) parameters as hard filters on the workspace data.
 * Runs AFTER scoring so that computed fields (score, calculated_tcv) are available.
 *
 * This is the backend counterpart to the baseParams filtering in useGraphLayout —
 * the frontend still applies dynamic/transient filters on top of this.
 */
export function applyValueStreamFilters(data: any, params: any): any {
    if (!params) return data;

    const cf = (params.customerFilter || '').toLowerCase();
    const wf = (params.workItemFilter || '').toLowerCase();
    const tf = (params.teamFilter || '').toLowerCase();
    const ef = (params.issueFilter || '').toLowerCase();
    const rel = params.releasedFilter || 'all';
    const minTcv = Number(params.minTcvFilter) || 0;
    const minScore = Number(params.minScoreFilter) || 0;

    let { customers, workItems, teams, issues, sprints } = data;

    // Customer filter: text match on name + minTcv on total TCV
    if (cf || minTcv > 0) {
        customers = customers.filter((c: any) => {
            if (cf && !c.name.toLowerCase().includes(cf)) return false;
            if (minTcv > 0) {
                const totalTcv = (c.existing_tcv || 0) + (c.potential_tcv || 0);
                if (totalTcv < minTcv) return false;
            }
            return true;
        });
    }

    // WorkItem filter: text match + released status + minScore
    if (wf || rel !== 'all' || minScore > 0) {
        workItems = workItems.filter((w: any) => {
            if (wf && !w.name.toLowerCase().includes(wf)) return false;
            if (rel === 'released' && !w.released_in_sprint_id) return false;
            if (rel === 'unreleased' && w.released_in_sprint_id) return false;
            if (minScore > 0 && (w.score || 0) < minScore) return false;
            return true;
        });
    }

    // Team filter: text match on name
    if (tf) {
        teams = teams.filter((t: any) => t.name.toLowerCase().includes(tf));
    }

    // Issue filter: text match on name + team membership + sprint range
    const validTeamIds = tf ? new Set(teams.map((t: any) => t.id)) : null;

    if (ef || validTeamIds || params.startSprintId || params.endSprintId) {
        const startSprint = params.startSprintId ? sprints.find((s: any) => s.id === params.startSprintId) : null;
        const endSprint = params.endSprintId ? sprints.find((s: any) => s.id === params.endSprintId) : null;
        const rangeStart = startSprint ? new Date(startSprint.start_date) : null;
        const rangeEnd = endSprint ? new Date(endSprint.end_date) : null;

        issues = issues.filter((e: any) => {
            if (ef && !(e.name || '').toLowerCase().includes(ef)) return false;
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
