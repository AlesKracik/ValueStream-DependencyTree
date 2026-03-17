import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import { getSettingsPath } from './settings';
import { maskSettings, augmentConfig, logQuery } from '../utils/configHelpers';
import { getDb } from '../utils/mongoServer';
import { enrichWorkItemsWithMetrics } from '../services/metricsService';
import { assignMissingQuarters } from '../services/sprintService';

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

  // 1. Granular Endpoints
  fastify.get('/api/settings', async (request, reply) => {
      try {
          const settings = getSettings();
          return reply.send({ success: true, settings: maskSettings(settings) });
      } catch (e: any) {
          return reply.code(500).send({ success: false, error: e.message });
      }
  });

  fastify.get('/api/data/customers', async (request, reply) => {
      try {
          const db = await getAppDb();
          const docs = await logQuery('Customers', 'customers', 'find', db.collection('customers').find({}).toArray());
          return reply.send(docs.map(({ _id, ...rest }) => rest));
      } catch (e: any) {
          return reply.code(500).send({ success: false, error: e.message });
      }
  });

  fastify.get('/api/data/teams', async (request, reply) => {
      try {
          const db = await getAppDb();
          const docs = await logQuery('Teams', 'teams', 'find', db.collection('teams').find({}).toArray());
          return reply.send(docs.map(({ _id, ...rest }) => rest));
      } catch (e: any) {
          return reply.code(500).send({ success: false, error: e.message });
      }
  });

  fastify.get('/api/data/issues', async (request, reply) => {
      try {
          const db = await getAppDb();
          const docs = await logQuery('Issues', 'issues', 'find', db.collection('issues').find({}).toArray());
          return reply.send(docs.map(({ _id, ...rest }) => rest));
      } catch (e: any) {
          return reply.code(500).send({ success: false, error: e.message });
      }
  });

  fastify.get('/api/data/valueStreams', async (request, reply) => {
      try {
          const db = await getAppDb();
          const docs = await logQuery('ValueStreams', 'valueStreams', 'find', db.collection('valueStreams').find({}).toArray());
          return reply.send(docs.map(({ _id, ...rest }) => rest));
      } catch (e: any) {
          return reply.code(500).send({ success: false, error: e.message });
      }
  });

  fastify.get('/api/data/sprints', async (request, reply) => {
      try {
          const db = await getAppDb();
          const settings = getSettings();
          const startMonth = settings.general?.fiscal_year_start_month || 1;
          
          const rawSprints = await logQuery('Sprints', 'sprints', 'find', db.collection('sprints').find({ is_archived: { $ne: true } }).sort({ start_date: 1 }).toArray());
          const sprintsWithoutId = rawSprints.map(({ _id, ...rest }) => rest);
          
          const docsWithQuarters = await assignMissingQuarters(sprintsWithoutId, db, startMonth);
          
          return reply.send(docsWithQuarters);
      } catch (e: any) {
          return reply.code(500).send({ success: false, error: e.message });
      }
  });

  fastify.get('/api/data/workItems', async (request, reply) => {
      try {
          const db = await getAppDb();
          // WorkItems require customers and issues to calculate RICE scores
          const [customers, workItems, issues] = await Promise.all([
            db.collection('customers').find({}).toArray(),
            db.collection('workItems').find({}).toArray(),
            db.collection('issues').find({}).toArray()
          ]);

          const { workItems: scoredItems, metrics } = enrichWorkItemsWithMetrics(
              workItems.map(({ _id, ...rest }) => rest), 
              customers.map(({ _id, ...rest }) => rest), 
              issues.map(({ _id, ...rest }) => rest)
          );

          return reply.send({ workItems: scoredItems, metrics });
      } catch (e: any) {
          return reply.code(500).send({ success: false, error: e.message });
      }
  });

  // 2. Composite Workspace Endpoint (replaces old loadData, used for full hydration on Graph View)
  fastify.get('/api/workspace', async (request, reply) => {
    try {
      const settings = getSettings();
      const hasAppDb = !!settings.persistence?.mongo?.app?.uri;
      
      const dbData: any = {
        settings: maskSettings(settings),
        customers: [], workItems: [], teams: [], issues: [], sprints: [], valueStreams: [],
        metrics: { maxScore: 1, maxRoi: 1 }
      };

      if (hasAppDb) {
        try {
          const db = await getAppDb();
          
          const ValueStreams = await logQuery('ValueStreams', 'valueStreams', 'find', db.collection('valueStreams').find({}).toArray());
          dbData.valueStreams = ValueStreams.map(({ _id, ...rest }) => rest);
          
          const rawSprintsForWorkspace = await logQuery('Sprints', 'sprints', 'find', db.collection('sprints').find({ is_archived: { $ne: true } }).sort({ start_date: 1 }).toArray());
          const sprintsWithoutIdForWorkspace = rawSprintsForWorkspace.map(({ _id, ...rest }) => rest);
          dbData.sprints = await assignMissingQuarters(sprintsWithoutIdForWorkspace, db, settings.general?.fiscal_year_start_month || 1);

          const [customers, workItems, teams, issues] = await Promise.all([
            logQuery('Customers', 'customers', 'find', db.collection('customers').find({}).toArray()),
            logQuery('WorkItems', 'workItems', 'find', db.collection('workItems').find({}).toArray()),
            logQuery('Teams', 'teams', 'find', db.collection('teams').find({}).toArray()),
            logQuery('Issues', 'issues', 'find', db.collection('issues').find({}).toArray())
          ]);

          dbData.customers = customers.map(({ _id, ...rest }) => rest);
          dbData.teams = teams.map(({ _id, ...rest }) => rest);
          dbData.issues = issues.map(({ _id, ...rest }) => rest);

          const { workItems: scoredItems, metrics } = enrichWorkItemsWithMetrics(
              workItems.map(({ _id, ...rest }) => rest), 
              dbData.customers, 
              dbData.issues
          );
          
          dbData.workItems = scoredItems;
          dbData.metrics = metrics;
          
        } catch (mongoErr) { 
          console.error('MongoDB load error:', mongoErr); 
        }
      }

      return reply.send(dbData);
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });
};
