import { commit, getProject } from '../../core/store';
import { editor } from '../../core/editorStore';
import { currentSceneId, sceneOf } from '../../core/selectors';
import { newEntity } from '../../core/defaults';
import { descendants, getComp } from '../../core/sceneUtils';
import { uid } from '../../core/ids';
import type { Entity, Project, Scene } from '../../core/types';

/** World/scene editing operations shared by the viewport, hierarchy and inspector. */

export function draftScene(d: Project): Scene {
  return sceneOf(d, currentSceneId());
}

export function activeWorldLayer(scene: Scene, preferred = 'Objects'): string {
  const id = editor().activeWorldLayerId;
  if (id && scene.layers.some((l) => l.id === id)) return id;
  return (scene.layers.find((l) => l.name === preferred) ?? scene.layers[0]).id;
}

export function placeAsset(assetId: string, x: number, y: number) {
  const p = getProject();
  const asset = p.assets[assetId];
  if (!asset?.art) return;
  const scene = sceneOf(p, currentSceneId());
  const layerId = activeWorldLayer(scene, asset.kind === 'background' ? 'Background' : 'Objects');
  const doc = asset.art;
  const e = newEntity(layerId, asset.name, {
    x: Math.round(x), y: Math.round(y),
    components: [{ type: 'sprite', assetId, flipX: false, opacity: 1 }],
  });
  if (doc.animations.length) e.components.push({ type: 'animator', animation: doc.animations[0].name, playing: true, speed: 1 });
  if (asset.kind !== 'background') e.components.push({ type: 'collider', w: doc.width, h: doc.height, ox: 0, oy: 0, isTrigger: false });
  commit('Place ' + asset.name, (d) => { draftScene(d).entities.push(e); });
  editor().set({ selection: [e.id] });
}

/** Copy of entity subtrees with fresh ids (parent links remapped). Roots keep their parent. */
function cloneSubtrees(all: Entity[], rootIds: string[]): Entity[] {
  const ids = new Set<string>();
  for (const r of rootIds) { ids.add(r); descendants(all, r).forEach((x) => ids.add(x)); }
  const map = new Map<string, string>();
  for (const id of ids) map.set(id, uid('e'));
  return all.filter((e) => ids.has(e.id)).map((e) => ({
    ...structuredClone(e), id: map.get(e.id)!,
    parentId: e.parentId && map.has(e.parentId) ? map.get(e.parentId)! : e.parentId,
  }));
}

function topLevel(all: Entity[], ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    let e = all.find((x) => x.id === id);
    for (let i = 0; e?.parentId && i < 64; i++) {
      if (set.has(e.parentId)) return false;
      e = all.find((x) => x.id === e!.parentId);
    }
    return true;
  });
}

export function deleteSelected() {
  const sel = editor().selection;
  if (!sel.length) return;
  commit('Delete', (d) => {
    const s = draftScene(d);
    const kill = new Set<string>();
    for (const id of sel) { kill.add(id); descendants(s.entities, id).forEach((x) => kill.add(x)); }
    s.entities = s.entities.filter((e) => !kill.has(e.id));
  });
  editor().set({ selection: [] });
}

export function duplicateSelected(offset = 16) {
  const p = getProject();
  const scene = sceneOf(p, currentSceneId());
  const roots = topLevel(scene.entities, editor().selection);
  if (!roots.length) return;
  const copies = cloneSubtrees(scene.entities, roots);
  const newRoots = copies.filter((c) => !copies.some((o) => o.id === c.parentId));
  for (const c of newRoots) { c.x += offset; c.y += offset; c.name = c.name.replace(/( copy)?$/, ' copy'); }
  commit('Duplicate', (d) => { draftScene(d).entities.push(...copies); });
  editor().set({ selection: newRoots.map((c) => c.id) });
}

let clipboard: Entity[] = [];
export function copySelected() {
  const scene = sceneOf(getProject(), currentSceneId());
  const roots = topLevel(scene.entities, editor().selection);
  clipboard = cloneSubtrees(scene.entities, roots);
  editor().set({ status: `Copied ${roots.length} object(s)` });
}
export function paste() {
  if (!clipboard.length) return;
  const scene = sceneOf(getProject(), currentSceneId());
  const copies = cloneSubtrees(clipboard, clipboard.filter((c) => !clipboard.some((o) => o.id === c.parentId)).map((c) => c.id));
  const ids = new Set(scene.entities.map((e) => e.id));
  const layerIds = new Set(scene.layers.map((l) => l.id));
  for (const c of copies) {
    if (c.parentId && !copies.some((o) => o.id === c.parentId) && !ids.has(c.parentId)) c.parentId = null;
    if (!layerIds.has(c.layerId)) c.layerId = activeWorldLayer(scene);
  }
  const roots = copies.filter((c) => !copies.some((o) => o.id === c.parentId));
  roots.forEach((r) => { r.x += 24; r.y += 24; });
  commit('Paste', (d) => { draftScene(d).entities.push(...copies); });
  editor().set({ selection: roots.map((r) => r.id) });
}

export function createPrefab(entityId: string) {
  const scene = sceneOf(getProject(), currentSceneId());
  const root = scene.entities.find((e) => e.id === entityId);
  if (!root) return;
  const ents = cloneSubtrees(scene.entities, [entityId]);
  const r = ents.find((e) => !ents.some((o) => o.id === e.parentId))!;
  r.parentId = null; r.x = 0; r.y = 0;
  ents.sort((a, b) => (a === r ? -1 : b === r ? 1 : 0));
  const id = uid('pf');
  commit('Create prefab ' + root.name, (d) => {
    d.prefabs[id] = { id, name: root.name, entities: ents };
    const e = draftScene(d).entities.find((x) => x.id === entityId);
    if (e) e.prefabId = id;
  });
  editor().set({ status: `Prefab "${root.name}" created (see Prefabs tab)` });
}

export function placePrefab(prefabId: string, x: number, y: number) {
  const p = getProject();
  const pf = p.prefabs[prefabId];
  if (!pf?.entities.length) return;
  const scene = sceneOf(p, currentSceneId());
  const copies = cloneSubtrees(pf.entities, [pf.entities[0].id]);
  const layerIds = new Set(scene.layers.map((l) => l.id));
  const root = copies.find((c) => !copies.some((o) => o.id === c.parentId))!;
  root.parentId = null; root.x = Math.round(x); root.y = Math.round(y); root.prefabId = pf.id;
  for (const c of copies) if (!layerIds.has(c.layerId)) c.layerId = activeWorldLayer(scene);
  commit('Place prefab ' + pf.name, (d) => { draftScene(d).entities.push(...copies); });
  editor().set({ selection: [root.id] });
}

/** Move an entity in the tree: into a new parent, or before another sibling. */
export function reparent(id: string, mode: 'inside' | 'before' | 'after', targetId: string | null) {
  commit('Reorder hierarchy', (d) => {
    const s = draftScene(d);
    const e = s.entities.find((x) => x.id === id);
    if (!e || id === targetId) return;
    if (targetId && descendants(s.entities, id).has(targetId)) return; // can't drop into own child
    const target = targetId ? s.entities.find((x) => x.id === targetId) : null;
    s.entities = s.entities.filter((x) => x.id !== id);
    if (mode === 'inside' || !target) {
      e.parentId = target ? target.id : null;
      s.entities.push(e);
    } else {
      e.parentId = target.parentId;
      const idx = s.entities.indexOf(s.entities.find((x) => x.id === target.id)!);
      s.entities.splice(mode === 'before' ? idx : idx + 1, 0, e);
    }
    if (target && mode === 'inside') e.layerId = target.kind === 'folder' ? e.layerId : e.layerId;
  });
}

export function addEmpty(kind: 'object' | 'folder') {
  const scene = sceneOf(getProject(), currentSceneId());
  const sel = editor().selection[0];
  const parent = sel ? scene.entities.find((e) => e.id === sel) : undefined;
  const e = newEntity(activeWorldLayer(scene), kind === 'folder' ? 'Folder' : 'Empty Object', { kind, parentId: parent?.kind === 'folder' ? parent.id : null });
  if (kind === 'object') { e.x = 480; e.y = 270; }
  commit('Add ' + kind, (d) => { draftScene(d).entities.push(e); });
  editor().set({ selection: [e.id] });
}

export function entityLocalBounds(e: Entity, p: Project) {
  const sp = getComp(e, 'sprite');
  const art = sp?.assetId ? p.assets[sp.assetId]?.art : undefined;
  if (art) return { x: -art.width / 2, y: -art.height / 2, w: art.width, h: art.height };
  const c = getComp(e, 'collider');
  if (c) return { x: c.ox - c.w / 2, y: c.oy - c.h / 2, w: c.w, h: c.h };
  if (e.kind === 'folder') return null;
  return { x: -12, y: -12, w: 24, h: 24 };
}
