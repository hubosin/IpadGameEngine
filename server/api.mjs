// Shared project API used by both the Vite dev server and the production LAN server.
// Plain JS (no TS) so Node can run it directly.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import QRCode from 'qrcode';

const ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

export async function printQr(port) {
  const ips = lanAddresses();
  console.log('\n  ==== iPad / tablet access (same Wi-Fi) ====');
  for (const ip of ips) console.log(`  Editor:  http://${ip}:${port}/`);
  if (ips[0]) {
    const qr = await QRCode.toString(`http://${ips[0]}:${port}/`, { type: 'terminal', small: true });
    console.log('  Scan with the iPad camera to open the editor:\n' + qr);
  }
  console.log('  Tip: in the editor press "iPad" in the top bar to get a QR code for the game itself.\n');
}

function send(res, code, body, type = 'application/json') {
  res.statusCode = code;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createApiHandler({ projectsDir }) {
  const dir = path.resolve(projectsDir);
  fs.mkdirSync(dir, { recursive: true });
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return next && next();
    try {
      if (url.pathname === '/api/ping') return send(res, 200, { ok: true, hosts: lanAddresses() });
      if (url.pathname === '/api/projects' && req.method === 'GET') {
        const list = [];
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith('.json')) continue;
          try {
            const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            list.push({ id: p.id, name: p.name, updatedAt: p.updatedAt });
          } catch { /* skip unreadable */ }
        }
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return send(res, 200, list);
      }
      const m = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (!ID_RE.test(id)) return send(res, 400, { error: 'bad id' });
        const file = path.join(dir, id + '.json');
        if (req.method === 'GET') {
          if (!fs.existsSync(file)) return send(res, 404, { error: 'not found' });
          return send(res, 200, fs.readFileSync(file, 'utf8'));
        }
        if (req.method === 'PUT') {
          const text = await readBody(req);
          const p = JSON.parse(text);
          if (p.id !== id) return send(res, 400, { error: 'id mismatch' });
          fs.writeFileSync(file + '.tmp', text);
          fs.renameSync(file + '.tmp', file);
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: 'unknown api route' });
    } catch (e) {
      return send(res, 500, { error: String((e && e.message) || e) });
    }
  };
}
