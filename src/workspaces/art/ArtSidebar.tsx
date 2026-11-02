import { useState } from 'react';
import { commit, useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { useAsset, activeFrameId, activeLayerId } from '../../core/selectors';
import type { AssetKind, VectorPath } from '../../core/types';
import { downloadDataUrl, safeFileName } from '../../core/storage';
import { getFrameCanvas } from '../../render/compose';
import { makeCanvas } from '../../render/surface';
import { BrushOptions } from '../../ui/BrushPanel';
import { Check, ColorField, EditableName, NumField, Section, Select, Slider, TextField } from '../../ui/widgets';
import { addLayer, editCel, editLayer } from './artOps';
import { uid } from '../../core/ids';
import { Icon, IconBtn } from '../../ui/Icon';

const KINDS: AssetKind[] = ['sprite', 'background', 'texture', 'vector', 'tileset', 'animated', 'particle'];

export function ArtSidebar() {
  const tool = useEditor((s) => s.artTool);
  const vs = useEditor((s) => s.vectorStyle);
  const tol = useEditor((s) => s.fillTolerance);
  const selectedPathId = useEditor((s) => s.selectedPathId);
  const asset = useAsset();
  const fid = useEditor((s) => activeFrameId(asset, s.activeFrameId));
  const lid = useEditor((s) => activeLayerId(asset, s.activeLayerId));
  const doc = asset?.art;
  const layer = doc?.layers.find((l) => l.id === lid);
  const path = layer?.kind === 'vector' && fid ? layer.cels[fid]?.paths?.find((p) => p.id === selectedPathId) : undefined;
  const editPath = (label: string, f: (p: VectorPath) => void, mk?: string) => {
    if (!asset || !lid || !fid || !path) return;
    editCel(label, asset.id, lid, fid, (cel) => { const p = cel.paths?.find((x) => x.id === path.id); if (p) f(p); }, mk);
  };
  const isVectorTool = tool === 'pen' || tool === 'rect' || tool === 'ellipse' || tool === 'direct';

  return (
    <div>
      {(tool === 'brush' || tool === 'eraser') && <BrushOptions eraser={tool === 'eraser'} compact />}
      {tool === 'fill' && (
        <Section title="Fill">
          <ColorField label="Color" value={useEditor.getState().brush.color} onChange={(v) => editor().set({ brush: { ...editor().brush, color: v ?? '#000000' } })} />
          <Slider label="Tolerance" min={0} max={255} step={1} value={tol} onChange={(v) => editor().set({ fillTolerance: v })} />
        </Section>
      )}
      {isVectorTool && (
        <Section title="New shape style">
          <ColorField label="Fill" allowNone value={vs.fill} onChange={(v) => editor().set({ vectorStyle: { ...vs, fill: v } })} />
          <ColorField label="Stroke" allowNone value={vs.stroke} onChange={(v) => editor().set({ vectorStyle: { ...vs, stroke: v } })} />
          <NumField label="Stroke width" min={0} value={vs.strokeWidth} onChange={(v) => editor().set({ vectorStyle: { ...vs, strokeWidth: v } })} />
        </Section>
      )}
      {path && (
        <Section title="Selected path">
          <ColorField label="Fill" allowNone value={path.fill} onChange={(v) => editPath('Path fill', (p) => { p.fill = v; }, 'pf' + path.id)} />
          <ColorField label="Stroke" allowNone value={path.stroke} onChange={(v) => editPath('Path stroke', (p) => { p.stroke = v; }, 'ps' + path.id)} />
          <NumField label="Stroke width" min={0} value={path.strokeWidth} onChange={(v) => editPath('Stroke width', (p) => { p.strokeWidth = v; }, 'pw' + path.id)} />
          <Check label="Closed" value={path.closed} onChange={(v) => editPath('Close path', (p) => { p.closed = v; })} />
          <div className="row">
            <button className="btn sm" onClick={() => editPath('Flip path', (p) => { const b = bounds(p); p.points = p.points.map((q) => ({ x: 2 * b.cx - q.x, y: q.y, ix: 2 * b.cx - q.ix, iy: q.iy, ox: 2 * b.cx - q.ox, oy: q.oy })); })}>Flip H</button>
            <button className="btn sm" onClick={() => editPath('Flip path', (p) => { const b = bounds(p); p.points = p.points.map((q) => ({ x: q.x, y: 2 * b.cy - q.y, ix: q.ix, iy: 2 * b.cy - q.iy, ox: q.ox, oy: 2 * b.cy - q.oy })); })}>Flip V</button>
            <button className="btn sm" onClick={() => {
              if (!asset || !lid || !fid) return;
              editCel('Path order', asset.id, lid, fid, (cel) => { const ps = cel.paths!; const i = ps.findIndex((x) => x.id === path.id); if (i < ps.length - 1) [ps[i], ps[i + 1]] = [ps[i + 1], ps[i]]; });
            }}>Bring forward</button>
            <button className="btn sm danger" onClick={() => { if (asset && lid && fid) { editCel('Delete path', asset.id, lid, fid, (cel) => { cel.paths = cel.paths!.filter((x) => x.id !== path.id); }); editor().set({ selectedPathId: null }); } }}>Delete</button>
          </div>
        </Section>
      )}
      {asset && <AssetProps />}
    </div>
  );
}

function bounds(p: VectorPath) {
  const xs = p.points.map((q) => q.x), ys = p.points.map((q) => q.y);
  return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function AssetProps() {
  const asset = useAsset()!;
  const fid = useEditor((s) => activeFrameId(asset, s.activeFrameId));
  const doc = asset.art;
  const edit = (label: string, f: (a: typeof asset) => void) => commit(label, (d) => { const a = d.assets[asset.id]; if (a) f(a); });
  const exportPng = () => {
    if (!doc || !fid) return;
    downloadDataUrl(safeFileName(asset.name) + '.png', getFrameCanvas(doc, fid).toDataURL('image/png'));
  };
  const exportSheet = () => {
    if (!doc) return;
    const c = makeCanvas(doc.width * doc.frames.length, doc.height);
    const g = c.getContext('2d')!;
    doc.frames.forEach((f, i) => g.drawImage(getFrameCanvas(doc, f.id), i * doc.width, 0));
    downloadDataUrl(safeFileName(asset.name) + '_sheet.png', c.toDataURL('image/png'));
  };
  return (
    <Section title="Asset">
      <TextField label="Name" value={asset.name} onChange={(v) => edit('Rename asset', (a) => { a.name = v; })} />
      {doc && <Select label="Type" value={asset.kind} options={KINDS} onChange={(v) => edit('Asset type', (a) => { a.kind = v; if (v === 'tileset' && !a.tile) a.tile = { w: 16, h: 16 }; })} />}
      {asset.kind === 'tileset' && asset.tile && (
        <>
          <NumField label="Tile width" min={1} value={asset.tile.w} onChange={(v) => edit('Tile size', (a) => { a.tile!.w = v; })} />
          <NumField label="Tile height" min={1} value={asset.tile.h} onChange={(v) => edit('Tile size', (a) => { a.tile!.h = v; })} />
        </>
      )}
      {doc && <div className="dim small">Canvas {doc.width} × {doc.height}px · {doc.layers.length} layers · {doc.frames.length} frames</div>}
      {doc && (
        <div className="row" style={{ marginTop: 4 }}>
          <button className="btn sm" onClick={exportPng}>Export PNG</button>
          {doc.frames.length > 1 && <button className="btn sm" onClick={exportSheet}>Export sprite sheet</button>}
        </div>
      )}
    </Section>
  );
}

export function LayersPanel() {
  const asset = useAsset();
  const lid = useEditor((s) => activeLayerId(asset, s.activeLayerId));
  const [renaming, setRenaming] = useState<string | null>(null);
  const doc = asset?.art;
  if (!asset || !doc) return <div className="hint">No art asset selected.</div>;
  const active = doc.layers.find((l) => l.id === lid);
  const groups = doc.layers.filter((l) => l.kind === 'group');
  const depth = (id: string | null): number => { let n = 0; for (let l = doc.layers.find((x) => x.id === id); l?.parentId && n < 16; l = doc.layers.find((x) => x.id === l!.parentId)) n++; return n; };
  const move = (dir: number) => {
    if (!active) return;
    commit('Reorder layers', (d) => {
      const ls = d.assets[asset.id].art!.layers;
      const i = ls.findIndex((l) => l.id === active.id), j = i + dir;
      if (j < 0 || j >= ls.length) return;
      [ls[i], ls[j]] = [ls[j], ls[i]];
    });
  };
  return (
    <div>
      <div className="toolrow">
        <IconBtn icon="plus" title="New raster layer" onClick={() => addLayer('raster')} />
        <IconBtn icon="pen" title="New vector layer" onClick={() => addLayer('vector')} />
        <IconBtn icon="folderPlus" title="New group" onClick={() => addLayer('group')} />
        <span className="grow" />
        <IconBtn icon="chevUp" title="Move up" disabled={!active} onClick={() => move(1)} />
        <IconBtn icon="chevDown" title="Move down" disabled={!active} onClick={() => move(-1)} />
        <IconBtn icon="copy" title="Duplicate layer" disabled={!active} onClick={() => {
          if (!active) return;
          const copy = structuredClone(active);
          copy.id = uid('l');
          copy.name = active.name + ' copy';
          commit('Duplicate layer', (d) => { const ls = d.assets[asset.id].art!.layers; ls.splice(ls.findIndex((l) => l.id === active.id) + 1, 0, copy); });
          editor().set({ activeLayerId: copy.id });
        }} />
        <IconBtn icon="trash" title="Delete layer" disabled={!active || doc.layers.length < 2} onClick={() => {
          if (!active) return;
          commit('Delete layer', (d) => {
            const art = d.assets[asset.id].art!;
            art.layers = art.layers.filter((l) => l.id !== active.id).map((l) => (l.parentId === active.id ? { ...l, parentId: active.parentId } : l));
          });
          editor().set({ activeLayerId: null });
        }} />
      </div>
      {[...doc.layers].reverse().map((l) => (
        <div key={l.id} className={'list-item' + (l.id === lid ? ' sel' : '')} style={{ paddingLeft: 4 + depth(l.id) * 14, opacity: l.visible ? 1 : 0.5 }} onClick={() => editor().set({ activeLayerId: l.id })}>
          <span className="ico" title={l.kind}><Icon name={l.kind === 'group' ? 'folder' : l.kind === 'vector' ? 'pen' : 'image'} size={13} /></span>
          <EditableName value={l.name} editing={renaming === l.id} setEditing={(b) => setRenaming(b ? l.id : null)} onChange={(v) => editLayer('Rename layer', l.id, (x) => { x.name = v; })} />
          <button className="ibtn on" onClick={(e) => { e.stopPropagation(); editLayer('Toggle layer', l.id, (x) => { x.visible = !x.visible; }); }}><Icon name={l.visible ? 'eye' : 'eyeOff'} size={14} /></button>
          <button className="ibtn on" onClick={(e) => { e.stopPropagation(); editLayer('Lock layer', l.id, (x) => { x.locked = !x.locked; }); }}><Icon name={l.locked ? 'lock' : 'unlock'} size={14} /></button>
        </div>
      ))}
      {active && (
        <Section title={'Layer: ' + active.name}>
          <Slider label="Opacity" min={0} max={1} value={active.opacity} onChange={(v) => editLayer('Layer opacity', active.id, (x) => { x.opacity = v; }, 'lop' + active.id)} display={(v) => Math.round(v * 100) + '%'} />
          {active.kind !== 'group' && (
            <Select label="In group" value={active.parentId ?? ''} options={[{ value: '', label: '(none)' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
              onChange={(v) => editLayer('Move to group', active.id, (x) => { x.parentId = v || null; })} />
          )}
          {active.kind === 'raster' && <button className="btn sm danger" onClick={() => { const f = activeFrameId(asset, editor().activeFrameId); if (f) editCel('Clear layer', asset.id, active.id, f, (cel) => { cel.tiles = {}; }); }}>Clear this frame</button>}
        </Section>
      )}
    </div>
  );
}
