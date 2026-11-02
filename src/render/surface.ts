import { loadImage } from './imageCache';

/**
 * A raster surface split into tiles. Used for art layers (one tile = whole canvas, bounded)
 * and for painting directly into the world (512px chunks, unbounded).
 * Serialized as Record<"tx,ty", PNG data URL>.
 */
export interface Tile { tx: number; ty: number; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; src: string | null }

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export class TiledSurface {
  tiles = new Map<string, Tile>();
  constructor(public tileW: number, public tileH: number, public bounded: boolean) {}

  static key(tx: number, ty: number) { return tx + ',' + ty; }

  getTile(tx: number, ty: number, create: boolean): Tile | null {
    if (this.bounded && (tx !== 0 || ty !== 0)) return null;
    const k = TiledSurface.key(tx, ty);
    let t = this.tiles.get(k);
    if (!t && create) {
      const canvas = makeCanvas(this.tileW, this.tileH);
      t = { tx, ty, canvas, ctx: canvas.getContext('2d', { willReadFrequently: false })!, src: null };
      this.tiles.set(k, t);
    }
    return t ?? null;
  }

  tilesInRect(x0: number, y0: number, x1: number, y1: number, create: boolean): Tile[] {
    const out: Tile[] = [];
    const tx0 = Math.floor(x0 / this.tileW), tx1 = Math.floor(x1 / this.tileW);
    const ty0 = Math.floor(y0 / this.tileH), ty1 = Math.floor(y1 / this.tileH);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.getTile(tx, ty, create);
        if (t) out.push(t);
      }
    return out;
  }

  /** Bring tiles in line with serialized data (after load/undo). Calls onChange when async loads land. */
  sync(data: Record<string, string> | undefined, onChange: () => void) {
    data = data ?? {};
    for (const [k, src] of Object.entries(data)) {
      const [tx, ty] = k.split(',').map(Number);
      const t = this.getTile(tx, ty, true);
      if (!t || t.src === src) continue;
      t.src = src;
      loadImage(src).then((img) => {
        if (t.src !== src) return; // superseded
        t.ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
        t.ctx.drawImage(img, 0, 0);
        onChange();
      }).catch(() => { /* ignore broken image */ });
    }
    for (const [k, t] of this.tiles) {
      if (!(k in data) && t.src !== null) {
        t.src = null;
        t.ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
        onChange();
      }
    }
  }

  clear() {
    for (const t of this.tiles.values()) t.ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
  }

  /** Serialize the given tiles; updates their src so a following sync() is a no-op. */
  export(keys: Iterable<string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of keys) {
      const t = this.tiles.get(k);
      if (!t) continue;
      t.src = t.canvas.toDataURL('image/png');
      out[k] = t.src;
    }
    return out;
  }

  draw(ctx: CanvasRenderingContext2D, alpha = 1) {
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    for (const t of this.tiles.values()) ctx.drawImage(t.canvas, t.tx * this.tileW, t.ty * this.tileH);
    ctx.globalAlpha = prev;
  }
}
