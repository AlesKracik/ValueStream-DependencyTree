import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const MockDataPersistencePlugin = () => ({
  name: 'mock-data-persistence',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/api/saveData' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
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
  }
})
