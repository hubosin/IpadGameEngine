import { useState } from 'react';
import { commit, useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { useScene } from '../../core/selectors';
import { treeOrder } from '../../core/sceneUtils';
import { newScene } from '../../core/defaults';
import { uid } from '../../core/ids';
import { ColorField, EditableName, NumField, Slider } from '../../ui/widgets';
import { addEmpty, createPrefab, deleteSelected, draftScene, duplicateSelected, reparent } from './worldOps';
import { Icon, IconBtn } from '../../ui/Icon';

export function SceneTree() {
  const scene = useScene();
  const selection = useEditor((s) => s.selection);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string | null; mode: 'inside' | 'before' | 'after' } | null>(null);
  const rows = treeOrder(scene.entities);
  const hasKids = new Set(scene.entities.map((e) => e.parentId).filter(Boolean) as string[]);
  const hiddenBy = (id: string | null): boolean => {
    for (let i = 0; id && i < 64; i++) {
      if (collapsed.has(id)) return true;
      id = scene.entities.find((e) => e.id === id)?.parentId ?? null;
    }
    return false;
  };
  const layerName = new Map(scene.layers.map((l) => [l.id, l.name]));
  const select = (id: string, add: boolean) => {
    const sel = editor().selection;
    editor().set({ selection: add ? (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]) : [id] });
  };
  const toggle = (id: string, field: 'visible' | 'locked') => commit(field === 'visible' ? 'Toggle visibility' : 'Toggle lock', (d) => {
    const e = draftScene(d).entities.find((x) => x.id === id);
    if (e) e[field] = !e[field];
  });
  const moveSibling = (dir: -1 | 1) => {
    const id = selection[0];
    const e = scene.entities.find((x) => x.id === id);
    if (!e) return;
    const sibs = scene.entities.filter((x) => x.parentId === e.parentId);
    const i = sibs.indexOf(e), j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    reparent(id, dir < 0 ? 'before' : 'after', sibs[j].id);
  };
  const sel0 = scene.entities.find((e) => e.id === selection[0]);

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData('text/x-entity'); if (id) reparent(id, 'inside', null); setDrop(null); }} style={{ minHeight: '100%' }}>
      <div className="toolrow">
        <IconBtn icon="plus" title="Add object" onClick={() => addEmpty('object')} />
        <IconBtn icon="folderPlus" title="Add folder" onClick={() => addEmpty('folder')} />
        <IconBtn icon="copy" title="Duplicate (Ctrl+D)" disabled={!selection.length} onClick={() => duplicateSelected()} />
        <IconBtn icon="star" title="Make prefab" disabled={!sel0 || sel0.kind !== 'object'} onClick={() => sel0 && createPrefab(sel0.id)} />
        <span className="grow" />
        <IconBtn icon="chevUp" title="Move up" disabled={!sel0} onClick={() => moveSibling(-1)} />
        <IconBtn icon="chevDown" title="Move down" disabled={!sel0} onClick={() => moveSibling(1)} />
        <IconBtn icon="x" title="Unparent" disabled={!sel0?.parentId} onClick={() => sel0 && reparent(sel0.id, 'inside', null)} />
        <IconBtn icon="trash" title="Delete (Del)" disabled={!selection.length} onClick={deleteSelected} />
      </div>
      {rows.filter((r) => !hiddenBy(r.e.parentId)).map(({ e, depth }) => (
        <div key={e.id}
          className={'list-item' + (selection.includes(e.id) ? ' sel' : '') + (drop?.id === e.id ? ' drop-' + (drop.mode === 'inside' ? 'in' : drop.mode) : '')}
          style={{ paddingLeft: 4 + depth * 14, opacity: e.visible ? 1 : 0.5 }}
          draggable={renaming !== e.id}
          onDragStart={(ev) => { ev.dataTransfer.setData('text/x-entity', e.id); ev.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(ev) => {
            ev.preventDefault(); ev.stopPropagation();
            const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
            const f = (ev.clientY - r.top) / r.height;
            setDrop({ id: e.id, mode: f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'inside' });
          }}
          onDragLeave={() => setDrop(null)}
          onDrop={(ev) => {
            ev.preventDefault(); ev.stopPropagation();
            const id = ev.dataTransfer.getData('text/x-entity');
            if (id && drop) reparent(id, drop.mode, e.id);
            setDrop(null);
          }}
          onClick={(ev) => select(e.id, ev.shiftKey || ev.ctrlKey || ev.metaKey)}>
          <span className="ibtn" style={{ visibility: hasKids.has(e.id) ? 'visible' : 'hidden' }}
            onClick={(ev) => { ev.stopPropagation(); const s = new Set(collapsed); if (s.has(e.id)) s.delete(e.id); else s.add(e.id); setCollapsed(s); }}>
            <Icon name={collapsed.has(e.id) ? 'chevRight' : 'chevDown'} size={12} />
          </span>
          <span className="ico"><Icon name={e.kind === 'folder' ? 'folder' : e.prefabId ? 'star' : 'object'} size={13} /></span>
          <EditableName value={e.name} editing={renaming === e.id} setEditing={(b) => setRenaming(b ? e.id : null)}
            onChange={(v) => commit('Rename', (d) => { const x = draftScene(d).entities.find((y) => y.id === e.id); if (x) x.name = v; })} />
          <span className="dim small">{layerName.get(e.layerId)}</span>
          <button className={'ibtn' + (e.visible ? ' on' : '')} title="Visible" onClick={(ev) => { ev.stopPropagation(); toggle(e.id, 'visible'); }}><Icon name={e.visible ? 'eye' : 'eyeOff'} size={14} /></button>
          <button className={'ibtn' + (e.locked ? ' on' : '')} title="Locked" onClick={(ev) => { ev.stopPropagation(); toggle(e.id, 'locked'); }}><Icon name={e.locked ? 'lock' : 'unlock'} size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export function WorldLayersPanel() {
  const scene = useScene();
  const active = useEditor((s) => s.activeWorldLayerId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const edit = (label: string, id: string, f: (l: (typeof scene.layers)[0]) => void, mergeKey?: string) =>
    commit(label, (d) => { const l = draftScene(d).layers.find((x) => x.id === id); if (l) f(l); }, mergeKey);
  const move = (id: string, dir: number) => commit('Reorder layers', (d) => {
    const ls = draftScene(d).layers;
    const i = ls.findIndex((l) => l.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= ls.length) return;
    [ls[i], ls[j]] = [ls[j], ls[i]];
  });
  const sel = scene.layers.find((l) => l.id === active);
  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <button className="btn sm" onClick={() => {
          const id = uid('wl');
          commit('Add world layer', (d) => { draftScene(d).layers.push({ id, name: 'New Layer', visible: true, locked: false, opacity: 1, parallax: 1, paint: {} }); });
          editor().set({ activeWorldLayerId: id });
        }}><Icon name="plus" size={13} /> Layer</button>
        <button className="btn sm danger" disabled={!sel || scene.layers.length < 2} onClick={() => {
          if (!sel) return;
          const n = scene.entities.filter((e) => e.layerId === sel.id).length;
          if (!confirm(`Delete layer "${sel.name}"? Its painting is removed${n ? ` and ${n} object(s) move to another layer` : ''}.`)) return;
          commit('Delete world layer', (d) => {
            const s = draftScene(d);
            s.layers = s.layers.filter((l) => l.id !== sel.id);
            for (const e of s.entities) if (e.layerId === sel.id) e.layerId = s.layers[0].id;
          });
          editor().set({ activeWorldLayerId: null });
        }}>Delete</button>
      </div>
      {[...scene.layers].reverse().map((l) => (
        <div key={l.id} className={'list-item' + (l.id === active ? ' sel' : '')} onClick={() => editor().set({ activeWorldLayerId: l.id })}>
          <EditableName value={l.name} editing={renaming === l.id} setEditing={(b) => setRenaming(b ? l.id : null)} onChange={(v) => edit('Rename layer', l.id, (x) => { x.name = v; })} />
          <span className="dim small">{Object.keys(l.paint).length ? '🖌' : ''}</span>
          <button className="ibtn" onClick={(e) => { e.stopPropagation(); move(l.id, 1); }} title="Move up"><Icon name="chevUp" size={13} /></button>
          <button className="ibtn" onClick={(e) => { e.stopPropagation(); move(l.id, -1); }} title="Move down"><Icon name="chevDown" size={13} /></button>
          <button className="ibtn on" onClick={(e) => { e.stopPropagation(); edit('Toggle layer', l.id, (x) => { x.visible = !x.visible; }); }}><Icon name={l.visible ? 'eye' : 'eyeOff'} size={14} /></button>
          <button className="ibtn on" onClick={(e) => { e.stopPropagation(); edit('Lock layer', l.id, (x) => { x.locked = !x.locked; }); }}><Icon name={l.locked ? 'lock' : 'unlock'} size={14} /></button>
        </div>
      ))}
      {sel && (
        <div className="section" style={{ marginTop: 8 }}>
          <div className="section-title">Layer: {sel.name}</div>
          <Slider label="Opacity" min={0} max={1} value={sel.opacity} onChange={(v) => edit('Layer opacity', sel.id, (x) => { x.opacity = v; }, 'wlop' + sel.id)} />
          <NumField label="Parallax" step={0.05} value={sel.parallax} title="1 = moves with camera, 0 = fixed to screen, <1 = distant background" onChange={(v) => edit('Layer parallax', sel.id, (x) => { x.parallax = v; }, 'wlpar' + sel.id)} />
          <button className="btn sm danger" disabled={!Object.keys(sel.paint).length} onClick={() => confirm('Clear all painting on this layer?') && edit('Clear layer paint', sel.id, (x) => { x.paint = {}; })}>Clear painting</button>
        </div>
      )}
    </div>
  );
}

export function ScenesPanel() {
  const project = useProject((s) => s.project);
  const active = useScene();
  const [renaming, setRenaming] = useState<string | null>(null);
  const ws = useEditor((s) => s.workspace);
  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <button className="btn sm" onClick={() => {
          const s = newScene('Scene ' + (project.sceneOrder.length + 1));
          commit('Add scene', (d) => { d.scenes[s.id] = s; d.sceneOrder.push(s.id); });
          editor().set({ activeSceneId: s.id, selection: [] });
        }}><Icon name="plus" size={13} /> Scene</button>
        <button className="btn sm" onClick={() => {
          const copy = structuredClone(active);
          copy.id = uid('s'); copy.name = active.name + ' copy';
          commit('Duplicate scene', (d) => { d.scenes[copy.id] = copy; d.sceneOrder.push(copy.id); });
          editor().set({ activeSceneId: copy.id, selection: [] });
        }}>Duplicate</button>
        <button className="btn sm danger" disabled={project.sceneOrder.length < 2} onClick={() => {
          if (!confirm(`Delete scene "${active.name}"?`)) return;
          commit('Delete scene', (d) => {
            delete d.scenes[active.id];
            d.sceneOrder = d.sceneOrder.filter((x) => x !== active.id);
            if (d.settings.startSceneId === active.id) d.settings.startSceneId = d.sceneOrder[0];
          });
          editor().set({ activeSceneId: null, selection: [] });
        }}>Delete</button>
      </div>
      {project.sceneOrder.map((id) => {
        const s = project.scenes[id];
        return (
          <div key={id} className={'list-item' + (id === active.id ? ' sel' : '')} onClick={() => editor().set({ activeSceneId: id, previewSceneId: id, selection: [] })}>
            <span title={project.settings.startSceneId === id ? 'Start scene' : 'Make start scene'} className="ibtn"
              onClick={(e) => { e.stopPropagation(); commit('Set start scene', (d) => { d.settings.startSceneId = id; }); }}>
              <Icon name="star" size={13} fill={project.settings.startSceneId === id} />
            </span>
            <EditableName value={s.name} editing={renaming === id} setEditing={(b) => setRenaming(b ? id : null)} onChange={(v) => commit('Rename scene', (d) => { d.scenes[id].name = v; })} />
            <span className="dim small">{s.entities.length} obj</span>
          </div>
        );
      })}
      <div className="section" style={{ marginTop: 8 }}>
        <ColorField label="Background" value={active.background} onChange={(v) => commit('Scene background', (d) => { d.scenes[active.id].background = v ?? '#000000'; }, 'scbg')} />
      </div>
    </div>
  );
}
