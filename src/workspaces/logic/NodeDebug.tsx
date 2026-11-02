import { useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { getDef } from '../../runtime/nodes';

/** Per-node execution counts from the last Preview run (also shown as badges on the nodes). */
export function NodeDebug() {
  const stats = useEditor((s) => s.nodeStats);
  const graphs = useProject((s) => s.project.graphs);
  const rows: { graph: string; graphId: string; nodeId: string; title: string; count: number; last: number }[] = [];
  for (const g of Object.values(graphs)) for (const n of g.nodes) {
    const s = stats[n.id];
    if (s) rows.push({ graph: g.name, graphId: g.id, nodeId: n.id, title: getDef(n.type)?.title ?? n.type, count: s.count, last: s.last });
  }
  rows.sort((a, b) => b.last - a.last);
  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <button className="btn sm" onClick={() => editor().set({ nodeStats: {} })}>Clear</button>
      </div>
      {!rows.length && <div className="hint">No runs yet</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          {rows.slice(0, 300).map((r) => (
            <tr key={r.nodeId} className="list-item" style={{ display: 'table-row' }} onClick={() => editor().set({ workspace: 'logic', activeGraphId: r.graphId, selectedNodeIds: [r.nodeId] })}>
              <td>{r.graph}</td><td>{r.title}</td><td style={{ textAlign: 'right' }}>{r.count}×</td>
              <td className="dim" style={{ textAlign: 'right' }}>{new Date(r.last).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
