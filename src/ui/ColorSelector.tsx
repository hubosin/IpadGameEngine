import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, editor } from '../core/editorStore';
import { commit, useProject } from '../core/store';
import { uid } from '../core/ids';
import type { Palette, Project } from '../core/types';
import { IconBtn } from './Icon';

/**
 * Colors: an "active color" swatch that opens a picker popover, plus a palette docker for
 * saving, adding, removing and editing colors in named palettes (stored in the project).
 */

function hexToHsv(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, max ? d / max : 0, max];
}

function hsvToHex(h: number, s: number, v: number) {
  const f = (k: number) => { const kk = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(kk, 4 - kk, 1)); };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

/** Make a color the active painting color (brush + vector fill). */
export function setColor(hex: string, remember = false) {
  const ed = editor();
  const patch: Partial<ReturnType<typeof editor>> = { brush: { ...ed.brush, color: hex } };
  if (ed.vectorStyle.fill !== null) patch.vectorStyle = { ...ed.vectorStyle, fill: hex };
  if (remember) patch.recentColors = [hex, ...ed.recentColors.filter((c) => c !== hex)].slice(0, 16);
  ed.set(patch);
}

/** Saturation/value square + hue strip + hex field + recent colors. */
export function ColorPicker({ value, onChange, onDone }: { value: string; onChange: (hex: string) => void; onDone?: (hex: string) => void }) {
  const recent = useEditor((s) => s.recentColors);
  const sq = useRef<HTMLCanvasElement>(null);
  const hueRef = useRef<HTMLCanvasElement>(null);
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hex, setHex] = useState(value);

  useEffect(() => {
    setHex(value);
    if (hsvToHex(...hsv) !== value.toLowerCase()) {
      const n = hexToHsv(value);
      setHsv(n[1] === 0 ? [hsv[0], n[1], n[2]] : n); // keep hue on greys
    }
  }, [value]);

  useEffect(() => {
    const c = sq.current, hc = hueRef.current;
    if (!c || !hc) return;
    c.width = c.clientWidth; c.height = c.clientHeight;
    const w = c.width, h = c.height;
    const g = c.getContext('2d')!;
    g.fillStyle = hsvToHex(hsv[0], 1, 1);
    g.fillRect(0, 0, w, h);
    const wg = g.createLinearGradient(0, 0, w, 0); wg.addColorStop(0, '#fff'); wg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = wg; g.fillRect(0, 0, w, h);
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, '#000');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = hsv[2] > 0.5 ? '#000' : '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(hsv[1] * w, (1 - hsv[2]) * h, 6, 0, Math.PI * 2); g.stroke();
    hc.width = hc.clientWidth; hc.height = hc.clientHeight;
    const hg = hc.getContext('2d')!;
    const grad = hg.createLinearGradient(0, 0, hc.width, 0);
    for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, hsvToHex((i * 60) % 360, 1, 1));
    hg.fillStyle = grad; hg.fillRect(0, 0, hc.width, hc.height);
    hg.fillStyle = '#fff';
    hg.fillRect((hsv[0] / 360) * hc.width - 2, 0, 4, hc.height);
  });

  const pos = (el: HTMLElement, e: React.PointerEvent): [number, number] => {
    const r = el.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const apply = (n: [number, number, number]) => { setHsv(n); onChange(hsvToHex(...n)); };
  const sv = (e: React.PointerEvent) => { const [x, y] = pos(e.currentTarget as HTMLElement, e); apply([hsv[0], x, 1 - y]); };
  const hue = (e: React.PointerEvent) => { const [x] = pos(e.currentTarget as HTMLElement, e); apply([x * 359.9, hsv[1], hsv[2]]); };
  const done = () => onDone?.(hsvToHex(...hsv));

  return (
    <div className="colorsel">
      <canvas ref={sq} className="sv"
        onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } sv(e); }}
        onPointerMove={(e) => { if (e.buttons) sv(e); }} onPointerUp={done} />
      <canvas ref={hueRef} className="hue"
        onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } hue(e); }}
        onPointerMove={(e) => { if (e.buttons) hue(e); }} onPointerUp={done} />
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <span className="cur" style={{ background: value }} />
        <input className="inp" value={hex} onChange={(e) => setHex(e.target.value)}
          onBlur={() => { const h = hex.trim().replace(/^([0-9a-f]{6})$/i, '#$1').toLowerCase(); if (/^#[0-9a-f]{6}$/.test(h)) { onChange(h); onDone?.(h); } else setHex(value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      </div>
      <div className="recent">
        {recent.map((c) => <span key={c} style={{ background: c }} title={c} onClick={() => { onChange(c); onDone?.(c); }} />)}
      </div>
    </div>
  );
}

/** Floating picker anchored next to an element; closes on outside tap or Escape. */
export function ColorPopover({ anchor, value, onChange, onClose, title }: {
  anchor: HTMLElement; value: string; onChange: (hex: string) => void; onClose: (finalHex: string) => void; title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(value);
  latest.current = value;
  const [pos, setPos] = useState({ left: -9999, top: 0 });
  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect(), w = 240, h = ref.current?.offsetHeight ?? 300;
    let left = a.right + 8, top = a.top;
    if (left + w > window.innerWidth - 8) left = a.left - w - 8;
    if (left < 8) left = Math.min(window.innerWidth - w - 8, Math.max(8, a.left));
    if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
    setPos({ left, top: Math.max(8, top) });
  }, [anchor]);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(latest.current); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(latest.current); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key); };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className="color-pop" style={pos}>
      {title && <div className="color-pop-title">{title}</div>}
      <ColorPicker value={value} onChange={onChange} />
    </div>,
    document.body,
  );
}

/** The active color. Tap it to pick a new one. */
export function ActiveColor({ size = 30 }: { size?: number }) {
  const color = useEditor((s) => s.brush.color);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button className={'swatch' + (anchor ? ' open' : '')} style={{ background: color, width: size, height: size }} title="Active color"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} />
      {anchor && (
        <ColorPopover anchor={anchor} value={color} title="Active color"
          onChange={(h) => setColor(h)}
          onClose={() => { setColor(editor().brush.color, true); setAnchor(null); }} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- palettes

function activePalette(p: Project, id: string | null): Palette | undefined {
  return p.palettes.find((x) => x.id === id) ?? p.palettes[0];
}
function editPalette(id: string, label: string, f: (pal: Palette) => void, mergeKey?: string) {
  commit(label, (d) => { const pal = d.palettes.find((x) => x.id === id); if (pal) f(pal); }, mergeKey);
}

export function PaletteDocker() {
  const palettes = useProject((s) => s.project.palettes);
  const project = useProject((s) => s.project);
  const activeId = useEditor((s) => s.activePaletteId);
  const sel = useEditor((s) => s.swatchIndex);
  const color = useEditor((s) => s.brush.color);
  const pal = activePalette(project, activeId);
  const [edit, setEdit] = useState<{ anchor: HTMLElement; index: number } | null>(null);

  const newPalette = () => {
    const name = prompt('Palette name', 'New Palette');
    if (!name) return;
    const np = { id: uid('pal'), name, colors: [color] };
    commit('New palette', (d) => { d.palettes.push(np); });
    editor().set({ activePaletteId: np.id, swatchIndex: 0 });
  };

  return (
    <div className="palette">
      <div className="row" style={{ flexWrap: 'nowrap', marginBottom: 4 }}>
        <ActiveColor size={34} />
        <select className="inp" value={pal?.id ?? ''} onChange={(e) => editor().set({ activePaletteId: e.target.value, swatchIndex: null })}>
          {palettes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {pal && (
        <>
          <div className="swatches">
            {pal.colors.map((c, i) => (
              <span key={i} className={'sw' + (sel === i ? ' sel' : '')} style={{ background: c }} title={c + ' (double-click to edit)'}
                onClick={() => { setColor(c, true); editor().set({ swatchIndex: i }); }}
                onDoubleClick={(e) => { editor().set({ swatchIndex: i }); setEdit({ anchor: e.currentTarget, index: i }); }} />
            ))}
            <button className="sw add" title="Add active color" onClick={() => {
              editPalette(pal.id, 'Add color', (x) => { x.colors.push(color); });
              editor().set({ swatchIndex: pal.colors.length });
            }}>+</button>
          </div>
          <div className="toolrow" style={{ marginTop: 4 }}>
            <IconBtn icon="pen" size={13} title="Edit selected color" disabled={sel == null} onClick={(e) => { if (sel != null) setEdit({ anchor: e.currentTarget as HTMLElement, index: sel }); }} />
            <IconBtn icon="pipette" size={13} title="Replace selected with active color" disabled={sel == null} onClick={() => sel != null && editPalette(pal.id, 'Replace color', (x) => { x.colors[sel] = color; })} />
            <IconBtn icon="chevUp" size={13} title="Move earlier" disabled={!sel} onClick={() => { if (!sel) return; editPalette(pal.id, 'Reorder colors', (x) => { [x.colors[sel - 1], x.colors[sel]] = [x.colors[sel], x.colors[sel - 1]]; }); editor().set({ swatchIndex: sel - 1 }); }} />
            <IconBtn icon="chevDown" size={13} title="Move later" disabled={sel == null || sel >= pal.colors.length - 1} onClick={() => { if (sel == null) return; editPalette(pal.id, 'Reorder colors', (x) => { [x.colors[sel + 1], x.colors[sel]] = [x.colors[sel], x.colors[sel + 1]]; }); editor().set({ swatchIndex: sel + 1 }); }} />
            <IconBtn icon="x" size={13} title="Remove selected color" disabled={sel == null} onClick={() => {
              if (sel == null) return;
              editPalette(pal.id, 'Remove color', (x) => { x.colors.splice(sel, 1); });
              editor().set({ swatchIndex: null });
            }} />
            <span className="grow" />
            <IconBtn icon="plus" size={13} title="New palette" onClick={newPalette} />
            <IconBtn icon="copy" size={13} title="Duplicate palette" disabled={!pal} onClick={() => {
          if (!pal) return;
          const np = { id: uid('pal'), name: pal.name + ' copy', colors: [...pal.colors] };
          commit('Duplicate palette', (d) => { d.palettes.push(np); });
          editor().set({ activePaletteId: np.id });
        }} />
            <IconBtn icon="comment" size={13} title="Rename palette" disabled={!pal} onClick={() => { const n = pal && prompt('Rename palette', pal.name); if (pal && n) editPalette(pal.id, 'Rename palette', (x) => { x.name = n; }); }} />
            <IconBtn icon="trash" size={13} title="Delete palette" disabled={!pal || palettes.length < 2} onClick={() => {
          if (!pal || !confirm(`Delete palette "${pal.name}"?`)) return;
          commit('Delete palette', (d) => { d.palettes = d.palettes.filter((x) => x.id !== pal.id); });
          editor().set({ activePaletteId: null, swatchIndex: null });
        }} />
          </div>
        </>
      )}
      {edit && pal && (
        <ColorPopover anchor={edit.anchor} value={pal.colors[edit.index] ?? color} title="Edit swatch"
          onChange={(h) => editPalette(pal.id, 'Edit color', (x) => { x.colors[edit.index] = h; }, 'sw' + pal.id + edit.index)}
          onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

