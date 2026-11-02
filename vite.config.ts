import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-ignore - plain JS module shared with the production server
import { createApiHandler, printQr } from './server/api.mjs';

// Dev-server plugin: exposes the shared project API (/api/*) so the Windows PC and the
// iPad (on the same Wi-Fi) read/write the same project files in ./projects.
function projectApi(): Plugin {
  return {
    name: 'project-api',
    configureServer(server) {
      server.middlewares.use(createApiHandler({ projectsDir: 'projects' }));
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer!.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5173;
        setTimeout(() => printQr(port), 300);
      });
    },
  };
}

export default defineConfig({
  // Relative base so the same build works at / (PC server) and /<repo>/ (GitHub Pages).
  base: './',
  plugins: [react(), projectApi()],
  server: { host: true, port: 5173 },
  build: {
    rollupOptions: { input: { main: 'index.html', play: 'play.html' } },
  },
});
