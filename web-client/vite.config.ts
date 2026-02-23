/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const MockDataPersistencePlugin = (): Plugin => ({
  name: 'mock-data-persistence',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      if (req.url === '/api/saveData' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const filePath = path.resolve(__dirname, 'public/mockData.json');
            // Write formatted JSON
            fs.writeFileSync(filePath, JSON.stringify(JSON.parse(body), null, 2));

            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true }));
          } catch (e: any) {
            console.error('Error saving mock data:', e);
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
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
      ignored: ['**/public/mockData.json']
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
  }
})
