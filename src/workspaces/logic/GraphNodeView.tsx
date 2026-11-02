import { memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { commit, useProject } from '../../core/store';
import { useEditor } from '../../core/editorStore';
import type { Project } from '../../core/types';
import { PIN_COLORS, getDef, type PinDef } from '../../runtime/nodes';
import { draftGraph, setNodeValue } from './graphOps';

export const CATEGORY_COLORS: Record<string, string> = {
  Events: '#8b2a2a', Input: '#7a4a12', Math: '#2f6b33', Movement: '#1f5a8a', Objects: '#2a4e8b',
  Logic: '#4a4f5a', Animation: '#6b3a8b', 'Game State': '#6b5a1f', UI: '#1f7a72', Data: '#7a5a2a',
};

const uniq = (names: string[]) => [...new Set(names.filter(Boolean))].map((n) => ({ value: n, label: n }));

export function resourceOptions(p: Project, kind: PinDef['resource'], graphId: string | null): { value: string; label: string }[] {
  switch (kind) {
    case 'action': return p.input.map((a) => ({ value: a.name, label: a.name }));
    case 'variable': {
      const g = graphId ? p.graphs[graphId] : undefined;
      return [...(g?.variables ?? []).map((v) => ({ value: v.name, label: v.name + ' (graph)' })), ...p.variables.map((v) => ({ value: v.name, label: v.name + ' (global)' }))];
    }
    case 'animation': {
      const names = new Set<string>();
      for (const a of Object.values(p.assets)) a.art?.animations.forEach((an) => names.add(an.name));
      return [...names].map((n) => ({ value: n, label: n }));
    }
    case 'prefab': return Object.values(p.prefabs).map((x) => ({ value: x.id, label: x.name }));
    case 'scene': return p.sceneOrder.map((id) => ({ value: id, label: p.scenes[id]?.name ?? id }));
    case 'asset': return Object.values(p.assets).map((a) => ({ value: a.id, label: a.name }));
    case 'ui': return uniq(Object.values(p.scenes).flatMap((sc) => (sc.ui ?? []).map((e) => e.name)));
    case 'animParam': return uniq(Object.values(p.animControllers ?? {}).flatMap((c) => c.params.map((x) => x.name)));
    case 'data': return Object.values(p.dataAssets ?? {}).map((d) => ({ value: d.id, label: d.name }));
    case 'schema': return Object.values(p.dataSchemas ?? {}).map((d) => ({ value: d.id, label: d.name }));
    case 'dataField': return uniq(Object.values(p.dataSchemas ?? {}).flatMap((sc) => sc.fields.map((f) => f.name)));
    default: return [];
  }
}

function parseAny(s: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(s.trim())) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  return s;
}

/** Inline editor for an unconnected input or a node property. */
export function ValueEditor({ nodeId, pin, value, project, graphId }: { nodeId: string; pin: PinDef; value: unknown; project: Project; graphId: string | null }) {
  const set = (v: unknown) => setNodeValue(nodeId, pin.id, v);
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() };
  const v = value ?? pin.default;
  if (pin.options) return <select className="nodrag" value={String(v ?? '')} onChange={(e) => set(e.target.value)} {...stop}>{pin.options.map((o) => <option key={o}>{o}</option>)}</select>;
  if (pin.resource) {
    const opts = resourceOptions(project, pin.resource, graphId);
    if (pin.type === 'resource' || opts.length) {
      return (
        <select className="nodrag" value={String(v ?? '')} onChange={(e) => set(e.target.value)} {...stop}>
          <option value="">—</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {v && !opts.some((o) => o.value === v) ? <option value={String(v)}>{String(v)} (missing)</option> : null}
        </select>
      );
    }
  }
  switch (pin.type) {
    case 'number': return <input className="nodrag" type="number" value={Number(v ?? 0)} onChange={(e) => set(parseFloat(e.target.value) || 0)} {...stop} />;
    case 'boolean': return <input className="nodrag" type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} {...stop} />;
    case 'string': return <input className="nodrag" type="text" value={String(v ?? '')} onChange={(e) => set(e.target.value)} {...stop} />;
    case 'any': return <input className="nodrag" type="text" value={v == null ? '' : String(v)} placeholder="value" onChange={(e) => set(parseAny(e.target.value))} {...stop} />;
    case 'vector': {
      const vec = (v as { x: number; y: number }) ?? { x: 0, y: 0 };
      return (
        <span className="row" style={{ gap: 2 }}>
          <input className="nodrag" type="number" style={{ width: 44 }} value={vec.x} onChange={(e) => set({ ...vec, x: parseFloat(e.target.value) || 0 })} {...stop} />
          <input className="nodrag" type="number" style={{ width: 44 }} value={vec.y} onChange={(e) => set({ ...vec, y: parseFloat(e.target.value) || 0 })} {...stop} />
        </span>
      );
    }
    case 'object': return <span className="dim small">Self</span>;
    default: return null;
  }
}

export const GraphNodeView = memo(function GraphNodeView({ id, selected }: NodeProps) {
  const project = useProject((s) => s.project);
  const graphId = useEditor((s) => s.activeGraphId);
  const stats = useEditor((s) => s.nodeStats[id]);
  const graph = graphId ? project.graphs[graphId] : undefined;
  const node = graph?.nodes.find((n) => n.id === id);
  if (!node || !graph) return null;
  const def = getDef(node.type);
  if (!def) return <div className="gnode"><div className="gnode-title" style={{ background: '#a00' }}>Unknown: {node.type}</div></div>;
  const connectedIn = new Set(graph.edges.filter((e) => e.target === id).map((e) => e.targetPin));
  const recent = stats && Date.now() - stats.last < 600;
  return (
    <div className={'gnode' + (selected ? ' selected' : '') + (recent ? ' flash' : '')} title={def.description}>
      <div className="gnode-title" style={{ background: CATEGORY_COLORS[def.category] ?? '#444' }}>
        {def.title}
        {stats && <span className="count" title="Times executed in the last preview run">{stats.count}</span>}
      </div>
      <div className="gnode-body">
        <div className="gnode-col">
          {def.inputs.map((p) => (
            <div key={p.id} className="gpin">
              <Handle type="target" position={Position.Left} id={'i:' + p.id}
                style={{ background: PIN_COLORS[p.type], ...(p.type === 'exec' ? { borderRadius: 2, transform: 'translate(-50%,-50%) rotate(45deg)' } : {}) }} />
              <span>{p.label ?? (p.type === 'exec' ? '' : p.id)}</span>
              {p.type !== 'exec' && !connectedIn.has(p.id) && <ValueEditor nodeId={id} pin={p} value={node.values[p.id]} project={project} graphId={graphId} />}
            </div>
          ))}
        </div>
        <div className="gnode-col">
          {def.outputs.map((p) => (
            <div key={p.id} className="gpin out">
              <span>{p.label ?? (p.type === 'exec' ? '' : p.id)}</span>
              <Handle type="source" position={Position.Right} id={'o:' + p.id}
                style={{ background: PIN_COLORS[p.type], ...(p.type === 'exec' ? { borderRadius: 2, transform: 'translate(50%,-50%) rotate(45deg)' } : {}) }} />
            </div>
          ))}
        </div>
      </div>
      {def.props?.map((p) => (
        <div key={p.id} className="gprop">
          <label>{p.label ?? p.id}</label>
          <ValueEditor nodeId={id} pin={p} value={node.values[p.id]} project={project} graphId={graphId} />
        </div>
      ))}
    </div>
  );
});

export const CommentView = memo(function CommentView({ id, selected }: NodeProps) {
  const comment = useProject((s) => {
    const g = s.project.graphs[useEditor.getState().activeGraphId ?? ''];
    return g?.comments.find((c) => c.id === id);
  });
  if (!comment) return null;
  return (
    <>
      <NodeResizer isVisible={!!selected} minWidth={120} minHeight={60}
        onResizeEnd={(_, p) => commit('Resize comment', (d) => {
          const c = draftGraph(d)?.comments.find((x) => x.id === id);
          if (c) { c.x = Math.round(p.x); c.y = Math.round(p.y); c.w = Math.round(p.width); c.h = Math.round(p.height); }
        })} />
      <div className="gcomment" style={{ background: comment.color + 'cc' }}
        onDoubleClick={() => {
          const t = prompt('Comment text', comment.text);
          if (t !== null) commit('Edit comment', (d) => { const c = draftGraph(d)?.comments.find((x) => x.id === id); if (c) c.text = t; });
        }}>
        {comment.text}
      </div>
    </>
  );
});
