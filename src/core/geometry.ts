import type { PathPoint, VectorPath, Vec2 } from './types';
import { uid } from './ids';

export const KAPPA = 0.5522847498;

export function pt(x: number, y: number): PathPoint {
  return { x, y, ix: x, iy: y, ox: x, oy: y };
}

export function rectPath(x: number, y: number, w: number, h: number, fill: string | null, stroke: string | null = null, strokeWidth = 2): VectorPath {
  return { id: uid('p'), points: [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)], closed: true, fill, stroke, strokeWidth };
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number, fill: string | null, stroke: string | null = null, strokeWidth = 2): VectorPath {
  const kx = rx * KAPPA, ky = ry * KAPPA;
  const points: PathPoint[] = [
    { x: cx, y: cy - ry, ix: cx - kx, iy: cy - ry, ox: cx + kx, oy: cy - ry },
    { x: cx + rx, y: cy, ix: cx + rx, iy: cy - ky, ox: cx + rx, oy: cy + ky },
    { x: cx, y: cy + ry, ix: cx + kx, iy: cy + ry, ox: cx - kx, oy: cy + ry },
    { x: cx - rx, y: cy, ix: cx - rx, iy: cy + ky, ox: cx - rx, oy: cy - ky },
  ];
  return { id: uid('p'), points, closed: true, fill, stroke, strokeWidth };
}

export function tracePath(ctx: CanvasRenderingContext2D | Path2D, p: VectorPath) {
  const pts = p.points;
  if (!pts.length) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  const n = p.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    ctx.bezierCurveTo(a.ox, a.oy, b.ix, b.iy, b.x, b.y);
  }
  if (p.closed) ctx.closePath();
}

export function drawPath(ctx: CanvasRenderingContext2D, p: VectorPath) {
  if (p.points.length < 1) return;
  ctx.beginPath();
  tracePath(ctx, p);
  if (p.fill && p.closed) { ctx.fillStyle = p.fill; ctx.fill(); }
  if (p.stroke && p.strokeWidth > 0) {
    ctx.strokeStyle = p.stroke; ctx.lineWidth = p.strokeWidth; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();
  }
}

export function pathBounds(p: VectorPath) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of p.points) {
    for (const [x, y] of [[q.x, q.y], [q.ix, q.iy], [q.ox, q.oy]]) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function mapPathPoints(p: VectorPath, f: (v: Vec2) => Vec2): VectorPath {
  return {
    ...p,
    points: p.points.map((q) => {
      const a = f({ x: q.x, y: q.y }), i = f({ x: q.ix, y: q.iy }), o = f({ x: q.ox, y: q.oy });
      return { x: a.x, y: a.y, ix: i.x, iy: i.y, ox: o.x, oy: o.y };
    }),
  };
}

// ---- 2D affine matrices [a, b, c, d, e, f] (same layout as canvas setTransform)
export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function matMul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function matFromTRS(x: number, y: number, rotDeg: number, sx: number, sy: number): Mat {
  const r = (rotDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
}

export function matInvert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

export function matApply(m: Mat, x: number, y: number): Vec2 {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function rotateVec(v: Vec2, deg: number): Vec2 {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}
