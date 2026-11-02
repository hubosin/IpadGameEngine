import { useEffect, useMemo, useRef, useState } from 'react';
import { commit, useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { useScene } from '../../core/selectors';
import { newUIElement } from '../../core/defaults';
import type { Project, UIElement, UIKind } from '../../core/types';
import { drawUI, hitUI, uiRect, uiScale } from '../../runtime/ui';
import { onImageLoad } from '../../render/imageCache';
import { capture } from '../../ui/viewport';
import { Icon, IconBtn, type IconName } from '../../ui/Icon';
import { Check, ColorField, EditableName, NumField, Section, Select, Slider, TextField } from '../../ui/widgets';
import { draftScene } from './worldOps';

const ASPECTS = [
  { label: '16:9', v: 16 / 9 }, { label: 'iPad 4:3', v: 4 / 3 }, { label: 'iPad Pro', v: 1.43 }, { label: 'Phone', v: 19.5 / 9 },
];
const KINDS: { kind: UIKind; icon: IconName; tip: string }[] = [
  { kind: 'text', icon: 'comment', tip: 'Text' },
  { kind: 'button', icon: 'rect', tip: 'Button' },
  { kind: 'panel', icon: 'panelBottom', tip: 'Panel' },
  { kind: 'image', icon: 'image', tip: 'Image' },
  { kind: 'bar', icon: 'layers', tip: 'Bar' },
];

function editUI(id: string, label: string, f: (e: UIElement) => void, mk?: string) {
  commit(label, (d) => { const e = draftScene(d).ui.find((x) => x.id === id); if (e) f(e); }, mk);
}

export function addUI(kind: UIKind) {
  const e = newUIElement(kind);
  commit('Add UI ' + kind, (d) => { draftScene(d).ui.push(e); });
  editor().set({ uiSelection: e.id });
}

/** Frame of the simulated screen inside the editor viewport. */
function frameOf(W: number, H: number, aspect: number) {
  const left = 64, pad = 24, top = 56; // clear of the floating toolbars
  let fw = W - left - pad, fh = fw / aspect;
  if (fh > H - top - pad) { fh = H - top - pad; fw = fh * aspect; }
  return { ox: left + (W - left - pad - fw) / 2, oy: top + (H - top - pad - fh) / 2, fw, fh };
}

export function UIEditor() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'size'; sx: number; sy: number; x0: number; y0: number; w0: number; h0: number; s: number } | null>(null);
  const aspect = useEditor((s) => s.uiAspect);
  const [, force] = useState(0);

  const invalidate = useMemo(() => {
    let pending = false;
    return () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; draw(); }); };
  }, []);

  function geometry() {
    const el = wrap.current!;
    const p = useProject.getState().project;
    const f = frameOf(el.clientWidth, el.clientHeight, useEditor.getState().uiAspect);
    return { p, f, view: { cw: f.fw, ch: f.fh, W: p.settings.width, H: p.settings.height, ox: f.ox, oy: f.oy } };
  }

  function draw() {
    const canvas = canvasRef.current, el = wrap.current;
    if (!canvas || !el) return;
    const W = el.clientWidth, H = el.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const ctx = canvas.getContext('2d')!;
    const { p, f, view } = geometry();
    const scene = sceneFor(p);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1d1d1d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = scene.background;
    ctx.fillRect(f.ox, f.oy, f.fw, f.fh);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(f.ox, f.oy, f.fw, f.fh);
    const vars = new Map(p.variables.map((v) => [v.name, v.value]));
    drawUI(ctx, scene.ui, { ...view, dpr }, p, new Map(), (n) => vars.get(n), true);
    // selection
    const sel = scene.ui.find((e) => e.id === useEditor.getState().uiSelection);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (sel) {
      const { s, sw, sh } = uiScale(view);
      const r = uiRect(sel, sw, sh);
      const x = f.ox + r.x * s, y = f.oy + r.y * s, w = r.w * s, h = r.h * s;
      ctx.strokeStyle = '#e3913a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#e3913a';
      ctx.fillRect(x + w - 5, y + h - 5, 10, 10);
      // anchor marker
      const ax = f.ox + sel.anchorX * f.fw, ay = f.oy + sel.anchorY * f.fh;
      ctx.beginPath(); ctx.moveTo(ax - 6, ay); ctx.lineTo(ax + 6, ay); ctx.moveTo(ax, ay - 6); ctx.lineTo(ax, ay + 6); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(f.ox - 0.5, f.oy - 0.5, f.fw + 1, f.fh + 1);
  }

  useEffect(() => {
    const ro = new ResizeObserver(invalidate);
    ro.observe(wrap.current!);
    const u1 = useProject.subscribe(invalidate), u2 = useEditor.subscribe(invalidate), u3 = onImageLoad(invalidate);
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const id = editor().uiSelection;
      if (!id) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); commit('Delete UI', (d) => { const sc = draftScene(d); sc.ui = sc.ui.filter((x) => x.id !== id); }); editor().set({ uiSelection: null }); }
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const k = e.shiftKey ? 10 : 1;
        editUI(id, 'Nudge UI', (x) => { x.x += e.key === 'ArrowLeft' ? -k : e.key === 'ArrowRight' ? k : 0; x.y += e.key === 'ArrowUp' ? -k : e.key === 'ArrowDown' ? k : 0; }, 'uinudge');
      }
    };
    window.addEventListener('keydown', key);
    invalidate();
    return () => { ro.disconnect(); u1(); u2(); u3(); window.removeEventListener('keydown', key); };
  }, []);

  const local = (e: React.PointerEvent) => { const r = wrap.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function onDown(e: React.PointerEvent) {
    capture(e);
    const { p, f, view } = geometry();
    const scene = sceneFor(p);
    const q = local(e);
    const { s, sw, sh } = uiScale(view);
    const sel = scene.ui.find((x) => x.id === editor().uiSelection);
    if (sel) {
      const r = uiRect(sel, sw, sh);
      const hx = f.ox + (r.x + r.w) * s, hy = f.oy + (r.y + r.h) * s;
      if (Math.hypot(q.x - hx, q.y - hy) < (e.pointerType === 'touch' ? 18 : 10)) {
        useProject.getState().begin();
        drag.current = { id: sel.id, mode: 'size', sx: q.x, sy: q.y, x0: sel.x, y0: sel.y, w0: sel.w, h0: sel.h, s };
        return;
      }
    }
    const hit = hitUI(scene.ui, q.x, q.y, view, new Map(), true);
    editor().set({ uiSelection: hit?.id ?? null });
    if (hit) {
      useProject.getState().begin();
      drag.current = { id: hit.id, mode: 'move', sx: q.x, sy: q.y, x0: hit.x, y0: hit.y, w0: hit.w, h0: hit.h, s };
    }
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const q = local(e);
    const dx = (q.x - d.sx) / d.s, dy = (q.y - d.sy) / d.s;
    useProject.getState().live((dr) => {
      const el = draftScene(dr).ui.find((x) => x.id === d.id);
      if (!el) return;
      if (d.mode === 'move') { el.x = Math.round(d.x0 + dx); el.y = Math.round(d.y0 + dy); }
      else {
        el.w = Math.max(8, Math.round(d.w0 + dx)); el.h = Math.max(8, Math.round(d.h0 + dy));
        // keep the top-left corner fixed regardless of pivot
        el.x = Math.round(d.x0 + el.pivotX * (el.w - d.w0)); el.y = Math.round(d.y0 + el.pivotY * (el.h - d.h0));
      }
    });
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (d) useProject.getState().end(d.mode === 'move' ? 'Move UI' : 'Resize UI');
    force((x) => x + 1);
  }

  return (
    <div className="viewport" ref={wrap}>
      <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <div className="float vert toolbox">
        {KINDS.map((k) => <IconBtn key={k.kind} icon={k.icon} title={'Add ' + k.tip} onClick={() => addUI(k.kind)} />)}
      </div>
      <div className="float topright">
        <ModeSwitch />
        <span className="sep" />
        <select value={aspect} onChange={(e) => editor().set({ uiAspect: Number(e.target.value) })} title="Preview screen shape">
          {ASPECTS.map((a) => <option key={a.label} value={a.v}>{a.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function sceneFor(p: Project) {
  const id = useEditor.getState().activeSceneId;
  return (id && p.scenes[id]) || p.scenes[p.sceneOrder[0]];
}

/** World / UI segmented switch used in both World viewports. */
export function ModeSwitch() {
  const mode = useEditor((s) => s.worldMode);
  return (
    <>
      <button className={'pill' + (mode === 'world' ? ' on' : '')} style={mode === 'world' ? { background: 'var(--accent)', color: '#fff' } : undefined} onClick={() => editor().set({ worldMode: 'world' })}>World</button>
      <button className={'pill' + (mode === 'ui' ? ' on' : '')} style={mode === 'ui' ? { background: 'var(--accent)', color: '#fff' } : undefined} onClick={() => editor().set({ worldMode: 'ui' })}>UI</button>
    </>
  );
}

export function UIList() {
  const scene = useScene();
  const sel = useEditor((s) => s.uiSelection);
  const [renaming, setRenaming] = useState<string | null>(null);
  const move = (dir: number) => sel && commit('Reorder UI', (d) => {
    const list = draftScene(d).ui;
    const i = list.findIndex((x) => x.id === sel), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  });
  const icon = (k: UIKind): IconName => KINDS.find((x) => x.kind === k)!.icon;
  return (
    <div>
      <div className="toolrow">
        {KINDS.map((k) => <IconBtn key={k.kind} icon={k.icon} title={'Add ' + k.tip} onClick={() => addUI(k.kind)} />)}
        <span className="grow" />
        <IconBtn icon="chevUp" title="Bring forward" disabled={!sel} onClick={() => move(1)} />
        <IconBtn icon="chevDown" title="Send back" disabled={!sel} onClick={() => move(-1)} />
        <IconBtn icon="trash" title="Delete" disabled={!sel} onClick={() => { commit('Delete UI', (d) => { const sc = draftScene(d); sc.ui = sc.ui.filter((x) => x.id !== sel); }); editor().set({ uiSelection: null }); }} />
      </div>
      {[...scene.ui].reverse().map((e) => (
        <div key={e.id} className={'list-item' + (e.id === sel ? ' sel' : '')} onClick={() => editor().set({ uiSelection: e.id })} style={{ opacity: e.visible ? 1 : 0.5 }}>
          <span className="ico"><Icon name={icon(e.kind)} size={13} /></span>
          <EditableName value={e.name} editing={renaming === e.id} setEditing={(b) => setRenaming(b ? e.id : null)} onChange={(v) => editUI(e.id, 'Rename UI', (x) => { x.name = v; })} />
          <button className="ibtn" onClick={(ev) => { ev.stopPropagation(); editUI(e.id, 'Toggle UI', (x) => { x.visible = !x.visible; }); }}><Icon name={e.visible ? 'eye' : 'eyeOff'} size={14} /></button>
        </div>
      ))}
      {!scene.ui.length && <div className="hint">No UI</div>}
    </div>
  );
}

const ANCHORS = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];

export function UIInspector() {
  const scene = useScene();
  const project = useProject((s) => s.project);
  const id = useEditor((s) => s.uiSelection);
  const e = scene.ui.find((x) => x.id === id);
  if (!e) return <div className="hint">Nothing selected</div>;
  const set = (label: string, f: (x: UIElement) => void, mk?: string) => editUI(e.id, label, f, mk ? mk + e.id : undefined);
  const hasText = e.kind === 'text' || e.kind === 'button' || e.kind === 'panel';
  return (
    <div>
      <Section title={e.kind[0].toUpperCase() + e.kind.slice(1)}>
        <TextField label="Name" value={e.name} onChange={(v) => set('Rename UI', (x) => { x.name = v; })} />
        <Check label="Visible" value={e.visible} onChange={(v) => set('Toggle UI', (x) => { x.visible = v; })} />
        <Slider label="Opacity" min={0} max={1} value={e.opacity} onChange={(v) => set('UI opacity', (x) => { x.opacity = v; }, 'op')} />
      </Section>
      <Section title="Layout">
        <div className="field">
          <label>Anchor</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 20px)', gap: 2 }}>
            {ANCHORS.map(([ax, ay]) => (
              <button key={ax + ',' + ay} title="Anchor" className="ib" style={{ width: 20, height: 20, background: e.anchorX === ax && e.anchorY === ay ? 'var(--accent)' : 'var(--widget)' }}
                onClick={() => set('UI anchor', (x) => { x.anchorX = ax; x.anchorY = ay; x.pivotX = ax; x.pivotY = ay; x.x = ax === 0 ? 16 : ax === 1 ? -16 : 0; x.y = ay === 0 ? 16 : ay === 1 ? -16 : 0; })} />
            ))}
          </div>
        </div>
        <NumField label="X" value={e.x} onChange={(v) => set('Move UI', (x) => { x.x = v; }, 'x')} />
        <NumField label="Y" value={e.y} onChange={(v) => set('Move UI', (x) => { x.y = v; }, 'y')} />
        <NumField label="Width" min={1} value={e.w} onChange={(v) => set('Resize UI', (x) => { x.w = v; }, 'w')} />
        <NumField label="Height" min={1} value={e.h} onChange={(v) => set('Resize UI', (x) => { x.h = v; }, 'h')} />
      </Section>
      {hasText && (
        <Section title="Text">
          <TextField label="Text" value={e.text} placeholder="Score: {score}" onChange={(v) => set('UI text', (x) => { x.text = v; })} />
          <NumField label="Size" min={4} value={e.fontSize} onChange={(v) => set('Font size', (x) => { x.fontSize = v; }, 'fs')} />
          <ColorField label="Color" value={e.textColor} onChange={(v) => set('Text color', (x) => { x.textColor = v ?? '#ffffff'; }, 'tc')} />
          <Select label="Align" value={e.align} options={['left', 'center', 'right']} onChange={(v) => set('Align', (x) => { x.align = v; })} />
        </Section>
      )}
      {e.kind === 'image' && (
        <Section title="Image">
          <Select label="Asset" value={e.assetId ?? ''} options={[{ value: '', label: '(none)' }, ...Object.values(project.assets).filter((a) => a.art).map((a) => ({ value: a.id, label: a.name }))]} onChange={(v) => set('UI image', (x) => { x.assetId = v || null; })} />
        </Section>
      )}
      {e.kind === 'bar' && (
        <Section title="Bar">
          <Select label="Variable" value={e.barVar} options={[{ value: '', label: '(set by node)' }, ...project.variables.map((v) => ({ value: v.name, label: v.name }))]} onChange={(v) => set('Bar variable', (x) => { x.barVar = v; })} />
          <NumField label="Max" value={e.barMax} onChange={(v) => set('Bar max', (x) => { x.barMax = v; }, 'bm')} />
          <ColorField label="Fill" value={e.barColor} onChange={(v) => set('Bar color', (x) => { x.barColor = v ?? '#4caf50'; }, 'bc')} />
        </Section>
      )}
      <Section title="Style">
        <ColorField label="Background" allowNone value={e.fill?.startsWith('#') || e.fill === null ? e.fill : '#000000'} onChange={(v) => set('UI fill', (x) => { x.fill = v; }, 'fill')} />
        <ColorField label="Border" allowNone value={e.stroke} onChange={(v) => set('UI border', (x) => { x.stroke = v; }, 'stroke')} />
        <NumField label="Corners" min={0} value={e.radius} onChange={(v) => set('UI radius', (x) => { x.radius = v; }, 'rad')} />
      </Section>
    </div>
  );
}
