import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, applyNodeChanges, useReactFlow,
  type Node, type Edge, type Connection, type NodeChange, type OnConnectStartParams,
} from '@xyflow/react';
import { commit, useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { useGraph } from '../../core/selectors';
import { newGraph } from '../../core/defaults';
import { uid } from '../../core/ids';
import type { Graph, PinType } from '../../core/types';
import { NODE_LIST, PIN_COLORS, canConnect, type NodeDef } from '../../runtime/nodes';
import { CommentView, GraphNodeView, CATEGORY_COLORS } from './GraphNodeView';
import { IconBtn } from '../../ui/Icon';
import { addNode, connect, copyNodes, deleteNodes, draftGraph, insertSection, pasteNodes, pinType, saveSnippet } from './graphOps';

const nodeTypes = { gnode: GraphNodeView, comment: CommentView };

function buildNodes(g: Graph, prev: Node[]): Node[] {
  const selected = new Set(prev.filter((n) => n.selected).map((n) => n.id));
  return [
    ...g.comments.map((c): Node => ({ id: c.id, type: 'comment', position: { x: c.x, y: c.y }, data: {}, style: { width: c.w, height: c.h }, zIndex: -1, selected: selected.has(c.id) })),
    ...g.nodes.map((n): Node => ({ id: n.id, type: 'gnode', position: { x: n.x, y: n.y }, data: {}, selected: selected.has(n.id) })),
  ];
}

function buildEdges(g: Graph): Edge[] {
  return g.edges.map((e) => {
    const t = pinType(g.nodes.find((n) => n.id === e.source), e.sourcePin, 'out') ?? 'any';
    return { id: e.id, source: e.source, sourceHandle: 'o:' + e.sourcePin, target: e.target, targetHandle: 'i:' + e.targetPin, style: { stroke: PIN_COLORS[t], strokeWidth: t === 'exec' ? 3 : 2 } };
  });
}

interface Palette { x: number; y: number; flow: { x: number; y: number }; from?: { nodeId: string; pin: string; dir: 'in' | 'out'; type: PinType } }

function Editor({ graph }: { graph: Graph }) {
  const rf = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>([]);
  const edges = useMemo(() => buildEdges(graph), [graph.edges, graph.nodes]);
  const [palette, setPalette] = useState<Palette | null>(null);
  const connecting = useRef<OnConnectStartParams | null>(null);
  const dragStart = useRef<Map<string, { x: number; y: number }>>(new Map());
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => { setNodes((prev) => buildNodes(graph, prev)); }, [graph.nodes, graph.comments]);

  const selectedIds = () => nodes.filter((n) => n.selected && n.type === 'gnode').map((n) => n.id);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), ns));
  }, []);

  const selKey = nodes.filter((n) => n.selected && n.type === 'gnode').map((n) => n.id).join(',');
  useEffect(() => { editor().set({ selectedNodeIds: selKey ? selKey.split(',') : [] }); }, [selKey]);

  const onNodeDragStart = (_: unknown, node: Node, dragged: Node[]) => {
    dragStart.current = new Map();
    for (const n of dragged) dragStart.current.set(n.id, { ...n.position });
    // dragging a comment carries the nodes inside it
    for (const n of dragged) {
      if (n.type !== 'comment') continue;
      const c = graph.comments.find((x) => x.id === n.id);
      if (!c) continue;
      for (const gn of graph.nodes) if (gn.x >= c.x && gn.y >= c.y && gn.x <= c.x + c.w && gn.y <= c.y + c.h && !dragStart.current.has(gn.id)) dragStart.current.set(gn.id, { x: gn.x, y: gn.y });
    }
    void node;
  };
  const onNodeDrag = (_: unknown, node: Node) => {
    const s = dragStart.current.get(node.id);
    if (!s || node.type !== 'comment') return;
    const dx = node.position.x - s.x, dy = node.position.y - s.y;
    setNodes((ns) => ns.map((n) => {
      const st = dragStart.current.get(n.id);
      return st && n.id !== node.id && !n.selected ? { ...n, position: { x: st.x + dx, y: st.y + dy } } : n;
    }));
  };
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const onNodeDragStop = () => requestAnimationFrame(() => commitPositions(nodesRef.current));
  const commitPositions = (ns: Node[]) => {
    const pos = new Map(ns.map((n) => [n.id, n.position]));
    if (!dragStart.current.size) return;
    commit('Move nodes', (d) => {
      const g = draftGraph(d);
      if (!g) return;
      for (const id of dragStart.current.keys()) {
        const p = pos.get(id);
        if (!p) continue;
        const gn = g.nodes.find((n) => n.id === id);
        if (gn) { gn.x = Math.round(p.x); gn.y = Math.round(p.y); }
        const c = g.comments.find((x) => x.id === id);
        if (c) { c.x = Math.round(p.x); c.y = Math.round(p.y); }
      }
    });
    dragStart.current = new Map();
  };

  const isValidConnection = useCallback((c: Connection | Edge) => {
    if (c.source === c.target) return false;
    const sn = graph.nodes.find((n) => n.id === c.source), tn = graph.nodes.find((n) => n.id === c.target);
    const st = pinType(sn, String(c.sourceHandle).slice(2), 'out'), tt = pinType(tn, String(c.targetHandle).slice(2), 'in');
    return !!st && !!tt && canConnect(st, tt);
  }, [graph]);

  const onConnect = (c: Connection) => {
    connecting.current = null;
    if (!connect(c.source!, String(c.sourceHandle).slice(2), c.target!, String(c.targetHandle).slice(2))) editor().set({ status: 'Those pins have incompatible types' });
  };

  const onConnectEnd = (e: MouseEvent | TouchEvent) => {
    const start = connecting.current;
    connecting.current = null;
    if (!start?.nodeId || !start.handleId) return;
    const target = e.target as HTMLElement;
    if (!target.classList.contains('react-flow__pane')) return;
    const pt = 'changedTouches' in e ? e.changedTouches[0] : e;
    const dir = start.handleType === 'source' ? 'out' : 'in';
    const pin = start.handleId.slice(2);
    const type = pinType(graph.nodes.find((n) => n.id === start.nodeId), pin, dir);
    if (!type) return;
    openPalette(pt.clientX, pt.clientY, { nodeId: start.nodeId, pin, dir, type });
  };

  function openPalette(clientX: number, clientY: number, from?: Palette['from']) {
    const r = wrap.current!.getBoundingClientRect();
    setPalette({ x: clientX - r.left, y: clientY - r.top, flow: rf.screenToFlowPosition({ x: clientX, y: clientY }), from });
  }

  function pick(def: NodeDef) {
    const p = palette!;
    setPalette(null);
    const id = addNode(def.type, p.flow.x, p.flow.y);
    if (!id || !p.from) return;
    if (p.from.dir === 'out') {
      const pin = def.inputs.find((x) => canConnect(p.from!.type, x.type));
      if (pin) connect(p.from.nodeId, p.from.pin, id, pin.id);
    } else {
      const pin = def.outputs.find((x) => canConnect(x.type, p.from!.type));
      if (pin) connect(id, pin.id, p.from.nodeId, p.from.pin);
    }
  }

  const center = () => {
    const r = wrap.current!.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'c') copyNodes(selectedIds());
    else if (mod && e.key.toLowerCase() === 'v') { const c = center(); selectAfter(pasteNodes(c.x, c.y)); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); const ids = selectedIds(); copyNodes(ids); const n = graph.nodes.find((x) => x.id === ids[0]); if (n) selectAfter(pasteNodes(n.x + 40, n.y + 40)); }
    else if (e.key === 'Tab' || (e.key === ' ' && !mod)) { e.preventDefault(); const r = wrap.current!.getBoundingClientRect(); openPalette(r.left + r.width / 2 - 140, r.top + 80); }
  };

  const selectAfter = (ids: string[]) => {
    const set = new Set(ids);
    requestAnimationFrame(() => setNodes((ns) => ns.map((n) => ({ ...n, selected: set.has(n.id) }))));
  };

  const addComment = () => {
    const sel = graph.nodes.filter((n) => selectedIds().includes(n.id));
    const id = uid('c');
    const c = center();
    const box = sel.length
      ? { x: Math.min(...sel.map((n) => n.x)) - 30, y: Math.min(...sel.map((n) => n.y)) - 60, w: Math.max(...sel.map((n) => n.x)) - Math.min(...sel.map((n) => n.x)) + 280, h: Math.max(...sel.map((n) => n.y)) - Math.min(...sel.map((n) => n.y)) + 200 }
      : { x: c.x - 150, y: c.y - 80, w: 300, h: 160 };
    commit('Add comment', (d) => { draftGraph(d)?.comments.push({ id, ...box, text: 'Comment (double-click to edit)', color: '#3a3f4a' }); });
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }} ref={wrap} onKeyDown={onKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodesDelete={(ns) => deleteNodes(ns.filter((n) => n.type === 'gnode').map((n) => n.id), ns.filter((n) => n.type === 'comment').map((n) => n.id))}
        onEdgesDelete={(es) => { const ids = new Set(es.map((e) => e.id)); commit('Delete wires', (d) => { const g = draftGraph(d); if (g) g.edges = g.edges.filter((e) => !ids.has(e.id)); }); }}
        onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectStart={(_, p) => { connecting.current = p; }}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onPaneContextMenu={(e) => { e.preventDefault(); openPalette(e.clientX, e.clientY); }}
        onDoubleClick={(e) => { if ((e.target as HTMLElement).classList.contains('react-flow__pane')) openPalette(e.clientX, e.clientY); }}
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        zoomOnDoubleClick={false}
        minZoom={0.1} maxZoom={2.5}
        fitView fitViewOptions={{ padding: 0.2 }}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Lines} gap={28} color="#2a2a2a" />
      </ReactFlow>
      <div className="float toolbox">
        <IconBtn icon="plus" title="Add node (Space)" onClick={() => { const r = wrap.current!.getBoundingClientRect(); openPalette(r.left + 20, r.top + 56); }} />
        <IconBtn icon="comment" title="Comment" onClick={addComment} />
        <span className="sep" />
        <IconBtn icon="copy" title="Copy (Ctrl+C)" onClick={() => copyNodes(selectedIds())} />
        <IconBtn icon="paste" title="Paste (Ctrl+V)" onClick={() => { const c = center(); selectAfter(pasteNodes(c.x, c.y)); }} />
        <IconBtn icon="bookmark" title="Save as reusable section" onClick={() => saveSnippet(selectedIds())} />
        <IconBtn icon="trash" title="Delete (Del)" onClick={() => deleteNodes(selectedIds(), nodes.filter((n) => n.selected && n.type === 'comment').map((n) => n.id))} />
        <span className="sep" />
        <IconBtn icon="fit" title="Fit view" onClick={() => rf.fitView({ padding: 0.2, duration: 200 })} />
        <IconBtn icon="play" title="Play" onClick={() => editor().set({ workspace: 'preview' })} />
      </div>
      {palette && <NodeSearch palette={palette} onPick={pick} onClose={() => setPalette(null)} onSnippet={(id) => {
        const sn = useProject.getState().project.snippets[id];
        setPalette(null);
        if (sn) selectAfter(insertSection(sn, palette.flow.x, palette.flow.y, 'Insert section'));
      }} />}
    </div>
  );
}

function NodeSearch({ palette, onPick, onClose, onSnippet }: { palette: Palette; onPick: (d: NodeDef) => void; onClose: () => void; onSnippet: (id: string) => void }) {
  const [q, setQ] = useState('');
  const snippets = useProject((s) => s.project.snippets);
  const from = palette.from;
  const list = NODE_LIST.filter((d) => {
    if (q && !(d.title + ' ' + d.category + ' ' + d.description).toLowerCase().includes(q.toLowerCase())) return false;
    if (!from) return true;
    return from.dir === 'out' ? d.inputs.some((p) => canConnect(from.type, p.type)) : d.outputs.some((p) => canConnect(p.type, from.type));
  });
  const cats = [...new Set(list.map((d) => d.category))];
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, zIndex: 19 }} onPointerDown={onClose} />
      <div className="menu" style={{ left: Math.max(4, palette.x), top: Math.max(4, palette.y), width: 280, maxHeight: 420, overflow: 'auto', zIndex: 20 }}>
        <input className="inp" autoFocus placeholder={from ? `Nodes accepting ${from.type}…` : 'Search nodes…'} value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: '100%', marginBottom: 4 }}
          onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) onPick(list[0]); if (e.key === 'Escape') onClose(); }} />
        {cats.map((c) => (
          <div key={c}>
            <div className="mcat" style={{ borderLeft: `2px solid ${CATEGORY_COLORS[c] ?? '#666'}` }}>{c}</div>
            {list.filter((d) => d.category === c).map((d) => (
              <div key={d.type} className="mi" title={d.description} onClick={() => onPick(d)}>{d.title}</div>
            ))}
          </div>
        ))}
        {!from && Object.values(snippets).length > 0 && (
          <div>
            <div className="mcat">Sections</div>
            {Object.values(snippets).filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase())).map((s) => (
              <div key={s.id} className="mi" onClick={() => onSnippet(s.id)}>⧉ {s.name} <span className="dim small">({s.nodes.length} nodes)</span></div>
            ))}
          </div>
        )}
        {!list.length && <div className="hint">No matching nodes.</div>}
      </div>
    </>
  );
}

export function LogicEditor() {
  const graph = useGraph();
  const graphs = useProject((s) => s.project.graphs);
  if (!graph) {
    return (
      <div className="hint" style={{ padding: 20 }}>
        {Object.keys(graphs).length ? 'Pick a graph in the left panel.' : 'No logic graphs yet.'}
        <div style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={() => { const g = newGraph('New Graph'); commit('New graph', (d) => { d.graphs[g.id] = g; }); editor().set({ activeGraphId: g.id }); }}>+ New graph</button>
        </div>
      </div>
    );
  }
  return (
    <ReactFlowProvider key={graph.id}>
      <Editor graph={graph} />
    </ReactFlowProvider>
  );
}

