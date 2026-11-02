import type { InputAction, Vec2 } from '../core/types';

/**
 * Action-based input. Keyboard keys and on-screen touch buttons both feed named actions
 * (left/right/up/down/jump/action...), so games work the same on Windows and iPad.
 */
export class InputSystem {
  held = new Set<string>();
  pressed = new Set<string>();
  released = new Set<string>();
  private keys = new Set<string>();
  private virtual = new Map<string, number>();
  private pendingPress = new Set<string>();
  private keyToActions = new Map<string, string[]>();
  private target: Window | null = null;

  constructor(public actions: InputAction[]) {
    for (const a of actions) for (const k of a.keys) {
      if (!this.keyToActions.has(k)) this.keyToActions.set(k, []);
      this.keyToActions.get(k)!.push(a.name);
    }
  }

  private onDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const acts = this.keyToActions.get(e.code);
    if (!acts) return;
    e.preventDefault();
    if (!this.keys.has(e.code)) acts.forEach((a) => this.pendingPress.add(a));
    this.keys.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onBlur = () => { this.keys.clear(); this.virtual.clear(); };

  attach(w: Window) {
    this.target = w;
    w.addEventListener('keydown', this.onDown);
    w.addEventListener('keyup', this.onUp);
    w.addEventListener('blur', this.onBlur);
  }

  detach() {
    const w = this.target;
    if (!w) return;
    w.removeEventListener('keydown', this.onDown);
    w.removeEventListener('keyup', this.onUp);
    w.removeEventListener('blur', this.onBlur);
    this.target = null;
  }

  setVirtual(action: string, down: boolean) {
    const n = (this.virtual.get(action) ?? 0) + (down ? 1 : -1);
    if (down && !this.isHeldRaw(action)) this.pendingPress.add(action);
    this.virtual.set(action, Math.max(0, n));
  }

  private isHeldRaw(action: string) {
    if ((this.virtual.get(action) ?? 0) > 0) return true;
    const a = this.actions.find((x) => x.name === action);
    return !!a && a.keys.some((k) => this.keys.has(k));
  }

  /** Call once per frame before game logic. */
  update() {
    const prev = this.held;
    const now = new Set<string>();
    for (const a of this.actions) if (this.isHeldRaw(a.name)) now.add(a.name);
    this.pressed = new Set([...now].filter((a) => !prev.has(a)));
    for (const a of this.pendingPress) this.pressed.add(a); // taps shorter than one frame
    this.pendingPress.clear();
    this.released = new Set([...prev].filter((a) => !now.has(a)));
    this.held = now;
  }

  axis(): Vec2 {
    const h = this.held;
    return { x: (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0), y: (h.has('down') ? 1 : 0) - (h.has('up') ? 1 : 0) };
  }
}

/** On-screen controls for touch devices (iPad). Multi-touch: each button tracks its own pointers. */
export function createTouchControls(container: HTMLElement, input: InputSystem): () => void {
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;z-index:5';
  const mk = (label: string, action: string, css: string) => {
    const b = document.createElement('div');
    b.textContent = label;
    b.style.cssText = `position:absolute;${css};width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.18);border:2px solid rgba(255,255,255,.45);color:#fff;font:bold 22px sans-serif;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none`;
    const pointers = new Set<number>();
    const down = (e: PointerEvent) => {
      e.preventDefault();
      if (pointers.has(e.pointerId)) return;
      pointers.add(e.pointerId);
      try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      input.setVirtual(action, true);
      b.style.background = 'rgba(255,255,255,.4)';
    };
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      input.setVirtual(action, false);
      if (!pointers.size) b.style.background = 'rgba(255,255,255,.18)';
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    root.appendChild(b);
  };
  mk('◀', 'left', 'left:20px;bottom:60px');
  mk('▶', 'right', 'left:180px;bottom:60px');
  mk('▲', 'up', 'left:100px;bottom:130px');
  mk('▼', 'down', 'left:100px;bottom:-5px;width:60px;height:60px');
  mk('A', 'jump', 'right:30px;bottom:60px');
  mk('B', 'action', 'right:120px;bottom:120px');
  container.appendChild(root);
  return () => root.remove();
}
