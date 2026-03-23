import { Collection, Document, WithId } from 'mongodb';

const DATA_THRESHOLD = 500;

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
        throw new Error(`[413] Data set too large (${count} items in ${collectionName}). Please apply filters to reduce the results below ${DATA_THRESHOLD}.`);
    }
    
    // We already have items if countDocuments wasn't available
    return await collection.find(query).toArray();
}

export function buildMongoQuery(query: any): any {
    const mongoQuery: any = {};
    if (query.valueStreamId) {
        // Value stream filtering logic can be complex, often entities don't have a direct valueStreamId.
        // For now, if value stream has direct relations, map them, but for this app it might be better handled later.
        // E.g. we might need to query the valueStream first and get its team/customer filters, 
        // or if entities actually have `valueStreamId`, map it directly.
        // For safety, let's include it if present, but the frontend currently uses valueStreamId to get the specific stream,
        // and its associated filters.
    }
    if (query.customerFilter) {
        // For work items
        mongoQuery['customer_targets.customer_id'] = query.customerFilter;
    }
    if (query.teamFilter) {
        // For issues
        mongoQuery.team_id = query.teamFilter;
    }
    if (query.releasedFilter) {
        mongoQuery.released = query.releasedFilter === 'true' || query.releasedFilter === true;
    }
    if (query.minTcvFilter) {
        mongoQuery.tcv = { $gte: Number(query.minTcvFilter) };
    }
    // We can add more mappings as needed based on the models.
    return mongoQuery;
}
