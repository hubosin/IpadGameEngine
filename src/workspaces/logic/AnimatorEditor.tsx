import { memo, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Handle, Position, MarkerType, applyNodeChanges,
  type Node, type Edge, type NodeChange, type NodeProps, type Connection,
} from '@xyflow/react';
import { commit, useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { newController } from '../../core/defaults';
import { uid } from '../../core/ids';
import type { AnimCondition, AnimController, AnimParamType, AnimState, AnimTransition, Project } from '../../core/types';
import { Icon, IconBtn } from '../../ui/Icon';
import { Check, EditableName, NumField, Section, Select, TextField } from '../../ui/widgets';

/** Animation state machines: parameters drive transitions between sprite animations. */

function draftCtrl(d: Project): AnimController | undefined {
  const id = editor().activeControllerId;
  return id ? d.animControllers[id] : undefined;
}
function editCtrl(label: string, f: (c: AnimController) => void, mk?: string) {
  commit(label, (d) => { const c = draftCtrl(d); if (c) f(c); }, mk);
}

export function allAnimationNames(p: Project) {
  const names = new Set<string>();
  for (const a of Object.values(p.assets)) a.art?.animations.forEach((x) => names.add(x.name));
  return [...names];
}

const StateNode = memo(function StateNode({ id, selected, data }: NodeProps) {
  const d = data as { label: string; sub: string; isDefault: boolean; isAny: boolean };
  return (
    <div className={'astate' + (selected ? ' selected' : '') + (d.isDefault ? ' default' : '') + (d.isAny ? ' any' : '')}>
      {!d.isAny && <Handle type="target" position={Position.Left} id="in" />}
      <div className="astate-name">{d.label}</div>
      {d.sub && <div className="astate-sub">{d.sub}</div>}
      <Handle type="source" position={Position.Right} id="out" />
      <span style={{ display: 'none' }}>{id}</span>
    </div>
  );
});
const nodeTypes = { astate: StateNode };

function Graph({ ctrl }: { ctrl: AnimController }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const sel = useEditor((s) => s.animSel);
  useEffect(() => {
    setNodes((prev) => {
      const selected = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return [
        { id: 'any', type: 'astate', position: { x: ctrl.anyX, y: ctrl.anyY }, data: { label: 'Any State', sub: '', isDefault: false, isAny: true }, selected: selected.has('any') },
        ...ctrl.states.map((s): Node => ({ id: s.id, type: 'astate', position: { x: s.x, y: s.y }, data: { label: s.name, sub: s.animation, isDefault: ctrl.defaultState === s.id, isAny: false }, selected: selected.has(s.id) })),
      ];
    });
  }, [ctrl.states, ctrl.defaultState, ctrl.anyX, ctrl.anyY]);
  const edges: Edge[] = useMemo(() => ctrl.transitions.map((t) => ({
    id: t.id, source: t.from, target: t.to, sourceHandle: 'out', targetHandle: 'in',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#bbb' },
    label: t.conditions.map((c) => c.op === 'trigger' ? c.param + '!' : c.op === 'true' ? c.param : c.op === 'false' ? '!' + c.param : `${c.param} ${c.op} ${c.value}`).join(' & ') || (t.exitTime != null ? 'exit' : ''),
    labelStyle: { fill: '#ccc', fontSize: 10 }, labelBgStyle: { fill: '#262626' },
    style: { stroke: sel?.id === t.id ? '#e3913a' : '#9a9a9a', strokeWidth: 2 },
  })), [ctrl.transitions, sel]);

  const onNodesChange = (ch: NodeChange[]) => setNodes((ns) => applyNodeChanges(ch.filter((c) => c.type !== 'remove'), ns));
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.target === 'any' || c.source === c.target) return;
    const id = uid('at');
    editCtrl('Add transition', (x) => { x.transitions.push({ id, from: c.source as string, to: c.target as string, conditions: [], exitTime: null }); });
    editor().set({ animSel: { kind: 'transition', id } });
  };
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onConnect={onConnect}
      onNodeClick={(_, n) => editor().set({ animSel: n.id === 'any' ? null : { kind: 'state', id: n.id } })}
      onEdgeClick={(_, e) => editor().set({ animSel: { kind: 'transition', id: e.id } })}
      onPaneClick={() => editor().set({ animSel: null })}
      onNodeDragStop={(_, n) => editCtrl('Move state', (x) => {
        if (n.id === 'any') { x.anyX = Math.round(n.position.x); x.anyY = Math.round(n.position.y); return; }
        const s = x.states.find((y) => y.id === n.id); if (s) { s.x = Math.round(n.position.x); s.y = Math.round(n.position.y); }
      })}
      onNodesDelete={(ns) => { const ids = new Set(ns.map((n) => n.id).filter((i) => i !== 'any')); editCtrl('Delete states', (x) => { x.states = x.states.filter((s) => !ids.has(s.id)); x.transitions = x.transitions.filter((t) => !ids.has(t.from) && !ids.has(t.to)); if (x.defaultState && ids.has(x.defaultState)) x.defaultState = x.states[0]?.id ?? null; }); }}
      onEdgesDelete={(es) => { const ids = new Set(es.map((e) => e.id)); editCtrl('Delete transitions', (x) => { x.transitions = x.transitions.filter((t) => !ids.has(t.id)); }); }}
      deleteKeyCode={['Delete', 'Backspace']} fitView fitViewOptions={{ padding: 0.3 }} colorMode="dark" proOptions={{ hideAttribution: true }} zoomOnDoubleClick={false}>
      <Background variant={BackgroundVariant.Lines} gap={28} color="#2a2a2a" />
    </ReactFlow>
  );
}

export function AnimatorEditor() {
  const project = useProject((s) => s.project);
  const id = useEditor((s) => s.activeControllerId);
  const ctrl = id ? project.animControllers[id] : undefined;
  if (!ctrl) {
    return (
      <div className="hint" style={{ paddingTop: 40 }}>
        <button className="btn primary" onClick={() => createController()}><Icon name="plus" size={13} /> New animator</button>
      </div>
    );
  }
  const addState = () => {
    const sid = uid('as');
    const anim = allAnimationNames(project)[0] ?? '';
    editCtrl('Add state', (x) => {
      x.states.push({ id: sid, name: 'State ' + (x.states.length + 1), animation: anim, speed: 1, x: 80 + x.states.length * 40, y: 80 + x.states.length * 30 });
      x.defaultState ??= sid;
    });
    editor().set({ animSel: { kind: 'state', id: sid } });
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ReactFlowProvider key={ctrl.id}><Graph ctrl={ctrl} /></ReactFlowProvider>
      <div className="float toolbox">
        <IconBtn icon="plus" title="Add state" onClick={addState} />
        <IconBtn icon="trash" title="Delete selection" onClick={() => {
          const s = editor().animSel;
          if (!s) return;
          if (s.kind === 'state') editCtrl('Delete state', (x) => { x.states = x.states.filter((y) => y.id !== s.id); x.transitions = x.transitions.filter((t) => t.from !== s.id && t.to !== s.id); if (x.defaultState === s.id) x.defaultState = x.states[0]?.id ?? null; });
          else editCtrl('Delete transition', (x) => { x.transitions = x.transitions.filter((t) => t.id !== s.id); });
          editor().set({ animSel: null });
        }} />
      </div>
    </div>
  );
}

export function createController() {
  const c = newController('New Animator');
  commit('New animator', (d) => { d.animControllers[c.id] = c; });
  editor().set({ activeControllerId: c.id, logicView: 'animator', animSel: null });
}

/** Left panel: animators + parameters of the active one. */
export function ControllerList() {
  const project = useProject((s) => s.project);
  const activeId = useEditor((s) => s.activeControllerId);
  const [renaming, setRenaming] = useState<string | null>(null);
  useEffect(() => { editor().set({ logicView: 'animator' }); }, []);
  const ctrl = activeId ? project.animControllers[activeId] : undefined;
  return (
    <div>
      <Section title="Animators" actions={<IconBtn icon="plus" title="New animator" onClick={createController} />}>
        {Object.values(project.animControllers).map((c) => (
          <div key={c.id} className={'list-item' + (c.id === activeId ? ' sel' : '')} onClick={() => editor().set({ activeControllerId: c.id, animSel: null })}>
            <EditableName value={c.name} editing={renaming === c.id} setEditing={(b) => setRenaming(b ? c.id : null)} onChange={(v) => commit('Rename animator', (d) => { d.animControllers[c.id].name = v; })} />
            <IconBtn icon="trash" size={13} title="Delete" onClick={() => {
              if (!confirm(`Delete animator "${c.name}"?`)) return;
              commit('Delete animator', (d) => { delete d.animControllers[c.id]; });
              editor().set({ activeControllerId: null });
            }} />
          </div>
        ))}
      </Section>
      {ctrl && (
        <Section title="Parameters" actions={<IconBtn icon="plus" title="Add parameter" onClick={() => editCtrl('Add parameter', (x) => { x.params.push({ id: uid('ap'), name: 'param' + (x.params.length + 1), type: 'number', value: 0 }); })} />}>
          {ctrl.params.map((p, i) => (
            <div key={p.id} className="row" style={{ flexWrap: 'nowrap', marginBottom: 2 }}>
              <input className="inp" defaultValue={p.name} style={{ width: 80 }} onBlur={(e) => e.target.value && editCtrl('Rename parameter', (x) => { x.params[i].name = e.target.value; })} />
              <select className="inp" style={{ width: 70, flex: 'none' }} value={p.type} onChange={(e) => editCtrl('Parameter type', (x) => { const t = e.target.value as AnimParamType; x.params[i].type = t; x.params[i].value = t === 'number' ? 0 : false; })}>
                <option value="number">number</option><option value="bool">bool</option><option value="trigger">trigger</option>
              </select>
              {p.type === 'number' && <input className="inp" type="number" value={Number(p.value)} onChange={(e) => editCtrl('Parameter value', (x) => { x.params[i].value = parseFloat(e.target.value) || 0; }, 'pv' + p.id)} />}
              {p.type === 'bool' && <input type="checkbox" className="check" checked={!!p.value} onChange={(e) => editCtrl('Parameter value', (x) => { x.params[i].value = e.target.checked; })} />}
              <IconBtn icon="x" size={12} title="Remove" onClick={() => editCtrl('Remove parameter', (x) => { x.params.splice(i, 1); })} />
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

const OPS_NUM: AnimCondition['op'][] = ['>', '<', '>=', '<=', '==', '!='];

/** Right panel: selected state or transition. */
export function AnimInspector() {
  const project = useProject((s) => s.project);
  const id = useEditor((s) => s.activeControllerId);
  const sel = useEditor((s) => s.animSel);
  const ctrl = id ? project.animControllers[id] : undefined;
  if (!ctrl || !sel) return <div className="hint">Nothing selected</div>;
  if (sel.kind === 'state') {
    const s = ctrl.states.find((x) => x.id === sel.id);
    if (!s) return null;
    const ed = (label: string, f: (st: AnimState) => void, mk?: string) => editCtrl(label, (x) => { const st = x.states.find((y) => y.id === s.id); if (st) f(st); }, mk);
    return (
      <Section title="State">
        <TextField label="Name" value={s.name} onChange={(v) => ed('Rename state', (x) => { x.name = v; })} />
        <Select label="Animation" value={s.animation} options={[{ value: '', label: '(none)' }, ...allAnimationNames(project).map((n) => ({ value: n, label: n }))]} onChange={(v) => ed('State animation', (x) => { x.animation = v; })} />
        <NumField label="Speed" step={0.1} value={s.speed} onChange={(v) => ed('State speed', (x) => { x.speed = v; }, 'ss' + s.id)} />
        <div className="field"><label /><button className={'btn sm' + (ctrl.defaultState === s.id ? ' on' : '')} onClick={() => editCtrl('Default state', (x) => { x.defaultState = s.id; })}>Default state</button></div>
      </Section>
    );
  }
  const t = ctrl.transitions.find((x) => x.id === sel.id);
  if (!t) return null;
  const ed = (label: string, f: (tr: AnimTransition) => void, mk?: string) => editCtrl(label, (x) => { const tr = x.transitions.find((y) => y.id === t.id); if (tr) f(tr); }, mk);
  const name = (sid: string) => sid === 'any' ? 'Any State' : ctrl.states.find((x) => x.id === sid)?.name ?? '?';
  return (
    <div>
      <Section title={`${name(t.from)} → ${name(t.to)}`}>
        <Check label="Exit time" value={t.exitTime != null} onChange={(v) => ed('Exit time', (x) => { x.exitTime = v ? 1 : null; })} />
        {t.exitTime != null && <NumField label="At (0-1)" step={0.1} min={0} value={t.exitTime} onChange={(v) => ed('Exit time', (x) => { x.exitTime = v; }, 'et' + t.id)} />}
      </Section>
      <Section title="Conditions" actions={<IconBtn icon="plus" title="Add condition" onClick={() => ed('Add condition', (x) => {
        const p = ctrl.params[0];
        x.conditions.push({ param: p?.name ?? '', op: p?.type === 'bool' ? 'true' : p?.type === 'trigger' ? 'trigger' : '>', value: 0 });
      })} />}>
        {t.conditions.map((c, i) => {
          const p = ctrl.params.find((x) => x.name === c.param);
          const ops: AnimCondition['op'][] = p?.type === 'bool' ? ['true', 'false'] : p?.type === 'trigger' ? ['trigger'] : OPS_NUM;
          return (
            <div key={i} className="row" style={{ flexWrap: 'nowrap', marginBottom: 2 }}>
              <select className="inp" value={c.param} onChange={(e) => ed('Condition', (x) => {
                const np = ctrl.params.find((y) => y.name === e.target.value);
                x.conditions[i] = { param: e.target.value, op: np?.type === 'bool' ? 'true' : np?.type === 'trigger' ? 'trigger' : '>', value: 0 };
              })}>
                {ctrl.params.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
              </select>
              <select className="inp" style={{ width: 62, flex: 'none' }} value={c.op} onChange={(e) => ed('Condition', (x) => { x.conditions[i].op = e.target.value as AnimCondition['op']; })}>
                {ops.map((o) => <option key={o}>{o}</option>)}
              </select>
              {OPS_NUM.includes(c.op) && <input className="inp" type="number" style={{ width: 54, flex: 'none' }} value={c.value} onChange={(e) => ed('Condition', (x) => { x.conditions[i].value = parseFloat(e.target.value) || 0; }, 'cv' + t.id + i)} />}
              <IconBtn icon="x" size={12} title="Remove" onClick={() => ed('Remove condition', (x) => { x.conditions.splice(i, 1); })} />
            </div>
          );
        })}
        {!ctrl.params.length && <div className="dim small">Add parameters in the left panel</div>}
      </Section>
    </div>
  );
}
