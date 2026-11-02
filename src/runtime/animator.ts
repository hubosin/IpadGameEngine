import type { AnimCondition, AnimController, AnimState, Project } from '../core/types';
import { getComp } from '../core/sceneUtils';
import type { RObj } from './types';

/** Built-in parameters filled from physics every frame when a controller declares them. */
const AUTO = ['speed', 'vx', 'vy', 'grounded'] as const;

/**
 * Runs an animation controller for one object: parameters (number/bool/trigger) are set by
 * nodes or by physics, and transitions pick which sprite animation plays.
 */
export class AnimatorInstance {
  params = new Map<string, number | boolean>();
  triggers = new Set<string>();
  state: AnimState | null = null;

  constructor(public ctrl: AnimController, o: RObj) {
    for (const p of ctrl.params) if (p.type !== 'trigger') this.params.set(p.name, p.value);
    const first = ctrl.states.find((s) => s.id === ctrl.defaultState) ?? ctrl.states[0];
    if (first) this.enter(first, o);
  }

  set(name: string, v: number | boolean) { this.params.set(name, v); }
  trigger(name: string) { this.triggers.add(name); }

  private enter(s: AnimState, o: RObj) {
    this.state = s;
    o.anim = { name: s.animation, time: 0, playing: true, speed: s.speed };
  }

  private test(c: AnimCondition): boolean {
    if (c.op === 'trigger') return this.triggers.has(c.param);
    const v = this.params.get(c.param);
    if (c.op === 'true') return !!v;
    if (c.op === 'false') return !v;
    const n = Number(v) || 0;
    switch (c.op) {
      case '>': return n > c.value;
      case '<': return n < c.value;
      case '>=': return n >= c.value;
      case '<=': return n <= c.value;
      case '==': return n === c.value;
      case '!=': return n !== c.value;
    }
    return false;
  }

  private normalizedTime(o: RObj, project: Project): number {
    const sp = getComp(o, 'sprite');
    const doc = sp?.assetId ? project.assets[sp.assetId]?.art : undefined;
    const anim = doc?.animations.find((a) => a.name === o.anim.name);
    const dur = anim && anim.fps > 0 ? anim.frameIds.length / anim.fps : 1;
    return o.anim.time / dur;
  }

  update(o: RObj, project: Project) {
    const declared = new Set(this.ctrl.params.map((p) => p.name));
    for (const a of AUTO) {
      if (!declared.has(a)) continue;
      this.params.set(a, a === 'speed' ? Math.abs(o.vx) : a === 'vx' ? o.vx : a === 'vy' ? o.vy : o.grounded);
    }
    const cur = this.state;
    const nt = this.normalizedTime(o, project);
    for (const t of this.ctrl.transitions) {
      if (t.from !== 'any' && t.from !== cur?.id) continue;
      if (t.from === 'any' && t.to === cur?.id) continue;
      if (t.exitTime != null && t.from !== 'any' && nt < t.exitTime) continue;
      if (!t.conditions.every((c) => this.test(c))) continue;
      const next = this.ctrl.states.find((s) => s.id === t.to);
      if (!next) continue;
      for (const c of t.conditions) if (c.op === 'trigger') this.triggers.delete(c.param);
      this.enter(next, o);
      break;
    }
  }
}

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'back' | 'bounce';

export function ease(e: Easing | string, t: number): number {
  switch (e) {
    case 'easeIn': return t * t * t;
    case 'easeOut': return 1 - Math.pow(1 - t, 3);
    case 'easeInOut': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'back': { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
    case 'bounce': {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    }
    default: return t;
  }
}
