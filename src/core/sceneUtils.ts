import type { Component, ComponentType, Entity } from './types';
import { IDENTITY, matFromTRS, matMul, type Mat } from './geometry';

export function getComp<T extends ComponentType>(e: { components: Component[] }, type: T): Extract<Component, { type: T }> | undefined {
  return e.components.find((c) => c.type === type) as Extract<Component, { type: T }> | undefined;
}

export interface EntityLike { id: string; parentId: string | null; x: number; y: number; rotation: number; scaleX: number; scaleY: number }

/** World matrices for an entity tree (children are relative to their parent). */
export function computeWorldMatrices<T extends EntityLike>(entities: Iterable<T>, byId: Map<string, T>): Map<string, Mat> {
  const out = new Map<string, Mat>();
  const visit = (e: T, depth: number): Mat => {
    const hit = out.get(e.id);
    if (hit) return hit;
    const local = matFromTRS(e.x, e.y, e.rotation, e.scaleX, e.scaleY);
    const parent = e.parentId && depth < 64 ? byId.get(e.parentId) : undefined;
    const m = parent ? matMul(visit(parent, depth + 1), local) : local;
    out.set(e.id, m);
    return m;
  };
  for (const e of entities) visit(e, 0);
  return out;
}

export function parentMatrix<T extends EntityLike>(e: T, mats: Map<string, Mat>): Mat {
  return (e.parentId && mats.get(e.parentId)) || IDENTITY;
}

export function descendants(entities: Entity[], id: string): Set<string> {
  const out = new Set<string>();
  let frontier = [id];
  while (frontier.length) {
    const next: string[] = [];
    for (const e of entities) if (e.parentId && frontier.includes(e.parentId) && !out.has(e.id)) { out.add(e.id); next.push(e.id); }
    frontier = next;
  }
  return out;
}

/** Visible/locked inherit down the tree. */
export function effectiveFlags(entities: Entity[]) {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const vis = new Map<string, boolean>(), lock = new Map<string, boolean>();
  const get = (e: Entity, depth = 0): [boolean, boolean] => {
    if (vis.has(e.id)) return [vis.get(e.id)!, lock.get(e.id)!];
    const p = e.parentId && depth < 64 ? byId.get(e.parentId) : undefined;
    const [pv, pl] = p ? get(p, depth + 1) : [true, false];
    const r: [boolean, boolean] = [pv && e.visible, pl || e.locked];
    vis.set(e.id, r[0]); lock.set(e.id, r[1]);
    return r;
  };
  entities.forEach((e) => get(e));
  return { visible: vis, locked: lock };
}

/** Depth-first ordering of the tree (used for draw order and the hierarchy panel). */
export function treeOrder<T extends { id: string; parentId: string | null }>(entities: T[]): { e: T; depth: number }[] {
  const kids = new Map<string | null, T[]>();
  const ids = new Set(entities.map((e) => e.id));
  for (const e of entities) {
    const p = e.parentId && ids.has(e.parentId) ? e.parentId : null;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p)!.push(e);
  }
  const out: { e: T; depth: number }[] = [];
  const walk = (p: string | null, depth: number) => {
    for (const e of kids.get(p) ?? []) {
      out.push({ e, depth });
      if (depth < 64) walk(e.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
