import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { Project } from './types';
import { migrateProject } from './defaults';

/**
 * Project persistence:
 *  - Local: IndexedDB in this browser (works offline, per device).
 *  - Server: ./projects folder on the Windows PC via the dev/LAN server API. This is what
 *    lets the iPad open what you made on Windows (and vice versa) instantly.
 *  - Files: .json download/upload for backups and moving projects anywhere.
 */

export interface ProjectMeta { id: string; name: string; updatedAt: number; where?: 'local' | 'server' }

const INDEX_KEY = 'projects:index';

export async function listLocal(): Promise<ProjectMeta[]> {
  return ((await idbGet(INDEX_KEY)) as ProjectMeta[] | undefined) ?? [];
}

export async function saveLocal(p: Project) {
  await idbSet('project:' + p.id, p);
  const idx = (await listLocal()).filter((m) => m.id !== p.id);
  idx.unshift({ id: p.id, name: p.name, updatedAt: p.updatedAt });
  await idbSet(INDEX_KEY, idx);
  localStorage.setItem('lastProjectId', p.id);
}

export async function loadLocal(id: string): Promise<Project | null> {
  const p = await idbGet('project:' + id);
  return p ? migrateProject(p) : null;
}

export async function deleteLocal(id: string) {
  await idbDel('project:' + id);
  await idbSet(INDEX_KEY, (await listLocal()).filter((m) => m.id !== id));
}

let serverAvailable: boolean | null = null;
export async function hasServer(): Promise<boolean> {
  if (serverAvailable !== null) return serverAvailable;
  try {
    const r = await fetch('api/ping', { cache: 'no-store' });
    serverAvailable = r.ok && (await r.json()).ok === true;
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
}

export async function serverHosts(): Promise<string[]> {
  try {
    const r = await fetch('api/ping', { cache: 'no-store' });
    return (await r.json()).hosts ?? [];
  } catch {
    return [];
  }
}

export async function listServer(): Promise<ProjectMeta[]> {
  if (!(await hasServer())) return [];
  const r = await fetch('api/projects', { cache: 'no-store' });
  return r.ok ? r.json() : [];
}

export async function saveServer(p: Project) {
  const r = await fetch('api/projects/' + encodeURIComponent(p.id), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
  });
  if (!r.ok) throw new Error('Server save failed: ' + (await r.text()));
}

export async function loadServer(id: string): Promise<Project> {
  const r = await fetch('api/projects/' + encodeURIComponent(id), { cache: 'no-store' });
  if (!r.ok) throw new Error('Project not found on server');
  return migrateProject(await r.json());
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function downloadDataUrl(filename: string, url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export function readFileAsText(f: File): Promise<string> {
  return f.text();
}

export function readFileAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}

export function safeFileName(s: string) {
  return s.replace(/[^a-z0-9_\- ]/gi, '_').trim() || 'project';
}
