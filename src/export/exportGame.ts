import type { Project } from '../core/types';
import { downloadText, safeFileName } from '../core/storage';

/**
 * Standalone export: one .html file containing the runtime + this project's data.
 * Works offline in any modern browser and can be dropped onto any static web host
 * (GitHub Pages, Netlify Drop, itch.io…) to play on iPad from anywhere.
 */
export async function exportStandaloneHtml(p: Project) {
  const r = await fetch('player-template/index.html', { cache: 'no-store' });
  if (!r.ok) throw new Error('Player template missing. Run "npm run build:player" (npm run dev does this automatically).');
  const template = await r.text();
  const marker = '/*__PROJECT_DATA__*/null';
  if (!template.includes(marker)) throw new Error('Player template is invalid; rebuild it with "npm run build:player".');
  // Escape "<" so project text can never close the <script> tag.
  const lineSeps = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
  const json = JSON.stringify(p).replace(/</g, '\\u003c').replace(lineSeps, (c) => '\\u' + c.charCodeAt(0).toString(16));
  const html = template.replace(marker, () => json).replace('<title>Game</title>', `<title>${escapeHtml(p.name)}</title>`);
  downloadText(safeFileName(p.name) + '.html', html, 'text/html');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
