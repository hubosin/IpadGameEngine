import { useEffect, useRef, useState } from 'react';
import { useEditor, editor } from '../core/editorStore';
import { commit, useProject } from '../core/store';
import { fullBrush } from '../core/defaults';
import { uid } from '../core/ids';
import { pickFile, readFileAsDataUrl } from '../core/storage';
import type { BrushPreset, BrushResource, BrushSettings } from '../core/types';
import { BrushStroke } from '../render/brush';
import { BUILTIN_GRAINS, BUILTIN_TIPS, grainPreview, tipMask } from '../render/brushTips';
import { loadImage, onImageLoad } from '../render/imageCache';
import { TiledSurface, makeCanvas } from '../render/surface';
import { IconBtn } from './Icon';
import { Check, Section, Select, Slider } from './widgets';

/** Brush engine settings: presets, tip, paper texture and dynamics (shared by Art and World painting). */

const setBrush = (patch: Partial<BrushSettings>) => editor().set({ brush: { ...editor().brush, ...patch } });

function applyPreset(p: BrushPreset) {
  editor().set({ brush: { ...fullBrush(p.settings), color: editor().brush.color } });
}

/** Compact preset dropdown for toolbars. */
export function PresetSelect() {
  const presets = useProject((s) => s.project.brushPresets);
  return (
    <select className="inp" style={{ width: 120, flex: 'none' }} value="" onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) applyPreset(p); }}>
      <option value="">Brushes…</option>
      {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

/** Live stroke preview of brush settings. */
function StrokePreview({ settings, resources, w = 92, h = 34 }: { settings: BrushSettings; resources: BrushResource[]; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => onImageLoad(() => setTick((x) => x + 1)), []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = w * 2, H = h * 2;
    c.width = W; c.height = H;
    const surf = new TiledSurface(W, H, true);
    const size = Math.min(settings.size * 2, H * 0.55);
    const st = new BrushStroke(surf, { ...settings, color: '#e8e8e8', size: Math.max(2, size), opacity: Math.max(0.35, settings.opacity), smoothing: 0, sizeJitter: settings.sizeJitter, scatter: Math.min(settings.scatter, 0.4) }, false, resources);
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = W * 0.08 + t * W * 0.84, y = H / 2 + Math.sin(t * Math.PI * 2) * H * 0.22;
      const p = 0.35 + Math.sin(t * Math.PI) * 0.65;
      if (i === 0) st.begin(x, y, p); else st.move(x, y, p);
    }
    st.end();
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    surf.draw(g);
  }, [JSON.stringify(settings), resources, tick]);
  return <canvas ref={ref} style={{ width: w, height: h, display: 'block' }} />;
}

function Thumb({ draw, on, title, onClick, onRemove }: { draw: (g: CanvasRenderingContext2D, s: number) => boolean; on: boolean; title: string; onClick: () => void; onRemove?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => onImageLoad(() => setTick((x) => x + 1)), []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 64; c.height = 64;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 64, 64);
    draw(g, 64);
  });
  return (
    <div className={'bthumb' + (on ? ' on' : '')} title={title} onClick={onClick}>
      <canvas ref={ref} />
      {onRemove && <button className="bthumb-x" title="Remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>}
      <span style={{ display: 'none' }}>{tick}</span>
    </div>
  );
}

async function importResource(kind: 'tip' | 'grain'): Promise<string | null> {
  const f = await pickFile('image/*');
  if (!f) return null;
  const img = await loadImage(await readFileAsDataUrl(f));
  // keep projects small: brush images never need to be huge
  const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const r: BrushResource = { id: uid(kind === 'tip' ? 'tip' : 'grain'), name: f.name.replace(/\.[^.]+$/, ''), kind, data: c.toDataURL('image/png') };
  commit(kind === 'tip' ? 'Import brush tip' : 'Import texture', (d) => { d.brushResources.push(r); });
  return r.id;
}

function removeResource(r: BrushResource) {
  if (!confirm(`Remove "${r.name}" from this project?`)) return;
  commit('Remove brush image', (d) => { d.brushResources = d.brushResources.filter((x) => x.id !== r.id); });
  const b = editor().brush;
  if (b.tip === r.id) setBrush({ tip: 'round' });
  if (b.grain === r.id) setBrush({ grain: null });
}

/** Brush library: saved brushes, tip shapes and paper textures. */
export function BrushLibrary({ eraser, tabbed }: { eraser?: boolean; tabbed?: boolean }) {
  const [tab, setTab] = useState<'brushes' | 'tip' | 'texture'>('brushes');
  const cur = eraser && tab === 'texture' ? 'brushes' : tab; // erasers have no texture
  const show = (t: typeof tab) => !tabbed || cur === t;
  const b = useEditor((s) => s.brush);
  const presets = useProject((s) => s.project.brushPresets);
  const resources = useProject((s) => s.project.brushResources);
  const [selPreset, setSelPreset] = useState<string | null>(null);
  const tips = resources.filter((r) => r.kind === 'tip');
  const grains = resources.filter((r) => r.kind === 'grain');
  const sel = presets.find((p) => p.id === selPreset);
  const pct = (v: number) => Math.round(v * 100) + '%';

  const drawTip = (id: string) => (g: CanvasRenderingContext2D, s: number) => {
    const m = tipMask(id, resources);
    if (!m) return false;
    const k = (s * 0.84) / Math.max(m.width, m.height);
    g.drawImage(m, (s - m.width * k) / 2, (s - m.height * k) / 2, m.width * k, m.height * k);
    return true;
  };
  const drawGrain = (id: string) => (g: CanvasRenderingContext2D, s: number) => {
    const m = grainPreview(id, resources);
    if (!m) return false;
    g.drawImage(m, 0, 0, s, s);
    return true;
  };

  return (
    <>
      {tabbed && (
        <div className="segtabs">
          {(['brushes', 'tip', 'texture'] as const).filter((t) => !(eraser && t === 'texture')).map((t) => (
            <button key={t} className={cur === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'brushes' ? 'Brushes' : t === 'tip' ? 'Tip' : 'Texture'}</button>
          ))}
        </div>
      )}
      {show('brushes') && <Section title="Brushes">
        <div className="presets">
          {presets.map((p) => (
            <div key={p.id} className={'preset' + (p.id === selPreset ? ' on' : '')} title={p.name}
              onClick={() => { applyPreset(p); setSelPreset(p.id); }}>
              <StrokePreview settings={fullBrush(p.settings)} resources={resources} />
              <span>{p.name}</span>
            </div>
          ))}
        </div>
        <div className="toolrow" style={{ marginTop: 4 }}>
          <IconBtn icon="plus" size={13} title="Save current settings as a new brush" onClick={() => {
            const n = prompt('Brush name', 'My Brush');
            if (!n) return;
            const np: BrushPreset = { id: uid('bp'), name: n, settings: { ...editor().brush } };
            commit('Save brush', (d) => { d.brushPresets.push(np); });
            setSelPreset(np.id);
          }} />
          <IconBtn icon="check" size={13} title="Overwrite selected brush with current settings" disabled={!sel} onClick={() => sel && commit('Update brush', (d) => { const x = d.brushPresets.find((y) => y.id === sel.id); if (x) x.settings = { ...editor().brush }; })} />
          <IconBtn icon="comment" size={13} title="Rename selected brush" disabled={!sel} onClick={() => { const n = sel && prompt('Rename brush', sel.name); if (sel && n) commit('Rename brush', (d) => { const x = d.brushPresets.find((y) => y.id === sel.id); if (x) x.name = n; }); }} />
          <IconBtn icon="copy" size={13} title="Duplicate selected brush" disabled={!sel} onClick={() => { if (!sel) return; const np = { ...structuredClone(sel), id: uid('bp'), name: sel.name + ' copy' }; commit('Duplicate brush', (d) => { d.brushPresets.push(np); }); setSelPreset(np.id); }} />
          <span className="grow" />
          <IconBtn icon="trash" size={13} title="Delete selected brush" disabled={!sel} onClick={() => { if (sel && confirm(`Delete brush "${sel.name}"?`)) { commit('Delete brush', (d) => { d.brushPresets = d.brushPresets.filter((x) => x.id !== sel.id); }); setSelPreset(null); } }} />
        </div>
      </Section>}

      {show('tip') && <Section title={eraser ? 'Eraser tip' : 'Tip'}>
        <div className="bthumbs">
          {BUILTIN_TIPS.map((t) => <Thumb key={t.id} title={t.name} on={b.tip === t.id} draw={drawTip(t.id)} onClick={() => setBrush({ tip: t.id })} />)}
          {tips.map((r) => <Thumb key={r.id} title={r.name} on={b.tip === r.id} draw={drawTip(r.id)} onClick={() => setBrush({ tip: r.id })} onRemove={() => removeResource(r)} />)}
          <button className="bthumb add" title="Import a brush tip image (black or transparent PNG shapes)" onClick={async () => { const id = await importResource('tip'); if (id) setBrush({ tip: id }); }}>+</button>
        </div>
      </Section>}

      {!eraser && show('texture') && (
        <Section title="Texture">
          <div className="bthumbs">
            <Thumb title="None" on={!b.grain} draw={(g, s) => { g.strokeStyle = '#888'; g.lineWidth = 3; g.beginPath(); g.moveTo(s * 0.25, s * 0.75); g.lineTo(s * 0.75, s * 0.25); g.stroke(); return true; }} onClick={() => setBrush({ grain: null })} />
            {BUILTIN_GRAINS.map((t) => <Thumb key={t.id} title={t.name} on={b.grain === t.id} draw={drawGrain(t.id)} onClick={() => setBrush({ grain: t.id })} />)}
            {grains.map((r) => <Thumb key={r.id} title={r.name} on={b.grain === r.id} draw={drawGrain(r.id)} onClick={() => setBrush({ grain: r.id })} onRemove={() => removeResource(r)} />)}
            <button className="bthumb add" title="Import a paper/texture image (light = more paint)" onClick={async () => { const id = await importResource('grain'); if (id) setBrush({ grain: id }); }}>+</button>
          </div>
          {b.grain && <Slider label="Scale" min={0.25} max={4} value={b.grainScale} display={(v) => v.toFixed(2) + '×'} onChange={(v) => setBrush({ grainScale: v })} />}
          {b.grain && <Slider label="Strength" min={0} max={1} value={b.grainStrength} display={pct} onChange={(v) => setBrush({ grainStrength: v })} />}
        </Section>
      )}

    </>
  );
}

/** Brush behavior: size/opacity, flow, spacing, shape and dynamics. */
export function BrushOptions({ eraser, compact }: { eraser?: boolean; compact?: boolean }) {
  const b = useEditor((s) => s.brush);
  const pct = (v: number) => Math.round(v * 100) + '%';
  return (
    <>
      <Section title={eraser ? 'Eraser' : 'Brush'}>
        {!compact && <Slider label="Size" min={1} max={300} step={1} value={b.size} onChange={(v) => setBrush({ size: v })} />}
        {!compact && <Slider label="Opacity" min={0.01} max={1} value={b.opacity} display={pct} onChange={(v) => setBrush({ opacity: v })} />}
        {(!compact && b.tip === 'round') && <Slider label="Hardness" min={0} max={1} value={b.hardness} display={pct} onChange={(v) => setBrush({ hardness: v })} />}
        <Slider label="Flow" min={0.01} max={1} value={b.flow} display={pct} onChange={(v) => setBrush({ flow: v })} />
        <Slider label="Spacing" min={0.02} max={1.5} value={b.spacing} display={pct} onChange={(v) => setBrush({ spacing: v })} />
      </Section>
      <Section title="Shape & dynamics">
        <Slider label="Angle" min={0} max={180} step={1} value={b.angle} display={(v) => Math.round(v) + '°'} onChange={(v) => setBrush({ angle: v })} />
        <Slider label="Roundness" min={0.05} max={1} value={b.roundness} display={pct} onChange={(v) => setBrush({ roundness: v })} />
        <Select label="Rotation" value={b.rotation} options={[{ value: 'fixed', label: 'Fixed' }, { value: 'follow', label: 'Follow stroke' }, { value: 'random', label: 'Random' }]} onChange={(v) => setBrush({ rotation: v })} />
        <Slider label="Scatter" min={0} max={2} value={b.scatter} display={pct} onChange={(v) => setBrush({ scatter: v })} />
        <Slider label="Size jitter" min={0} max={1} value={b.sizeJitter} display={pct} onChange={(v) => setBrush({ sizeJitter: v })} />
        <Slider label="Opacity jitter" min={0} max={1} value={b.opacityJitter} display={pct} onChange={(v) => setBrush({ opacityJitter: v })} />
        <Slider label="Smoothing" min={0} max={0.95} value={b.smoothing} display={pct} onChange={(v) => setBrush({ smoothing: v })} />
        <Check label="Pressure → size" value={b.pressureSize} onChange={(v) => setBrush({ pressureSize: v })} title="Pen / Apple Pencil pressure changes brush size" />
        <Check label="Pressure → opacity" value={b.pressureOpacity} onChange={(v) => setBrush({ pressureOpacity: v })} />
      </Section>
    </>
  );
}

/** Everything together (used by World painting, which has a single inspector). */
export function BrushPanel({ eraser }: { eraser?: boolean }) {
  return (
    <>
      <BrushLibrary eraser={eraser} />
      <BrushOptions eraser={eraser} />
    </>
  );
}
