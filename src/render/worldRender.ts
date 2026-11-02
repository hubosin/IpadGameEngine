import type { Asset, WorldLayer } from '../core/types';
import type { Mat } from '../core/geometry';
import { drawAsset } from './compose';
import { getImage, isReady } from './imageCache';

/** Shared scene renderer used by both the World editor and the game runtime. */

export const CHUNK = 512;

export interface RenderObject {
  layerId: string;
  matrix: Mat;
  asset?: Asset;
  frameId: string | null;
  flipX: boolean;
  opacity: number;
}

export interface Camera { x: number; y: number; zoom: number }

export interface WorldRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number; // CSS px
  height: number;
  dpr: number;
  camera: Camera;
  background: string;
  layers: WorldLayer[];
  objects: RenderObject[];
  parallax: boolean;
  pixelArt?: boolean;
  /** Override paint-layer drawing (the editor draws its live surfaces). Return true if handled. */
  drawPaint?: (layer: WorldLayer, ctx: CanvasRenderingContext2D) => boolean;
  /** Called per layer after its contents are drawn, still in that layer's world transform. */
  afterLayer?: (layer: WorldLayer, ctx: CanvasRenderingContext2D) => void;
}

export function layerTransform(p: WorldRenderParams, parallax: number): Mat {
  const { dpr, camera: c } = p;
  const z = c.zoom * dpr;
  return [z, 0, 0, z, dpr * (p.width / 2) - c.x * parallax * z, dpr * (p.height / 2) - c.y * parallax * z];
}

export function drawPaintChunks(ctx: CanvasRenderingContext2D, paint: Record<string, string>) {
  for (const [k, src] of Object.entries(paint)) {
    const img = getImage(src);
    if (!isReady(img)) continue;
    const [cx, cy] = k.split(',').map(Number);
    ctx.drawImage(img, cx * CHUNK, cy * CHUNK);
  }
}

export function renderWorld(p: WorldRenderParams) {
  const { ctx } = p;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.background;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = !p.pixelArt;
  const byLayer = new Map<string, RenderObject[]>();
  for (const o of p.objects) {
    if (!byLayer.has(o.layerId)) byLayer.set(o.layerId, []);
    byLayer.get(o.layerId)!.push(o);
  }
  for (const layer of p.layers) {
    if (!layer.visible) continue;
    const t = layerTransform(p, p.parallax ? layer.parallax : 1);
    ctx.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]);
    ctx.globalAlpha = layer.opacity;
    if (!p.drawPaint || !p.drawPaint(layer, ctx)) drawPaintChunks(ctx, layer.paint);
    for (const o of byLayer.get(layer.id) ?? []) {
      ctx.save();
      ctx.transform(o.matrix[0], o.matrix[1], o.matrix[2], o.matrix[3], o.matrix[4], o.matrix[5]);
      ctx.globalAlpha = layer.opacity * o.opacity;
      drawAsset(ctx, o.asset, o.frameId, o.flipX);
      ctx.restore();
    }
    if (p.afterLayer) {
      ctx.globalAlpha = 1;
      p.afterLayer(layer, ctx);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}
