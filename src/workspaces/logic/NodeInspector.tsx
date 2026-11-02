import { useState } from 'react';
import { useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { useGraph } from '../../core/selectors';
import { NODE_CATEGORIES, NODE_LIST, PIN_COLORS, getDef, formatValue } from '../../runtime/nodes';
import { ValueEditor, CATEGORY_COLORS } from './GraphNodeView';
import { addNode } from './graphOps';

export function NodeInspector() {
  const graph = useGraph();
  const project = useProject((s) => s.project);
  const sel = useEditor((s) => s.selectedNodeIds);
  const stats = useEditor((s) => s.nodeStats);
  const node = graph?.nodes.find((n) => n.id === sel[0]);
  if (!graph) return <div className="hint">No graph open.</div>;
  if (!node) return <div className="hint">No node selected</div>;
  const def = getDef(node.type);
  if (!def) return <div className="hint">Unknown node type {node.type}</div>;
  const connected = new Set(graph.edges.filter((e) => e.target === node.id).map((e) => e.targetPin));
  return (
    <div>
      <div className="section">
        <div style={{ fontWeight: 600, fontSize: 15, borderLeft: `4px solid ${CATEGORY_COLORS[def.category]}`, paddingLeft: 6 }}>{def.title}</div>
        <div>{def.description}</div>
        {stats[node.id] && <div className="dim small" style={{ marginTop: 4 }}>Executed {stats[node.id].count}× in the last run</div>}
      </div>
      {(def.inputs.some((p) => p.type !== 'exec') || def.props?.length) && (
        <div className="section">
          <div className="section-title" style={{ cursor: 'default' }}>Values</div>
          {def.inputs.filter((p) => p.type !== 'exec').map((p) => (
            <div key={p.id} className="field gpin" style={{ height: 'auto', padding: 0 }}>
              <label style={{ color: PIN_COLORS[p.type] }}>{p.label ?? p.id}</label>
              {connected.has(p.id) ? <span className="dim small">connected</span> : <ValueEditor nodeId={node.id} pin={p} value={node.values[p.id]} project={project} graphId={graph.id} />}
            </div>
          ))}
          {def.props?.map((p) => (
            <div key={p.id} className="field gpin" style={{ height: 'auto', padding: 0 }}>
              <label>{p.label ?? p.id}</label>
              <ValueEditor nodeId={node.id} pin={p} value={node.values[p.id]} project={project} graphId={graph.id} />
            </div>
          ))}
        </div>
      )}
      <div className="section">
        <div className="section-title" style={{ cursor: 'default' }}>Pins</div>
        {def.inputs.map((p) => <div key={'i' + p.id} className="small">→ <span style={{ color: PIN_COLORS[p.type] }}>{p.type}</span> {p.label ?? p.id}{p.default !== undefined && p.type !== 'exec' ? <span className="dim"> (default {formatValue(p.default)})</span> : null}</div>)}
        {def.outputs.map((p) => <div key={'o' + p.id} className="small">← <span style={{ color: PIN_COLORS[p.type] }}>{p.type}</span> {p.label ?? p.id}</div>)}
      </div>
    </div>
  );
}

/** Touch-friendly node list: tap to add (placed to the right of the existing nodes). */
export function NodePalette() {
  const graph = useGraph();
  const [q, setQ] = useState('');
  if (!graph) return <div className="hint">No graph open.</div>;
  const add = (type: string) => {
    const xs = graph.nodes.map((n) => n.x), ys = graph.nodes.map((n) => n.y);
    const id = addNode(type, xs.length ? Math.max(...xs) + 280 : 0, ys.length ? Math.min(...ys) : 0);
    if (id) editor().set({ selectedNodeIds: [id] });
  };
  const list = NODE_LIST.filter((d) => !q || (d.title + ' ' + d.description).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <input className="inp" style={{ width: '100%', marginBottom: 6 }} placeholder="Search nodes…" value={q} onChange={(e) => setQ(e.target.value)} />
      {NODE_CATEGORIES.map((c) => {
        const items = list.filter((d) => d.category === c);
        if (!items.length) return null;
        return (
          <div key={c} style={{ marginBottom: 6 }}>
            <div className="dim small" style={{ borderLeft: `3px solid ${CATEGORY_COLORS[c]}`, paddingLeft: 5, marginBottom: 2 }}>{c}</div>
            {items.map((d) => (
              <div key={d.type} className="list-item" title={d.description} onClick={() => add(d.type)}>
                <span className="name">{d.title}</span><span className="dim small">+</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
