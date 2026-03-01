/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { MongoClient } from 'mongodb'
import dns from 'node:dns'
import { promisify } from 'node:util'

const lookup = promisify(dns.lookup);

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

      const SENSITIVE_FIELDS = ['jira_api_token', 'mongo_uri', 'mongo_aws_access_key', 'mongo_aws_secret_key', 'mongo_aws_session_token', 'mongo_oidc_token'];
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
      const adminSecret = process.env.ADMIN_SECRET;
      if (req.url === '/api/auth/status' && req.method === 'GET') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ required: !!adminSecret }));
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

          const { address } = await lookup(hostname);
          
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
      async function getDb(settings: any) {
        const uri = settings.mongo_uri;
        if (!await isSafeUrl(uri)) {
          throw new Error("Invalid or unsafe MongoDB URI");
        }
        const dbName = settings.mongo_db;
        const authMethod = settings.mongo_auth_method || 'scram';

        if (!uri) throw new Error("Mongo URI not provided");

        const options: any = {};

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
          // Explicitly prevent SCRAM fallback if URI has embedded user:pass
          options.auth = { username: '', password: '' };
        } else if (authMethod === 'oidc') {
          if (!settings.mongo_oidc_token) {
            throw new Error("Access Token is required for OIDC authentication.");
          }
          options.authMechanism = 'MONGODB-OIDC';
          options.authMechanismProperties = {
            ENVIRONMENT: 'test',
          };
          options.auth = {
            username: settings.mongo_oidc_token,
            password: ''
          };
        }

        const client = new MongoClient(uri, options);
        await client.connect();
        return client.db(dbName || 'valuestream');
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
            const displayEffort = Math.max(totalEffort, epicMdsSum, 1);

            if (f.all_customers_target) {
                const type = f.all_customers_target.tcv_type;
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
              const db = await getDb(settings);
              
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

              const sprints = await db.collection('sprints').find({}).toArray();
              dbData.sprints = sprints.map(({ _id, ...rest }) => rest);

              const sprintsToUpdate = dbData.sprints.filter((s: any) => !s.quarter);
              if (sprintsToUpdate.length > 0) {
                for (const sprint of sprintsToUpdate) {
                  const quarter = calculateQuarter(sprint.start_date, settings.fiscal_year_start_month || 1);
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
          
          const db = await getDb(settings);

          if (req.method === 'POST') {
              if (!id) throw new Error("Missing entity id");
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
          const db = await getDb(config);
          await db.command({ ping: 1 });
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, message: 'MongoDB connection successful!' }));
        } catch (e: any) {
          console.error('Error testing mongo connection:', e);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = e.message === 'Payload Too Large' ? 413 : 200; 
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/mongo/export' && req.method === 'POST') {
        try {
          const settingsPath = path.resolve(__dirname, 'settings.json');
          if (!fs.existsSync(settingsPath)) throw new Error("Settings file not found.");
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          if (!settings.mongo_uri) throw new Error("MongoDB URI not configured.");

          const db = await getDb(settings);
          
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
