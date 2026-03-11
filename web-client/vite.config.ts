/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import { getDb, startMongoCleanup, isSafeUrl } from './src/utils/mongoServer'
import { checkAuth } from './src/utils/authServer'

const execPromise = promisify(exec);

// Start idle connection cleanup for MongoDB connections
startMongoCleanup();

const ALLOWED_COLLECTIONS = ['customers', 'workItems', 'teams', 'epics', 'sprints', 'valueStreams'];

const calculateQuarter = (dateStr: string, fiscalYearStartMonth: number) => {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1; // 1-12
  const adjustedMonth = (month - fiscalYearStartMonth + 12) % 12;
  const quarter = Math.floor(adjustedMonth / 3) + 1;
  const year = date.getFullYear();
  const fiscalYear = month < fiscalYearStartMonth ? year : year + 1;
  return `FY${String(fiscalYear).slice(2)}Q${quarter}`;
};

async function logQuery<T>(name: string, collection: string, op: string, promise: Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const res = await promise;
    const count = Array.isArray(res) ? res.length : (res ? 1 : 0);
    console.log(`[MONGO] ${name} (${collection}.${op}) took ${Date.now() - start}ms (${count} docs)`);
    return res;
  } catch (e) {
    console.error(`[MONGO] ${name} (${collection}.${op}) FAILED after ${Date.now() - start}ms`, e);
    throw e;
  }
}

const PersistencePlugin = (env: Record<string, string>): Plugin => ({
  name: 'persistence-plugin',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const ADMIN_SECRET = process.env.ADMIN_SECRET || env.ADMIN_SECRET || env.VITE_ADMIN_SECRET;
      
      const SENSITIVE_FIELDS = [
        'api_token', 
        'uri', 
        'aws_access_key', 
        'aws_secret_key', 
        'aws_session_token', 
        'aws_role_arn',
        'aws_external_id',
        'aws_role_session_name',
        'aws_profile',
        'aws_sso_start_url',
        'aws_sso_region',
        'aws_sso_account_id',
        'aws_sso_role_name',
        'oidc_token', 
        'api_key'
      ];

      const MASK = '********';

      function maskSettings(settings: any) {
        if (!settings || typeof settings !== 'object') return settings;
        const masked = Array.isArray(settings) ? [...settings] : { ...settings };
        
        Object.keys(masked).forEach(key => {
          if (SENSITIVE_FIELDS.includes(key) && masked[key]) {
            masked[key] = MASK;
          } else if (typeof masked[key] === 'object') {
            masked[key] = maskSettings(masked[key]);
          }
        });

        // Inject legacy flat properties for UI backward compatibility
        if (!Array.isArray(masked)) {
          if (settings.jira?.base_url) masked.jira_base_url = settings.jira.base_url;
          if (settings.jira?.api_version) masked.jira_api_version = settings.jira.api_version;
          if (settings.jira?.api_token) masked.jira_api_token = MASK;
          if (settings.jira?.customer_jql_new) masked.customer_jql_new = settings.jira.customer_jql_new;
          if (settings.jira?.customer_jql_in_progress) masked.customer_jql_in_progress = settings.jira.customer_jql_in_progress;
          if (settings.jira?.customer_jql_noop) masked.customer_jql_noop = settings.jira.customer_jql_noop;
          if (settings.general?.sprint_duration_days) masked.sprint_duration_days = settings.general.sprint_duration_days;
          if (settings.general?.fiscal_year_start_month) masked.fiscal_year_start_month = settings.general.fiscal_year_start_month;
        }

        return masked;
      }

      function unmaskSettings(newData: any, existingSettings: any) {
        if (!newData || typeof newData !== 'object') return newData;
        const unmasked = Array.isArray(newData) ? [...newData] : { ...newData };
        
        Object.keys(unmasked).forEach(key => {
          if (SENSITIVE_FIELDS.includes(key) && unmasked[key] === MASK) {
            unmasked[key] = existingSettings ? existingSettings[key] : MASK;
          } else if (typeof unmasked[key] === 'object') {
            unmasked[key] = unmaskSettings(unmasked[key], existingSettings ? existingSettings[key] : null);
          }
        });
        return unmasked;
      }

      function migrateSettings(settings: any) {
        if (settings.general || settings.persistence || settings.jira || settings.ai) return settings;

        console.log("[SETTINGS] Migrating flat settings.json to hierarchical structure...");
        return {
          general: {
            fiscal_year_start_month: settings.fiscal_year_start_month || 1,
            sprint_duration_days: settings.sprint_duration_days || 14
          },
          persistence: {
            mongo: {
              app: {
                uri: settings.mongo_uri || '',
                db: settings.mongo_db || '',
                use_proxy: settings.mongo_use_proxy || false,
                tunnel_name: settings.mongo_tunnel_name || 'app',
                auth: {
                  method: settings.mongo_auth_method || 'scram',
                  aws_auth_type: settings.mongo_aws_auth_type || 'static',
                  aws_access_key: settings.mongo_aws_access_key,
                  aws_secret_key: settings.mongo_aws_secret_key,
                  aws_session_token: settings.mongo_aws_session_token,
                  aws_role_arn: settings.mongo_aws_role_arn,
                  aws_external_id: settings.mongo_aws_external_id,
                  aws_role_session_name: settings.mongo_aws_role_session_name,
                  aws_profile: settings.mongo_aws_profile,
                  aws_sso_start_url: settings.mongo_aws_sso_start_url,
                  aws_sso_region: settings.mongo_aws_sso_region,
                  aws_sso_account_id: settings.mongo_aws_sso_account_id,
                  aws_sso_role_name: settings.mongo_aws_sso_role_name,
                  oidc_token: settings.mongo_oidc_token
                }
              },
              customer: {
                uri: settings.customer_mongo_uri || '',
                db: settings.customer_mongo_db || 'customers',
                use_proxy: settings.customer_mongo_use_proxy || false,
                tunnel_name: settings.customer_mongo_tunnel_name || 'customer',
                collection: settings.customer_mongo_collection || 'Customers',
                custom_query: settings.customer_mongo_custom_query || '',
                auth: {
                  method: settings.customer_mongo_auth_method || 'scram',
                  aws_auth_type: settings.customer_mongo_aws_auth_type || 'static',
                  aws_access_key: settings.customer_mongo_aws_access_key,
                  aws_secret_key: settings.customer_mongo_aws_secret_key,
                  aws_session_token: settings.customer_mongo_aws_session_token,
                  aws_role_arn: settings.customer_mongo_aws_role_arn,
                  aws_external_id: settings.customer_mongo_aws_external_id,
                  aws_role_session_name: settings.customer_mongo_aws_role_session_name,
                  aws_profile: settings.customer_mongo_aws_profile,
                  aws_sso_start_url: settings.customer_mongo_aws_sso_start_url,
                  aws_sso_region: settings.customer_mongo_aws_sso_region,
                  aws_sso_account_id: settings.customer_mongo_aws_sso_account_id,
                  aws_sso_role_name: settings.customer_mongo_aws_sso_role_name,
                  oidc_token: settings.customer_mongo_oidc_token
                }
              }
            }
          },
          jira: {
            base_url: settings.jira_base_url || '',
            api_version: settings.jira_api_version || '3',
            api_token: settings.jira_api_token,
            customer_jql_new: settings.customer_jql_new,
            customer_jql_in_progress: settings.customer_jql_in_progress,
            customer_jql_noop: settings.customer_jql_noop
          },
          ai: {
            provider: settings.llm_provider || 'openai',
            api_key: settings.llm_api_key,
            model: settings.llm_model
          }
        };
      }

      const augmentConfig = (config: any, role: 'app' | 'customer' = 'app') => {
        const tunnels: Record<string, any> = {};
        const combinedEnv = { ...process.env, ...env };
        Object.keys(combinedEnv).forEach(key => {
          if (key.endsWith('_SOCKS_PORT')) {
            const name = key.replace('_SOCKS_PORT', '').toLowerCase();
            const port = parseInt(combinedEnv[key] || '');
            if (!isNaN(port)) {
              tunnels[name] = {
                host: combinedEnv.SOCKS_PROXY_HOST || combinedEnv.VITE_SOCKS_PROXY_HOST || 'localhost',
                port: port
              };
            }
          }
        });

        const mongo = config.persistence?.mongo?.[role] || {};
        
        return {
            ...mongo,
            proxyHost: process.env.SOCKS_PROXY_HOST || env.VITE_SOCKS_PROXY_HOST || env.SOCKS_PROXY_HOST,
            proxyPort: parseInt(process.env.SOCKS_PROXY_PORT || env.VITE_SOCKS_PROXY_PORT || env.SOCKS_PROXY_PORT || '1080'),
            tunnels
        };
      };

      const readBody = (request: any): Promise<string> => {
        return new Promise((resolve, reject) => {
          let body = '';
          request.on('data', (chunk: any) => {
            body += chunk;
            if (body.length > 10 * 1024 * 1024) reject(new Error('Payload Too Large'));
          });
          request.on('end', () => resolve(body));
          request.on('error', reject);
        });
      };

      const authResult = checkAuth(req.url, req.headers, ADMIN_SECRET);
      if (authResult.response) {
        res.statusCode = authResult.statusCode || 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(authResult.response));
      }
      if (!authResult.authorized) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      }

      if (req.url?.startsWith('/api/loadData') && req.method === 'GET') {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const valueStreamId = url.searchParams.get('valueStreamId');
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const mockDataPath = path.resolve(__dirname, 'public/staticImport.json');

          let settings: any = {};
          if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          } else if (fs.existsSync(mockDataPath)) {
            const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));
            settings = mockData.settings || {};
          }

          settings = migrateSettings(settings);
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

          const hasAppDb = !!settings.persistence?.mongo?.app?.uri;
          let dbData: any = {
            settings: maskSettings(settings),
            customers: [], workItems: [], teams: [], epics: [], sprints: [], valueStreams: [],
            metrics: { maxScore: 1, maxRoi: 1 }
          };

          if (hasAppDb) {
            try {
              const db = await getDb(augmentConfig(settings, 'app'), 'app', true);
              const ValueStreams = await logQuery('ValueStreams', 'valueStreams', 'find', db.collection('valueStreams').find({}).toArray());
              dbData.valueStreams = ValueStreams.map(({ _id, ...rest }) => rest);
              const activeVS = valueStreamId ? dbData.valueStreams.find((d: any) => d.id === valueStreamId) : null;
              
              const sprints = await logQuery('Sprints', 'sprints', 'find', db.collection('sprints').find({ is_archived: { $ne: true } }).sort({ start_date: 1 }).toArray());
              dbData.sprints = sprints.map(({ _id, ...rest }) => rest);

              const sprintsToUpdate = dbData.sprints.filter((s: any) => !s.quarter);
              if (sprintsToUpdate.length > 0) {
                for (const sprint of sprintsToUpdate) {
                  const quarter = calculateQuarter(sprint.end_date, settings.general?.fiscal_year_start_month || 1);
                  await logQuery('UpdateSprintQuarter', 'sprints', 'updateOne', db.collection('sprints').updateOne({ id: sprint.id }, { $set: { quarter } }));
                  sprint.quarter = quarter;
                }
              }

              const [customers, workItems, teams, epics] = await Promise.all([
                logQuery('Customers', 'customers', 'find', db.collection('customers').find({}).toArray()),
                logQuery('WorkItems', 'workItems', 'find', db.collection('workItems').find({}).toArray()),
                logQuery('Teams', 'teams', 'find', db.collection('teams').find({}).toArray()),
                logQuery('Epics', 'epics', 'find', db.collection('epics').find({}).toArray())
              ]);

              dbData.customers = customers.map(({ _id, ...rest }) => rest);
              dbData.workItems = workItems.map(({ _id, ...rest }) => rest);
              dbData.teams = teams.map(({ _id, ...rest }) => rest);
              dbData.epics = epics.map(({ _id, ...rest }) => rest);

              // Calculate global metrics for scaling
              if (dbData.workItems.length > 0) {
                dbData.metrics.maxScore = Math.max(...dbData.workItems.map((f: any) => f.score || 0), 1);
                // maxRoi is used for edge thickness, also compute it
                dbData.metrics.maxRoi = Math.max(...dbData.workItems.map((f: any) => {
                    if (!f.total_effort_mds) return 0;
                    const totalTcv = (f.customer_targets || []).reduce((sum: number, t: any) => {
                        const cust = dbData.customers.find((c: any) => c.id === t.customer_id);
                        if (!cust) return sum;
                        return sum + (t.tcv_type === 'existing' ? (cust.existing_tcv || 0) : (cust.potential_tcv || 0));
                    }, 0);
                    return totalTcv / f.total_effort_mds;
                }), 0.0001);
              }
            } catch (mongoErr) { console.error('MongoDB load error:', mongoErr); }
          } else if (fs.existsSync(mockDataPath)) {
            const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));
            dbData = { ...dbData, ...mockData, settings: dbData.settings };
          }

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify(dbData));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/settings' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const newData = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existingSettings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const unmasked = unmaskSettings(newData, existingSettings);
          fs.writeFileSync(settingsPath, JSON.stringify(unmasked, null, 2));
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url?.startsWith('/api/entity/') && (req.method === 'POST' || req.method === 'DELETE')) {
        try {
          const body = await readBody(req);
          const parts = req.url.split('?')[0].split('/');
          const collectionName = parts[3];
          const entityId = parts[4]; 
          if (!ALLOWED_COLLECTIONS.includes(collectionName)) throw new Error('Forbidden collection');

          const data = body ? JSON.parse(body) : {};
          const id = String(data.id || entityId);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          if (!settings.persistence?.mongo?.app?.uri) throw new Error("App MongoDB not configured");
          
          const db = await getDb(augmentConfig(settings, 'app'), 'app', true);
          if (req.method === 'POST') {
              await db.collection(collectionName).createIndex({ id: 1 }, { unique: true });
              await db.collection(collectionName).updateOne({ id }, { $set: data }, { upsert: true });
          } else {
              await db.collection(collectionName).deleteOne({ id });
          }
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/mongo/databases' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const config = unmaskSettings(rawConfig, existing);
          const role = config.connection_type || 'app';
          const db = await getDb(augmentConfig(config, role), role);
          const dbs = await db.admin().listDatabases();
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, databases: dbs.databases.map((d: any) => d.name) }));
        } catch (e: any) {
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/mongo/test' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const config = unmaskSettings(rawConfig, existing);
          const role = config.connection_type || 'app';
          const targetDb = config.persistence?.mongo?.[role]?.db || 'valueStream';
          const db = await getDb(augmentConfig(config, role), role);
          const collections = await db.listCollections().toArray();
          const exists = collections.length > 0;
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, exists, message: `Connected to ${targetDb}` }));
        } catch (e: any) {
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/mongo/query' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          
          // Use existing (saved) settings for the connection to ensure we use the right mongo
          // The client's rawConfig might be incomplete or masked
          const role = rawConfig.connection_type || 'customer';
          const mongo = existing.persistence?.mongo?.[role] || {};
          
          const targetCollection = mongo.collection || (role === 'customer' ? 'Customers' : 'customers');
          
          const db = await getDb(augmentConfig(existing, role), role);
          const collection = db.collection(targetCollection);
          
          const query = typeof rawConfig.query === 'string' ? JSON.parse(rawConfig.query) : rawConfig.query;
          const results = Array.isArray(query) ? await collection.aggregate(query).toArray() : await collection.find(query).toArray();
          console.log(`[DEBUG] /api/mongo/query - results count: ${results.length}`);
          
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, data: results }));
        } catch (e: any) {
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/mongo/export' && req.method === 'POST') {
        try {
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          const db = await getDb(augmentConfig(settings, 'app'), 'app', true);
          const data: any = { settings: maskSettings(settings) };
          for (const col of ALLOWED_COLLECTIONS) {
            const docs = await db.collection(col).find({}).toArray();
            data[col] = docs.map(({ _id, ...rest }) => rest);
          }
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, data }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/mongo/import' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const { data: importData } = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          const db = await getDb(augmentConfig(settings, 'app'), 'app', false);
          for (const col of ALLOWED_COLLECTIONS) {
            await db.collection(col).deleteMany({});
            if (importData[col]?.length > 0) await db.collection(col).insertMany(importData[col]);
          }
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/jira/test' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const { jira_base_url, jira_api_version, jira_api_token } = unmaskSettings(rawConfig, existing);
          const apiUrl = `${new URL(jira_base_url).origin}/rest/api/${jira_api_version || '3'}/myself`;
          const jiraRes = await fetch(apiUrl, { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${jira_api_token}` } });
          if (!jiraRes.ok) throw new Error(`Jira error ${jiraRes.status}`);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, message: 'Connected!' }));
        } catch (e: any) {
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/jira/issue' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const { jira_key, jira_base_url, jira_api_version, jira_api_token } = unmaskSettings(rawConfig, existing);
          const apiUrl = `${new URL(jira_base_url).origin}/rest/api/${jira_api_version || '3'}/issue/${jira_key}?expand=names`;
          const jiraRes = await fetch(apiUrl, { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${jira_api_token}` } });
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, data: await jiraRes.json() }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/jira/search' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const { jql, jira_base_url, jira_api_version, jira_api_token } = unmaskSettings(rawConfig, existing);
          const apiUrl = `${new URL(jira_base_url).origin}/rest/api/${jira_api_version || '3'}/search`;
          const jiraRes = await fetch(apiUrl, { 
            method: 'POST', 
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${jira_api_token}` },
            body: JSON.stringify({ jql, expand: ['names'], maxResults: 100 })
          });
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, data: await jiraRes.json() }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/llm/generate' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const { prompt, config: rawConfig } = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const config = unmaskSettings(rawConfig || {}, existing);
          const provider = config.ai?.provider || 'openai';
          const apiKey = config.ai?.api_key;
          if (!apiKey) throw new Error('LLM API key missing');
          
          let resultText = '';
          if (provider === 'openai') {
            const r = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({ model: config.ai?.model || 'gpt-4-turbo', messages: [{ role: 'user', content: prompt }] })
            });
            const d = await r.json() as any;
            resultText = d.choices[0].message.content;
          } else if (provider === 'gemini') {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.ai?.model || 'gemini-1.5-pro'}:generateContent?key=${apiKey}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const d = await r.json() as any;
            resultText = d.candidates[0].content.parts[0].text;
          } else if (provider === 'augment') {
            const env = { ...process.env, AUGMENT_SESSION_AUTH: apiKey };
            const { stdout } = await execPromise(`npx --no-install auggie --print --quiet "${prompt.replace(/"/g, '\\"')}"`, { env });
            resultText = stdout.trim();
          }
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, text: resultText }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/aws/sso/login' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const config = unmaskSettings(rawConfig, existing);
          
          const role = config.role || 'app';
          const auth = config.persistence?.mongo?.[role]?.auth || {};
          const profile = auth.aws_profile;
          const sso_start_url = auth.aws_sso_start_url;
          const sso_region = auth.aws_sso_region;
          const sso_account_id = auth.aws_sso_account_id;
          const sso_role_name = auth.aws_sso_role_name;

          let envVars = { ...process.env };
          let profileName = profile || 'temp-sso-profile';
          if (!profile && sso_start_url) {
            const tempConfigPath = path.join(os.tmpdir(), `aws_config_${crypto.randomBytes(4).toString('hex')}`);
            fs.writeFileSync(tempConfigPath, `[profile ${profileName}]\nsso_start_url = ${sso_start_url}\nsso_region = ${sso_region}\nsso_account_id = ${sso_account_id}\nsso_role_name = ${sso_role_name}\nregion = ${sso_region}\n`);
            envVars.AWS_CONFIG_FILE = tempConfigPath;
          }
          
          const child = spawn(`aws sso login --profile ${profileName}`, { shell: true, env: envVars });
          
          let capturedOutput = '';
          const outputPromise = new Promise<string>((resolve) => {
            const timeout = setTimeout(() => resolve(capturedOutput || 'Login initiated (check logs if no URL appears)'), 4000);
            
            const handleData = (data: any) => {
              const str = data.toString();
              capturedOutput += str;
              if (str.includes('https://') || str.includes('code:')) {
                clearTimeout(timeout);
                // Give it a tiny bit more time to finish the sentence
                setTimeout(() => resolve(capturedOutput), 500);
              }
            };
            
            child.stdout.on('data', handleData);
            child.stderr.on('data', handleData);
          });

          const message = await outputPromise;
          
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, message }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/aws/sso/credentials' && req.method === 'POST') {
        try {
          const body = await readBody(req);
          const rawConfig = JSON.parse(body);
          const settingsPath = path.resolve(__dirname, 'settings.json');
          const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
          const config = unmaskSettings(rawConfig, existing);
          
          const role = config.role || 'app';
          const auth = config.persistence?.mongo?.[role]?.auth || {};
          const profile = auth.aws_profile;
          const sso_start_url = auth.aws_sso_start_url;
          const sso_region = auth.aws_sso_region;
          const sso_account_id = auth.aws_sso_account_id;
          const sso_role_name = auth.aws_sso_role_name;

          let envVars = { ...process.env };
          let profileName = profile || 'temp-sso-profile';
          let tempPath = '';
          if (!profile && sso_start_url) {
            tempPath = path.join(os.tmpdir(), `aws_config_${crypto.randomBytes(4).toString('hex')}`);
            fs.writeFileSync(tempPath, `[profile ${profileName}]\nsso_start_url = ${sso_start_url}\nsso_region = ${sso_region}\nsso_account_id = ${sso_account_id}\nsso_role_name = ${sso_role_name}\nregion = ${sso_region}\n`);
            envVars.AWS_CONFIG_FILE = tempPath;
          }
          const { stdout } = await execPromise(`aws configure export-credentials --profile ${profileName}`, { env: envVars });
          if (tempPath) try { fs.unlinkSync(tempPath); } catch(e) {}
          const creds = JSON.parse(stdout);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, accessKey: creds.AccessKeyId, secretKey: creds.SecretAccessKey, sessionToken: creds.SessionToken }));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else {
        next();
      }
    });
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  return {
    plugins: [react(), PersistencePlugin(env)],
    server: { watch: { ignored: ['**/public/staticImport.json'] } },
    test: { environment: 'jsdom', globals: true }
  }
})
