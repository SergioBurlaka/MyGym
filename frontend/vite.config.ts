import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Docker Desktop on Windows doesn't forward native fs-change events into
    // bind-mounted volumes, so chokidar never sees edits without polling.
    watch: {
      usePolling: true,
      interval: 300,
    },
    // In dev, requests to /api are proxied straight to the backend
    // container so the frontend can always call a same-origin "/api".
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
