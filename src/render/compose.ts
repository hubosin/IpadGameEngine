import type { ArtDoc, ArtLayer, Asset } from '../core/types';
import { drawPath } from '../core/geometry';
import { getImage, isReady } from './imageCache';
import { makeCanvas } from './surface';

/** Optional hook so the art editor can draw a layer from its live surfaces instead of saved data. */
export type LayerOverride = (layer: ArtLayer, ctx: CanvasRenderingContext2D) => boolean;

/** Draw one frame of an art document at doc coordinates. Returns false if images are still loading. */
export function renderArtFrame(ctx: CanvasRenderingContext2D, doc: ArtDoc, frameId: string, override?: LayerOverride): boolean {
  let complete = true;
  const draw = (c: CanvasRenderingContext2D, parentId: string | null) => {
    for (const layer of doc.layers) {
      if (layer.parentId !== parentId || !layer.visible) continue;
      if (layer.kind === 'group') {
        if (layer.opacity >= 1) { draw(c, layer.id); continue; }
        // render the group into its own buffer so opacity applies to the group as a whole
        const off = makeCanvas(doc.width, doc.height);
        draw(off.getContext('2d')!, layer.id);
        c.save();
        c.globalAlpha *= layer.opacity;
        c.drawImage(off, 0, 0);
        c.restore();
        continue;
      }
      c.save();
      c.globalAlpha *= layer.opacity;
      if (!override || !override(layer, c)) {
        const cel = layer.cels[frameId];
        if (cel?.tiles) {
          for (const [k, src] of Object.entries(cel.tiles)) {
            const img = getImage(src);
            if (!isReady(img)) { complete = false; continue; }
            const [tx, ty] = k.split(',').map(Number);
            c.drawImage(img, tx * doc.width, ty * doc.height);
          }
        }
        if (cel?.paths) for (const p of cel.paths) drawPath(c, p);
      }
      c.restore();
    }
  };
  draw(ctx, null);
  return complete;
}

// Frame composites are cached per layers-array identity (immer keeps identity until an edit).
const frameCache = new WeakMap<ArtLayer[], Map<string, HTMLCanvasElement>>();

export function getFrameCanvas(doc: ArtDoc, frameId: string): HTMLCanvasElement {
  let m = frameCache.get(doc.layers);
  const hit = m?.get(frameId);
  if (hit) return hit;
  const c = makeCanvas(doc.width, doc.height);
  const ok = renderArtFrame(c.getContext('2d')!, doc, frameId);
  if (!ok) return c; // images still decoding; don't cache the partial result
  if (!m) { m = new Map(); frameCache.set(doc.layers, m); }
  m.set(frameId, c);
  return c;
}

/** Resolve which frame to show for an animation at a given time. */
export function frameAt(doc: ArtDoc, animation: string | null | undefined, timeSec: number): string {
  const anim = animation ? doc.animations.find((a) => a.name === animation) : undefined;
  if (anim && anim.frameIds.length) {
    const idx = Math.floor(timeSec * anim.fps);
    return anim.frameIds[anim.loop ? idx % anim.frameIds.length : Math.min(idx, anim.frameIds.length - 1)];
  }
  const frames = doc.frames;
  if (frames.length <= 1) return frames[0]?.id ?? '';
  // no animation chosen: cycle all frames using their own durations
  const total = frames.reduce((s, f) => s + f.duration, 0) / 1000;
  let t = total > 0 ? timeSec % total : 0;
  for (const f of frames) {
    t -= f.duration / 1000;
    if (t < 0) return f.id;
  }
  return frames[0].id;
}

/** Draw an asset centered on the current origin. */
export function drawAsset(ctx: CanvasRenderingContext2D, asset: Asset | undefined, frameId: string | null, flipX = false): boolean {
  const doc = asset?.art;
  if (!doc) return false;
  const fid = frameId && doc.frames.some((f) => f.id === frameId) ? frameId : doc.frames[0]?.id;
  if (!fid) return false;
  const c = getFrameCanvas(doc, fid);
  if (flipX) { ctx.save(); ctx.scale(-1, 1); }
  ctx.drawImage(c, -doc.width / 2, -doc.height / 2);
  if (flipX) ctx.restore();
  return true;
}
