import type { BrushResource } from '../core/types';
import { getImage, isReady } from './imageCache';
import { makeCanvas } from './surface';

/**
 * Brush tips (dab shapes) and paper textures (grain). Built-ins are generated procedurally
 * (no image files to ship); imported ones come from images stored in the project.
 * Tip masks are white with coverage in alpha. Grains are greyscale: light = paint passes.
 */

export const BUILTIN_TIPS = [
  { id: 'round', name: 'Round' },
  { id: 'square', name: 'Square' },
  { id: 'pencil', name: 'Pencil' },
  { id: 'chalk', name: 'Chalk' },
  { id: 'bristle', name: 'Bristle' },
  { id: 'splatter', name: 'Splatter' },
  { id: 'leaf', name: 'Leaf' },
  { id: 'grass', name: 'Grass' },
];

export const BUILTIN_GRAINS = [
  { id: 'paper', name: 'Paper' },
  { id: 'canvas', name: 'Canvas' },
  { id: 'noise', name: 'Noise' },
  { id: 'hatch', name: 'Hatching' },
];

const TIP = 128;
const GRAIN = 256;

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
  g.globalAlpha = a;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function builtinTip(id: string): HTMLCanvasElement | null {
  const c = makeCanvas(TIP, TIP);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  const R = rng(id.length * 9973 + id.charCodeAt(0));
  const h = TIP / 2;
  switch (id) {
    case 'round': {
      const grad = g.createRadialGradient(h, h, 0, h, h, h);
      grad.addColorStop(0, '#fff'); grad.addColorStop(0.7, '#fff'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, TIP, TIP);
      break;
    }
    case 'square': g.fillRect(0, 0, TIP, TIP); break;
    case 'pencil': // mostly solid graphite with a slightly broken edge
      g.beginPath(); g.arc(h, h, h * 0.88, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 500; i++) {
        const a = R() * Math.PI * 2, d = h * (0.8 + R() * 0.2);
        dot(g, h + Math.cos(a) * d, h + Math.sin(a) * d, 1.5 + R() * 3, 0.6 + R() * 0.4);
      }
      break;
    case 'chalk':
      for (let i = 0; i < 420; i++) {
        const a = R() * Math.PI * 2, d = Math.pow(R(), 0.8) * h * 0.9;
        dot(g, h + Math.cos(a) * d, h + Math.sin(a) * d, 3 + R() * 8, 0.45 + R() * 0.55);
      }
      break;
    case 'bristle': // a vertical row of hairs: with "follow" rotation they drag along the stroke
      for (let i = 0; i < 22; i++) {
        const y = 8 + (i / 21) * (TIP - 16) + (R() - 0.5) * 4;
        dot(g, h + (R() - 0.5) * 10, y, 3 + R() * 3, 0.7 + R() * 0.3);
      }
      break;
    case 'splatter':
      for (let i = 0; i < 26; i++) {
        const a = R() * Math.PI * 2, d = Math.pow(R(), 0.6) * h * 0.85;
        dot(g, h + Math.cos(a) * d, h + Math.sin(a) * d, 1.5 + Math.pow(R(), 2.5) * 16, 1);
      }
      break;
    case 'leaf':
      g.beginPath();
      g.moveTo(h, 6);
      g.quadraticCurveTo(TIP - 18, h, h, TIP - 6);
      g.quadraticCurveTo(18, h, h, 6);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = 3;
      g.strokeStyle = '#000';
      g.beginPath(); g.moveTo(h, 14); g.lineTo(h, TIP - 14); g.stroke();
      break;
    case 'grass':
      for (let i = 0; i < 7; i++) {
        const x = 18 + i * 15 + (R() - 0.5) * 8, lean = (R() - 0.5) * 30;
        g.beginPath();
        g.moveTo(x - 4, TIP - 4);
        g.quadraticCurveTo(x + lean * 0.3, h, x + lean, 8 + R() * 30);
        g.quadraticCurveTo(x + lean * 0.3 + 3, h, x + 4, TIP - 4);
        g.fill();
      }
      break;
    default: return null;
  }
  return c;
}

/** Tileable value noise (wraps at `period`). */
function tileNoise(R: () => number, size: number, period: number) {
  const grid = Array.from({ length: period * period }, () => R());
  const at = (x: number, y: number) => grid[((y % period) + period) % period * period + ((x % period) + period) % period];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * period, fy = (y / size) * period;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    out[y * size + x] = a + (b - a) * sy;
  }
  return out;
}

function builtinGrain(id: string): Float32Array | null {
  const R = rng(id.charCodeAt(0) * 131 + id.length);
  const N = GRAIN * GRAIN;
  const v = new Float32Array(N);
  switch (id) {
    case 'paper': {
      const octaves: [number, number][] = [[8, 0.35], [16, 0.25], [32, 0.2], [64, 0.12], [128, 0.08]];
      for (const [period, w] of octaves) { const n = tileNoise(R, GRAIN, period); for (let i = 0; i < N; i++) v[i] += n[i] * w; }
      break;
    }
    case 'canvas': {
      const n = tileNoise(R, GRAIN, 64);
      for (let y = 0; y < GRAIN; y++) for (let x = 0; x < GRAIN; x++) {
        const wx = Math.sin((x / GRAIN) * Math.PI * 2 * 32), wy = Math.sin((y / GRAIN) * Math.PI * 2 * 32);
        const weave = (x + y) % 2 ? 0 : 0.05;
        v[y * GRAIN + x] = 0.55 + 0.25 * (Math.abs(wx) > Math.abs(wy) ? wx : wy) * 0.5 + n[y * GRAIN + x] * 0.25 + weave;
      }
      break;
    }
    case 'noise': for (let i = 0; i < N; i++) v[i] = R(); break;
    case 'hatch':
      for (let y = 0; y < GRAIN; y++) for (let x = 0; x < GRAIN; x++) {
        const d = ((x + y) % 16) / 16;
        v[y * GRAIN + x] = d < 0.45 ? 1 : 0.15 + R() * 0.15;
      }
      break;
    default: return null;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) { lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]); }
  for (let i = 0; i < N; i++) v[i] = (v[i] - lo) / (hi - lo || 1);
  return v;
}

// ---------------------------------------------------------------- caches

const tipCache = new Map<string, HTMLCanvasElement>();
const grainCache = new Map<string, { size: number; v: Float32Array }>();
const grainAlphaCache = new Map<string, HTMLCanvasElement>();

function resource(id: string, resources: BrushResource[]) {
  return resources.find((r) => r.id === id);
}

/** Pixels of an image resource, or null while it is still loading. */
function imagePixels(r: BrushResource, size: number): ImageData | null {
  const img = getImage(r.data);
  if (!isReady(img)) return null;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const k = Math.min(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return g.getImageData(0, 0, size, size);
}

/** Tip mask (white + alpha), or null for the plain round tip / unknown / still loading. */
export function tipMask(id: string, resources: BrushResource[] = []): HTMLCanvasElement | null {
  const key = id + '|' + (resource(id, resources)?.data.length ?? 0);
  const hit = tipCache.get(key);
  if (hit) return hit;
  let c: HTMLCanvasElement | null = null;
  const r = resource(id, resources);
  if (r) {
    const px = imagePixels(r, 256);
    if (!px) return null;
    const d = px.data;
    let transparent = false;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { transparent = true; break; }
    // images with transparency use their alpha; solid images use darkness (black = paint)
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
      const a = (transparent ? d[i + 3] : 255 - lum) / 255;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(255 * (1 - (1 - a) * (1 - a)));
    }
    c = makeCanvas(256, 256);
    c.getContext('2d')!.putImageData(px, 0, 0);
  } else {
    c = builtinTip(id);
  }
  if (c) tipCache.set(key, c);
  return c;
}

function grainValues(id: string, resources: BrushResource[]): { size: number; v: Float32Array } | null {
  const r = resource(id, resources);
  const key = id + '|' + (r?.data.length ?? 0);
  const hit = grainCache.get(key);
  if (hit) return hit;
  let out: { size: number; v: Float32Array } | null = null;
  if (r) {
    const px = imagePixels(r, GRAIN);
    if (!px) return null;
    const v = new Float32Array(GRAIN * GRAIN);
    for (let i = 0; i < v.length; i++) v[i] = (px.data[i * 4] * 0.3 + px.data[i * 4 + 1] * 0.59 + px.data[i * 4 + 2] * 0.11) / 255;
    out = { size: GRAIN, v };
  } else {
    const v = builtinGrain(id);
    if (v) out = { size: GRAIN, v };
  }
  if (out) grainCache.set(key, out);
  return out;
}

/** White canvas whose alpha = how much paint passes, for a given texture strength. */
export function grainAlpha(id: string, strength: number, resources: BrushResource[] = []): HTMLCanvasElement | null {
  const s = Math.round(Math.max(0, Math.min(1, strength)) * 20) / 20;
  const g = grainValues(id, resources);
  if (!g) return null;
  const key = id + '|' + s + '|' + g.v.length + '|' + (resource(id, resources)?.data.length ?? 0);
  const hit = grainAlphaCache.get(key);
  if (hit) return hit;
  const c = makeCanvas(g.size, g.size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(g.size, g.size);
  for (let i = 0; i < g.v.length; i++) {
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
    const pit = 1 - g.v[i];
    img.data[o + 3] = Math.round(255 * (1 - s * pit * pit));
  }
  ctx.putImageData(img, 0, 0);
  grainAlphaCache.set(key, c);
  return c;
}

/** Greyscale preview of a grain (for thumbnails). */
export function grainPreview(id: string, resources: BrushResource[] = []): HTMLCanvasElement | null {
  const g = grainValues(id, resources);
  if (!g) return null;
  const c = makeCanvas(g.size, g.size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(g.size, g.size);
  for (let i = 0; i < g.v.length; i++) { const o = i * 4, l = Math.round(g.v[i] * 255); img.data[o] = img.data[o + 1] = img.data[o + 2] = l; img.data[o + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Paint a mask in a color (used for brush stamps). */
export function colorize(mask: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = makeCanvas(mask.width, mask.height);
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask, 0, 0);
  return c;
}
