import { FastifyPluginAsync } from 'fastify';
import { maskSettings, augmentConfig, logQuery } from '../utils/configHelpers';
import { getDb } from '../utils/mongoServer';
import { computeMetricsFromPrecomputed, recomputeScoresForWorkItems } from '../services/metricsService';
import { assignMissingQuarters } from '../services/sprintService';
import { fetchWithThreshold, buildMongoQuery, applyValueStreamFilters, buildWorkspaceQueries } from '../utils/dbHelpers';

export const dataRoutes: FastifyPluginAsync = async (fastify) => {

  // Helper to safely get the App DB
  const getAppDb = async () => {
    const settings = await fastify.getSettings();
    if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error('App database is not configured in settings.');
    }
    return getDb(augmentConfig(settings, 'app'), 'app', true);
  };

  const handleError = (e: any, reply: any) => {
      const statusCode = e.statusCode || 500;
      return reply.code(statusCode).send({ success: false, error: e.message });
  };

  // 1. Granular Endpoints
  fastify.get('/api/settings', async (request, reply) => {
      try {
          const settings = await fastify.getSettings();
          return reply.send({ success: true, settings: maskSettings(settings) });
      } catch (e: any) {
          return handleError(e, reply);
      }
  });

  fastify.get('/api/data/customers', async (request, reply) => {
      try {
          const db = await getAppDb();
          const query = buildMongoQuery(request.query || {}, 'customers');
          const docs = await fetchWithThreshold(db.collection('customers'), query, 'customers');
          return reply.send(docs.map(({ _id, ...rest }) => rest));
      } catch (e: any) {
          return handleError(e, reply);
      }
  });

  fastify.get('/api/data/teams', async (request, reply) => {
      try {
          const db = await getAppDb();
          const query = buildMongoQuery(request.query || {}, 'teams');
          const docs = await fetchWithThreshold(db.collection('teams'), query, 'teams');
          return reply.send(docs.map(({ _id, ...rest }) => rest));
      } catch (e: any) {
          return handleError(e, reply);
      }
  });

  fastify.get('/api/data/issues', async (request, reply) => {
      try {
          const db = await getAppDb();
          const query = buildMongoQuery(request.query || {}, 'issues');
          const docs = await fetchWithThreshold(db.collection('issues'), query, 'issues');
          return reply.send(docs.map(({ _id, ...rest }) => rest));
      } catch (e: any) {
          return handleError(e, reply);
      }
  });

  fastify.get('/api/data/valueStreams', async (request, reply) => {
      try {
          const db = await getAppDb();
          const docs = await fetchWithThreshold(db.collection('valueStreams'), {}, 'valueStreams');
          return reply.send(docs.map(({ _id, ...rest }) => rest));
      } catch (e: any) {
          return handleError(e, reply);
      }
  });

  fastify.get('/api/data/sprints', async (request, reply) => {
      try {
          const db = await getAppDb();
          const settings = await fastify.getSettings();
          const startMonth = settings.general?.fiscal_year_start_month || 1;

          const rawSprints = await fetchWithThreshold(db.collection('sprints'), { is_archived: { $ne: true } }, 'sprints');
          const sprintsWithoutId = rawSprints
              .sort((a: any, b: any) => (a.start_date || '').localeCompare(b.start_date || ''))
              .map(({ _id, ...rest }) => rest);

          const docsWithQuarters = await assignMissingQuarters(sprintsWithoutId, db, startMonth);

          return reply.send(docsWithQuarters);
      } catch (e: any) {
          return handleError(e, reply);
      }
  });

  fastify.get('/api/data/workItems', async (request, reply) => {
      try {
          const db = await getAppDb();
          // Scores are pre-computed on WorkItem documents — no need to join with customers/issues
          const query = buildMongoQuery(request.query || {}, 'workItems');
          const docs = await fetchWithThreshold(db.collection('workItems'), query, 'workItems');
          const workItems = docs.map(({ _id, ...rest }) => rest);
          const metrics = computeMetricsFromPrecomputed(workItems);

          return reply.send({ workItems, metrics });
      } catch (e: any) {
          return handleError(e, reply);
      }
  });

  // Migration: backfill pre-computed scores on existing WorkItem documents
  fastify.post('/api/data/recomputeScores', async (request, reply) => {
      try {
          const db = await getAppDb();
          await recomputeScoresForWorkItems(db);
          const count = await db.collection('workItems').countDocuments({});
          return reply.send({ success: true, workItemsUpdated: count });
      } catch (e: any) {
          return handleError(e, reply);
      }
  });

  // 2. Composite Workspace Endpoint (replaces old loadData, used for full hydration on Graph View)
  fastify.get('/api/workspace', async (request, reply) => {
    try {
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
          console.error('MongoDB load error:', mongoErr);
        }
      }

      return reply.send(dbData);
    } catch (e: any) {
      return handleError(e, reply);
    }
  });
};
