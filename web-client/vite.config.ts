/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { MongoClient } from 'mongodb'
import dns from 'node:dns'
import { promisify } from 'node:util'

const dnsLookup = promisify(dns.lookup);

// Map to store persistent Augment processes: sessionId -> { child, lastUsed }
const augmentProcesses = new Map<string, { child: any, lastUsed: number }>();

// Cleanup idle processes every minute
setInterval(() => {
  const now = Date.now();
  for (const [_, item] of augmentProcesses.entries()) {
    if (now - item.lastUsed > 10 * 60 * 1000) { // 10 minutes idle
      item.child.kill();
      augmentProcesses.delete(_);
    }
  }
}, 60000);

// Ensure child processes are killed when the main app process exits
const cleanupAllProcesses = () => {
  for (const [_, item] of augmentProcesses.entries()) {
    try {
      item.child.kill();
    } catch (e) { /* ignore */ }
  }
  augmentProcesses.clear();
};

process.on('SIGINT', () => { cleanupAllProcesses(); process.exit(); });
process.on('SIGTERM', () => { cleanupAllProcesses(); process.exit(); });
process.on('exit', cleanupAllProcesses);

const MockDataPersistencePlugin = (): Plugin => ({
  name: 'mock-data-persistence',
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      const ALLOWED_COLLECTIONS = ['customers', 'workItems', 'teams', 'epics', 'sprints', 'dashboards'];
      const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5 MB limit

      function escapeRegex(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }

      // Simple CORS check
      const origin = req.headers['origin'];
      const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
      if (origin && !allowedOrigins.includes(origin)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: false, error: 'CORS policy violation' }));
      }
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
      }

      const SENSITIVE_FIELDS = [
        'jira_api_token', 
        'mongo_uri', 
        'mongo_aws_access_key', 
        'mongo_aws_secret_key', 
        'mongo_aws_session_token', 
        'mongo_aws_role_arn',
        'mongo_aws_external_id',
        'mongo_aws_role_session_name',
        'mongo_oidc_token', 
        'mongo_ssh_key',
        'customer_mongo_uri', 
        'customer_mongo_aws_access_key', 
        'customer_mongo_aws_secret_key', 
        'customer_mongo_aws_session_token', 
        'customer_mongo_aws_role_arn',
        'customer_mongo_aws_external_id',
        'customer_mongo_aws_role_session_name',
        'customer_mongo_oidc_token', 
        'customer_mongo_ssh_key',
        'llm_api_key'
      ];

      const MASK = '********';

      function maskSettings(settings: any) {
        const masked = { ...settings };
        SENSITIVE_FIELDS.forEach(field => {
          if (masked[field]) masked[field] = MASK;
        });
        return masked;
      }

      function unmaskSettings(newData: any, existingSettings: any) {
        const unmasked = { ...newData };
        SENSITIVE_FIELDS.forEach(field => {
          if (unmasked[field] === MASK) {
            unmasked[field] = existingSettings[field];
          }
        });
        return unmasked;
      }

      // Simple Authentication Check
      const adminSecret = process.env.ADMIN_SECRET || server.config.env.ADMIN_SECRET;
      if (req.url === '/api/auth/status' && req.method === 'GET') {
        const authHeader = req.headers['authorization'];
        const hasSecret = !!adminSecret;
        
        if (hasSecret && authHeader) {
            const isAuthorized = authHeader === `Bearer ${adminSecret}`;
            res.statusCode = isAuthorized ? 200 : 401;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ required: true, authenticated: isAuthorized }));
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ required: hasSecret, authenticated: !hasSecret }));
      }

      if (adminSecret && req.url.startsWith('/api/')) {
        const authHeader = req.headers['authorization'];
        if (authHeader !== `Bearer ${adminSecret}`) {
          res.statusCode = 401;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
        }
      }

      // Helper to safely read stream body with size limit
      const readBody = (request: any): Promise<string> => {
        return new Promise((resolve, reject) => {
          let body = '';
          let length = 0;
          request.on('data', (chunk: any) => {
            length += chunk.length;
            if (length > MAX_PAYLOAD_SIZE) {
              request.pause();
              reject(new Error('Payload Too Large'));
              return;
            }
            body += chunk.toString();
          });
          request.on('end', () => resolve(body));
          request.on('error', reject);
        });
      };

      // SSRF Protection: Check if URL is internal/private
      async function isSafeUrl(urlStr: string) {
        try {
          const url = new URL(urlStr);
          if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mongodb:' && url.protocol !== 'mongodb+srv:') return false;
          
          const hostname = url.hostname;
          if (!hostname) return true; // Could be a local path or similar for non-URL protocols
          
          // Allow localhost/loopback for local development/integration
          if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;

          const { address } = await dnsLookup(hostname);
          
          // Allow loopback address from DNS resolution too
          if (address === '127.0.0.1' || address === '::1') return true;

          const parts = address.split('.').map(Number);

          // SSRF protection for this tool should primarily block cloud metadata services
          // blocking 10.x, 172.x, 192.x is too aggressive for self-hosted integration tools
          if (parts[0] === 169 && parts[1] === 254) return false; // Link-local / Metadata service

          return true;
        } catch {
          return false;
        }
      }

      // helper to connect to Mongo
      async function getDb(settings: any, checkExists = false) {
        const uri = settings.mongo_uri;
        if (!uri) throw new Error("Mongo URI not provided");
        if (!await isSafeUrl(uri)) {
          throw new Error("Invalid or unsafe MongoDB URI");
        }
        
        const dbName = settings.mongo_db || 'valueStream';
        const authMethod = settings.mongo_auth_method || 'scram';

        const options: any = {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000,
        };

        if (authMethod === 'aws') {
          if (!settings.mongo_aws_access_key || !settings.mongo_aws_secret_key) {
            throw new Error("AWS Access Key and Secret Key are required for AWS IAM authentication.");
          }
          options.authMechanism = 'MONGODB-AWS';
          options.authMechanismProperties = {
            AWS_ACCESS_KEY_ID: settings.mongo_aws_access_key,
            AWS_SECRET_ACCESS_KEY: settings.mongo_aws_secret_key,
            AWS_SESSION_TOKEN: settings.mongo_aws_session_token
          };
          options.auth = { username: '', password: '' };
        } else if (authMethod === 'oidc') {
          if (!settings.mongo_oidc_token) {
            throw new Error("Access Token is required for OIDC authentication.");
          }
          options.authMechanism = 'MONGODB-OIDC';
          options.authMechanismProperties = { ENVIRONMENT: 'test' };
          options.auth = { username: settings.mongo_oidc_token, password: '' };
        }

        const client = new MongoClient(uri, options);
        await client.connect();
        const db = client.db(dbName);

        if (checkExists && !settings.mongo_create_if_not_exists) {
          try {
            // Check existence by listing collections on the specific database.
            // This is safer than listDatabases on admin which requires cluster-wide permissions.
            const collections = await db.listCollections().toArray();
            if (collections.length === 0) {
              // In MongoDB, a database without collections technically "doesn't exist" in listDatabases.
              // So if it's empty, we should check listDatabases IF we have permission, 
              // but if not, we assume it's missing if create_if_not_exists is false.
              try {
                const dbs = await client.db().admin().listDatabases();
                const exists = dbs.databases.some((d: any) => d.name === dbName);
                if (!exists) {
                   await client.close();
                   throw new Error(`Database '${dbName}' does not exist and 'Create if not exists' is disabled.`);
                }
              } catch (adminErr) {
                // If we can't listDatabases, we rely on the fact that listCollections was empty.
                // It's safer to throw here to avoid silent failure when the user explicitly said "don't create".
                await client.close();
                throw new Error(`Database '${dbName}' has no collections and cluster-wide database listing is restricted. Please check the name or enable 'Create if not exists'.`);
              }
            }
          } catch (err: any) {
            if (err.message.includes('Database') && err.message.includes('does not exist')) throw err;
            // Connectivity error
            await client.close();
            throw err;
          }
        }

        return db;
      }

      function calculateQuarter(dateStr: string, fiscalStartMonth: number) {
        const date = new Date(dateStr);
        const month = date.getMonth() + 1; // 1-12
        const year = date.getFullYear();

        let shiftedMonth = month - fiscalStartMonth + 1;
        let fiscalYear = year;
        if (shiftedMonth <= 0) {
            shiftedMonth += 12;
            fiscalYear -= 1;
        }

        if (fiscalStartMonth > 1) {
            fiscalYear += 1;
        }

        const quarter = Math.ceil(shiftedMonth / 3);
        return `FY${fiscalYear} Q${quarter}`;
      }

      // Shared score calculation logic for both Mongo and local file
      function applyScores(workItems: any[], allWorkItems: any[], allCustomers: any[]) {
        return workItems.map(f => {
            let impact = 0;
            // Ensure we use numbers for effort calculation
            const epicMdsSum = f.epicMdsSum || 0;
            const totalEffort = Number(f.total_effort_mds || 0);
            const displayEffort = Math.max(epicMdsSum > 0 ? epicMdsSum : totalEffort, 1);

            if (f.all_customers_target) {                const type = f.all_customers_target.tcv_type;
                const priority = f.all_customers_target.priority || 'Must-have';
                // Global workitems are always bound to latest actual existing TCV
                let totalRelevantTcv = allCustomers.reduce((sum, c) => sum + Number(type === 'existing' ? (c.existing_tcv || 0) : (c.potential_tcv || 0)), 0);
                if (priority === 'Must-have') {
                    impact = totalRelevantTcv;
                } else if (priority === 'Should-have') {
                    const globalShouldCount = allWorkItems.filter(wf => wf.all_customers_target?.priority === 'Should-have' && wf.all_customers_target?.tcv_type === type).length;
                    impact = totalRelevantTcv / (globalShouldCount || 1);
                }
            } else {
                (f.customer_targets || []).forEach((target: any) => {
                    const customer = allCustomers.find(c => c.id === target.customer_id);
                    if (!customer) return;
                    
                    let targetTcv = 0;
                    if (target.tcv_type === 'existing') {
                        if (target.tcv_history_id && customer.tcv_history) {
                            const historyEntry = customer.tcv_history.find((h: any) => h.id === target.tcv_history_id);
                            targetTcv = Number(historyEntry ? historyEntry.value : customer.existing_tcv);
                        } else {
                            targetTcv = Number(customer.existing_tcv);
                        }
                    } else {
                        targetTcv = Number(customer.potential_tcv);
                    }

                    if (target.priority === 'Must-have' || !target.priority) {
                        impact += targetTcv;
                    } else if (target.priority === 'Should-have') {
                        const shouldHaveCount = allWorkItems.filter(wf => wf.customer_targets?.some((ct: any) => ct.customer_id === target.customer_id && ct.priority === 'Should-have' && ct.tcv_type === target.tcv_type)).length;
                        impact += (targetTcv / (shouldHaveCount || 1));
                    }
                });
            }
            const score = impact / displayEffort;
            return { ...f, score };
        });
      }

      if (req.url.startsWith('/api/loadData') && req.method === 'GET') {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const dashboardId = url.searchParams.get('dashboardId');
          
          // Filters from query params
          const qCustomerFilter = url.searchParams.get('customerFilter') || '';
          const qWorkItemFilter = url.searchParams.get('workItemFilter') || '';
          const qReleasedFilter = url.searchParams.get('releasedFilter') || 'all';
          const qTeamFilter = url.searchParams.get('teamFilter') || '';
          const qEpicFilter = url.searchParams.get('epicFilter') || '';
          const qMinTcv = Number(url.searchParams.get('minTcv')) || 0;
          const qMinScore = Number(url.searchParams.get('minScore')) || 0;

          const settingsPath = path.resolve(__dirname, 'settings.json');
          const mockDataPath = path.resolve(__dirname, 'public/staticImport.json');

          let settings: any = {};
          if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          } else if (fs.existsSync(mockDataPath)) {
            const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));
            settings = mockData.settings || {};
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
          }

          const mongoUri = settings.mongo_uri;

          let dbData: any = {
            settings: maskSettings(settings),
            customers: [],
            workItems: [],
            teams: [],
            epics: [],
            sprints: [],
            dashboards: [],
            metrics: { maxScore: 1, maxRoi: 1 }
          };

          if (mongoUri) {
            try {
              const db = await getDb(settings, true);
              
              const dashboards = await db.collection('dashboards').find({}).toArray();
              dbData.dashboards = dashboards.map(({ _id, ...rest }) => rest);
              
              const activeDashboard = dashboardId ? dbData.dashboards.find((d: any) => d.id === dashboardId) : null;
              
              const customerFilter = qCustomerFilter || activeDashboard?.parameters?.customerFilter || '';
              const workItemFilter = qWorkItemFilter || activeDashboard?.parameters?.workItemFilter || '';
              const teamFilter = qTeamFilter || activeDashboard?.parameters?.teamFilter || '';
              const epicFilter = qEpicFilter || activeDashboard?.parameters?.epicFilter || '';
              const releasedFilter = qReleasedFilter !== 'all' ? qReleasedFilter : (activeDashboard?.parameters?.releasedFilter || 'all');
              const minTcv = Math.max(qMinTcv, Number(activeDashboard?.parameters?.minTcvFilter) || 0);
              const minScore = Math.max(qMinScore, Number(activeDashboard?.parameters?.minScoreFilter) || 0);

              const sprints = await db.collection('sprints').find({ is_archived: { $ne: true } }).sort({ start_date: 1 }).toArray();
              dbData.sprints = sprints.map(({ _id, ...rest }) => rest);

              const sprintsToUpdate = dbData.sprints.filter((s: any) => !s.quarter);
              if (sprintsToUpdate.length > 0) {
                for (const sprint of sprintsToUpdate) {
                  const quarter = calculateQuarter(sprint.end_date, settings.fiscal_year_start_month || 1);
                  await db.collection('sprints').updateOne({ id: sprint.id }, { $set: { quarter } });
                  sprint.quarter = quarter;
                }
              }

              const teamQuery: any = {};
              if (teamFilter) {
                teamQuery.name = { $regex: escapeRegex(teamFilter), $options: 'i' };
              }
              const teams = await db.collection('teams').find(teamQuery).toArray();
              dbData.teams = teams.map(({ _id, ...rest }) => rest);
              const visibleTeamIds = new Set(dbData.teams.map((t: any) => t.id));

              const customerQuery: any = {};
              if (customerFilter) {
                customerQuery.name = { $regex: escapeRegex(customerFilter), $options: 'i' };
              }
              const customers = await db.collection('customers').find(customerQuery).toArray();
              dbData.customers = customers.map(({ _id, ...rest }) => rest)
                .filter((c: any) => (Number(c.existing_tcv || 0) + Number(c.potential_tcv || 0)) >= minTcv);

              const workItemPipeline: any[] = [
                {
                  $lookup: {
                    from: 'epics',
                    localField: 'id',
                    foreignField: 'work_item_id',
                    as: 'associated_epics'
                  }
                },
                {
                  $addFields: {
                    epicMdsSum: { $sum: '$associated_epics.effort_md' }
                  }
                }
              ];

              const workItemMatch: any = {};
              if (workItemFilter) {
                workItemMatch.name = { $regex: escapeRegex(workItemFilter), $options: 'i' };
              }
              if (releasedFilter === 'released') {
                workItemMatch.released_in_sprint_id = { $exists: true, $ne: null };
              } else if (releasedFilter === 'unreleased') {
                workItemMatch.released_in_sprint_id = { $in: [null, ""] };
              }
              if (Object.keys(workItemMatch).length > 0) {
                workItemPipeline.unshift({ $match: workItemMatch });
              }

              const workItemsRaw = await db.collection('workItems').aggregate(workItemPipeline).toArray();
              const fullCustomers = await db.collection('customers').find({}).toArray();
              const fullWorkItems = await db.collection('workItems').find({}).toArray();

              // Calculate scores for ALL work items to find global max and consistent scores
              const allWorkItemsWithScores = applyScores(fullWorkItems, fullWorkItems, fullCustomers);
              dbData.metrics.maxScore = allWorkItemsWithScores.reduce((max, f) => Math.max(max, f.score || 0), 1);

              // Calculate ROI for edge thickness scaling
              let maxRoi = 0.0001;
              allWorkItemsWithScores.forEach(wf => {
                  if (wf.all_customers_target) return;
                  (wf.customer_targets || []).forEach((target: any) => {
                      const customer = fullCustomers.find(c => c.id === target.customer_id);
                      if (customer) {
                          const targetTcv = Number(target.tcv_type === 'existing' ? customer.existing_tcv : customer.potential_tcv);
                          const roi = targetTcv / (Number(wf.total_effort_mds || 0) || 1);
                          if (roi > maxRoi) maxRoi = roi;
                      }
                  });
              });
              dbData.metrics.maxRoi = maxRoi;

              // Process workItemsRaw (the filtered set)
              const workItemsRawWithLookups = workItemsRaw.map(f => {
                  const { _id, associated_epics, ...rest } = f;
                  return rest;
              });
              dbData.workItems = applyScores(workItemsRawWithLookups, fullWorkItems, fullCustomers)
                .filter((f: any) => f.score >= minScore);

              const epicQuery: any = {};
              if (epicFilter) {
                epicQuery.name = { $regex: escapeRegex(epicFilter), $options: 'i' };
              }
              if (teamFilter) {
                // If team filter is active, only show epics for visible teams
                epicQuery.team_id = { $in: Array.from(visibleTeamIds) };
              }
              const epics = await db.collection('epics').find(epicQuery).toArray();
              dbData.epics = epics.map(({ _id, ...rest }) => rest);

              // Seeding logic...
              if (dbData.customers.length === 0 && !customerFilter && minTcv === 0 && fs.existsSync(mockDataPath)) {
                 const localData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));
                 if (localData.customers && localData.customers.length > 0) {
                    await db.collection('customers').insertMany(localData.customers);
                    if (localData.workItems?.length > 0) await db.collection('workItems').insertMany(localData.workItems);
                    if (localData.teams?.length > 0) await db.collection('teams').insertMany(localData.teams);
                    if (localData.epics?.length > 0) await db.collection('epics').insertMany(localData.epics);
                    if (localData.sprints?.length > 0) await db.collection('sprints').insertMany(localData.sprints);
                    const defaultDashboards = localData.dashboards || [{ id: 'main', name: 'Main Dashboard', parameters: {} }];
                    await db.collection('dashboards').insertMany(defaultDashboards);
                    dbData = { ...localData, settings, dashboards: defaultDashboards };
                    // Recalculate scores for seeded data response
                    const seededW = applyScores(dbData.workItems, dbData.workItems, dbData.customers);
                    dbData.workItems = seededW;
                    dbData.metrics.maxScore = Math.max(...seededW.map(f => f.score || 0), 1);
                 }
              }
            } catch(e) {
              console.error("MongoDB Error loading data:", e);
            }
          } else if (fs.existsSync(mockDataPath)) {
             const localData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));
             const fullW = applyScores(localData.workItems || [], localData.workItems || [], localData.customers || []);
             dbData = { 
                ...localData, 
                settings: maskSettings(settings), 
                sprints: (localData.sprints || [])
                    .filter((s: any) => !s.is_archived)
                    .sort((a: any, b: any) => (a.start_date || '').localeCompare(b.start_date || '')),
                workItems: fullW, 
                metrics: { maxScore: Math.max(...fullW.map(f => f.score || 0), 1), maxRoi: 1 } 
             };
          }
          
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(JSON.stringify(dbData));
        } catch (e: any) {
          console.error('Error loading data:', e);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/settings' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const newData = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          
          let existingSettings: any = {};
          if (fs.existsSync(settingsPath)) {
            existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          }
          
          const finalSettings = unmaskSettings(newData, existingSettings);
          fs.writeFileSync(settingsPath, JSON.stringify(finalSettings, null, 2));

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true }));
        } catch (e: any) {
          console.error('Error saving settings:', e);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = e.message === 'Payload Too Large' ? 413 : 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url.startsWith('/api/entity/') && (req.method === 'POST' || req.method === 'DELETE')) {
        try {
          const body = await readBody(req);
          const parts = req.url.split('?')[0].split('/');
          const collectionName = parts[3];
          const entityId = parts[4]; 

          if (!ALLOWED_COLLECTIONS.includes(collectionName)) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, error: 'Forbidden collection' }));
          }

          const data = body ? JSON.parse(body) : {};
          const rawId = data.id || entityId;
          const id = String(rawId);

          const settingsPath = path.resolve(__dirname, 'settings.json');
          const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};

          if (!settings.mongo_uri) {
              throw new Error("No MongoDB URI configured.");
          }
          
          const db = await getDb(settings, true);

          if (req.method === 'POST') {
              if (!id) throw new Error("Missing entity id");
              
              // Ensure unique index exists for the 'id' field in this collection
              await db.collection(collectionName).createIndex({ id: 1 }, { unique: true });

              await db.collection(collectionName).updateOne({ id }, { $set: data }, { upsert: true });
          } else if (req.method === 'DELETE') {
              if (!id) throw new Error("Missing entity id");
              await db.collection(collectionName).deleteOne({ id });
          }

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true }));
        } catch (e: any) {
          console.error(`Error ${req.method} entity:`, e);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = e.message === 'Payload Too Large' ? 413 : 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/mongo/databases' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);
          
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existingSettings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const config = unmaskSettings(rawConfig, existingSettings);

          if (!config.mongo_uri) {
            throw new Error('Missing mongo_uri');
          }
          
          const client = new MongoClient(config.mongo_uri, { serverSelectionTimeoutMS: 5000 });
          await client.connect();
          let databases: string[] = [];
          try {
            const dbs = await client.db().admin().listDatabases();
            databases = dbs.databases.map((d: any) => d.name);
          } catch (err) {
            // If listing fails, we can't provide the list, but we shouldn't fail the whole request
            console.warn("Could not list databases:", err);
          }
          await client.close();
          
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, databases }));
        } catch (e: any) {
          console.error('Error listing mongo databases:', e);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200; 
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/mongo/test' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);
          
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existingSettings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const config = unmaskSettings(rawConfig, existingSettings);

          if (!config.mongo_uri) {
            throw new Error('Missing mongo_uri');
          }
          
          const targetDb = config.mongo_db || 'valueStream';
          const client = new MongoClient(config.mongo_uri, { serverSelectionTimeoutMS: 5000 });
          await client.connect();
          
          let exists = false;
          try {
              // Try the specific DB first (more likely to have permissions)
              const collections = await client.db(targetDb).listCollections().toArray();
              exists = collections.length > 0;
              
              if (!exists) {
                  // Fallback to listDatabases if possible to be absolutely sure
                  try {
                      const dbs = await client.db().admin().listDatabases();
                      exists = dbs.databases.some((d: any) => d.name === targetDb);
                  } catch (adminErr) {
                      // Skip if no admin permissions
                  }
              }
          } catch (err) {
              // If we can't even list collections, it might not exist or we might not have access
          }
          await client.close();

          let message = exists 
            ? `Connection successful! Database '${targetDb}' exists.` 
            : `Connection successful, but database '${targetDb}' does not exist yet.`;
          
          if (!exists && config.mongo_create_if_not_exists) {
              message = `Connection successful! Database '${targetDb}' does not exist yet, but will be created automatically.`;
          }

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ 
            success: true, 
            exists,
            message
          }));
        } catch (e: any) {
          console.error('Error testing mongo connection:', e);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200; 
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/mongo/export' && req.method === 'POST') {
        try {
          const settingsPath = path.resolve(__dirname, 'settings.json');
          if (!fs.existsSync(settingsPath)) throw new Error("Settings file not found.");
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          if (!settings.mongo_uri) throw new Error("MongoDB URI not configured.");

          const db = await getDb(settings, true);
          
          const customers = await db.collection('customers').find({}).toArray();
          const workItems = await db.collection('workItems').find({}).toArray();
          const teams = await db.collection('teams').find({}).toArray();
          const epics = await db.collection('epics').find({}).toArray();
          const sprints = await db.collection('sprints').find({}).toArray();
          const dashboards = await db.collection('dashboards').find({}).toArray();
          
          const stripId = (arr: any[]) => arr.map(doc => {
            const { _id, ...rest } = doc;
            return rest;
          });

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ 
            success: true, 
            data: {
                settings: maskSettings(settings),
                customers: stripId(customers),
                workItems: stripId(workItems),
                teams: stripId(teams),
                epics: stripId(epics),
                sprints: stripId(sprints),
                dashboards: stripId(dashboards),
            } 
          }));
        } catch (e: any) {
          console.error('Error exporting mongo data:', e);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/mongo/import' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const { data: importData } = JSON.parse(body);

          const settingsPath = path.resolve(__dirname, 'settings.json');
          if (!fs.existsSync(settingsPath)) throw new Error("Settings file not found.");
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          if (!settings.mongo_uri) throw new Error("MongoDB URI not configured.");

          const db = await getDb(settings, false);

          // Delete all collections
          for (const collectionName of ALLOWED_COLLECTIONS) {
              await db.collection(collectionName).deleteMany({});
          }

          // Import new data
          if (importData.customers?.length > 0) await db.collection('customers').insertMany(importData.customers);
          if (importData.workItems?.length > 0) await db.collection('workItems').insertMany(importData.workItems);
          if (importData.teams?.length > 0) await db.collection('teams').insertMany(importData.teams);
          if (importData.epics?.length > 0) await db.collection('epics').insertMany(importData.epics);
          if (importData.sprints?.length > 0) await db.collection('sprints').insertMany(importData.sprints);
          if (importData.dashboards?.length > 0) await db.collection('dashboards').insertMany(importData.dashboards);

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true }));
        } catch (e: any) {
          console.error('Error importing mongo data:', e);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/mongo/query' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);

          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existingSettings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const config = unmaskSettings(rawConfig, existingSettings);

          if (!config.mongo_uri) throw new Error("MongoDB URI not provided.");
          if (!config.query) throw new Error("Query not provided.");

          const db = await getDb(config);
          const collection = db.collection('Customers'); // Default to Customers for customer-specific queries
          
          let query;
          try {
            query = typeof config.query === 'string' ? JSON.parse(config.query) : config.query;
          } catch (e) {
            throw new Error("Invalid JSON in query: " + e.message);
          }

          let results;
          if (Array.isArray(query)) {
            results = await collection.aggregate(query).toArray();
          } else {
            results = await collection.find(query).toArray();
          }

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, data: results }));
        } catch (e: any) {
          console.error('Error executing mongo query:', e);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200; // Return 200 with success: false to avoid empty response errors
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/jira/test' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);

          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existingSettings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const { jira_base_url, jira_api_version, jira_api_token } = unmaskSettings(rawConfig, existingSettings);
          
          if (!await isSafeUrl(jira_base_url)) {
            throw new Error('Invalid or unsafe Jira URL');
          }

          const url = new URL(jira_base_url);
          const apiUrl = `${url.origin}/rest/api/${jira_api_version || '3'}/myself`;
          const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${jira_api_token}` };
          const jiraRes = await fetch(apiUrl, { headers });
          if (!jiraRes.ok) throw new Error(`Jira API returned ${jiraRes.status}`);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, message: 'Connection successful!' }));
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = e.message === 'Payload Too Large' ? 413 : 200; 
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/jira/issue' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);

          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existingSettings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const { jira_key, jira_base_url, jira_api_version, jira_api_token } = unmaskSettings(rawConfig, existingSettings);

          if (!await isSafeUrl(jira_base_url)) {
            throw new Error('Invalid or unsafe Jira URL');
          }

          const url = new URL(jira_base_url);
          const apiUrl = `${url.origin}/rest/api/${jira_api_version || '3'}/issue/${jira_key}?expand=names`;
          const headers: any = { 'Accept': 'application/json' };
          if (jira_api_token) headers['Authorization'] = `Bearer ${jira_api_token}`;
          const jiraRes = await fetch(apiUrl, { headers });
          const jiraData = await jiraRes.json();
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, data: jiraData }));
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = e.message === 'Payload Too Large' ? 413 : 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/jira/search' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);

          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existingSettings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const { jql, jira_base_url, jira_api_version, jira_api_token } = unmaskSettings(rawConfig, existingSettings);

          if (!await isSafeUrl(jira_base_url)) {
            throw new Error('Invalid or unsafe Jira URL');
          }

          const url = new URL(jira_base_url);
          const apiUrl = `${url.origin}/rest/api/${jira_api_version || '3'}/search`;
          const headers: any = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
          if (jira_api_token) headers['Authorization'] = `Bearer ${jira_api_token}`;
          
          const jiraRes = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify({ jql, expand: ['names'], maxResults: 100 }) });
          const jiraData = await jiraRes.json();

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, data: jiraData }));
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = e.message === 'Payload Too Large' ? 413 : 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/llm/generate' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const { prompt, config: rawConfig, stream = false } = JSON.parse(body);

          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existingSettings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const config = unmaskSettings(rawConfig || {}, existingSettings);

          const provider = config.llm_provider || 'openai';
          const apiKey = config.llm_api_key;
          const model = config.llm_model;

          if (!apiKey) {
            throw new Error('LLM API key not configured');
          }

          if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // for nginx

            if (provider === 'openai') {
              const fetchRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                  model: model || 'gpt-4-turbo',
                  messages: [{ role: 'user', content: prompt }],
                  stream: true
                })
              });
              
              if (!fetchRes.ok) {
                const errData = await fetchRes.json() as any;
                res.write(`data: ${JSON.stringify({ error: errData.error?.message || 'OpenAI API error' })}\n\n`);
                return res.end();
              }

              const reader = fetchRes.body!.getReader();
              const decoder = new TextDecoder();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                      const json = JSON.parse(data);
                      const text = json.choices[0]?.delta?.content || '';
                      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
                    } catch (e) { /* skip partial JSON */ }
                  }
                }
              }
              return res.end();
            } else if (provider === 'gemini') {
              // Gemini doesn't use standard SSE for streamGenerateContent, it's a bit more involved
              // We'll simulate it for now by letting the user know it's not implemented yet for Gemini or just doing a full response.
              // Actually, Gemini supports streaming via a different URL.
              const fetchRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-pro'}:streamGenerateContent?alt=sse&key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }]
                })
              });

              if (!fetchRes.ok) {
                const errData = await fetchRes.json() as any;
                res.write(`data: ${JSON.stringify({ error: errData.error?.message || 'Gemini API error' })}\n\n`);
                return res.end();
              }

              const reader = fetchRes.body!.getReader();
              const decoder = new TextDecoder();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    try {
                      const json = JSON.parse(data);
                      const text = json.candidates[0]?.content?.parts[0]?.text || '';
                      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
                    } catch (e) { /* skip partial JSON */ }
                  }
                }
              }
              return res.end();
            } else if (provider === 'augment') {
              const { spawn } = await import('child_process');
              const env = { ...process.env, AUGMENT_SESSION_AUTH: apiKey };
              
              // When shell: true is used, we need to pass a single command string with properly escaped arguments.
              // We escape backslashes, double quotes, dollar signs, and backticks.
              const escapedPrompt = prompt
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');

              const child = spawn(`npx --no-install auggie --print --quiet "${escapedPrompt}"`, { env, shell: true });

              child.stdout.on('data', (data) => {
                const text = data.toString();
                if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
              });

              child.stderr.on('data', (data) => {
                console.error(`Augment CLI Error: ${data.toString()}`);
              });

              child.on('close', () => {
                res.end();
              });

              req.on('close', () => {
                child.kill();
              });
              
              return; // Handled by events
            } else {
              res.write(`data: ${JSON.stringify({ error: `Streaming not yet supported for provider: ${provider}` })}\n\n`);
              return res.end();
            }
          }

          let resultText = '';

          if (provider === 'openai') {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: model || 'gpt-4-turbo',
                messages: [{ role: 'user', content: prompt }]
              })
            });
            const data = await res.json() as any;
            if (!res.ok) throw new Error(data.error?.message || 'OpenAI API error');
            resultText = data.choices[0].message.content;
          } else if (provider === 'gemini') {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-pro'}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
              })
            });
            const data = await res.json() as any;
            if (!res.ok) throw new Error(data.error?.message || 'Gemini API error');
            resultText = data.candidates[0].content.parts[0].text;
          } else if (provider === 'anthropic') {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json', 
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
              },
              body: JSON.stringify({
                model: model || 'claude-3-opus-20240229',
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }]
              })
            });
            const data = await res.json() as any;
            if (!res.ok) throw new Error(data.error?.message || 'Anthropic API error');       
            resultText = data.content[0].text;
            } else if (provider === 'augment') {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            
            // Use the standard environment variable name for the Augment provider
            const env = { ...process.env, AUGMENT_SESSION_AUTH: apiKey };
            
            try {
              // Pass the prompt to 'auggie'. We escape backslashes, double quotes, dollar signs, and backticks.
              const escapedPrompt = prompt
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');

              const { stdout, stderr } = await execAsync(`npx --no-install auggie --print --quiet "${escapedPrompt}"`, { env });
              
              if (stderr && stdout.trim() === '') {
                throw new Error(stderr);
              }
              resultText = stdout.trim();
            } catch (execError: any) {
              throw new Error(`Augment CLI (auggie) execution failed: ${execError.message}`);
            }
            } else {
            throw new Error(`Unsupported LLM provider: ${provider}`);
            }
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, text: resultText }));
        } catch (e: any) {
          if (!res.writableEnded) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = e.message === 'Payload Too Large' ? 413 : 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        }
      } else {
        next();
      }
    });
  }
});

export default defineConfig({
  plugins: [react(), MockDataPersistencePlugin()],
  server: { watch: { ignored: ['**/public/staticImport.json'] } },
  test: { environment: 'jsdom', globals: true }
})
