import { TiledSurface, makeCanvas } from './surface';

export type { BrushSettings } from '../core/types';
import type { BrushResource, BrushSettings } from '../core/types';
import { fullBrush } from '../core/defaults';
import { colorize, grainAlpha, tipMask } from './brushTips';

/**
 * Pen pressure response. A soft curve so a normal press reaches near full size/opacity
 * (raw tablet pressure is usually only 0.3-0.6 in normal drawing).
 */
export function pressureCurve(p: number) {
  return Math.pow(Math.min(1, Math.max(0, p)), 0.4);
}
const sizeFactor = (s: BrushSettings, p: number) => (s.pressureSize ? Math.max(0.2, pressureCurve(p)) : 1);
const alphaFactor = (s: BrushSettings, p: number) => (s.pressureOpacity ? Math.max(0.15, pressureCurve(p)) : 1);

/** Outline of the brush at a screen point: tip shape (angle/roundness), radius in screen px. */
export function drawBrushCursor(ctx: CanvasRenderingContext2D, x: number, y: number, s: BrushSettings, screenRadius: number, liveRadius?: number) {
  const draw = (r: number, dash: boolean) => {
    const rx = Math.max(1, r), ry = Math.max(1, r * (s.roundness ?? 1));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((s.angle ?? 0) * Math.PI) / 180);
    ctx.setLineDash(dash ? [3, 3] : []);
    for (const [color, w] of [['rgba(0,0,0,.65)', 3], ['rgba(255,255,255,.95)', 1]] as const) {
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  };
  draw(screenRadius, liveRadius != null);
  if (liveRadius != null) draw(liveRadius, false); // actual size at the current pen pressure
  if (screenRadius < 4) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 0.5, y - 0.5, 1, 1); }
}

function makeStamp(color: string, hardness: number, radius: number): HTMLCanvasElement {
  const r = Math.max(1, Math.ceil(radius));
  const c = makeCanvas(r * 2 + 2, r * 2 + 2);
  const g = c.getContext('2d')!;
  const cx = r + 1;
  if (hardness >= 0.99) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.fill();
  } else {
    const grad = g.createRadialGradient(cx, cx, 0, cx, cx, r);
    grad.addColorStop(0, color);
    grad.addColorStop(Math.max(0, Math.min(0.99, hardness)), color);
    grad.addColorStop(1, hexAlpha(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

function hexAlpha(color: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return `rgba(0,0,0,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * One brush/eraser stroke. Paint dabs go to a stroke buffer which is composited onto the
 * layer at the stroke's opacity when the stroke ends (so overlapping dabs don't build up past
 * it; "flow" controls build-up within the stroke). A paper texture (grain) masks the buffer.
 * Eraser dabs cut directly into the layer.
 */
export class BrushStroke {
  buffer: TiledSurface;
  dirty = new Set<string>();
  s: BrushSettings;
  private stamp: HTMLCanvasElement;
  private stampW: number; // stamp aspect, as fractions of the diameter
  private stampH: number;
  private radius: number;
  private grain: HTMLCanvasElement | null;
  private masked = new Map<string, { canvas: HTMLCanvasElement; dirty: boolean }>();
  private last: { x: number; y: number; p: number } | null = null;
  private smooth: { x: number; y: number; p: number } | null = null;
  private raw: { x: number; y: number; p: number } | null = null;
  private residual = 0;
  private dir = 0;
  private stampPad = 1; // stamp canvas size / tip diameter (round stamps have a 1px margin)
  /** Radius of the most recent dab (before jitter), for the on-canvas cursor. */
  liveRadius = 0;

  constructor(public layer: TiledSurface, settings: BrushSettings, public erase: boolean, resources: BrushResource[] = []) {
    this.s = fullBrush(settings);
    this.buffer = new TiledSurface(layer.tileW, layer.tileH, layer.bounded);
    this.radius = Math.max(0.5, this.s.size / 2);
    const color = erase ? '#000000' : this.s.color;
    const mask = this.s.tip !== 'round' ? tipMask(this.s.tip, resources) : null;
    const sr = Math.max(1, Math.ceil(Math.max(this.radius, 8)));
    this.stamp = mask ? colorize(mask, color) : makeStamp(color, this.s.hardness, sr);
    if (!mask) this.stampPad = this.stamp.width / (2 * sr);
    const big = Math.max(this.stamp.width, this.stamp.height);
    this.stampW = this.stamp.width / big;
    this.stampH = this.stamp.height / big;
    this.grain = !erase && this.s.grain ? grainAlpha(this.s.grain, this.s.grainStrength, resources) : null;
  }

  private dab(x: number, y: number, p: number) {
    const s = this.s;
    this.liveRadius = this.radius * sizeFactor(s, p);
    const r = this.liveRadius * (1 - s.sizeJitter * Math.random());
    const a = alphaFactor(s, p) * s.flow * (1 - s.opacityJitter * Math.random());
    if (s.scatter > 0) {
      const ang = Math.random() * Math.PI * 2, dist = Math.random() * s.scatter * this.radius * 2;
      x += Math.cos(ang) * dist; y += Math.sin(ang) * dist;
    }
    const rot = (s.angle * Math.PI) / 180 + (s.rotation === 'follow' ? this.dir : s.rotation === 'random' ? Math.random() * Math.PI * 2 : 0);
    const dw = 2 * r * this.stampW * this.stampPad, dh = 2 * r * this.stampH * this.stampPad * Math.max(0.05, s.roundness);
    const ext = Math.hypot(dw, dh) / 2 + 1;
    const target = this.erase ? this.layer : this.buffer;
    for (const t of target.tilesInRect(x - ext, y - ext, x + ext, y + ext, !this.erase)) {
      const ox = t.tx * target.tileW, oy = t.ty * target.tileH;
      const k = TiledSurface.key(t.tx, t.ty);
      const ctx = t.ctx;
      ctx.save();
      if (this.erase) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = a * s.opacity;
        this.dirty.add(k);
      } else {
        ctx.globalAlpha = a;
        const m = this.masked.get(k);
        if (m) m.dirty = true;
      }
      ctx.translate(x - ox, y - oy);
      if (rot) ctx.rotate(rot);
      ctx.drawImage(this.stamp, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
  }

  /** Buffer tile with the paper texture applied (anchored to surface coordinates). */
  private texturedTile(k: string, t: { tx: number; ty: number; canvas: HTMLCanvasElement }): HTMLCanvasElement {
    if (!this.grain) return t.canvas;
    let m = this.masked.get(k);
    if (!m) { m = { canvas: makeCanvas(t.canvas.width, t.canvas.height), dirty: true }; this.masked.set(k, m); }
    if (m.dirty) {
      const g = m.canvas.getContext('2d')!;
      g.globalCompositeOperation = 'copy';
      g.drawImage(t.canvas, 0, 0);
      g.globalCompositeOperation = 'destination-in';
      const pat = g.createPattern(this.grain, 'repeat')!;
      const sc = Math.max(0.1, this.s.grainScale);
      pat.setTransform(new DOMMatrix().translate(-t.tx * this.buffer.tileW, -t.ty * this.buffer.tileH).scale(sc));
      g.fillStyle = pat;
      g.fillRect(0, 0, m.canvas.width, m.canvas.height);
      g.globalCompositeOperation = 'source-over';
      m.dirty = false;
    }
    return m.canvas;
  }

  begin(x: number, y: number, p: number) {
    this.last = { x, y, p };
    this.smooth = { x, y, p };
    this.raw = { x, y, p };
    this.residual = 0;
    this.dab(x, y, p);
  }

  move(x: number, y: number, p: number) {
    if (!this.last || !this.smooth) return this.begin(x, y, p);
    this.raw = { x, y, p };
    // stabilizer: chase the pointer instead of jumping to it
    const k = 1 - Math.min(0.95, Math.max(0, this.s.smoothing));
    const sm = this.smooth;
    sm.x += (x - sm.x) * k; sm.y += (y - sm.y) * k; sm.p += (p - sm.p) * k;
    this.lineTo(sm.x, sm.y, sm.p);
  }

  private lineTo(x: number, y: number, p: number) {
    const last = this.last!;
    const dx = x - last.x, dy = y - last.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) return;
    this.dir = Math.atan2(dy, dx);
    const r = this.radius * sizeFactor(this.s, p);
    const step = Math.max(0.5, r * 2 * this.s.spacing);
    let d = step - this.residual;
    while (d <= dist) {
      const t = d / dist;
      this.dab(last.x + dx * t, last.y + dy * t, last.p + (p - last.p) * t);
      d += step;
    }
    this.residual = dist - (d - step);
    this.last = { x, y, p };
  }

  /** Finish: composite the buffer into the layer. Returns the tile keys that changed. */
  end(): Set<string> {
    if (this.raw && this.s.smoothing > 0) this.lineTo(this.raw.x, this.raw.y, this.raw.p); // catch up to the pen
    if (!this.erase) {
      for (const [k, bt] of this.buffer.tiles) {
        const lt = this.layer.getTile(bt.tx, bt.ty, true);
        if (!lt) continue;
        lt.ctx.save();
        lt.ctx.globalAlpha = this.s.opacity;
        lt.ctx.drawImage(this.texturedTile(k, bt), 0, 0);
        lt.ctx.restore();
        this.dirty.add(k);
      }
    }
    return this.dirty;
  }

  /** Draw the in-progress stroke preview (in surface coordinates). */
  drawLive(ctx: CanvasRenderingContext2D) {
    if (this.erase) return;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * this.s.opacity;
    for (const [k, t] of this.buffer.tiles) ctx.drawImage(this.texturedTile(k, t), t.tx * this.buffer.tileW, t.ty * this.buffer.tileH);
    ctx.globalAlpha = prev;
  }
}

/**
 * Scanline flood fill. The region is found in `sample` (e.g. all visible layers merged) and
 * painted into `canvas` (the active layer). Returns true if anything changed.
 */
export function floodFill(canvas: HTMLCanvasElement, sx: number, sy: number, color: string, tolerance: number, sample: HTMLCanvasElement = canvas): boolean {
  const w = canvas.width, h = canvas.height;
  sx = Math.floor(sx); sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, w, h);
  const out = img.data;
  const d = sample === canvas ? out : sample.getContext('2d')!.getImageData(0, 0, w, h).data;
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  const n = m ? parseInt(m[1], 16) : 0;
  const fr = (n >> 16) & 255, fg = (n >> 8) & 255, fb = n & 255;
  const i0 = (sy * w + sx) * 4;
  const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2], ta = d[i0 + 3];
  if (sample === canvas && tr === fr && tg === fg && tb === fb && ta === 255) return false;
  const tol = tolerance * 4;
  const match = (i: number) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) + Math.abs(d[i + 3] - ta) <= tol;
  const seen = new Uint8Array(w * h);
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!, x0 = stack.pop()!;
    let x = x0;
    while (x >= 0 && !seen[y * w + x] && match((y * w + x) * 4)) x--;
    x++;
    let up = false, down = false;
    while (x < w && !seen[y * w + x] && match((y * w + x) * 4)) {
      const p = y * w + x, i = p * 4;
      seen[p] = 1;
      out[i] = fr; out[i + 1] = fg; out[i + 2] = fb; out[i + 3] = 255;
      if (y > 0) {
        const q = p - w;
        if (!seen[q] && match(q * 4)) { if (!up) { stack.push(x, y - 1); up = true; } } else up = false;
      }
      if (y < h - 1) {
        const q = p + w;
        if (!seen[q] && match(q * 4)) { if (!down) { stack.push(x, y + 1); down = true; } } else down = false;
      }
      x++;
    }
  }
  ctx.putImageData(img, 0, 0);
  return true;
}
