import { useEffect, useState } from 'react';
import { commit, useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { defaultForField, newSchema } from '../../core/defaults';
import { uid } from '../../core/ids';
import type { DataField, DataFieldType, DataSchema, Project } from '../../core/types';
import { Icon, IconBtn } from '../../ui/Icon';
import { EditableName, Section } from '../../ui/widgets';

/**
 * Scriptable objects: a data type (schema) defines fields; data assets are instances that
 * objects and graphs reference (shared stats, item definitions, level settings...).
 */

const FIELD_TYPES: DataFieldType[] = ['number', 'boolean', 'string', 'vector', 'color', 'asset', 'prefab', 'data'];

function editSchema(id: string, label: string, f: (s: DataSchema) => void, mk?: string) {
  commit(label, (d) => { const s = d.dataSchemas[id]; if (s) f(s); }, mk);
}

export function createSchema() {
  const s = newSchema('New Type');
  commit('New data type', (d) => { d.dataSchemas[s.id] = s; });
  editor().set({ activeSchemaId: s.id, logicView: 'data' });
}

export function DataList() {
  const project = useProject((s) => s.project);
  const activeId = useEditor((s) => s.activeSchemaId);
  const [renaming, setRenaming] = useState<string | null>(null);
  useEffect(() => { editor().set({ logicView: 'data' }); }, []);
  return (
    <Section title="Data types" actions={<IconBtn icon="plus" title="New data type" onClick={createSchema} />}>
      {Object.values(project.dataSchemas).map((s) => (
        <div key={s.id} className={'list-item' + (s.id === activeId ? ' sel' : '')} onClick={() => editor().set({ activeSchemaId: s.id })}>
          <span className="ico"><Icon name="bookmark" size={13} /></span>
          <EditableName value={s.name} editing={renaming === s.id} setEditing={(b) => setRenaming(b ? s.id : null)} onChange={(v) => editSchema(s.id, 'Rename type', (x) => { x.name = v; })} />
          <span className="dim small">{Object.values(project.dataAssets).filter((a) => a.schemaId === s.id).length}</span>
        </div>
      ))}
    </Section>
  );
}

function FieldValue({ field, value, project, onChange }: { field: DataField; value: unknown; project: Project; onChange: (v: unknown) => void }) {
  const v = value === undefined ? field.default : value;
  switch (field.type) {
    case 'number': return <input className="inp" type="number" value={Number(v ?? 0)} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />;
    case 'boolean': return <input type="checkbox" className="check" checked={!!v} onChange={(e) => onChange(e.target.checked)} />;
    case 'color': return <input type="color" value={String(v ?? '#ffffff')} onChange={(e) => onChange(e.target.value)} style={{ width: 40, height: 22, border: 'none', background: 'none' }} />;
    case 'vector': {
      const p = (v as { x: number; y: number }) ?? { x: 0, y: 0 };
      return (
        <span className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="inp" type="number" value={p.x} onChange={(e) => onChange({ ...p, x: parseFloat(e.target.value) || 0 })} />
          <input className="inp" type="number" value={p.y} onChange={(e) => onChange({ ...p, y: parseFloat(e.target.value) || 0 })} />
        </span>
      );
    }
    case 'asset': case 'prefab': case 'data': {
      const opts = field.type === 'asset' ? Object.values(project.assets).map((a) => [a.id, a.name])
        : field.type === 'prefab' ? Object.values(project.prefabs).map((a) => [a.id, a.name])
          : Object.values(project.dataAssets).filter((a) => !field.ref || a.schemaId === field.ref).map((a) => [a.id, a.name]);
      return (
        <select className="inp" value={String(v ?? '')} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {opts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      );
    }
    default: return <input className="inp" value={String(v ?? '')} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function DataEditor() {
  const project = useProject((s) => s.project);
  const id = useEditor((s) => s.activeSchemaId);
  const schema = id ? project.dataSchemas[id] : undefined;
  if (!schema) {
    return <div className="hint" style={{ paddingTop: 40 }}><button className="btn primary" onClick={createSchema}><Icon name="plus" size={13} /> New data type</button></div>;
  }
  const assets = Object.values(project.dataAssets).filter((a) => a.schemaId === schema.id);
  const addAsset = () => {
    const a = { id: uid('da'), name: schema.name + ' ' + (assets.length + 1), schemaId: schema.id, values: {} };
    commit('New data asset', (d) => { d.dataAssets[a.id] = a; });
  };
  const setValue = (aid: string, fid: string, v: unknown) => commit('Edit data', (d) => { d.dataAssets[aid].values[fid] = v; }, 'dv' + aid + fid);
  return (
    <div className="panel-body" style={{ position: 'absolute', inset: 0, padding: 12 }}>
      <Section title={'Fields of ' + schema.name} actions={<IconBtn icon="plus" title="Add field" onClick={() => editSchema(schema.id, 'Add field', (s) => { s.fields.push({ id: uid('df'), name: 'field' + (s.fields.length + 1), type: 'number', default: 0 }); })} />}>
        <table className="dtable">
          <thead><tr><th>Name</th><th>Type</th><th>Default</th><th /></tr></thead>
          <tbody>
            {schema.fields.map((f, i) => (
              <tr key={f.id}>
                <td><input className="inp" defaultValue={f.name} onBlur={(e) => e.target.value && editSchema(schema.id, 'Rename field', (s) => { s.fields[i].name = e.target.value; })} /></td>
                <td>
                  <select className="inp" value={f.type} onChange={(e) => editSchema(schema.id, 'Field type', (s) => { const t = e.target.value as DataFieldType; s.fields[i].type = t; s.fields[i].default = defaultForField(t); })}>
                    {FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  {f.type === 'data' && (
                    <select className="inp" value={f.ref ?? ''} onChange={(e) => editSchema(schema.id, 'Field ref', (s) => { s.fields[i].ref = e.target.value || null; })}>
                      <option value="">any type</option>
                      {Object.values(project.dataSchemas).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                </td>
                <td><FieldValue field={f} value={f.default} project={project} onChange={(v) => editSchema(schema.id, 'Field default', (s) => { s.fields[i].default = v; }, 'fd' + f.id)} /></td>
                <td><IconBtn icon="x" size={12} title="Remove field" onClick={() => editSchema(schema.id, 'Remove field', (s) => { s.fields.splice(i, 1); })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Assets" actions={<IconBtn icon="plus" title="New asset of this type" onClick={addAsset} />}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dtable">
            <thead><tr><th>Name</th>{schema.fields.map((f) => <th key={f.id}>{f.name}</th>)}<th /></tr></thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td><input className="inp" defaultValue={a.name} onBlur={(e) => e.target.value && commit('Rename data', (d) => { d.dataAssets[a.id].name = e.target.value; })} /></td>
                  {schema.fields.map((f) => <td key={f.id}><FieldValue field={f} value={a.values[f.id]} project={project} onChange={(v) => setValue(a.id, f.id, v)} /></td>)}
                  <td className="row" style={{ flexWrap: 'nowrap' }}>
                    <IconBtn icon="copy" size={12} title="Duplicate" onClick={() => { const c = { ...structuredClone(a), id: uid('da'), name: a.name + ' copy' }; commit('Duplicate data', (d) => { d.dataAssets[c.id] = c; }); }} />
                    <IconBtn icon="trash" size={12} title="Delete" onClick={() => commit('Delete data', (d) => { delete d.dataAssets[a.id]; })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <div className="row">
        <button className="btn sm danger" onClick={() => {
          if (!confirm(`Delete type "${schema.name}" and its ${assets.length} asset(s)?`)) return;
          commit('Delete data type', (d) => { delete d.dataSchemas[schema.id]; for (const a of assets) delete d.dataAssets[a.id]; });
          editor().set({ activeSchemaId: null });
        }}>Delete type</button>
      </div>
    </div>
  );
}
