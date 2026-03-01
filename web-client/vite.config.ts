/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { MongoClient } from 'mongodb'

const MockDataPersistencePlugin = (): Plugin => ({
  name: 'mock-data-persistence',
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      // helper to connect to Mongo
      async function getDb(uri: string, dbName: string) {
        if (!uri) throw new Error("Mongo URI not provided");
        const client = new MongoClient(uri);
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

      if (req.url === '/api/loadData' && req.method === 'GET') {
        try {
          const settingsPath = path.resolve(__dirname, 'public/settings.json');
          const mockDataPath = path.resolve(__dirname, 'public/staticImport.json');

          let settings: any = {};
          if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          } else if (fs.existsSync(mockDataPath)) {
            // Fallback to extract settings from mockData if settings.json doesn't exist yet
            const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));
            settings = mockData.settings || {};
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
          }

          const mongoUri = settings.mongo_uri;
          const mongoDbName = settings.mongo_db;

          let dbData: {
            settings: any;
            customers: any[];
            workItems: any[];
            teams: any[];
            epics: any[];
            sprints: any[];
            dashboards: any[];
          } = {
            settings,
            customers: [],
            workItems: [],
            teams: [],
            epics: [],
            sprints: [],
            dashboards: []
          };

          if (mongoUri) {
            try {
              const db = await getDb(mongoUri, mongoDbName);
              // Collections to read:
              const customers = await db.collection('customers').find({}).toArray();
              const workItems = await db.collection('workItems').find({}).toArray();
              const teams = await db.collection('teams').find({}).toArray();
              const epics = await db.collection('epics').find({}).toArray();
              const sprints = await db.collection('sprints').find({}).toArray();
              const dashboards = await db.collection('dashboards').find({}).toArray();
              
              // strip _id
              const stripId = (arr: any[]) => arr.map(doc => {
                const { _id, ...rest } = doc;
                return rest;
              });

              dbData = {
                settings,
                customers: stripId(customers),
                workItems: stripId(workItems),
                teams: stripId(teams),
                epics: stripId(epics),
                sprints: stripId(sprints),
                dashboards: stripId(dashboards),
              };

              // Migration: Ensure all sprints have a quarter attribute
              const sprintsToUpdate = dbData.sprints.filter(s => !s.quarter);
              if (sprintsToUpdate.length > 0) {
                console.log(`[Migration] Updating ${sprintsToUpdate.length} sprints with quarter info...`);
                for (const sprint of sprintsToUpdate) {
                  const quarter = calculateQuarter(sprint.start_date, settings.fiscal_year_start_month || 1);
                  await db.collection('sprints').updateOne({ id: sprint.id }, { $set: { quarter } });
                  sprint.quarter = quarter; // Update local copy for current response
                }
              }

              // If database is empty, seed it with staticImport.json
              if (dbData.customers.length === 0 && fs.existsSync(mockDataPath)) {
                 const localData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));
                 if (localData.customers && localData.customers.length > 0) {
                   await db.collection('customers').insertMany(localData.customers);
                   if (localData.workItems?.length > 0) await db.collection('workItems').insertMany(localData.workItems);
                   if (localData.teams?.length > 0) await db.collection('teams').insertMany(localData.teams);
                   if (localData.epics?.length > 0) await db.collection('epics').insertMany(localData.epics);
                   if (localData.sprints?.length > 0) await db.collection('sprints').insertMany(localData.sprints);
                   // Create a default dashboard if missing in localData
                   const defaultDashboards = localData.dashboards || [{ 
                     id: 'main', 
                     name: 'Main Dependency Tree Dashboard', 
                     description: 'Visualizes customers, work items, and epics on a timeline.',
                     parameters: {
                       customerFilter: '',
                       workItemFilter: '',
                       releasedFilter: 'all',
                       minTcvFilter: '',
                       minScoreFilter: '',
                       teamFilter: '',
                       epicFilter: ''
                     }
                   }];
                   await db.collection('dashboards').insertMany(defaultDashboards);
                   
                   dbData.customers = localData.customers || [];
                   dbData.workItems = localData.workItems || [];
                   dbData.teams = localData.teams || [];
                   dbData.epics = localData.epics || [];
                   dbData.sprints = localData.sprints || [];
                   dbData.dashboards = defaultDashboards;
                 }
              }
            } catch(e) {
              console.error("MongoDB Error loading data:", e);
              // Provide empty data instead of falling back to mockData full state
            }
          } else {
             // If no mongo configured, maybe return mockData as a fallback for the very first time, but we don't save to it anymore.
             if (fs.existsSync(mockDataPath)) {
                const localData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));
                if (!localData.dashboards) {
                    localData.dashboards = [{ id: 'main', name: 'Main Dependency Tree Dashboard', description: 'Visualizes customers, work items, and epics on a timeline.' }];
                }
                dbData = { ...localData, settings };
             }
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
        let body = '';
        req.on('data', (chunk: any) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const settingsPath = path.resolve(__dirname, 'public/settings.json');
            fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));

            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true }));
          } catch (e: any) {
            console.error('Error saving settings:', e);
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      } else if (req.url.startsWith('/api/entity/') && (req.method === 'POST' || req.method === 'DELETE')) {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const parts = req.url.split('?')[0].split('/');
            const collectionName = parts[3];
            const entityId = parts[4]; // might be undefined for POST

            const data = body ? JSON.parse(body) : {};
            const id = data.id || entityId;

            const settingsPath = path.resolve(__dirname, 'public/settings.json');
            const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};

            if (!settings.mongo_uri) {
                throw new Error("No MongoDB URI configured.");
            }
            
            const db = await getDb(settings.mongo_uri, settings.mongo_db);

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
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      } else if (req.url === '/api/mongo/test' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { mongo_uri, mongo_db } = JSON.parse(body);
            if (!mongo_uri) {
              throw new Error('Missing mongo_uri');
            }
            const db = await getDb(mongo_uri, mongo_db);
            // Verify connection by fetching a ping command or simply listing collections
            await db.command({ ping: 1 });
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, message: 'MongoDB connection successful!' }));
          } catch (e: any) {
            console.error('Error testing mongo connection:', e);
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200; // Return 200 with semantic failure so client parses JSON
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      } else if (req.url === '/api/mongo/export' && req.method === 'POST') {
        try {
          const settingsPath = path.resolve(__dirname, 'public/settings.json');
          const mockDataPath = path.resolve(__dirname, 'public/staticImport.json');

          if (!fs.existsSync(settingsPath)) {
            throw new Error("Settings file not found.");
          }
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

          if (!settings.mongo_uri) {
            throw new Error("MongoDB URI not configured in settings.");
          }

          const db = await getDb(settings.mongo_uri, settings.mongo_db);
          
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

          const fullExport = {
            settings,
            customers: stripId(customers),
            workItems: stripId(workItems),
            teams: stripId(teams),
            epics: stripId(epics),
            sprints: stripId(sprints),
            dashboards: stripId(dashboards),
          };

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, data: fullExport }));
        } catch (e: any) {
          console.error('Error exporting mongo data:', e);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      } else if (req.url === '/api/jira/test' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { jira_base_url, jira_api_version, jira_api_token } = JSON.parse(body);
            if (!jira_base_url || !jira_api_token) {
              throw new Error('Missing jira_base_url or jira_api_token');
            }

            const url = new URL(jira_base_url);
            const apiUrl = `${url.origin}/rest/api/${jira_api_version || '3'}/myself`;

            const headers: Record<string, string> = {
              'Accept': 'application/json',
              'Authorization': `Bearer ${jira_api_token}`
            };

            const jiraRes = await fetch(apiUrl, { headers });

            if (!jiraRes.ok) {
              const errorText = await jiraRes.text();
              throw new Error(`Jira API returned ${jiraRes.status} ${jiraRes.statusText}: ${errorText}`);
            }

            // Connection successful
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, message: 'Connection successful!' }));
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200; // Return HTTP 200 but semantic payload success = false
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      } else if (req.url === '/api/jira/issue' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { jira_key, jira_base_url, jira_api_version, jira_api_token } = JSON.parse(body);
            if (!jira_base_url || !jira_key) {
              throw new Error('Missing jira_base_url or jira_key');
            }

            const url = new URL(jira_base_url);
            // Construct the REST API url, asking to expand 'names' so we can reverse-lookup custom fields
            const apiUrl = `${url.origin}/rest/api/${jira_api_version || '3'}/issue/${jira_key}?expand=names`;

            const headers: Record<string, string> = {
              'Accept': 'application/json'
            };

            if (jira_api_token) {
              headers['Authorization'] = `Bearer ${jira_api_token}`;
            }

            console.log(`[Jira Proxy] Fetching from ${apiUrl}...`);
            const jiraRes = await fetch(apiUrl, { headers });

            if (!jiraRes.ok) {
              const errorText = await jiraRes.text();
              console.error(`Jira API Error ${jiraRes.status}:`, errorText);
              throw new Error(`Jira API returned ${jiraRes.status} ${jiraRes.statusText}`);
            }

            const jiraData = await jiraRes.json();
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, data: jiraData }));
          } catch (e: any) {
            console.error('Error proxying Jira request:', e);
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      } else if (req.url === '/api/jira/search' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { jql, jira_base_url, jira_api_version, jira_api_token } = JSON.parse(body);
            if (!jira_base_url || !jql) {
              throw new Error('Missing jira_base_url or jql');
            }

            const url = new URL(jira_base_url);
            // Construct the REST API url for search
            const apiUrl = `${url.origin}/rest/api/${jira_api_version || '3'}/search`;

            const headers: Record<string, string> = {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            };

            if (jira_api_token) {
              headers['Authorization'] = `Bearer ${jira_api_token}`;
            }

            console.log(`[Jira Proxy] Searching from ${apiUrl} with JQL: ${jql}`);
            const jiraRes = await fetch(apiUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                jql,
                expand: ['names'],
                maxResults: 100 // Can be tuned
              })
            });

            if (!jiraRes.ok) {
              const errorText = await jiraRes.text();
              console.error(`Jira API Error ${jiraRes.status}:`, errorText);
              throw new Error(`Jira API returned ${jiraRes.status} ${jiraRes.statusText}`);
            }

            const jiraData = await jiraRes.json();
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, data: jiraData }));
          } catch (e: any) {
            console.error('Error proxying Jira search request:', e);
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      } else {
        next();
      }
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    MockDataPersistencePlugin()
  ],
  server: {
    watch: {
      // Prevent Vite server from full-page reloading every time mockData is written
      ignored: ['**/public/staticImport.json']
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
  }
})