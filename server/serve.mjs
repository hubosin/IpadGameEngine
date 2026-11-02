// Production LAN server: serves the built app (dist/) plus the project API on all interfaces.
// Usage: npm run ipad   (builds, then runs this)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApiHandler, printQr } from './api.mjs';

const PORT = Number(process.env.PORT || 4173);
const root = path.resolve('dist');
const api = createApiHandler({ projectsDir: 'projects' });
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

if (!fs.existsSync(root)) {
  console.error('dist/ not found. Run "npm run build" first.');
  process.exit(1);
}

http.createServer((req, res) => {
  api(req, res, () => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Serving on http://localhost:${PORT}/`);
  printQr(PORT);
});
