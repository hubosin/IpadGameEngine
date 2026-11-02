import type { Vec2 } from '../core/types';

/**
 * Pan/zoom camera + gesture handling shared by the World and Art canvases.
 * Mouse: wheel = zoom at cursor, middle-drag or Space+drag = pan.
 * Touch: two fingers = pan + pinch zoom (cancels any tool stroke in progress).
 */
export interface View { cx: number; cy: number; zoom: number }

export function screenToWorld(v: View, el: HTMLElement, sx: number, sy: number): Vec2 {
  const r = el.getBoundingClientRect();
  return { x: (sx - r.left - r.width / 2) / v.zoom + v.cx, y: (sy - r.top - r.height / 2) / v.zoom + v.cy };
}

export function zoomAt(v: View, el: HTMLElement, sx: number, sy: number, factor: number, min = 0.05, max = 64): View {
  const before = screenToWorld(v, el, sx, sy);
  const zoom = Math.min(max, Math.max(min, v.zoom * factor));
  const r = el.getBoundingClientRect();
  return { zoom, cx: before.x - (sx - r.left - r.width / 2) / zoom, cy: before.y - (sy - r.top - r.height / 2) / zoom };
}

export class Gestures {
  private touches = new Map<number, Vec2>();
  private panning: { id: number; last: Vec2 } | null = null;
  private pinch: { dist: number; mid: Vec2 } | null = null;
  spaceDown = false;

  constructor(private el: HTMLElement, private getView: () => View, private setView: (v: View) => void, private onGestureStart: () => void) {}

  /** Returns true if the event was consumed by navigation (tool should ignore it). */
  down(e: PointerEvent): boolean {
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        this.onGestureStart();
        this.pinch = this.measure();
        return true;
      }
      if (this.touches.size > 2) return true;
    }
    if (e.button === 1 || (e.button === 0 && this.spaceDown) || e.button === 2) {
      this.panning = { id: e.pointerId, last: { x: e.clientX, y: e.clientY } };
      return true;
    }
    return false;
  }

  startPan(e: PointerEvent) {
    this.panning = { id: e.pointerId, last: { x: e.clientX, y: e.clientY } };
  }

  move(e: PointerEvent): boolean {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.touches.size >= 2) {
        const m = this.measure();
        let v = this.getView();
        v = { ...v, cx: v.cx - (m.mid.x - this.pinch.mid.x) / v.zoom, cy: v.cy - (m.mid.y - this.pinch.mid.y) / v.zoom };
        if (this.pinch.dist > 0) v = zoomAt(v, this.el, m.mid.x, m.mid.y, m.dist / this.pinch.dist);
        this.setView(v);
        this.pinch = m;
        return true;
      }
    }
    if (this.panning && this.panning.id === e.pointerId) {
      const v = this.getView();
      this.setView({ ...v, cx: v.cx - (e.clientX - this.panning.last.x) / v.zoom, cy: v.cy - (e.clientY - this.panning.last.y) / v.zoom });
      this.panning.last = { x: e.clientX, y: e.clientY };
      return true;
    }
    return !!this.pinch;
  }

  up(e: PointerEvent): boolean {
    let consumed = false;
    if (this.touches.delete(e.pointerId) && this.pinch) {
      consumed = true;
      if (this.touches.size < 2) this.pinch = null;
    }
    if (this.panning?.id === e.pointerId) { this.panning = null; consumed = true; }
    return consumed;
  }

  wheel(e: WheelEvent) {
    e.preventDefault();
    const v = this.getView();
    if (e.ctrlKey || !isTrackpadPan(e)) {
      this.setView(zoomAt(v, this.el, e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    } else {
      this.setView({ ...v, cx: v.cx + e.deltaX / v.zoom, cy: v.cy + e.deltaY / v.zoom });
    }
  }

  private measure() {
    const [a, b] = [...this.touches.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
}

function isTrackpadPan(e: WheelEvent) {
  // Trackpads send small pixel deltas with horizontal components; mouse wheels send large vertical steps.
  return e.deltaMode === 0 && (Math.abs(e.deltaX) > 0 || (Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY)));
}

/** Pressure from a pointer event (pens report real pressure; mouse/touch = full). */
export function pressureOf(e: PointerEvent) {
  return e.pointerType === 'pen' ? Math.max(0.01, e.pressure || 0.5) : 1;
}

/** Coalesced events give smoother strokes with Apple Pencil / pens. */
export function coalesced(e: PointerEvent): PointerEvent[] {
  const list = (e as any).getCoalescedEvents?.() as PointerEvent[] | undefined;
  return list && list.length ? list : [e];
}

/** Capture the pointer so drags continue outside the canvas (ignores synthetic/stale pointers). */
export function capture(e: { target: EventTarget; pointerId: number }) {
  try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
}
