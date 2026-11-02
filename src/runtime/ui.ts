import type { Project, UIElement } from '../core/types';
import { getFrameCanvas } from '../render/compose';
import { formatValue } from './nodes';

/**
 * Screen-space game UI, shared by the runtime and the UI editor. Elements are laid out in
 * "design pixels" (project resolution) relative to anchors on the actual screen, so a
 * top-right button stays top-right on both a 16:9 PC and a 4:3 iPad.
 */

export interface UIState { text?: string; visible?: boolean; value?: number; pressed?: boolean }

export interface UIView { cw: number; ch: number; W: number; H: number; ox?: number; oy?: number }

export function uiScale(v: UIView) {
  const s = Math.min(v.cw / v.W, v.ch / v.H) || 1;
  return { s, sw: v.cw / s, sh: v.ch / s };
}

export function uiRect(e: UIElement, sw: number, sh: number) {
  return { x: e.anchorX * sw + e.x - e.pivotX * e.w, y: e.anchorY * sh + e.y - e.pivotY * e.h, w: e.w, h: e.h };
}

export function formatTemplate(text: string, getVar: (name: string) => unknown) {
  return text.replace(/\{([\w.]+)\}/g, (_, n) => formatValue(getVar(n)));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawUI(ctx: CanvasRenderingContext2D, elements: UIElement[], view: UIView & { dpr: number }, project: Project,
  state: Map<string, UIState>, getVar: (name: string) => unknown, editor = false) {
  const { s, sw, sh } = uiScale(view);
  ctx.save();
  ctx.setTransform(view.dpr * s, 0, 0, view.dpr * s, view.dpr * (view.ox ?? 0), view.dpr * (view.oy ?? 0));
  for (const e of elements) {
    const st = state.get(e.id);
    const visible = st?.visible ?? e.visible;
    if (!visible && !editor) continue;
    const r = uiRect(e, sw, sh);
    ctx.globalAlpha = e.opacity * (visible ? 1 : 0.3);
    if (e.kind === 'image') {
      const art = e.assetId ? project.assets[e.assetId]?.art : undefined;
      if (art?.frames[0]) ctx.drawImage(getFrameCanvas(art, art.frames[0].id), r.x, r.y, r.w, r.h);
      else if (editor) { ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.strokeRect(r.x, r.y, r.w, r.h); }
    }
    if (e.fill) { roundRect(ctx, r.x, r.y, r.w, r.h, e.radius); ctx.fillStyle = e.fill; ctx.fill(); }
    if (e.kind === 'bar') {
      const raw = st?.value ?? Number(e.barVar ? getVar(e.barVar) : 0);
      const t = Math.max(0, Math.min(1, (Number(raw) || 0) / (e.barMax || 1)));
      if (t > 0) { roundRect(ctx, r.x, r.y, r.w * t, r.h, e.radius); ctx.fillStyle = e.barColor; ctx.fill(); }
    }
    if (e.kind === 'button' && st?.pressed) { roundRect(ctx, r.x, r.y, r.w, r.h, e.radius); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill(); }
    if (e.stroke) { roundRect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, e.radius); ctx.strokeStyle = e.stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
    const text = st?.text ?? (e.text ? formatTemplate(e.text, getVar) : '');
    if (text && e.kind !== 'image' && e.kind !== 'bar') {
      ctx.fillStyle = e.textColor;
      ctx.font = `600 ${e.fontSize}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = e.align;
      const pad = e.kind === 'text' ? 0 : 10;
      const tx = e.align === 'left' ? r.x + pad : e.align === 'right' ? r.x + r.w - pad : r.x + r.w / 2;
      ctx.fillText(text, tx, r.y + r.h / 2);
    }
  }
  ctx.restore();
}

/** Topmost visible button under a point given in CSS pixels. */
export function hitUI(elements: UIElement[], px: number, py: number, view: UIView, state: Map<string, UIState>, any = false): UIElement | null {
  const { s, sw, sh } = uiScale(view);
  const x = (px - (view.ox ?? 0)) / s, y = (py - (view.oy ?? 0)) / s;
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i];
    if (!any && (e.kind !== 'button' || !(state.get(e.id)?.visible ?? e.visible))) continue;
    const r = uiRect(e, sw, sh);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return e;
  }
  return null;
}
