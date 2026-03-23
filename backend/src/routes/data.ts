import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import { getSettingsPath } from './settings';
import { maskSettings, augmentConfig, logQuery } from '../utils/configHelpers';
import { getDb } from '../utils/mongoServer';
import { enrichWorkItemsWithMetrics } from '../services/metricsService';
import { assignMissingQuarters } from '../services/sprintService';
import { fetchWithThreshold, buildMongoQuery, applyValueStreamFilters } from '../utils/dbHelpers';

export const dataRoutes: FastifyPluginAsync = async (fastify) => {

  // Helper to safely get the App DB
  const getAppDb = async () => {
    const settingsPath = getSettingsPath();
    let settings: any = {};
    if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
    if (!settings.persistence?.mongo?.app?.uri) {
        throw new Error('App database is not configured in settings.');
    }
    return getDb(augmentConfig(settings, 'app'), 'app', true);
  };

  const getSettings = () => {
      const settingsPath = getSettingsPath();
      if (fs.existsSync(settingsPath)) {
          return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      }
      return {};
  }

  const handleError = (e: any, reply: any) => {
      const statusCode = e.statusCode || 500;
      return reply.code(statusCode).send({ success: false, error: e.message });
  };

  // 1. Granular Endpoints
  fastify.get('/api/settings', async (request, reply) => {
      try {
          const settings = getSettings();
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
          const settings = getSettings();
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
          // WorkItems require ALL customers, workItems, and issues to calculate correct RICE scores
          // (e.g. Should-have TCV count needs all workItems). Threshold protects each collection.
          const [customers, workItems, issues] = await Promise.all([
            fetchWithThreshold(db.collection('customers'), {}, 'customers'),
            fetchWithThreshold(db.collection('workItems'), {}, 'workItems'),
            fetchWithThreshold(db.collection('issues'), {}, 'issues')
          ]);

          const { workItems: scoredItems, metrics } = enrichWorkItemsWithMetrics(
              workItems.map(({ _id, ...rest }) => rest),
              customers.map(({ _id, ...rest }) => rest),
              issues.map(({ _id, ...rest }) => rest)
          );

          return reply.send({ workItems: scoredItems, metrics });
      } catch (e: any) {
          return handleError(e, reply);
      }
  });

  // 2. Composite Workspace Endpoint (replaces old loadData, used for full hydration on Graph View)
  fastify.get('/api/workspace', async (request, reply) => {
    try {
      const settings = getSettings();
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

          // Fetch ALL data for correct score computation (e.g. Should-have TCV needs all workItems).
          // No per-collection threshold here — the post-filter threshold in applyValueStreamFilters
          // is what protects the client. The user controls this via ValueStream parameters.
          const [customers, workItems, teams, issues] = await Promise.all([
            logQuery('Customers', 'customers', 'find', db.collection('customers').find({}).toArray()),
            logQuery('WorkItems', 'workItems', 'find', db.collection('workItems').find({}).toArray()),
            logQuery('Teams', 'teams', 'find', db.collection('teams').find({}).toArray()),
            logQuery('Issues', 'issues', 'find', db.collection('issues').find({}).toArray())
          ]);

          dbData.customers = customers.map(({ _id, ...rest }) => rest);
          dbData.teams = teams.map(({ _id, ...rest }) => rest);
          dbData.issues = issues.map(({ _id, ...rest }) => rest);

          // Score workItems on the FULL dataset (before filtering)
          const { workItems: scoredItems, metrics } = enrichWorkItemsWithMetrics(
              workItems.map(({ _id, ...rest }) => rest),
              dbData.customers,
              dbData.issues
          );

          dbData.workItems = scoredItems;
          dbData.metrics = metrics;

          // Apply ValueStream's saved (static) parameters as hard filters.
          // Dynamic/transient filters entered by the user are applied client-side in useGraphLayout.
          if (valueStreamId) {
            const vs = dbData.valueStreams.find((v: any) => v.id === valueStreamId);
            if (vs?.parameters) {
              const filtered = applyValueStreamFilters(dbData, vs.parameters);
              dbData.customers = filtered.customers;
              dbData.workItems = filtered.workItems;
              dbData.teams = filtered.teams;
              dbData.issues = filtered.issues;
            }
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
