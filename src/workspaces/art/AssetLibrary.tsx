import { useState } from 'react';
import { commit, useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { newAsset } from '../../core/defaults';
import { uid } from '../../core/ids';
import { pickFile, readFileAsDataUrl } from '../../core/storage';
import type { Asset, AssetKind } from '../../core/types';
import { loadImage } from '../../render/imageCache';
import { makeCanvas } from '../../render/surface';
import { AssetThumb } from '../../ui/AssetThumb';
import { EditableName } from '../../ui/widgets';
import { placeAsset } from '../world/worldOps';
import { worldViewCenter } from '../world/WorldViewport';
import { Icon, IconBtn } from '../../ui/Icon';

const KINDS: AssetKind[] = ['sprite', 'background', 'texture', 'vector', 'tileset', 'animated', 'particle'];

export function AssetLibrary() {
  const project = useProject((s) => s.project);
  const activeId = useEditor((s) => s.activeAssetId);
  const [folder, setFolder] = useState<string | null>(null); // null = all
  const [renaming, setRenaming] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; kind: AssetKind; w: number; h: number } | null>(null);
  const folders = Object.values(project.assetFolders);
  const assets = Object.values(project.assets).filter((a) => folder === null || a.folderId === folder || (folder === '' && !a.folderId));
  const active = activeId ? project.assets[activeId] : undefined;

  const select = (id: string) => editor().set({ activeAssetId: id, activeFrameId: null, activeLayerId: null, selectedPathId: null });
  const create = () => {
    if (!form) return;
    const a = newAsset(form.name || 'New Asset', form.kind, Math.max(1, Math.min(4096, form.w)), Math.max(1, Math.min(4096, form.h)), folder || null);
    commit('New asset', (d) => { d.assets[a.id] = a; });
    select(a.id);
    setForm(null);
  };
  const importImage = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    const url = await readFileAsDataUrl(f);
    const img = await loadImage(url);
    const w = Math.min(4096, img.naturalWidth), h = Math.min(4096, img.naturalHeight);
    const c = makeCanvas(w, h);
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const a = newAsset(f.name.replace(/\.[^.]+$/, ''), 'sprite', w, h, folder || null);
    const doc = a.art!;
    doc.layers[0].cels[doc.frames[0].id] = { tiles: { '0,0': c.toDataURL('image/png') } };
    commit('Import image', (d) => { d.assets[a.id] = a; });
    select(a.id);
  };
  const importAudio = async () => {
    const f = await pickFile('audio/*');
    if (!f) return;
    const a: Asset = { id: uid('a'), name: f.name.replace(/\.[^.]+$/, ''), kind: 'audio', folderId: folder || null, audio: { data: await readFileAsDataUrl(f) } };
    commit('Import audio', (d) => { d.assets[a.id] = a; });
  };
  const duplicate = (a: Asset) => {
    const copy = structuredClone(a);
    copy.id = uid('a');
    copy.name = a.name + ' copy';
    commit('Duplicate asset', (d) => { d.assets[copy.id] = copy; });
    select(copy.id);
  };
  const remove = (a: Asset) => {
    const uses = Object.values(project.scenes).reduce((n, s) => n + s.entities.filter((e) => e.components.some((c) => (c.type === 'sprite' || c.type === 'audio') && c.assetId === a.id)).length, 0);
    if (!confirm(`Delete "${a.name}"?${uses ? ` It is used by ${uses} object(s), which will lose it.` : ''}`)) return;
    commit('Delete asset', (d) => {
      delete d.assets[a.id];
      for (const s of Object.values(d.scenes)) for (const e of s.entities) for (const c of e.components) if ((c.type === 'sprite' || c.type === 'audio') && c.assetId === a.id) c.assetId = null;
    });
    editor().set({ activeAssetId: null });
  };

  return (
    <div>
      <div className="toolrow">
        <IconBtn icon="plus" title="New asset" onClick={() => setForm({ name: 'New Sprite', kind: 'sprite', w: 64, h: 64 })} />
        <IconBtn icon="upload" title="Import image" onClick={importImage} />
        <IconBtn icon="music" title="Import sound" onClick={importAudio} />
      </div>
      {form && (
        <div className="section">
          <div className="field"><label>Name</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Type</label>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AssetKind })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          </div>
          <div className="field"><label>Size</label>
            <input type="number" value={form.w} onChange={(e) => setForm({ ...form, w: Number(e.target.value) })} />×
            <input type="number" value={form.h} onChange={(e) => setForm({ ...form, h: Number(e.target.value) })} />
          </div>
          <div className="row">
            {[[32, 32], [64, 64], [128, 128], [256, 256], [960, 540]].map(([w, h]) => <button key={w + 'x' + h} className="btn sm" onClick={() => setForm({ ...form, w, h })}>{w}×{h}</button>)}
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn primary" onClick={create}>Create</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="section">
        <div className="section-title" style={{ cursor: 'default' }}>
          Folders <span className="grow" />
          <button className="btn sm" onClick={() => {
            const id = uid('af');
            commit('New folder', (d) => { d.assetFolders[id] = { id, name: 'New Folder', parentId: null }; });
            setFolder(id); setRenaming(id);
          }}>+ Folder</button>
        </div>
        <div className={'list-item' + (folder === null ? ' sel' : '')} onClick={() => setFolder(null)}><span className="name">All assets</span></div>
        <div className={'list-item' + (folder === '' ? ' sel' : '')} onClick={() => setFolder('')}><span className="name dim">Unsorted</span></div>
        {folders.map((f) => (
          <div key={f.id} className={'list-item' + (folder === f.id ? ' sel' : '')} onClick={() => setFolder(f.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { const id = e.dataTransfer.getData('text/x-asset'); if (id) commit('Move asset', (d) => { if (d.assets[id]) d.assets[id].folderId = f.id; }); }}>
            <span className="ico"><Icon name="folder" size={13} /></span>
            <EditableName value={f.name} editing={renaming === f.id} setEditing={(b) => setRenaming(b ? f.id : null)} onChange={(v) => commit('Rename folder', (d) => { d.assetFolders[f.id].name = v; })} />
            <button className="ibtn" title="Delete folder (assets are kept)" onClick={(e) => {
              e.stopPropagation();
              commit('Delete folder', (d) => { delete d.assetFolders[f.id]; for (const a of Object.values(d.assets)) if (a.folderId === f.id) a.folderId = null; });
              setFolder(null);
            }}>✕</button>
          </div>
        ))}
      </div>
      <div className="asset-grid">
        {assets.map((a) => (
          <div key={a.id} className={'asset-card' + (a.id === activeId ? ' sel' : '')} onClick={() => select(a.id)} draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/x-asset', a.id); e.dataTransfer.effectAllowed = 'copyMove'; }}>
            <AssetThumb asset={a} />
            <span className="name" title={a.name}>{a.name}</span>
            <span className="dim small">{a.kind}</span>
          </div>
        ))}
      </div>
      {active && (
        <div className="section" style={{ marginTop: 8 }}>
          <div className="section-title" style={{ cursor: 'default' }}>{active.name}</div>
          <div className="row">
            <button className="btn sm" onClick={() => { const n = prompt('Rename asset', active.name); if (n) commit('Rename asset', (d) => { d.assets[active.id].name = n; }); }}>Rename</button>
            <button className="btn sm" onClick={() => duplicate(active)}>Duplicate</button>
            {active.art && <button className="btn sm" onClick={() => { editor().set({ workspace: 'world' }); placeAsset(active.id, worldViewCenter().x, worldViewCenter().y); }}>Place in world</button>}
            <button className="btn sm danger" onClick={() => remove(active)}>Delete</button>
          </div>
          <div className="field" style={{ marginTop: 4 }}><label>Folder</label>
            <select value={active.folderId ?? ''} onChange={(e) => commit('Move asset', (d) => { d.assets[active.id].folderId = e.target.value || null; })}>
              <option value="">(unsorted)</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {active.kind === 'audio' && active.audio && <audio controls src={active.audio.data} style={{ width: '100%' }} />}
        </div>
      )}
    </div>
  );
}
