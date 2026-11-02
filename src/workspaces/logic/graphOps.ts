import { commit, getProject } from '../../core/store';
import { editor } from '../../core/editorStore';
import { uid } from '../../core/ids';
import type { Graph, GraphEdge, GraphNode, PinType, Project } from '../../core/types';
import { canConnect, getDef } from '../../runtime/nodes';

export function draftGraph(d: Project): Graph | undefined {
  const id = editor().activeGraphId;
  return id ? d.graphs[id] : undefined;
}

export function pinType(node: GraphNode | undefined, pin: string, dir: 'in' | 'out'): PinType | null {
  const def = node && getDef(node.type);
  const p = def?.[dir === 'in' ? 'inputs' : 'outputs'].find((x) => x.id === pin);
  return p?.type ?? null;
}

export function addNode(type: string, x: number, y: number): string | null {
  const def = getDef(type);
  if (!def) return null;
  const id = uid('n');
  const values: Record<string, unknown> = {};
  for (const p of def.props ?? []) if (p.default !== undefined) values[p.id] = p.default;
  commit('Add ' + def.title, (d) => { draftGraph(d)?.nodes.push({ id, type, x: Math.round(x), y: Math.round(y), values }); });
  return id;
}

/** Validate + add a wire. Data inputs keep one wire; exec outputs keep one wire. */
export function connect(source: string, sourcePin: string, target: string, targetPin: string): boolean {
  const g = getProject().graphs[editor().activeGraphId ?? ''];
  if (!g || source === target) return false;
  const sn = g.nodes.find((n) => n.id === source), tn = g.nodes.find((n) => n.id === target);
  const st = pinType(sn, sourcePin, 'out'), tt = pinType(tn, targetPin, 'in');
  if (!st || !tt || !canConnect(st, tt)) return false;
  commit('Connect', (d) => {
    const dg = draftGraph(d);
    if (!dg) return;
    dg.edges = dg.edges.filter((e) =>
      !(st === 'exec' ? e.source === source && e.sourcePin === sourcePin : e.target === target && e.targetPin === targetPin));
    dg.edges.push({ id: uid('ed'), source, sourcePin, target, targetPin });
  });
  return true;
}

export function deleteNodes(ids: string[], commentIds: string[] = []) {
  if (!ids.length && !commentIds.length) return;
  const set = new Set(ids), cset = new Set(commentIds);
  commit('Delete nodes', (d) => {
    const g = draftGraph(d);
    if (!g) return;
    g.nodes = g.nodes.filter((n) => !set.has(n.id));
    g.edges = g.edges.filter((e) => !set.has(e.source) && !set.has(e.target));
    g.comments = g.comments.filter((c) => !cset.has(c.id));
  });
}

export function setNodeValue(nodeId: string, key: string, value: unknown) {
  commit('Edit node value', (d) => {
    const n = draftGraph(d)?.nodes.find((x) => x.id === nodeId);
    if (n) n.values[key] = value;
  }, 'nv' + nodeId + key);
}

// ---- clipboard / snippets (work across graphs)
let clipboard: { nodes: GraphNode[]; edges: GraphEdge[] } | null = null;

export function selectionSection(g: Graph, ids: string[]) {
  const set = new Set(ids);
  return {
    nodes: g.nodes.filter((n) => set.has(n.id)).map((n) => structuredClone(n)),
    edges: g.edges.filter((e) => set.has(e.source) && set.has(e.target)).map((e) => ({ ...e })),
  };
}

export function copyNodes(ids: string[]) {
  const g = getProject().graphs[editor().activeGraphId ?? ''];
  if (!g || !ids.length) return;
  clipboard = selectionSection(g, ids);
  editor().set({ status: `Copied ${ids.length} node(s)` });
}

/** Insert a section with fresh ids, offset so its top-left lands at (x, y). Returns new ids. */
export function insertSection(sec: { nodes: GraphNode[]; edges: GraphEdge[] }, x: number, y: number, label = 'Paste nodes'): string[] {
  if (!sec.nodes.length) return [];
  const minX = Math.min(...sec.nodes.map((n) => n.x)), minY = Math.min(...sec.nodes.map((n) => n.y));
  const map = new Map(sec.nodes.map((n) => [n.id, uid('n')]));
  const nodes = sec.nodes.map((n) => ({ ...structuredClone(n), id: map.get(n.id)!, x: Math.round(n.x - minX + x), y: Math.round(n.y - minY + y) }));
  const edges = sec.edges.map((e) => ({ ...e, id: uid('ed'), source: map.get(e.source)!, target: map.get(e.target)! }));
  commit(label, (d) => { const g = draftGraph(d); if (g) { g.nodes.push(...nodes); g.edges.push(...edges); } });
  return nodes.map((n) => n.id);
}

export function pasteNodes(x: number, y: number): string[] {
  return clipboard ? insertSection(clipboard, x, y) : [];
}

export function saveSnippet(ids: string[]) {
  const g = getProject().graphs[editor().activeGraphId ?? ''];
  if (!g || !ids.length) return;
  const name = prompt('Name for this reusable section', 'My Section');
  if (!name) return;
  const sec = selectionSection(g, ids);
  const id = uid('sn');
  commit('Save snippet', (d) => { d.snippets[id] = { id, name, ...sec }; });
  editor().set({ status: `Saved section "${name}" — insert it from the Add Node menu` });
}
