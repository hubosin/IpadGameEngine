import { get as idbGet, set as idbSet } from 'idb-keyval';
import { GameRuntime } from '../runtime/runtime';
import { migrateProject } from '../core/defaults';
import type { Project } from '../core/types';

/**
 * Standalone player. Project source, in order:
 *  1. window.__PROJECT__ (exported single-file game)
 *  2. ?project=<id>  -> fetched from the Windows PC over Wi-Fi (falls back to last cached copy)
 *  3. ?local=<id>    -> this browser's own saved projects
 */
declare global { interface Window { __PROJECT__?: unknown } }

const root = document.getElementById('game')!;

function message(html: string) {
  root.innerHTML = `<div style="color:#ddd;font:16px sans-serif;padding:24px;text-align:center;margin-top:20vh">${html}</div>`;
}

async function loadProject(): Promise<Project> {
  if (window.__PROJECT__) return migrateProject(window.__PROJECT__);
  const q = new URLSearchParams(location.search);
  const sid = q.get('project');
  if (sid) {
    try {
      const r = await fetch('api/projects/' + encodeURIComponent(sid), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const p = migrateProject(await r.json());
      idbSet('player:' + sid, p).catch(() => {});
      return p;
    } catch {
      const cached = await idbGet('player:' + sid);
      if (cached) return migrateProject(cached);
      throw new Error('Could not reach the PC and no offline copy is saved yet.');
    }
  }
  const lid = q.get('local');
  if (lid) {
    const p = await idbGet('project:' + lid);
    if (p) return migrateProject(p);
  }
  throw new Error('No project specified. Open this page from the editor\'s "iPad" button.');
}

async function main() {
  message('Loading…');
  let project: Project;
  try {
    project = await loadProject();
  } catch (e) {
    message((e as Error).message);
    return;
  }
  document.title = project.name;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  root.innerHTML = '';
  // A tap is needed on iOS before audio may play; it also gives the player a moment to get ready.
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font:bold 28px sans-serif;background:#111;z-index:10;cursor:pointer';
  overlay.innerHTML = `<div>${escapeHtml(project.name)}</div><div style="font-size:18px;margin-top:16px;opacity:.8">Tap to play</div>`;
  root.appendChild(overlay);
  overlay.addEventListener('pointerup', () => {
    overlay.remove();
    const rt = new GameRuntime(project, root, { touchControls: touch });
    rt.start();
  }, { once: true });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

main();
