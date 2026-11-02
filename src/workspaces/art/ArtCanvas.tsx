import { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../../core/store';
import { useEditor, editor, type ArtTool } from '../../core/editorStore';
import { useAsset, activeFrameId, activeLayerId } from '../../core/selectors';
import { drawPath, ellipsePath, mapPathPoints, pathBounds, pt, rectPath, rotateVec, tracePath } from '../../core/geometry';
import { uid } from '../../core/ids';
import type { ArtDoc, PathPoint, Vec2, VectorPath } from '../../core/types';
import { TiledSurface, makeCanvas } from '../../render/surface';
import { BrushStroke, drawBrushCursor, floodFill } from '../../render/brush';
import { renderArtFrame, type LayerOverride } from '../../render/compose';
import { onImageLoad } from '../../render/imageCache';
import { IconBtn, type IconName } from '../../ui/Icon';
import { ColorSwatch } from '../../ui/CanvasControls';
import { Slider } from '../../ui/widgets';
import { PresetSelect } from '../../ui/BrushPanel';
import { Gestures, capture, coalesced, pressureOf, screenToWorld, type View } from '../../ui/viewport';
import { addLayer, celOf, currentArt, draftDoc, editCel } from './artOps';

let view: View = { cx: 32, cy: 32, zoom: 4 };
let viewAsset: string | null = null;

interface Floating { canvas: HTMLCanvasElement; x: number; y: number; sx: number; sy: number; rot: number; layerId: string; frameId: string }

type Drag =
  | { kind: 'stroke'; stroke: BrushStroke; layerId: string; frameId: string }
  | { kind: 'select'; start: Vec2; cur: Vec2 }
  | { kind: 'fmove'; start: Vec2; x0: number; y0: number }
  | { kind: 'fscale'; p0: Vec2; sx0: number; sy0: number }
  | { kind: 'frotate'; a0: number; rot0: number }
  | { kind: 'shape'; shape: 'rect' | 'ellipse'; start: Vec2; cur: Vec2 }
  | { kind: 'pen' }
  | { kind: 'vpoint'; pathId: string; index: number; part: 'a' | 'i' | 'o'; start: VectorPath }
  | { kind: 'vmove'; pathId: string; startPos: Vec2; start: VectorPath }
  | { kind: 'vscale'; pathId: string; start: VectorPath; origin: Vec2; p0: Vec2 }
  | { kind: 'vrotate'; pathId: string; start: VectorPath; center: Vec2; a0: number };

const TOOLS: { id: ArtTool; icon: IconName; key: string; tip: string; group: number }[] = [
  { id: 'brush', icon: 'brush', key: 'b', tip: 'Brush (B)', group: 0 },
  { id: 'eraser', icon: 'eraser', key: 'e', tip: 'Eraser (E)', group: 0 },
  { id: 'fill', icon: 'fill', key: 'g', tip: 'Fill (G)', group: 0 },
  { id: 'eyedropper', icon: 'pipette', key: 'i', tip: 'Eyedropper (I)', group: 0 },
  { id: 'select', icon: 'select', key: 'm', tip: 'Select & transform (M)', group: 1 },
  { id: 'pen', icon: 'pen', key: 'p', tip: 'Pen (P)', group: 2 },
  { id: 'rect', icon: 'rect', key: 'r', tip: 'Rectangle (R)', group: 2 },
  { id: 'ellipse', icon: 'ellipse', key: 'o', tip: 'Ellipse (O)', group: 2 },
  { id: 'direct', icon: 'node', key: 'a', tip: 'Edit paths (A)', group: 2 },
  { id: 'pan', icon: 'hand', key: 'h', tip: 'Pan (H)', group: 3 },
];

export function ArtCanvas() {
  const asset = useAsset();
  const tool = useEditor((s) => s.artTool);
  const onion = useEditor((s) => s.onionSkin);
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaces = useRef(new Map<string, TiledSurface>());
  const surfAsset = useRef<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const sel = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const floating = useRef<Floating | null>(null);
  const pen = useRef<{ points: PathPoint[]; dragging: boolean } | null>(null);
  const hover = useRef<Vec2 | null>(null);
  const gestures = useRef<Gestures | null>(null);
  const [zoomLabel, setZoomLabel] = useState(view.zoom);
  const [, rerender] = useState(0);

  const invalidate = useMemo(() => {
    let pending = false;
    return () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; draw(); });
    };
  }, []);
  const setView = (v: View) => { view = v; setZoomLabel(v.zoom); invalidate(); };

  function fitView(doc: ArtDoc) {
    const el = wrap.current;
    if (!el) return;
    const zoom = Math.max(0.05, Math.min((el.clientWidth - 40) / doc.width, (el.clientHeight - 40) / doc.height, 32));
    setView({ cx: doc.width / 2, cy: doc.height / 2, zoom });
  }

  function surface(layerId: string, frameId: string, doc: ArtDoc): TiledSurface {
    const k = layerId + ':' + frameId;
    let s = surfaces.current.get(k);
    if (!s || s.tileW !== doc.width || s.tileH !== doc.height) {
      s = new TiledSurface(doc.width, doc.height, true);
      surfaces.current.set(k, s);
    }
    return s;
  }

  // keep surfaces in sync with saved cel data
  function syncSurfaces(doc: ArtDoc, frameIds: string[]) {
    for (const l of doc.layers) {
      if (l.kind !== 'raster') continue;
      for (const f of frameIds) surface(l.id, f, doc).sync(l.cels[f]?.tiles, invalidate);
    }
  }

  function makeOverride(doc: ArtDoc, frameId: string, live: boolean): LayerOverride {
    const ed = editor();
    const lid = activeLayerId(useProject.getState().project.assets[ed.activeAssetId!], ed.activeLayerId);
    return (layer, ctx) => {
      if (layer.kind !== 'raster') return false;
      surface(layer.id, frameId, doc).draw(ctx);
      if (!live) return true;
      const d = drag.current;
      if (d?.kind === 'stroke' && d.layerId === layer.id && d.frameId === frameId) d.stroke.drawLive(ctx);
      const f = floating.current;
      if (f && f.layerId === layer.id && f.frameId === frameId && layer.id === lid) drawFloating(ctx, f);
      return true;
    };
  }

  function drawFloating(ctx: CanvasRenderingContext2D, f: Floating) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    ctx.scale(f.sx, f.sy);
    ctx.drawImage(f.canvas, -f.canvas.width / 2, -f.canvas.height / 2);
    ctx.restore();
  }

  function floatCorners(f: Floating): Vec2[] {
    const hw = (f.canvas.width / 2) * f.sx, hh = (f.canvas.height / 2) * f.sy;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => { const r = rotateVec({ x, y }, (f.rot * 180) / Math.PI); return { x: r.x + f.x, y: r.y + f.y }; });
  }
  function floatRotKnob(f: Floating): Vec2 {
    const hh = (f.canvas.height / 2) * Math.abs(f.sy) + 24 / view.zoom;
    const r = rotateVec({ x: 0, y: -hh }, (f.rot * 180) / Math.PI);
    return { x: f.x + r.x, y: f.y + r.y };
  }

  // ------------------------------------------------------------------ draw
  function draw() {
    const canvas = canvasRef.current, el = wrap.current;
    if (!canvas || !el) return;
    const p = useProject.getState().project;
    const ed = useEditor.getState();
    const a = ed.activeAssetId ? p.assets[ed.activeAssetId] : undefined;
    const W = el.clientWidth, H = el.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#16181c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const doc = a?.art;
    if (!a || !doc) return;
    if (surfAsset.current !== a.id) { surfaces.current.clear(); surfAsset.current = a.id; }
    const fid = activeFrameId(a, ed.activeFrameId)!;
    const fIdx = doc.frames.findIndex((f) => f.id === fid);
    const prevF = ed.onionSkin && fIdx > 0 ? doc.frames[fIdx - 1].id : null;
    const nextF = ed.onionSkin && fIdx < doc.frames.length - 1 ? doc.frames[fIdx + 1].id : null;
    syncSurfaces(doc, [fid, prevF, nextF].filter(Boolean) as string[]);

    const z = view.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - view.cx * z), dpr * (H / 2 - view.cy * z));
    // checkerboard
    const cs = Math.max(4, 8 / z * 2);
    ctx.fillStyle = '#3a3d44';
    ctx.fillRect(0, 0, doc.width, doc.height);
    ctx.fillStyle = '#2c2f35';
    for (let y = 0; y < doc.height; y += cs) for (let x = (Math.floor(y / cs) % 2) * cs; x < doc.width; x += cs * 2) ctx.fillRect(x, y, Math.min(cs, doc.width - x), Math.min(cs, doc.height - y));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, doc.width, doc.height); ctx.clip();
    ctx.imageSmoothingEnabled = z < 2;
    for (const [of, alpha] of [[prevF, 0.25], [nextF, 0.12]] as const) {
      if (!of) continue;
      ctx.save(); ctx.globalAlpha = alpha;
      renderArtFrame(ctx, doc, of, makeOverride(doc, of, false));
      ctx.restore();
    }
    renderArtFrame(ctx, doc, fid, makeOverride(doc, fid, true));
    // pen preview
    if (pen.current && pen.current.points.length) {
      const pts = [...pen.current.points];
      if (hover.current && !pen.current.dragging) pts.push(pt(hover.current.x, hover.current.y));
      drawPath(ctx, { id: '', points: pts, closed: false, fill: null, stroke: ed.vectorStyle.stroke ?? '#4aa3ff', strokeWidth: ed.vectorStyle.strokeWidth || 1 });
    }
    const d = drag.current;
    if (d?.kind === 'shape') {
      drawPath(ctx, shapeFrom(d.shape, d.start, d.cur, ed.vectorStyle, false));
    }
    ctx.restore();

    // ---- overlays in screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = (x: number, y: number) => ({ x: (x - view.cx) * z + W / 2, y: (y - view.cy) * z + H / 2 });
    const o = S(0, 0), e2 = S(doc.width, doc.height);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(o.x - 0.5, o.y - 0.5, e2.x - o.x + 1, e2.y - o.y + 1);
    if (z >= 12) { // pixel grid when zoomed in
      ctx.strokeStyle = 'rgba(255,255,255,.07)';
      ctx.beginPath();
      for (let x = 0; x <= doc.width; x++) { const q = S(x, 0); ctx.moveTo(q.x, o.y); ctx.lineTo(q.x, e2.y); }
      for (let y = 0; y <= doc.height; y++) { const q = S(0, y); ctx.moveTo(o.x, q.y); ctx.lineTo(e2.x, q.y); }
      ctx.stroke();
    }
    const sr = d?.kind === 'select' ? normRect(d.start, d.cur) : sel.current;
    if (sr && !floating.current) {
      const a1 = S(sr.x, sr.y), b1 = S(sr.x + sr.w, sr.y + sr.h);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = '#fff'; ctx.strokeRect(a1.x, a1.y, b1.x - a1.x, b1.y - a1.y);
      ctx.lineDashOffset = 5; ctx.strokeStyle = '#000'; ctx.strokeRect(a1.x, a1.y, b1.x - a1.x, b1.y - a1.y);
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    const f = floating.current;
    if (f) {
      const cs2 = floatCorners(f).map((q) => S(q.x, q.y));
      ctx.strokeStyle = '#4aa3ff';
      ctx.beginPath(); cs2.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#fff';
      for (const q of cs2) { ctx.fillRect(q.x - 5, q.y - 5, 10, 10); ctx.strokeRect(q.x - 5, q.y - 5, 10, 10); }
      const rk = floatRotKnob(f), rs = S(rk.x, rk.y);
      ctx.beginPath(); ctx.arc(rs.x, rs.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // vector editing overlay
    const lid = activeLayerId(a, ed.activeLayerId);
    const layer = doc.layers.find((l) => l.id === lid);
    if (ed.artTool === 'direct' && layer?.kind === 'vector') {
      const paths = layer.cels[fid]?.paths ?? [];
      ctx.strokeStyle = 'rgba(74,163,255,.5)';
      for (const pth of paths) {
        ctx.save();
        ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - view.cx * z), dpr * (H / 2 - view.cy * z));
        ctx.lineWidth = 1 / z;
        ctx.beginPath(); tracePath(ctx, pth); ctx.stroke();
        ctx.restore();
      }
      const sp = paths.find((q) => q.id === ed.selectedPathId);
      if (sp) {
        for (const q of sp.points) {
          const A = S(q.x, q.y), I = S(q.ix, q.iy), O = S(q.ox, q.oy);
          ctx.strokeStyle = '#4aa3ff';
          ctx.beginPath(); ctx.moveTo(I.x, I.y); ctx.lineTo(A.x, A.y); ctx.lineTo(O.x, O.y); ctx.stroke();
          ctx.fillStyle = '#4aa3ff';
          for (const h of [I, O]) { ctx.beginPath(); ctx.arc(h.x, h.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = '#fff'; ctx.fillRect(A.x - 4, A.y - 4, 8, 8); ctx.strokeRect(A.x - 4, A.y - 4, 8, 8);
        }
        const bb = pathBounds(sp);
        const br = S(bb.x + bb.w, bb.y + bb.h), tl = S(bb.x, bb.y);
        ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y); ctx.setLineDash([]);
        ctx.fillStyle = '#ffd34d'; ctx.fillRect(br.x - 5, br.y - 5, 10, 10);
        const rk = S(bb.x + bb.w / 2, bb.y);
        ctx.beginPath(); ctx.arc(rk.x, rk.y - 22, 6, 0, Math.PI * 2); ctx.fill();
      }
    }
    if ((ed.artTool === 'brush' || ed.artTool === 'eraser') && hover.current) {
      const q = S(hover.current.x, hover.current.y);
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      const live = d?.kind === 'stroke' ? d.stroke.liveRadius * z : undefined;
      drawBrushCursor(ctx, q.x, q.y, ed.brush, (ed.brush.size / 2) * z, live);
    }
  }

  // ------------------------------------------------------------------ lifecycle
  useEffect(() => {
    const el = wrap.current!;
    gestures.current = new Gestures(el, () => view, setView, () => cancel());
    const ro = new ResizeObserver(invalidate);
    ro.observe(el);
    const u1 = useProject.subscribe(invalidate);
    const u2 = useEditor.subscribe(invalidate);
    const u3 = onImageLoad(invalidate);
    const wheel = (e: WheelEvent) => gestures.current!.wheel(e);
    el.addEventListener('wheel', wheel, { passive: false });
    const kd = (e: KeyboardEvent) => onKey(e, true), ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { ro.disconnect(); u1(); u2(); u3(); el.removeEventListener('wheel', wheel); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); commitFloating(); };
  }, []);

  // asset switched: fit view, drop transient tool state
  useEffect(() => {
    commitFloating();
    sel.current = null; pen.current = null;
    if (asset?.art && viewAsset !== asset.id) { viewAsset = asset.id; requestAnimationFrame(() => fitView(asset.art!)); }
    invalidate();
  }, [asset?.id]);

  // switching tools finishes pending pen paths / floating selections
  useEffect(() => {
    if (tool !== 'pen') finishPen();
    if (tool !== 'select') { commitFloating(); sel.current = null; }
    invalidate();
  }, [tool]);

  function onKey(e: KeyboardEvent, down: boolean) {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.code === 'Space') { gestures.current!.spaceDown = down; return; }
    if (!down) return;
    const ed = editor();
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter') { if (pen.current) finishPen(); else commitFloating(); }
    else if (e.key === 'Escape') { if (pen.current) { pen.current = null; invalidate(); } else cancelFloating(); sel.current = null; invalidate(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const { doc } = currentArt();
      if (doc) { ed.set({ artTool: 'select' }); commitFloating(); sel.current = { x: 0, y: 0, w: doc.width, h: doc.height }; invalidate(); }
    } else if (e.key === '[') ed.set({ brush: { ...ed.brush, size: Math.max(1, Math.round(ed.brush.size / 1.25)) } });
    else if (e.key === ']') ed.set({ brush: { ...ed.brush, size: Math.min(500, Math.round(ed.brush.size * 1.25 + 1)) } });
    else if (!mod) {
      const tl = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (tl) ed.set({ artTool: tl.id });
    }
  }

  // ------------------------------------------------------------------ tool helpers
  /** Ensure the active layer is of the given kind; creates one if needed. */
  function ensureLayer(kind: 'raster' | 'vector'): string | null {
    const { doc, layerId } = currentArt();
    if (!doc) return null;
    const l = doc.layers.find((x) => x.id === layerId);
    if (l && l.kind === kind) {
      if (l.locked) { editor().set({ status: `Layer "${l.name}" is locked` }); return null; }
      return l.id;
    }
    editor().set({ status: `Added a ${kind} layer for this tool` });
    return addLayer(kind);
  }

  function commitRaster(label: string, layerId: string, frameId: string, s: TiledSurface, keys: Iterable<string>) {
    const { asset: a } = currentArt();
    if (!a) return;
    const data = s.export(keys);
    if (!Object.keys(data).length) return;
    editCel(label, a.id, layerId, frameId, (cel) => { cel.tiles = { ...(cel.tiles ?? {}), ...data }; });
  }

  function resetSurface(layerId: string, frameId: string) {
    surfaces.current.delete(layerId + ':' + frameId);
  }

  function liftSelection(): boolean {
    const r = sel.current;
    const { doc, frameId, layerId } = currentArt();
    if (!r || !doc || !frameId || !layerId || floating.current) return !!floating.current;
    const l = doc.layers.find((x) => x.id === layerId);
    if (!l || l.kind !== 'raster' || l.locked) { editor().set({ status: 'Select an unlocked raster layer to transform pixels' }); return false; }
    const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
    const w = Math.min(doc.width - x, Math.ceil(r.w)), h = Math.min(doc.height - y, Math.ceil(r.h));
    if (w < 1 || h < 1) return false;
    const tile = surface(layerId, frameId, doc).getTile(0, 0, true)!;
    const c = makeCanvas(w, h);
    c.getContext('2d')!.drawImage(tile.canvas, x, y, w, h, 0, 0, w, h);
    tile.ctx.clearRect(x, y, w, h);
    floating.current = { canvas: c, x: x + w / 2, y: y + h / 2, sx: 1, sy: 1, rot: 0, layerId, frameId };
    return true;
  }

  function commitFloating() {
    const f = floating.current;
    if (!f) return;
    floating.current = null;
    const { doc } = currentArt();
    if (!doc) return;
    const s = surface(f.layerId, f.frameId, doc);
    const tile = s.getTile(0, 0, true)!;
    drawFloating(tile.ctx, f);
    commitRaster('Transform selection', f.layerId, f.frameId, s, ['0,0']);
    const cs = floatCorners(f);
    const xs = cs.map((q) => q.x), ys = cs.map((q) => q.y);
    sel.current = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    invalidate();
  }

  function cancelFloating() {
    const f = floating.current;
    if (!f) return;
    floating.current = null;
    resetSurface(f.layerId, f.frameId);
    invalidate();
  }

  function deleteSelection() {
    const ed = editor();
    const { asset: a, doc, frameId, layerId } = currentArt();
    if (!a || !doc || !frameId || !layerId) return;
    if (ed.artTool === 'direct' && ed.selectedPathId) {
      const pid = ed.selectedPathId;
      editCel('Delete path', a.id, layerId, frameId, (cel) => { cel.paths = (cel.paths ?? []).filter((q) => q.id !== pid); });
      ed.set({ selectedPathId: null });
      return;
    }
    if (floating.current) { const f = floating.current; floating.current = null; commitRaster('Delete selection', f.layerId, f.frameId, surface(f.layerId, f.frameId, doc), ['0,0']); sel.current = null; invalidate(); return; }
    const r = sel.current;
    const l = doc.layers.find((x) => x.id === layerId);
    if (!r || !l || l.kind !== 'raster' || l.locked) return;
    const s = surface(layerId, frameId, doc);
    s.getTile(0, 0, true)!.ctx.clearRect(r.x, r.y, r.w, r.h);
    commitRaster('Clear selection', layerId, frameId, s, ['0,0']);
  }

  function finishPen(close = false) {
    const pn = pen.current;
    pen.current = null;
    if (pn) pn.points = pn.points.filter((q, i, arr) => i === 0 || Math.hypot(q.x - arr[i - 1].x, q.y - arr[i - 1].y) > 0.01); // double-click adds duplicates
    if (!pn || pn.points.length < 2) { invalidate(); return; }
    const { asset: a, frameId } = currentArt();
    const layerId = ensureLayer('vector');
    if (!a || !frameId || !layerId) return;
    const st = editor().vectorStyle;
    const path: VectorPath = { id: uid('p'), points: pn.points, closed: close, fill: close ? st.fill : null, stroke: st.stroke ?? (close ? null : '#000000'), strokeWidth: st.strokeWidth };
    editCel('Pen path', a.id, layerId, frameId, (cel) => { cel.paths = [...(cel.paths ?? []), path]; });
    editor().set({ selectedPathId: path.id });
  }

  function cancel() {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'stroke' && d.stroke.erase) resetSurface(d.layerId, d.frameId);
    if (d && (d.kind === 'vpoint' || d.kind === 'vmove' || d.kind === 'vscale' || d.kind === 'vrotate')) useProject.getState().cancel();
    invalidate();
  }

  // ------------------------------------------------------------------ pointer
  const toDoc = (e: { clientX: number; clientY: number }) => screenToWorld(view, wrap.current!, e.clientX, e.clientY);
  const near = (a: Vec2, b: Vec2, px: number) => Math.hypot(a.x - b.x, a.y - b.y) * view.zoom < px;

  function updatePath(pathId: string, f: (p: VectorPath) => VectorPath) {
    const { asset: a, frameId, layerId } = currentArt();
    if (!a || !frameId || !layerId) return;
    useProject.getState().live((d) => {
      const l = draftDoc(d, a.id)?.layers.find((x) => x.id === layerId);
      if (!l) return;
      const cel = celOf(l, frameId);
      cel.paths = (cel.paths ?? []).map((q) => (q.id === pathId ? f(q) : q));
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    const ne = e.nativeEvent;
    capture(e);
    if (gestures.current!.down(ne)) return;
    if (e.button !== 0) return;
    const ed = editor();
    const { asset: a, doc, frameId, layerId } = currentArt();
    if (!a || !doc || !frameId) return;
    const pnt = toDoc(e);
    const touchR = ne.pointerType === 'touch' ? 18 : 10;
    switch (ed.artTool) {
      case 'pan': gestures.current!.startPan(ne); return;
      case 'brush':
      case 'eraser': {
        const lid = ensureLayer('raster');
        if (!lid) return;
        const s = surface(lid, frameId, currentArt().doc!);
        const stroke = new BrushStroke(s, ed.brush, ed.artTool === 'eraser', useProject.getState().project.brushResources);
        stroke.begin(pnt.x, pnt.y, pressureOf(ne));
        drag.current = { kind: 'stroke', stroke, layerId: lid, frameId };
        invalidate();
        return;
      }
      case 'fill': {
        const lid = ensureLayer('raster');
        if (!lid) return;
        const d2 = currentArt().doc!;
        const s = surface(lid, frameId, d2);
        // find the region using everything visible, paint it into the active layer
        const merged = makeCanvas(d2.width, d2.height);
        renderArtFrame(merged.getContext('2d')!, d2, frameId, makeOverride(d2, frameId, false));
        if (floodFill(s.getTile(0, 0, true)!.canvas, pnt.x, pnt.y, ed.brush.color, ed.fillTolerance, merged)) commitRaster('Fill', lid, frameId, s, ['0,0']);
        return;
      }
      case 'eyedropper': {
        const c = makeCanvas(doc.width, doc.height);
        const g = c.getContext('2d')!;
        renderArtFrame(g, doc, frameId, makeOverride(doc, frameId, false));
        const px = g.getImageData(Math.floor(pnt.x), Math.floor(pnt.y), 1, 1).data;
        if (px[3] === 0) return;
        const hex = '#' + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        ed.set({ brush: { ...ed.brush, color: hex }, vectorStyle: { ...ed.vectorStyle, fill: hex } });
        return;
      }
      case 'select': {
        const f = floating.current;
        if (f) {
          const rk = floatRotKnob(f);
          if (near(pnt, rk, touchR)) { drag.current = { kind: 'frotate', a0: Math.atan2(pnt.y - f.y, pnt.x - f.x), rot0: f.rot }; return; }
          if (floatCorners(f).some((q) => near(pnt, q, touchR))) {
            const lp = rotateVec({ x: pnt.x - f.x, y: pnt.y - f.y }, (-f.rot * 180) / Math.PI);
            drag.current = { kind: 'fscale', p0: lp, sx0: f.sx, sy0: f.sy };
            return;
          }
          const lp = rotateVec({ x: pnt.x - f.x, y: pnt.y - f.y }, (-f.rot * 180) / Math.PI);
          if (Math.abs(lp.x) <= (f.canvas.width / 2) * Math.abs(f.sx) && Math.abs(lp.y) <= (f.canvas.height / 2) * Math.abs(f.sy)) {
            drag.current = { kind: 'fmove', start: pnt, x0: f.x, y0: f.y };
            return;
          }
          commitFloating();
        }
        const r = sel.current;
        if (r && pnt.x >= r.x && pnt.x <= r.x + r.w && pnt.y >= r.y && pnt.y <= r.y + r.h && liftSelection()) {
          const fl = floating.current!;
          drag.current = { kind: 'fmove', start: pnt, x0: fl.x, y0: fl.y };
          invalidate();
          return;
        }
        sel.current = null;
        drag.current = { kind: 'select', start: pnt, cur: pnt };
        invalidate();
        return;
      }
      case 'pen': {
        if (!pen.current) pen.current = { points: [], dragging: false };
        const pts = pen.current.points;
        if (pts.length >= 2 && near(pnt, pts[0], touchR)) { finishPen(true); return; }
        pts.push(pt(pnt.x, pnt.y));
        pen.current.dragging = true;
        drag.current = { kind: 'pen' };
        invalidate();
        return;
      }
      case 'rect':
      case 'ellipse':
        drag.current = { kind: 'shape', shape: ed.artTool, start: pnt, cur: pnt };
        return;
      case 'direct': {
        const layer = doc.layers.find((l) => l.id === layerId);
        if (!layer || layer.kind !== 'vector') { ed.set({ status: 'Select a vector layer to edit paths' }); return; }
        if (layer.locked) { ed.set({ status: 'Layer is locked' }); return; }
        const paths = layer.cels[frameId]?.paths ?? [];
        const sp = paths.find((q) => q.id === ed.selectedPathId);
        if (sp) {
          for (let i = 0; i < sp.points.length; i++) {
            const q = sp.points[i];
            for (const [part, x, y] of [['a', q.x, q.y], ['o', q.ox, q.oy], ['i', q.ix, q.iy]] as const) {
              if (near(pnt, { x, y }, touchR)) { useProject.getState().begin(); drag.current = { kind: 'vpoint', pathId: sp.id, index: i, part, start: sp }; return; }
            }
          }
          const bb = pathBounds(sp);
          if (near(pnt, { x: bb.x + bb.w, y: bb.y + bb.h }, touchR)) { useProject.getState().begin(); drag.current = { kind: 'vscale', pathId: sp.id, start: sp, origin: { x: bb.x, y: bb.y }, p0: pnt }; return; }
          const knob = { x: bb.x + bb.w / 2, y: bb.y - 22 / view.zoom };
          if (near(pnt, knob, touchR)) {
            const center = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
            useProject.getState().begin();
            drag.current = { kind: 'vrotate', pathId: sp.id, start: sp, center, a0: Math.atan2(pnt.y - center.y, pnt.x - center.x) };
            return;
          }
        }
        const hit = hitPath(paths, pnt);
        ed.set({ selectedPathId: hit?.id ?? null });
        if (hit) { useProject.getState().begin(); drag.current = { kind: 'vmove', pathId: hit.id, startPos: pnt, start: hit }; }
        return;
      }
    }
  }

  function hitPath(paths: VectorPath[], q: Vec2): VectorPath | null {
    const g = makeCanvas(1, 1).getContext('2d')!;
    for (let i = paths.length - 1; i >= 0; i--) {
      const pth = paths[i];
      const p2 = new Path2D();
      tracePath(p2, pth);
      g.lineWidth = Math.max(pth.strokeWidth, 10 / view.zoom);
      if ((pth.fill && pth.closed && g.isPointInPath(p2, q.x, q.y)) || g.isPointInStroke(p2, q.x, q.y)) return pth;
    }
    return null;
  }

  function onPointerMove(e: React.PointerEvent) {
    const ne = e.nativeEvent;
    if (gestures.current!.move(ne)) return;
    const pnt = toDoc(e);
    hover.current = pnt;
    const d = drag.current;
    if (!d) { const t = editor().artTool; if (t === 'brush' || t === 'eraser' || (t === 'pen' && pen.current)) invalidate(); return; }
    switch (d.kind) {
      case 'stroke':
        for (const ce of coalesced(ne)) { const q = toDoc(ce); d.stroke.move(q.x, q.y, pressureOf(ce)); }
        break;
      case 'select': d.cur = pnt; break;
      case 'shape': d.cur = e.shiftKey ? squareFrom(d.start, pnt) : pnt; break;
      case 'fmove': { const f = floating.current!; f.x = d.x0 + pnt.x - d.start.x; f.y = d.y0 + pnt.y - d.start.y; break; }
      case 'fscale': {
        const f = floating.current!;
        const lp = rotateVec({ x: pnt.x - f.x, y: pnt.y - f.y }, (-f.rot * 180) / Math.PI);
        let kx = Math.abs(d.p0.x) > 0.5 ? lp.x / d.p0.x : 1, ky = Math.abs(d.p0.y) > 0.5 ? lp.y / d.p0.y : 1;
        if (e.shiftKey) { const k = Math.max(Math.abs(kx), Math.abs(ky)); kx = k * Math.sign(kx || 1); ky = k * Math.sign(ky || 1); }
        f.sx = d.sx0 * kx; f.sy = d.sy0 * ky;
        break;
      }
      case 'frotate': {
        const f = floating.current!;
        let r = d.rot0 + Math.atan2(pnt.y - f.y, pnt.x - f.x) - d.a0;
        if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
        f.rot = r;
        break;
      }
      case 'pen': {
        const pts = pen.current?.points;
        if (!pts?.length) break;
        const last = pts[pts.length - 1];
        last.ox = pnt.x; last.oy = pnt.y;
        last.ix = 2 * last.x - pnt.x; last.iy = 2 * last.y - pnt.y;
        break;
      }
      case 'vpoint':
        updatePath(d.pathId, () => {
          const pts = d.start.points.map((q) => ({ ...q }));
          const q = pts[d.index];
          if (d.part === 'a') { const dx = pnt.x - q.x, dy = pnt.y - q.y; q.x += dx; q.y += dy; q.ix += dx; q.iy += dy; q.ox += dx; q.oy += dy; }
          else if (d.part === 'o') { q.ox = pnt.x; q.oy = pnt.y; if (!e.altKey) { q.ix = 2 * q.x - pnt.x; q.iy = 2 * q.y - pnt.y; } }
          else { q.ix = pnt.x; q.iy = pnt.y; if (!e.altKey) { q.ox = 2 * q.x - pnt.x; q.oy = 2 * q.y - pnt.y; } }
          return { ...d.start, points: pts };
        });
        break;
      case 'vmove': {
        const dx = pnt.x - d.startPos.x, dy = pnt.y - d.startPos.y;
        updatePath(d.pathId, () => mapPathPoints(d.start, (v) => ({ x: v.x + dx, y: v.y + dy })));
        break;
      }
      case 'vscale': {
        const bb = pathBounds(d.start);
        const kx = bb.w > 0.5 ? (pnt.x - d.origin.x) / bb.w : 1, ky = bb.h > 0.5 ? (pnt.y - d.origin.y) / bb.h : 1;
        const k = e.shiftKey ? Math.max(kx, ky) : 0;
        updatePath(d.pathId, () => mapPathPoints(d.start, (v) => ({ x: d.origin.x + (v.x - d.origin.x) * (k || kx), y: d.origin.y + (v.y - d.origin.y) * (k || ky) })));
        break;
      }
      case 'vrotate': {
        let deg = ((Math.atan2(pnt.y - d.center.y, pnt.x - d.center.x) - d.a0) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        updatePath(d.pathId, () => mapPathPoints(d.start, (v) => { const r = rotateVec({ x: v.x - d.center.x, y: v.y - d.center.y }, deg); return { x: r.x + d.center.x, y: r.y + d.center.y }; }));
        break;
      }
    }
    invalidate();
  }

  function onPointerUp(e: React.PointerEvent) {
    if (gestures.current!.up(e.nativeEvent)) return;
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    switch (d.kind) {
      case 'stroke': {
        const dirty = d.stroke.end();
        commitRaster(d.stroke.erase ? 'Erase' : 'Brush stroke', d.layerId, d.frameId, d.stroke.layer, dirty);
        break;
      }
      case 'select': {
        const r = normRect(d.start, d.cur);
        sel.current = r.w >= 1 && r.h >= 1 ? r : null;
        break;
      }
      case 'pen': if (pen.current) pen.current.dragging = false; break;
      case 'shape': {
        const r = normRect(d.start, d.cur);
        if (r.w < 1 || r.h < 1) break;
        const { asset: a, frameId } = currentArt();
        const lid = ensureLayer('vector');
        if (!a || !frameId || !lid) break;
        const path = shapeFrom(d.shape, d.start, d.cur, editor().vectorStyle, true);
        editCel('Add ' + d.shape, a.id, lid, frameId, (cel) => { cel.paths = [...(cel.paths ?? []), path]; });
        editor().set({ selectedPathId: path.id });
        break;
      }
      case 'vpoint': useProject.getState().end('Edit point'); break;
      case 'vmove': useProject.getState().end('Move path'); break;
      case 'vscale': useProject.getState().end('Scale path'); break;
      case 'vrotate': useProject.getState().end('Rotate path'); break;
    }
    invalidate();
    rerender((x) => x + 1);
  }

  const ed = useEditor();
  const doc = asset?.art;
  const fid = activeFrameId(asset, ed.activeFrameId);
  return (
    <div className="viewport kstudio">
      <div className="k-options">
        <span className="k-toolname">{TOOLS.find((t) => t.id === tool)?.tip.replace(/ \(.\)$/, '')}</span>
        {(tool === 'brush' || tool === 'eraser') && (
          <>
            <PresetSelect />
            <Slider width={150} label="Size" min={1} max={300} step={1} value={ed.brush.size} onChange={(v) => ed.set({ brush: { ...ed.brush, size: v } })} />
            <Slider width={130} label="Opacity" min={0.01} max={1} value={ed.brush.opacity} display={(v) => Math.round(v * 100) + '%'} onChange={(v) => ed.set({ brush: { ...ed.brush, opacity: v } })} />
            <Slider width={130} label="Hardness" min={0} max={1} value={ed.brush.hardness} display={(v) => Math.round(v * 100) + '%'} onChange={(v) => ed.set({ brush: { ...ed.brush, hardness: v } })} />
          </>
        )}
        {tool === 'fill' && <Slider width={160} label="Tolerance" min={0} max={255} step={1} value={ed.fillTolerance} onChange={(v) => ed.set({ fillTolerance: v })} />}
        {(tool === 'pen' || tool === 'rect' || tool === 'ellipse') && (
          <>
            <label className="k-lbl">Fill</label>
            <input type="color" className="k-color" value={ed.vectorStyle.fill ?? '#000000'} disabled={ed.vectorStyle.fill === null} onChange={(e) => ed.set({ vectorStyle: { ...ed.vectorStyle, fill: e.target.value } })} />
            <button className={'btn sm' + (ed.vectorStyle.fill === null ? ' on' : '')} title="No fill" onClick={() => ed.set({ vectorStyle: { ...ed.vectorStyle, fill: ed.vectorStyle.fill === null ? ed.brush.color : null } })}>∅</button>
            <label className="k-lbl">Stroke</label>
            <input type="color" className="k-color" value={ed.vectorStyle.stroke ?? '#000000'} disabled={ed.vectorStyle.stroke === null} onChange={(e) => ed.set({ vectorStyle: { ...ed.vectorStyle, stroke: e.target.value } })} />
            <button className={'btn sm' + (ed.vectorStyle.stroke === null ? ' on' : '')} title="No stroke" onClick={() => ed.set({ vectorStyle: { ...ed.vectorStyle, stroke: ed.vectorStyle.stroke === null ? '#000000' : null } })}>∅</button>
            <Slider width={120} label="Width" min={0} max={40} step={0.5} value={ed.vectorStyle.strokeWidth} onChange={(v) => ed.set({ vectorStyle: { ...ed.vectorStyle, strokeWidth: v } })} />
          </>
        )}
        {tool === 'pen' && <button className="btn sm" onClick={() => finishPen()}>Finish path</button>}
        {tool === 'select' && (
          <>
            <button className="btn sm" onClick={() => { if (doc) { commitFloating(); sel.current = { x: 0, y: 0, w: doc.width, h: doc.height }; liftSelection(); invalidate(); rerender((x) => x + 1); } }}>Transform layer</button>
            <button className="btn sm" disabled={!floating.current} onClick={() => { commitFloating(); rerender((x) => x + 1); }}>Apply</button>
            <button className="btn sm" disabled={!floating.current} onClick={() => { cancelFloating(); sel.current = null; rerender((x) => x + 1); }}>Cancel</button>
            <button className="btn sm" onClick={() => { deleteSelection(); rerender((x) => x + 1); }}>Clear</button>
          </>
        )}
        <span style={{ flex: 1 }} />
        <IconBtn icon="onion" title="Onion skin" on={onion} onClick={() => ed.set({ onionSkin: !onion })} />
        <IconBtn icon="undo" title="Undo" onClick={() => useProject.getState().undo()} />
        <IconBtn icon="redo" title="Redo" onClick={() => useProject.getState().redo()} />
        <button className="btn sm" onClick={() => doc && fitView(doc)} title="Fit to view">{Math.round(zoomLabel * 100)}%</button>
      </div>
      <div className="k-tools">
        {TOOLS.map((t, i) => (
          <span key={t.id} style={{ display: 'contents' }}>
            {i > 0 && TOOLS[i - 1].group !== t.group && <span className="k-sep" />}
            <IconBtn icon={t.icon} title={t.tip} on={tool === t.id} onClick={() => ed.set({ artTool: t.id })} />
          </span>
        ))}
        <span className="k-sep" />
        <ColorSwatch />
      </div>
      <div className="k-canvas" ref={wrap}>
        <canvas ref={canvasRef}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onPointerLeave={() => { hover.current = null; invalidate(); }}
          onDoubleClick={() => pen.current && finishPen()}
          onContextMenu={(e) => e.preventDefault()}
          style={{ cursor: tool === 'pan' ? 'grab' : tool === 'direct' || tool === 'select' ? 'default' : 'crosshair' }} />
      </div>
    </div>
  );
}

function normRect(a: Vec2, b: Vec2) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}
function squareFrom(a: Vec2, b: Vec2): Vec2 {
  const s = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return { x: a.x + s * Math.sign(b.x - a.x || 1), y: a.y + s * Math.sign(b.y - a.y || 1) };
}
function shapeFrom(shape: 'rect' | 'ellipse', a: Vec2, b: Vec2, st: { fill: string | null; stroke: string | null; strokeWidth: number }, final: boolean): VectorPath {
  const r = normRect(a, b);
  const fill = st.fill, stroke = st.stroke ?? (final ? null : '#4aa3ff');
  return shape === 'rect' ? rectPath(r.x, r.y, r.w, r.h, fill, stroke, st.strokeWidth) : ellipsePath(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, fill, stroke, st.strokeWidth);
}
