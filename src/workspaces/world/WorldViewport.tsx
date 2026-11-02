import { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../../core/store';
import { useEditor, editor, type WorldTool } from '../../core/editorStore';
import { sceneOf, useScene } from '../../core/selectors';
import { computeWorldMatrices, effectiveFlags, getComp, parentMatrix, treeOrder } from '../../core/sceneUtils';
import { matApply, matFromTRS, matInvert, matMul, type Mat } from '../../core/geometry';
import { newEntity } from '../../core/defaults';
import type { Entity, Project, Vec2 } from '../../core/types';
import { TiledSurface } from '../../render/surface';
import { BrushStroke, drawBrushCursor } from '../../render/brush';
import { frameAt } from '../../render/compose';
import { renderWorld, CHUNK, type RenderObject } from '../../render/worldRender';
import { onImageLoad } from '../../render/imageCache';
import { Icon, IconBtn, type IconName } from '../../ui/Icon';
import { BrushSliders, ColorSwatch } from '../../ui/CanvasControls';
import { ModeSwitch } from './UIEditor';
import { Gestures, capture, coalesced, pressureOf, screenToWorld, type View } from '../../ui/viewport';
import {
  activeWorldLayer, copySelected, deleteSelected, draftScene, duplicateSelected, entityLocalBounds, paste, placeAsset, placePrefab,
} from './worldOps';

let view: View = { cx: 480, cy: 270, zoom: 1 };

/** Center of the World view (used to place assets where the user is looking). */
export function worldViewCenter() { return { x: Math.round(view.cx), y: Math.round(view.cy) }; }

type Drag =
  | { kind: 'move'; starts: Map<string, Vec2>; inv: Map<string, Mat>; startWorld: Vec2; primary: string; moved: boolean }
  | { kind: 'scale'; id: string; m0inv: Mat; p0: Vec2; sx0: number; sy0: number }
  | { kind: 'rotate'; id: string; center: Vec2; a0: number; rot0: number }
  | { kind: 'marquee'; start: Vec2; cur: Vec2; base: string[] }
  | { kind: 'paint'; stroke: BrushStroke; layerId: string }
  | { kind: 'collider'; start: Vec2; cur: Vec2 };

const TOOLS: { id: WorldTool; icon: IconName; key: string; tip: string }[] = [
  { id: 'select', icon: 'pointer', key: 'v', tip: 'Select (V)' },
  { id: 'paint', icon: 'brush', key: 'b', tip: 'Paint (B)' },
  { id: 'erase', icon: 'eraser', key: 'e', tip: 'Erase (E)' },
  { id: 'collider', icon: 'box', key: 'c', tip: 'Collision box (C)' },
  { id: 'pan', icon: 'hand', key: 'h', tip: 'Pan (H)' },
];

interface Frame { scene: ReturnType<typeof sceneOf>; mats: Map<string, Mat>; byId: Map<string, Entity>; hittable: Entity[] }

export function WorldViewport() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaces = useRef(new Map<string, TiledSurface>());
  const drag = useRef<Drag | null>(null);
  const hover = useRef<Vec2 | null>(null);
  const frame = useRef<Frame | null>(null);
  const tool = useEditor((s) => s.worldTool);
  const grid = useEditor((s) => s.grid);
  const scene = useScene();
  const activeLayer = activeWorldLayer(scene, tool === 'paint' || tool === 'erase' ? 'Scenery' : 'Objects');
  const [zoomLabel, setZoomLabel] = useState(view.zoom);

  const invalidate = useMemo(() => {
    let pending = false;
    return () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; draw(); });
    };
  }, []);

  const setView = (v: View) => { view = v; setZoomLabel(v.zoom); invalidate(); };
  const gestures = useMemo(() => ({ current: null as Gestures | null }), []);

  // ------------------------------------------------------------------ drawing
  function worldToScreen(x: number, y: number, W: number, H: number): Vec2 {
    return { x: (x - view.cx) * view.zoom + W / 2, y: (y - view.cy) * view.zoom + H / 2 };
  }

  function draw() {
    const canvas = canvasRef.current, el = wrap.current;
    if (!canvas || !el) return;
    const p = useProject.getState().project;
    const ed = useEditor.getState();
    const sc = sceneOf(p, ed.activeSceneId);
    const W = el.clientWidth, H = el.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const ctx = canvas.getContext('2d')!;

    for (const l of sc.layers) {
      let s = surfaces.current.get(l.id);
      if (!s) { s = new TiledSurface(CHUNK, CHUNK, false); surfaces.current.set(l.id, s); }
      s.sync(l.paint, invalidate);
    }
    const byId = new Map(sc.entities.map((e) => [e.id, e]));
    const mats = computeWorldMatrices(sc.entities, byId);
    const flags = effectiveFlags(sc.entities);
    const layerIdx = new Map(sc.layers.map((l, i) => [l.id, i]));
    const ordered = treeOrder(sc.entities).map((x) => x.e);
    const objects: RenderObject[] = [];
    const hittable: Entity[] = [];
    for (const e of ordered) {
      if (!flags.visible.get(e.id)) continue;
      const layer = sc.layers[layerIdx.get(e.layerId) ?? -1];
      if (!layer?.visible) continue;
      if (!flags.locked.get(e.id) && !layer.locked) hittable.push(e);
      const sp = getComp(e, 'sprite');
      const asset = sp?.assetId ? p.assets[sp.assetId] : undefined;
      if (!sp || !asset?.art) continue;
      const anim = getComp(e, 'animator');
      objects.push({ layerId: e.layerId, matrix: mats.get(e.id)!, asset, frameId: frameAt(asset.art, anim?.animation, 0), flipX: sp.flipX, opacity: sp.opacity });
    }
    hittable.sort((a, b) => (layerIdx.get(a.layerId) ?? 0) - (layerIdx.get(b.layerId) ?? 0));
    frame.current = { scene: sc, mats, byId, hittable };

    const d = drag.current;
    renderWorld({
      ctx, width: W, height: H, dpr, camera: { x: view.cx, y: view.cy, zoom: view.zoom }, background: sc.background,
      layers: sc.layers, objects, parallax: false, pixelArt: p.settings.pixelArt,
      drawPaint: (layer, c) => {
        surfaces.current.get(layer.id)?.draw(c);
        if (d?.kind === 'paint' && d.layerId === layer.id) d.stroke.drawLive(c);
        return true;
      },
    });

    // ---- overlays (world space)
    const z = view.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - view.cx * z), dpr * (H / 2 - view.cy * z));
    ctx.lineWidth = 1 / z;
    if (ed.grid.show) {
      const g = ed.grid.size;
      if (g * z >= 5) {
        const x0 = view.cx - W / 2 / z, x1 = view.cx + W / 2 / z, y0 = view.cy - H / 2 / z, y1 = view.cy + H / 2 / z;
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.beginPath();
        for (let x = Math.floor(x0 / g) * g; x <= x1; x += g) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
        for (let y = Math.floor(y0 / g) * g; y <= y1; y += g) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
        ctx.stroke();
      }
    }
    // game frame (default camera view)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([6 / z, 4 / z]);
    ctx.strokeRect(0, 0, p.settings.width, p.settings.height);
    ctx.setLineDash([]);

    for (const e of ordered) {
      if (!flags.visible.get(e.id)) continue;
      const m = mats.get(e.id)!;
      const col = getComp(e, 'collider');
      if (col) {
        ctx.save();
        ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        ctx.strokeStyle = col.isTrigger ? 'rgba(255,211,77,0.9)' : 'rgba(80,255,120,0.85)';
        ctx.lineWidth = 1.5 / z / Math.max(0.01, Math.hypot(m[0], m[1]));
        ctx.strokeRect(col.ox - col.w / 2, col.oy - col.h / 2, col.w, col.h);
        ctx.restore();
      }
      const cam = getComp(e, 'camera');
      if (cam) {
        const w = p.settings.width / cam.zoom, h = p.settings.height / cam.zoom;
        ctx.strokeStyle = 'rgba(200,120,255,0.8)';
        ctx.strokeRect(m[4] - w / 2, m[5] - h / 2, w, h);
        ctx.fillStyle = 'rgba(200,120,255,0.9)';
        ctx.font = `${12 / z}px sans-serif`;
        ctx.fillText('📷 ' + e.name, m[4] - w / 2 + 4 / z, m[5] - h / 2 + 14 / z);
      }
      if (!getComp(e, 'sprite') && !col && e.kind === 'object' && !cam) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.moveTo(m[4] - 8 / z, m[5]); ctx.lineTo(m[4] + 8 / z, m[5]); ctx.moveTo(m[4], m[5] - 8 / z); ctx.lineTo(m[4], m[5] + 8 / z);
        ctx.stroke();
      }
    }

    // ---- overlays (screen space)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sel = ed.selection.map((id) => byId.get(id)).filter(Boolean) as Entity[];
    for (const e of sel) {
      const poly = selectionPoly(e, p, mats, W, H);
      if (!poly) continue;
      ctx.strokeStyle = '#4aa3ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      poly.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.stroke();
    }
    if (sel.length === 1 && ed.worldTool === 'select') {
      const h = handles(sel[0], p, mats, W, H);
      if (h) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#1d4ed8';
        for (const c of h.corners) { ctx.fillRect(c.x - 5, c.y - 5, 10, 10); ctx.strokeRect(c.x - 5, c.y - 5, 10, 10); }
        ctx.beginPath(); ctx.moveTo(h.top.x, h.top.y); ctx.lineTo(h.rot.x, h.rot.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(h.rot.x, h.rot.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    if (d?.kind === 'marquee' || d?.kind === 'collider') {
      const a = worldToScreen(d.start.x, d.start.y, W, H), b = worldToScreen(d.cur.x, d.cur.y, W, H);
      ctx.strokeStyle = d.kind === 'collider' ? '#50ff78' : '#4aa3ff';
      ctx.fillStyle = d.kind === 'collider' ? 'rgba(80,255,120,.12)' : 'rgba(74,163,255,.12)';
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    if ((ed.worldTool === 'paint' || ed.worldTool === 'erase') && hover.current) {
      const s = worldToScreen(hover.current.x, hover.current.y, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      drawBrushCursor(ctx, s.x, s.y, ed.brush, (ed.brush.size / 2) * z, d?.kind === 'paint' ? d.stroke.liveRadius * z : undefined);
    }
  }

  // ------------------------------------------------------------------ lifecycle
  useEffect(() => {
    const el = wrap.current!;
    gestures.current = new Gestures(el, () => view, setView, () => cancelDrag());
    const ro = new ResizeObserver(invalidate);
    ro.observe(el);
    const u1 = useProject.subscribe(invalidate);
    const u2 = useEditor.subscribe(invalidate);
    const u3 = onImageLoad(invalidate);
    const wheel = (e: WheelEvent) => gestures.current!.wheel(e);
    el.addEventListener('wheel', wheel, { passive: false });
    const key = (e: KeyboardEvent) => onKey(e, true);
    const keyUp = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', keyUp);
    invalidate();
    return () => { ro.disconnect(); u1(); u2(); u3(); el.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key); window.removeEventListener('keyup', keyUp); };
  }, []);

  function onKey(e: KeyboardEvent, down: boolean) {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.code === 'Space') { gestures.current!.spaceDown = down; return; }
    if (!down) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); }
    else if (mod && e.key.toLowerCase() === 'c') { copySelected(); }
    else if (mod && e.key.toLowerCase() === 'v') { paste(); }
    else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); editor().set({ selection: frame.current?.hittable.map((x) => x.id) ?? [] }); }
    else if (e.key === 'Escape') { cancelDrag(); editor().set({ selection: [] }); }
    else if (e.key.startsWith('Arrow') && editor().selection.length) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      const sel = new Set(editor().selection);
      useProject.getState().commit('Nudge', (d) => { for (const en of draftScene(d).entities) if (sel.has(en.id)) { en.x += dx; en.y += dy; } }, 'nudge');
    } else if (!mod) {
      const tl = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (tl) editor().set({ worldTool: tl.id });
    }
  }

  function cancelDrag() {
    const d = drag.current;
    drag.current = null;
    if (d && (d.kind === 'move' || d.kind === 'scale' || d.kind === 'rotate')) useProject.getState().cancel();
    // erasing edits the layer directly: drop the surface so it reloads from saved data
    if (d?.kind === 'paint' && d.stroke.erase) surfaces.current.delete(d.layerId);
    invalidate();
  }

  // ------------------------------------------------------------------ pointer input
  const W = () => wrap.current!.clientWidth, H = () => wrap.current!.clientHeight;
  const toWorld = (e: { clientX: number; clientY: number }) => screenToWorld(view, wrap.current!, e.clientX, e.clientY);
  const local = (e: { clientX: number; clientY: number }) => { const r = wrap.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const snap = (v: number) => { const g = editor().grid; return g.snap ? Math.round(v / g.size) * g.size : v; };

  function hitEntity(w: Vec2): Entity | null {
    const f = frame.current;
    if (!f) return null;
    const p = useProject.getState().project;
    // objects with real art/colliders win over bare markers (cameras, empties) on top of them
    for (const markers of [false, true]) {
      for (let i = f.hittable.length - 1; i >= 0; i--) {
        const e = f.hittable[i];
        const isMarker = !getComp(e, 'sprite') && !getComp(e, 'collider');
        if (isMarker !== markers) continue;
        const b = entityLocalBounds(e, p);
        if (!b) continue;
        const q = matApply(matInvert(f.mats.get(e.id)!), w.x, w.y);
        if (q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h) return e;
      }
    }
    return null;
  }

  function onPointerDown(e: React.PointerEvent) {
    const ne = e.nativeEvent;
    if (gestures.current!.down(ne)) { capture(e); return; }
    if (e.button !== 0) return;
    capture(e);
    const ed = editor();
    const p = useProject.getState().project;
    const f = frame.current;
    if (!f) return;
    const w = toWorld(e);
    if (ed.worldTool === 'pan') { gestures.current!.startPan(ne); return; }
    if (ed.worldTool === 'paint' || ed.worldTool === 'erase') {
      const layerId = activeWorldLayer(f.scene, 'Scenery');
      const layer = f.scene.layers.find((l) => l.id === layerId)!;
      if (layer.locked) { ed.set({ status: `Layer "${layer.name}" is locked` }); return; }
      const surf = surfaces.current.get(layerId)!;
      const stroke = new BrushStroke(surf, ed.brush, ed.worldTool === 'erase', useProject.getState().project.brushResources);
      stroke.begin(w.x, w.y, pressureOf(ne));
      drag.current = { kind: 'paint', stroke, layerId };
      invalidate();
      return;
    }
    if (ed.worldTool === 'collider') { drag.current = { kind: 'collider', start: { x: snap(w.x), y: snap(w.y) }, cur: { x: snap(w.x), y: snap(w.y) } }; return; }

    // select tool: handles first
    if (ed.selection.length === 1) {
      const sel = f.byId.get(ed.selection[0]);
      const h = sel && handles(sel, p, f.mats, W(), H());
      const s = local(e);
      const r = ne.pointerType === 'touch' ? 18 : 10;
      if (sel && h) {
        if (Math.hypot(s.x - h.rot.x, s.y - h.rot.y) < r) {
          const m = f.mats.get(sel.id)!;
          useProject.getState().begin();
          drag.current = { kind: 'rotate', id: sel.id, center: { x: m[4], y: m[5] }, a0: Math.atan2(w.y - m[5], w.x - m[4]), rot0: sel.rotation };
          return;
        }
        if (h.corners.some((c) => Math.hypot(s.x - c.x, s.y - c.y) < r)) {
          const m0 = matMul(parentMatrix(sel, f.mats), matFromTRS(sel.x, sel.y, sel.rotation, 1, 1));
          const inv = matInvert(m0);
          useProject.getState().begin();
          drag.current = { kind: 'scale', id: sel.id, m0inv: inv, p0: matApply(inv, w.x, w.y), sx0: sel.scaleX, sy0: sel.scaleY };
          return;
        }
      }
    }
    const hit = hitEntity(w);
    if (hit) {
      let selection = ed.selection;
      if (e.shiftKey) selection = selection.includes(hit.id) ? selection.filter((x) => x !== hit.id) : [...selection, hit.id];
      else if (!selection.includes(hit.id)) selection = [hit.id];
      ed.set({ selection });
      if (!selection.includes(hit.id)) return;
      const starts = new Map<string, Vec2>(), inv = new Map<string, Mat>();
      for (const id of selection) {
        const en = f.byId.get(id);
        if (!en || en.locked) continue;
        starts.set(id, { x: en.x, y: en.y });
        inv.set(id, matInvert(parentMatrix(en, f.mats)));
      }
      useProject.getState().begin();
      drag.current = { kind: 'move', starts, inv, startWorld: w, primary: hit.id, moved: false };
    } else {
      drag.current = { kind: 'marquee', start: w, cur: w, base: e.shiftKey ? ed.selection : [] };
      if (!e.shiftKey) ed.set({ selection: [] });
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const ne = e.nativeEvent;
    if (gestures.current!.move(ne)) return;
    const w = toWorld(e);
    hover.current = w;
    const d = drag.current;
    if (!d) { if (editor().worldTool === 'paint' || editor().worldTool === 'erase') invalidate(); return; }
    if (d.kind === 'paint') {
      for (const ce of coalesced(ne)) { const q = toWorld(ce); d.stroke.move(q.x, q.y, pressureOf(ce)); }
      invalidate();
    } else if (d.kind === 'move') {
      let dx = w.x - d.startWorld.x, dy = w.y - d.startWorld.y;
      if (!d.moved && Math.hypot(dx, dy) * view.zoom < 3) return;
      d.moved = true;
      const g = editor().grid;
      useProject.getState().live((draft) => {
        const ents = draftScene(draft).entities;
        const ps = d.starts.get(d.primary);
        let adjX = 0, adjY = 0;
        if (g.snap && ps) {
          const pi = d.inv.get(d.primary)!;
          const lx = ps.x + (matApply(pi, dx, dy).x - matApply(pi, 0, 0).x), ly = ps.y + (matApply(pi, dx, dy).y - matApply(pi, 0, 0).y);
          adjX = snap(lx) - lx; adjY = snap(ly) - ly;
        }
        for (const en of ents) {
          const s = d.starts.get(en.id);
          if (!s) continue;
          const inv = d.inv.get(en.id)!;
          const o = matApply(inv, 0, 0), v = matApply(inv, dx, dy);
          en.x = s.x + v.x - o.x + adjX;
          en.y = s.y + v.y - o.y + adjY;
        }
      });
    } else if (d.kind === 'scale') {
      const q = matApply(d.m0inv, w.x, w.y);
      let kx = Math.abs(d.p0.x) > 1 ? q.x / d.p0.x : 1, ky = Math.abs(d.p0.y) > 1 ? q.y / d.p0.y : 1;
      if (e.shiftKey) { const k = Math.max(Math.abs(kx), Math.abs(ky)); kx = k * Math.sign(kx || 1); ky = k * Math.sign(ky || 1); }
      useProject.getState().live((draft) => {
        const en = draftScene(draft).entities.find((x) => x.id === d.id);
        if (en) { en.scaleX = round3(d.sx0 * kx); en.scaleY = round3(d.sy0 * ky); }
      });
    } else if (d.kind === 'rotate') {
      let deg = d.rot0 + ((Math.atan2(w.y - d.center.y, w.x - d.center.x) - d.a0) * 180) / Math.PI;
      if (e.shiftKey || editor().grid.snap) deg = Math.round(deg / 15) * 15;
      useProject.getState().live((draft) => {
        const en = draftScene(draft).entities.find((x) => x.id === d.id);
        if (en) en.rotation = round3(((deg % 360) + 360) % 360);
      });
    } else if (d.kind === 'marquee') {
      d.cur = w;
      const f = frame.current!;
      const x0 = Math.min(d.start.x, w.x), x1 = Math.max(d.start.x, w.x), y0 = Math.min(d.start.y, w.y), y1 = Math.max(d.start.y, w.y);
      const inside = f.hittable.filter((en) => { const m = f.mats.get(en.id)!; return en.kind === 'object' && m[4] >= x0 && m[4] <= x1 && m[5] >= y0 && m[5] <= y1; }).map((en) => en.id);
      editor().set({ selection: [...new Set([...d.base, ...inside])] });
    } else if (d.kind === 'collider') {
      d.cur = { x: snap(w.x), y: snap(w.y) };
      invalidate();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (gestures.current!.up(e.nativeEvent)) return;
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'paint') {
      const dirty = d.stroke.end();
      const data = d.stroke.layer.export(dirty);
      if (Object.keys(data).length) {
        useProject.getState().commit(d.stroke.erase ? 'Erase in world' : 'Paint in world', (draft) => {
          const l = draftScene(draft).layers.find((x) => x.id === d.layerId);
          if (l) Object.assign(l.paint, data);
        });
      }
    } else if (d.kind === 'move') {
      useProject.getState().end('Move');
    } else if (d.kind === 'scale') {
      useProject.getState().end('Scale');
    } else if (d.kind === 'rotate') {
      useProject.getState().end('Rotate');
    } else if (d.kind === 'collider') {
      const w = Math.abs(d.cur.x - d.start.x), h = Math.abs(d.cur.y - d.start.y);
      if (w > 2 && h > 2) {
        const sc = frame.current!.scene;
        const layerId = (sc.layers.find((l) => l.name === 'Collision') ?? sc.layers[sc.layers.length - 1]).id;
        const en = newEntity(layerId, 'Collision Box', {
          x: Math.round((d.start.x + d.cur.x) / 2), y: Math.round((d.start.y + d.cur.y) / 2),
          components: [{ type: 'collider', w: Math.round(w), h: Math.round(h), ox: 0, oy: 0, isTrigger: false }],
        });
        useProject.getState().commit('Add collision box', (draft) => { draftScene(draft).entities.push(en); });
        editor().set({ selection: [en.id] });
      }
    }
    invalidate();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const w = toWorld(e);
    const assetId = e.dataTransfer.getData('text/x-asset');
    const prefabId = e.dataTransfer.getData('text/x-prefab');
    if (assetId) placeAsset(assetId, snap(w.x), snap(w.y));
    else if (prefabId) placePrefab(prefabId, snap(w.x), snap(w.y));
  }

  const ed = useEditor();
  return (
    <div className="viewport" ref={wrap} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <canvas ref={canvasRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onPointerLeave={() => { hover.current = null; invalidate(); }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }} />
      <div className="float vert toolbox">
        {TOOLS.map((t) => <IconBtn key={t.id} icon={t.icon} title={t.tip} on={tool === t.id} onClick={() => ed.set({ worldTool: t.id })} />)}
        <span className="sep" />
        <IconBtn icon="undo" title="Undo" onClick={() => useProject.getState().undo()} />
        <IconBtn icon="redo" title="Redo" onClick={() => useProject.getState().redo()} />
      </div>
      {(tool === 'paint' || tool === 'erase') && <BrushSliders />}
      <div className="float topright">
        <ModeSwitch />
        <span className="sep" />
        {(tool === 'paint' || tool === 'erase') && (
          <>
            <select value={activeLayer} onChange={(e) => ed.set({ activeWorldLayerId: e.target.value })} title="Paint layer">
              {scene.layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {tool === 'paint' && <ColorSwatch />}
            <span className="sep" />
          </>
        )}
        <IconBtn icon="grid" title="Grid" on={grid.show} onClick={() => ed.set({ grid: { ...grid, show: !grid.show } })} />
        <IconBtn icon="magnet" title="Snap" on={grid.snap} onClick={() => ed.set({ grid: { ...grid, snap: !grid.snap } })} />
        <select value={grid.size} title="Grid size" onChange={(e) => ed.set({ grid: { ...grid, size: Number(e.target.value) } })}>
          {[8, 16, 32, 64, 128].map((sz) => <option key={sz} value={sz}>{sz}</option>)}
        </select>
        <span className="sep" />
        <button className="pill" onClick={() => setView({ cx: 480, cy: 270, zoom: 1 })} title="Reset view">{Math.round(zoomLabel * 100)}%</button>
      </div>
    </div>
  );
}

function round3(v: number) { return Math.round(v * 1000) / 1000; }

function selectionPoly(e: Entity, p: Project, mats: Map<string, Mat>, W: number, H: number): Vec2[] | null {
  const b = entityLocalBounds(e, p);
  const m = mats.get(e.id);
  if (!b || !m) return null;
  return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => {
    const q = matApply(m, x, y);
    return { x: (q.x - view.cx) * view.zoom + W / 2, y: (q.y - view.cy) * view.zoom + H / 2 };
  });
}

function handles(e: Entity, p: Project, mats: Map<string, Mat>, W: number, H: number) {
  const poly = selectionPoly(e, p, mats, W, H);
  if (!poly) return null;
  const top = { x: (poly[0].x + poly[1].x) / 2, y: (poly[0].y + poly[1].y) / 2 };
  const ctr = { x: (poly[0].x + poly[2].x) / 2, y: (poly[0].y + poly[2].y) / 2 };
  let dx = top.x - ctr.x, dy = top.y - ctr.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  return { corners: poly, top, rot: { x: top.x + dx * 26, y: top.y + dy * 26 } };
}
