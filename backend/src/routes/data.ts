import { FastifyPluginAsync } from 'fastify';
import { maskSettings, augmentConfig, logQuery } from '../utils/configHelpers';
import { getDb } from '../utils/mongoServer';
import { computeMetricsFromPrecomputed, recomputeScoresForWorkItems } from '../services/metricsService';
import { assignMissingQuarters } from '../services/sprintService';
import { fetchWithThreshold, buildMongoQuery, applyValueStreamFilters, buildWorkspaceQueries, buildWorkItemSort, buildCustomerSort } from '../utils/dbHelpers';
import { WorkItemListQuery, WorkItemListQueryType, CustomerListQuery, CustomerListQueryType } from './schemas';
import { getDescendantIdsForRoots, ensureHierarchyIndex } from '../utils/workItemHierarchy';

export const dataRoutes: FastifyPluginAsync = async (fastify) => {

  // Helper to safely get the App DB
  const getAppDb = async () => {
    const settings = await fastify.getSettings();
    if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error('App database is not configured in settings.');
    }
    return getDb(augmentConfig(settings, 'app'), 'app', true);
  };

  // 1. Granular Endpoints
  fastify.get('/api/settings', async (request, reply) => {
    const settings = await fastify.getSettings();
    return reply.send({ success: true, settings: maskSettings(settings) });
  });

  fastify.get<{ Querystring: CustomerListQueryType }>('/api/data/customers', {
    schema: { querystring: CustomerListQuery }
  }, async (request, reply) => {
    const db = await getAppDb();
    const q = request.query || {};
    const query = buildMongoQuery(q, 'customers');
    const sort = buildCustomerSort(q);

    // Mirror the workItems endpoint pagination contract: both page and pageSize
    // must be valid positive numbers to engage; otherwise fall back to the
    // legacy threshold-protected fetch so existing callers are unaffected.
    const pageNum = Number(q.page);
    const pageSizeNum = Number(q.pageSize);
    const paginate =
      Number.isFinite(pageNum) && pageNum >= 1 &&
      Number.isFinite(pageSizeNum) && pageSizeNum >= 1;

    if (paginate) {
      const collection = db.collection('customers');
      const total = await collection.countDocuments(query);

      let cursor = collection.find(query);
      if (sort) cursor = cursor.sort(sort);
      cursor = cursor.skip((pageNum - 1) * pageSizeNum).limit(pageSizeNum);
      const pageDocs = await cursor.toArray();
      const customers = pageDocs.map(({ _id, ...rest }) => rest);

      return reply.send({ customers, total, page: pageNum, pageSize: pageSizeNum });
    }

    const docs = await fetchWithThreshold(db.collection('customers'), query, 'customers', sort);
    const customers = docs.map(({ _id, ...rest }) => rest);
    return reply.send({ customers, total: customers.length });
  });

  fastify.get('/api/data/teams', async (request, reply) => {
    const db = await getAppDb();
    const query = buildMongoQuery(request.query || {}, 'teams');
    const docs = await fetchWithThreshold(db.collection('teams'), query, 'teams');
    return reply.send(docs.map(({ _id, ...rest }) => rest));
  });

  fastify.get('/api/data/issues', async (request, reply) => {
    const db = await getAppDb();
    const query = buildMongoQuery(request.query || {}, 'issues');
    const docs = await fetchWithThreshold(db.collection('issues'), query, 'issues');
    return reply.send(docs.map(({ _id, ...rest }) => rest));
  });

  fastify.get('/api/data/valueStreams', async (request, reply) => {
    const db = await getAppDb();
    const docs = await fetchWithThreshold(db.collection('valueStreams'), {}, 'valueStreams');
    return reply.send(docs.map(({ _id, ...rest }) => rest));
  });

  fastify.get('/api/data/sprints', async (request, reply) => {
    const db = await getAppDb();
    const settings = await fastify.getSettings();
    const startMonth = settings.general?.fiscal_year_start_month || 1;

    const rawSprints = await fetchWithThreshold(db.collection('sprints'), { is_archived: { $ne: true } }, 'sprints');
    const sprintsWithoutId = rawSprints
        .sort((a: any, b: any) => (a.start_date || '').localeCompare(b.start_date || ''))
        .map(({ _id, ...rest }) => rest);

    const docsWithQuarters = await assignMissingQuarters(sprintsWithoutId, db, startMonth);

    return reply.send(docsWithQuarters);
  });

  fastify.get<{ Querystring: WorkItemListQueryType }>('/api/data/workItems', {
    schema: { querystring: WorkItemListQuery }
  }, async (request, reply) => {
    const db = await getAppDb();
    // Scores are pre-computed on WorkItem documents — no need to join with customers/issues
    const q = request.query || {};
    const query = buildMongoQuery(q, 'workItems');
    const sort = buildWorkItemSort(q);

    // Subtree filter: resolve every descendant of any `subtreeOf` root via
    // $graphLookup and AND the union into the query. The roots themselves are
    // intentionally excluded — users typically want "everything under X", not
    // the X itself. An empty union forces an unsatisfiable id match so the
    // response is correctly empty.
    // `subtreeOf` accepts a single value or repeated query params; both shapes
    // are normalized to a list.
    const subtreeRoots = (Array.isArray(q.subtreeOf) ? q.subtreeOf : (typeof q.subtreeOf === 'string' ? [q.subtreeOf] : []))
      .map(s => s.trim())
      .filter(Boolean);
    if (subtreeRoots.length > 0) {
      await ensureHierarchyIndex(db);
      const descendants = await getDescendantIdsForRoots(db, subtreeRoots);
      query.id = { $in: descendants };
    }

    // Parse pagination. Both page and pageSize must be valid positive numbers
    // for pagination to engage; otherwise we fall back to the legacy threshold-
    // protected fetch so existing callers (and the workspace endpoint upstream)
    // are unaffected.
    const pageNum = Number(q.page);
    const pageSizeNum = Number(q.pageSize);
    const paginate =
      Number.isFinite(pageNum) && pageNum >= 1 &&
      Number.isFinite(pageSizeNum) && pageSizeNum >= 1;

    if (paginate) {
      const collection = db.collection('workItems');
      // Metrics are computed across ALL matching docs so node-size scaling
      // stays stable as the user pages.
      const allDocs = await collection.find(query).toArray();
      const total = allDocs.length;
      const metrics = computeMetricsFromPrecomputed(allDocs.map(({ _id, ...rest }) => rest));

      let cursor = collection.find(query);
      if (sort) cursor = cursor.sort(sort);
      cursor = cursor.skip((pageNum - 1) * pageSizeNum).limit(pageSizeNum);
      const pageDocs = await cursor.toArray();
      const workItems = pageDocs.map(({ _id, ...rest }) => rest);

      return reply.send({ workItems, metrics, total, page: pageNum, pageSize: pageSizeNum });
    }

    const docs = await fetchWithThreshold(db.collection('workItems'), query, 'workItems', sort);
    const workItems = docs.map(({ _id, ...rest }) => rest);
    const metrics = computeMetricsFromPrecomputed(workItems);

    return reply.send({ workItems, metrics, total: workItems.length });
  });

  // Migration: backfill pre-computed scores on existing WorkItem documents
  fastify.post('/api/data/recomputeScores', async (request, reply) => {
    const db = await getAppDb();
    await recomputeScoresForWorkItems(db);
    const count = await db.collection('workItems').countDocuments({});
    return reply.send({ success: true, workItemsUpdated: count });
  });

  // 2. Composite Workspace Endpoint (replaces old loadData, used for full hydration on Graph View)
  fastify.get('/api/workspace', async (request, reply) => {
    const settings = await fastify.getSettings();
    const hasAppDb = !!settings.persistence?.mongo?.app?.uri;
    const { valueStreamId } = (request.query || {}) as any;

    const dbData: any = {
      settings: maskSettings(settings),
      customers: [], workItems: [], teams: [], issues: [], sprints: [], valueStreams: [],
      metrics: { maxScore: 1, maxRoi: 1 }
    };

    if (hasAppDb) {
      try {
        const db = await getAppDb();

        const valueStreamDocs = await logQuery('ValueStreams', 'valueStreams', 'find', db.collection('valueStreams').find({}).toArray());
        dbData.valueStreams = valueStreamDocs.map(({ _id, ...rest }) => rest);

        const rawSprintsForWorkspace = await logQuery('Sprints', 'sprints', 'find', db.collection('sprints').find({ is_archived: { $ne: true } }).sort({ start_date: 1 }).toArray());
        const sprintsWithoutIdForWorkspace = rawSprintsForWorkspace.map(({ _id, ...rest }) => rest);
        dbData.sprints = await assignMissingQuarters(sprintsWithoutIdForWorkspace, db, settings.general?.fiscal_year_start_month || 1);

        // Look up ValueStream parameters for DB-level query building
        const vs = valueStreamId ? dbData.valueStreams.find((v: any) => v.id === valueStreamId) : null;
        const params = vs?.parameters || {};

        // Build per-collection MongoDB queries from ValueStream parameters.
        // Scores are pre-computed on WorkItem docs, so score/released/name filters
        // can now be pushed to the DB layer — no need to fetch everything.
        const queries = buildWorkspaceQueries(params);

        // Subtree hierarchy filter — resolve all descendants of every chosen
        // root via $graphLookup and AND the union into the workItems query.
        // Reads `subtreeOfIds` (new array shape) and `subtreeOf` (legacy single
        // string from saved ValueStream documents) and unions them. Empty union
        // collapses to id $in [] so the workItems list is empty, which is the
        // correct behaviour for "show only what's under X".
        const subtreeRootList: string[] = [];
        if (Array.isArray(params.subtreeOfIds)) {
            for (const r of params.subtreeOfIds) {
                if (typeof r === 'string' && r.trim() !== '') subtreeRootList.push(r.trim());
            }
        }
        if (typeof params.subtreeOf === 'string' && params.subtreeOf.trim() !== '') {
            subtreeRootList.push(params.subtreeOf.trim());
        }
        const subtreeRoots = Array.from(new Set(subtreeRootList));
        if (subtreeRoots.length > 0) {
            await ensureHierarchyIndex(db);
            const descendants = await getDescendantIdsForRoots(db, subtreeRoots);
            queries.workItems.id = { $in: descendants };
        }

        const [customers, workItems, teams, issues] = await Promise.all([
          logQuery('Customers', 'customers', 'find', db.collection('customers').find(queries.customers).toArray()),
          logQuery('WorkItems', 'workItems', 'find', db.collection('workItems').find(queries.workItems).toArray()),
          logQuery('Teams', 'teams', 'find', db.collection('teams').find(queries.teams).toArray()),
          logQuery('Issues', 'issues', 'find', db.collection('issues').find(queries.issues).toArray())
        ]);

        dbData.customers = customers.map(({ _id, ...rest }) => rest);
        dbData.workItems = workItems.map(({ _id, ...rest }) => rest);
        dbData.teams = teams.map(({ _id, ...rest }) => rest);
        dbData.issues = issues.map(({ _id, ...rest }) => rest);

        // Compute metrics from pre-computed score fields (no need for enrichWorkItemsWithMetrics)
        dbData.metrics = computeMetricsFromPrecomputed(dbData.workItems);

        // Apply remaining in-memory filters that can't be expressed as simple MongoDB queries
        // (cross-entity: issue team membership, sprint range, post-filter threshold)
        if (valueStreamId && vs?.parameters) {
          const filtered = applyValueStreamFilters(dbData, vs.parameters);
          dbData.customers = filtered.customers;
          dbData.workItems = filtered.workItems;
          dbData.teams = filtered.teams;
          dbData.issues = filtered.issues;
        }

      } catch (mongoErr: any) {
        if (mongoErr.statusCode === 413) throw mongoErr;
        fastify.log.error(mongoErr, 'MongoDB load error');
      }
    }

    return reply.send(dbData);
  });
};
