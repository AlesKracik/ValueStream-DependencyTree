/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  loadEnv(mode, path.resolve(__dirname, '..'), '');
  return {
    plugins: [react()],
    server: { 
      watch: { ignored: [] },
      proxy: {
        '/api': {
          // Allow override for Docker/K8s environments
          target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    test: { 
      environment: 'jsdom', 
      globals: true 
    }
  }
})
