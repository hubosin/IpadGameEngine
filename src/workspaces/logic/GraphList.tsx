import { useEffect, useState } from 'react';
import { commit, useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { newGraph } from '../../core/defaults';
import { uid } from '../../core/ids';
import type { DataType, Project, VariableDef } from '../../core/types';
import { EditableName, Section } from '../../ui/widgets';

const TYPES: DataType[] = ['number', 'boolean', 'string', 'vector', 'any'];

function defaultFor(t: DataType): unknown {
  return t === 'number' ? 0 : t === 'boolean' ? false : t === 'vector' ? { x: 0, y: 0 } : '';
}

function VarRow({ v, onChange, onDelete }: { v: VariableDef; onChange: (v: VariableDef) => void; onDelete: () => void }) {
  const val = v.value as any;
  return (
    <div className="row" style={{ marginBottom: 3, flexWrap: 'nowrap' }}>
      <input className="inp" style={{ width: 80 }} defaultValue={v.name} onBlur={(e) => e.target.value.trim() && e.target.value !== v.name && onChange({ ...v, name: e.target.value.trim() })} />
      <select className="inp" style={{ width: 74, flex: 'none' }} value={v.type} onChange={(e) => onChange({ ...v, type: e.target.value as DataType, value: defaultFor(e.target.value as DataType) })}>
        {TYPES.map((t) => <option key={t}>{t}</option>)}
      </select>
      {v.type === 'number' && <input className="inp" type="number" value={Number(val)} onChange={(e) => onChange({ ...v, value: parseFloat(e.target.value) || 0 })} />}
      {v.type === 'boolean' && <input type="checkbox" checked={!!val} onChange={(e) => onChange({ ...v, value: e.target.checked })} />}
      {(v.type === 'string' || v.type === 'any') && <input className="inp" value={String(val ?? '')} onChange={(e) => onChange({ ...v, value: e.target.value })} />}
      {v.type === 'vector' && (
        <>
          <input className="inp" type="number" value={val?.x ?? 0} onChange={(e) => onChange({ ...v, value: { ...val, x: parseFloat(e.target.value) || 0 } })} />
          <input className="inp" type="number" value={val?.y ?? 0} onChange={(e) => onChange({ ...v, value: { ...val, y: parseFloat(e.target.value) || 0 } })} />
        </>
      )}
      <button className="ibtn" onClick={onDelete} title="Delete variable">✕</button>
    </div>
  );
}

function usage(p: Project, graphId: string) {
  let n = 0;
  for (const s of Object.values(p.scenes)) for (const e of s.entities) if (e.components.some((c) => c.type === 'logic' && c.graphId === graphId)) n++;
  return n;
}

export function GraphList() {
  const project = useProject((s) => s.project);
  const activeId = useEditor((s) => s.activeGraphId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const g = activeId ? project.graphs[activeId] : undefined;
  useEffect(() => { editor().set({ logicView: 'graph' }); }, []);
  const editVars = (scope: 'graph' | 'global', f: (vars: VariableDef[]) => VariableDef[]) =>
    commit('Edit variables', (d) => {
      if (scope === 'global') d.variables = f(d.variables);
      else if (activeId && d.graphs[activeId]) d.graphs[activeId].variables = f(d.graphs[activeId].variables);
    }, 'vars' + scope);

  return (
    <div>
      <Section title="Graphs" actions={<button className="btn sm" onClick={() => { const ng = newGraph('New Graph'); commit('New graph', (d) => { d.graphs[ng.id] = ng; }); editor().set({ activeGraphId: ng.id }); setRenaming(ng.id); }}>+ Graph</button>}>
        {Object.values(project.graphs).map((x) => (
          <div key={x.id} className={'list-item' + (x.id === activeId ? ' sel' : '')} onClick={() => editor().set({ activeGraphId: x.id, selectedNodeIds: [] })}>
            <EditableName value={x.name} editing={renaming === x.id} setEditing={(b) => setRenaming(b ? x.id : null)} onChange={(v) => commit('Rename graph', (d) => { d.graphs[x.id].name = v; })} />
            <span className="dim small" title="Objects using this graph">{usage(project, x.id)}×</span>
          </div>
        ))}
        {g && (
          <div className="row" style={{ marginTop: 4 }}>
            <button className="btn sm" onClick={() => setRenaming(g.id)}>Rename</button>
            <button className="btn sm" onClick={() => {
              const copy = structuredClone(g);
              copy.id = uid('g'); copy.name = g.name + ' copy';
              commit('Duplicate graph', (d) => { d.graphs[copy.id] = copy; });
              editor().set({ activeGraphId: copy.id });
            }}>Duplicate</button>
            <button className="btn sm danger" onClick={() => {
              const n = usage(project, g.id);
              if (!confirm(`Delete graph "${g.name}"?${n ? ` ${n} object(s) use it.` : ''}`)) return;
              commit('Delete graph', (d) => {
                delete d.graphs[g.id];
                for (const s of Object.values(d.scenes)) for (const e of s.entities) for (const c of e.components) if (c.type === 'logic' && c.graphId === g.id) c.graphId = null;
              });
              editor().set({ activeGraphId: Object.keys(project.graphs).find((k) => k !== g.id) ?? null });
            }}>Delete</button>
          </div>
        )}
      </Section>
      {g && (
        <Section title={'Graph variables'} actions={<button className="btn sm" onClick={() => editVars('graph', (vs) => [...vs, { id: uid('v'), name: 'var' + (vs.length + 1), type: 'number', value: 0 }])}>+ Var</button>}>
          {g.variables.map((v) => <VarRow key={v.id} v={v} onChange={(nv) => editVars('graph', (vs) => vs.map((x) => (x.id === v.id ? nv : x)))} onDelete={() => editVars('graph', (vs) => vs.filter((x) => x.id !== v.id))} />)}
        </Section>
      )}
      <Section title="Global variables" actions={<button className="btn sm" onClick={() => editVars('global', (vs) => [...vs, { id: uid('v'), name: 'global' + (vs.length + 1), type: 'number', value: 0 }])}>+ Var</button>}>
        {project.variables.map((v) => <VarRow key={v.id} v={v} onChange={(nv) => editVars('global', (vs) => vs.map((x) => (x.id === v.id ? nv : x)))} onDelete={() => editVars('global', (vs) => vs.filter((x) => x.id !== v.id))} />)}
      </Section>
      <Section title="Saved sections">
        {Object.values(project.snippets).map((s) => (
          <div key={s.id} className="list-item">
            <span className="name">⧉ {s.name}</span>
            <span className="dim small">{s.nodes.length} nodes</span>
            <button className="ibtn" onClick={() => commit('Delete section', (d) => { delete d.snippets[s.id]; })}>✕</button>
          </div>
        ))}
      </Section>
    </div>
  );
}
