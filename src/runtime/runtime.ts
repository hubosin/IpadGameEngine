import type { ColliderComponent, Entity, Project, Scene, Vec2 } from '../core/types';
import { getComp } from '../core/sceneUtils';
import { matApply, matFromTRS, matMul, type Mat } from '../core/geometry';
import { uid } from '../core/ids';
import { frameAt } from '../render/compose';
import { renderWorld, type RenderObject } from '../render/worldRender';
import { onImageLoad } from '../render/imageCache';
import { InputSystem, createTouchControls } from './input';
import { GraphInstance } from './interpreter';
import type { RObj, RuntimeAPI } from './types';
import { AnimatorInstance, ease } from './animator';
import { drawUI, hitUI, type UIState } from './ui';
import type { DataAsset } from '../core/types';

interface Tween { o: RObj; prop: string; from: number; to: number; t: number; dur: number; easing: string; loop: string; dir: 1 | -1 }
const TWEEN_PROPS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'];

export interface RuntimeOptions {
  touchControls?: boolean;
  sceneId?: string | null;
  onLog?: (level: 'info' | 'warn' | 'error', msg: string, source?: string) => void;
  onNodeExec?: (graphId: string, nodeId: string) => void;
}

const FIXED_DT = 1 / 60;
const BODY_GRAVITY = 1400;

interface AABB { x0: number; y0: number; x1: number; y1: number }

/**
 * The game runtime: no React, no editor code, no platform APIs beyond the DOM canvas.
 * The same class runs the editor Preview, the LAN /play page and exported standalone games.
 */
export class GameRuntime implements RuntimeAPI {
  input: InputSystem;
  time = 0;
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private objects = new Map<string, RObj>();
  private order: string[] = [];
  private instances = new Map<string, GraphInstance[]>();
  private globals = new Map<string, unknown>();
  private scene!: Scene;
  private running = false;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private contacts = new Set<string>();
  private pendingScene: string | null = null;
  private audios: HTMLAudioElement[] = [];
  private cleanup: (() => void)[] = [];
  private animators = new Map<string, AnimatorInstance>();
  private tweens: Tween[] = [];
  private uiState = new Map<string, UIState>();
  private uiPress: { id: string; pointer: number } | null = null;
  private data: Record<string, DataAsset> = {};

  constructor(private project: Project, private container: HTMLElement, private opts: RuntimeOptions = {}) {
    this.project = structuredClone(project);
    this.input = new InputSystem(this.project.input);
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    if (opts.touchControls) this.cleanup.push(createTouchControls(container, this.input));
    this.cleanup.push(onImageLoad(() => { /* next frame redraws anyway */ }));
    for (const v of this.project.variables) this.globals.set(v.name, structuredClone(v.value));
    this.data = structuredClone(this.project.dataAssets ?? {});
    // game UI buttons
    const view = () => ({ cw: this.container.clientWidth, ch: this.container.clientHeight, W: this.project.settings.width, H: this.project.settings.height });
    const local = (e: PointerEvent) => { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const down = (e: PointerEvent) => {
      const [x, y] = local(e);
      const hit = hitUI(this.scene?.ui ?? [], x, y, view(), this.uiState);
      if (!hit) return;
      this.uiPress = { id: hit.id, pointer: e.pointerId };
      this.uiState.set(hit.id, { ...this.uiState.get(hit.id), pressed: true });
    };
    const up = (e: PointerEvent) => {
      const press = this.uiPress;
      if (!press || press.pointer !== e.pointerId) return;
      this.uiPress = null;
      this.uiState.set(press.id, { ...this.uiState.get(press.id), pressed: false });
      const [x, y] = local(e);
      const hit = hitUI(this.scene?.ui ?? [], x, y, view(), this.uiState);
      if (hit?.id === press.id) this.eachInstance((g) => g.fire('ui.click', 'exec', {}, (n) => n.values.element === hit.name));
    };
    this.canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    this.cleanup.push(() => window.removeEventListener('pointerup', up));
  }

  start() {
    const sid = this.opts.sceneId && this.project.scenes[this.opts.sceneId] ? this.opts.sceneId : this.project.settings.startSceneId;
    this.loadScene(sid ?? this.project.sceneOrder[0]);
    this.input.attach(window);
    this.running = true;
    this.last = performance.now();
    const tick = (t: number) => {
      if (!this.running) return;
      this.frame(Math.min(0.1, (t - this.last) / 1000));
      this.last = t;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.audios.forEach((a) => a.pause());
    this.audios = [];
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
    this.canvas.remove();
  }

  // ---------------------------------------------------------------- scene setup

  private loadScene(id: string) {
    const scene = this.project.scenes[id];
    if (!scene) { this.log('error', `Scene "${id}" not found`); return; }
    this.audios.forEach((a) => a.pause());
    this.audios = [];
    this.scene = scene;
    this.objects.clear();
    this.order = [];
    this.instances.clear();
    this.animators.clear();
    this.tweens = [];
    this.uiState.clear();
    this.contacts.clear();
    this.time = 0;
    const created = scene.entities.map((e) => this.addEntity(e));
    for (const o of created) this.startObject(o);
  }

  private addEntity(e: Entity): RObj {
    const anim = getComp(e, 'animator');
    const o: RObj = {
      id: e.id, name: e.name, tags: [...e.tags], parentId: e.parentId, layerId: e.layerId,
      x: e.x, y: e.y, rotation: e.rotation, scaleX: e.scaleX, scaleY: e.scaleY,
      visible: e.visible, opacity: getComp(e, 'sprite')?.opacity ?? 1, flipX: getComp(e, 'sprite')?.flipX ?? false,
      components: structuredClone(e.components),
      vx: getComp(e, 'body')?.vx ?? 0, vy: getComp(e, 'body')?.vy ?? 0, grounded: false, jumpBuffer: 0,
      anim: { name: anim?.animation ?? '', time: 0, playing: anim?.playing ?? true, speed: anim?.speed ?? 1 },
      destroyed: false,
    };
    this.objects.set(o.id, o);
    this.order.push(o.id);
    const list: GraphInstance[] = [];
    for (const c of o.components) {
      if (c.type !== 'logic' || !c.enabled || !c.graphId) continue;
      const g = this.project.graphs[c.graphId];
      if (g) list.push(new GraphInstance(g, o, this, this.opts.onNodeExec));
      else this.log('warn', `Missing logic graph on ${o.name}`);
    }
    if (list.length) this.instances.set(o.id, list);
    const ctrlId = anim?.controllerId;
    const ctrl = ctrlId ? this.project.animControllers?.[ctrlId] : undefined;
    if (ctrl) this.animators.set(o.id, new AnimatorInstance(ctrl, o));
    return o;
  }

  private startObject(o: RObj) {
    for (const c of o.components) {
      if (c.type === 'audio' && c.autoplay && c.assetId) {
        const data = this.project.assets[c.assetId]?.audio?.data;
        if (data) {
          const a = new Audio(data);
          a.loop = c.loop; a.volume = c.volume;
          a.play().catch(() => this.log('warn', 'Audio blocked until the user taps the screen'));
          this.audios.push(a);
        }
      }
    }
    this.instances.get(o.id)?.forEach((g) => g.fire('event.start'));
  }

  // ---------------------------------------------------------------- frame

  private frame(dt: number) {
    this.input.update();
    this.instances.forEach((list) => list.forEach((g) => (g.steps = 0)));
    for (const o of this.objects.values()) if (this.input.pressed.has('jump')) o.jumpBuffer = 0.12;

    // input events
    for (const a of this.input.pressed) this.eachInstance((g) => g.fire('event.input', 'pressed', {}, (n) => (n.values.action ?? 'jump') === a));
    for (const a of this.input.released) this.eachInstance((g) => g.fire('event.input', 'released', {}, (n) => (n.values.action ?? 'jump') === a));

    // logic
    this.eachInstance((g) => g.update(dt));

    // physics (fixed step)
    this.acc += dt;
    let steps = 0;
    const newContacts = new Set<string>();
    while (this.acc >= FIXED_DT && steps < 6) {
      this.physicsStep(FIXED_DT, newContacts);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps) this.dispatchCollisions(newContacts);

    // animation: state machines, tweens, then frame clocks
    for (const [id, a] of this.animators) { const o = this.objects.get(id); if (o && !o.destroyed) a.update(o, this.project); }
    this.updateTweens(dt);
    for (const o of this.objects.values()) if (o.anim.playing) o.anim.time += dt * o.anim.speed;
    this.time += dt;

    this.flushDestroyed();
    if (this.pendingScene) {
      const s = this.pendingScene;
      this.pendingScene = null;
      this.loadScene(s);
    }
    this.render();
  }

  private eachInstance(fn: (g: GraphInstance) => void) {
    for (const id of [...this.order]) {
      const o = this.objects.get(id);
      if (!o || o.destroyed) continue;
      this.instances.get(id)?.forEach(fn);
    }
  }

  // ---------------------------------------------------------------- physics

  private worldMatrix(o: RObj, depth = 0): Mat {
    const local = matFromTRS(o.x, o.y, o.rotation, o.scaleX, o.scaleY);
    const p = o.parentId && depth < 32 ? this.objects.get(o.parentId) : undefined;
    return p ? matMul(this.worldMatrix(p, depth + 1), local) : local;
  }

  private aabb(o: RObj, c: ColliderComponent): AABB {
    const m = this.worldMatrix(o);
    const ctr = matApply(m, c.ox, c.oy);
    const hw = (c.w / 2) * Math.hypot(m[0], m[1]), hh = (c.h / 2) * Math.hypot(m[2], m[3]);
    return { x0: ctr.x - hw, y0: ctr.y - hh, x1: ctr.x + hw, y1: ctr.y + hh };
  }

  private isDynamic(o: RObj) {
    return !!(getComp(o, 'platformer') || getComp(o, 'body'));
  }

  private physicsStep(dt: number, contacts: Set<string>) {
    const solids: { o: RObj; c: ColliderComponent }[] = [];
    for (const o of this.objects.values()) {
      if (o.destroyed) continue;
      const c = getComp(o, 'collider');
      if (c && !c.isTrigger && !this.isDynamic(o)) solids.push({ o, c });
    }
    const axis = this.input.axis();
    for (const o of this.objects.values()) {
      if (o.destroyed) continue;
      const pf = getComp(o, 'platformer');
      const body = getComp(o, 'body');
      if (!pf && !body) continue;
      o.jumpBuffer = Math.max(0, o.jumpBuffer - dt);
      if (pf) {
        if (pf.builtinHorizontal) {
          const target = axis.x * pf.speed;
          const step = pf.accel * dt;
          o.vx = Math.abs(target - o.vx) <= step ? target : o.vx + Math.sign(target - o.vx) * step;
        }
        if (pf.builtinJump && o.jumpBuffer > 0 && o.grounded) {
          o.vy = -Math.sqrt(2 * pf.gravity * pf.jumpHeight);
          o.jumpBuffer = 0;
          o.grounded = false;
        }
        if (pf.builtinGravity) o.vy = Math.min(o.vy + pf.gravity * dt, pf.maxFall);
        if (o.vx < -1) o.flipX = true;
        else if (o.vx > 1) o.flipX = false;
      } else if (body) {
        o.vy += BODY_GRAVITY * body.gravityScale * dt;
      }
      const col = getComp(o, 'collider');
      if (!col || col.isTrigger) { o.x += o.vx * dt; o.y += o.vy * dt; continue; }
      // move X then Y, pushing out of solids
      o.x += o.vx * dt;
      let box = this.aabb(o, col);
      for (const s of solids) {
        const b = this.aabb(s.o, s.c);
        if (box.x1 <= b.x0 || box.x0 >= b.x1 || box.y1 <= b.y0 || box.y0 >= b.y1) continue;
        if (o.vx > 0) o.x -= box.x1 - b.x0;
        else if (o.vx < 0) o.x += b.x1 - box.x0;
        else continue;
        o.vx = 0;
        contacts.add(pairKey(o.id, s.o.id));
        box = this.aabb(o, col);
      }
      o.y += o.vy * dt;
      o.grounded = false;
      box = this.aabb(o, col);
      for (const s of solids) {
        const b = this.aabb(s.o, s.c);
        if (box.x1 <= b.x0 || box.x0 >= b.x1 || box.y1 <= b.y0 || box.y0 >= b.y1) continue;
        if (o.vy > 0) { o.y -= box.y1 - b.y0; o.grounded = true; }
        else if (o.vy < 0) o.y += b.y1 - box.y0;
        else continue;
        o.vy = 0;
        contacts.add(pairKey(o.id, s.o.id));
        box = this.aabb(o, col);
      }
    }
    // overlaps (triggers and dynamic-vs-dynamic)
    const cols: { o: RObj; c: ColliderComponent; box: AABB; dyn: boolean }[] = [];
    for (const o of this.objects.values()) {
      const c = getComp(o, 'collider');
      if (c && !o.destroyed) cols.push({ o, c, box: this.aabb(o, c), dyn: this.isDynamic(o) });
    }
    for (let i = 0; i < cols.length; i++)
      for (let j = i + 1; j < cols.length; j++) {
        const a = cols[i], b = cols[j];
        if (!(a.c.isTrigger || b.c.isTrigger || (a.dyn && b.dyn))) continue;
        if (!(a.dyn || b.dyn)) continue;
        if (a.box.x1 < b.box.x0 || a.box.x0 > b.box.x1 || a.box.y1 < b.box.y0 || a.box.y0 > b.box.y1) continue;
        contacts.add(pairKey(a.o.id, b.o.id));
      }
  }

  private dispatchCollisions(now: Set<string>) {
    for (const k of now) {
      if (this.contacts.has(k)) continue;
      const [a, b] = k.split('|').map((id) => this.objects.get(id));
      if (!a || !b) continue;
      this.instances.get(a.id)?.forEach((g) => g.fire('event.collision', 'exec', { other: b }));
      this.instances.get(b.id)?.forEach((g) => g.fire('event.collision', 'exec', { other: a }));
    }
    this.contacts = now;
  }

  // ---------------------------------------------------------------- rendering

  private render() {
    const cw = this.container.clientWidth || 1, ch = this.container.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(cw * dpr) || this.canvas.height !== Math.round(ch * dpr)) {
      this.canvas.width = Math.round(cw * dpr);
      this.canvas.height = Math.round(ch * dpr);
    }
    const { width, height } = this.project.settings;
    let cam = { x: width / 2, y: height / 2, zoom: 1 };
    for (const o of this.objects.values()) {
      const c = getComp(o, 'camera');
      if (c && c.primary && !o.destroyed) {
        const m = this.worldMatrix(o);
        cam = { x: m[4], y: m[5], zoom: c.zoom };
        break;
      }
    }
    const fit = Math.min(cw / width, ch / height);
    const objs: RenderObject[] = [];
    const hidden = new Set<string>();
    for (const id of this.order) {
      const o = this.objects.get(id)!;
      const p = o.parentId ? this.objects.get(o.parentId) : undefined;
      if (!o.visible || (p && hidden.has(p.id))) { hidden.add(o.id); continue; }
      const sp = getComp(o, 'sprite');
      if (!sp || !sp.assetId) continue;
      const asset = this.project.assets[sp.assetId];
      if (!asset?.art) continue;
      objs.push({ layerId: o.layerId, matrix: this.worldMatrix(o), asset, frameId: frameAt(asset.art, o.anim.name, o.anim.time), flipX: o.flipX, opacity: o.opacity });
    }
    renderWorld({
      ctx: this.ctx, width: cw, height: ch, dpr, camera: { x: cam.x, y: cam.y, zoom: cam.zoom * fit },
      background: this.scene.background, layers: this.scene.layers, objects: objs, parallax: true, pixelArt: this.project.settings.pixelArt,
    });
    if (this.scene.ui?.length) {
      drawUI(this.ctx, this.scene.ui, { cw, ch, dpr, W: width, H: height }, this.project, this.uiState, (n) => this.getGlobal(n));
    }
  }

  // ---------------------------------------------------------------- RuntimeAPI

  find(name: string) {
    for (const o of this.objects.values()) if (o.name === name && !o.destroyed) return o;
    return null;
  }
  findByTag(tag: string) {
    return [...this.objects.values()].filter((o) => !o.destroyed && o.tags.includes(tag));
  }
  get(id: string) {
    return this.objects.get(id) ?? null;
  }
  destroy(o: RObj) {
    if (o.destroyed) return;
    o.destroyed = true;
    for (const c of this.objects.values()) if (c.parentId === o.id) this.destroy(c);
  }
  private flushDestroyed() {
    let any = false;
    for (const [id, o] of this.objects) if (o.destroyed) { this.objects.delete(id); this.instances.delete(id); any = true; }
    if (any) this.order = this.order.filter((id) => this.objects.has(id));
  }
  spawn(prefabId: string, pos: Vec2) {
    const pf = this.project.prefabs[prefabId];
    if (!pf || !pf.entities.length) { this.log('warn', 'Spawn: prefab not found'); return null; }
    const map = new Map<string, string>();
    for (const e of pf.entities) map.set(e.id, uid('rt'));
    const made: RObj[] = [];
    pf.entities.forEach((e, i) => {
      const copy: Entity = { ...structuredClone(e), id: map.get(e.id)!, parentId: e.parentId ? map.get(e.parentId) ?? null : null };
      if (i === 0) { copy.x = pos.x; copy.y = pos.y; }
      if (!this.scene.layers.some((l) => l.id === copy.layerId)) copy.layerId = this.scene.layers[Math.min(2, this.scene.layers.length - 1)]?.id ?? copy.layerId;
      made.push(this.addEntity(copy));
    });
    made.forEach((o) => this.startObject(o));
    return made[0];
  }
  changeScene(nameOrId: string) {
    const s = this.project.scenes[nameOrId] ?? Object.values(this.project.scenes).find((x) => x.name === nameOrId);
    if (!s) return this.log('error', `Change Scene: "${nameOrId}" not found`);
    this.pendingScene = s.id;
  }
  restart() {
    this.pendingScene = this.scene.id;
  }
  log(level: 'info' | 'warn' | 'error', msg: string, source?: string) {
    if (this.opts.onLog) this.opts.onLog(level, msg, source);
    else (level === 'error' ? console.error : console.log)(`[${source ?? 'game'}] ${msg}`);
  }
  getGlobal(name: string) { return this.globals.get(name); }
  hasGlobal(name: string) { return this.globals.has(name); }
  setGlobal(name: string, v: unknown) { this.globals.set(name, v); }
  playAnimation(o: RObj, name: string, restart: boolean) {
    if (!restart && o.anim.name === name && o.anim.playing) return;
    o.anim = { ...o.anim, name, time: 0, playing: true };
  }
  stopAnimation(o: RObj) { o.anim.playing = false; }
  // ---- game UI
  private uiByName(name: string) { return this.scene.ui?.find((e) => e.name === name); }
  setUIText(name: string, text: string) { const e = this.uiByName(name); if (e) this.uiState.set(e.id, { ...this.uiState.get(e.id), text }); else this.log('warn', `UI element "${name}" not found`); }
  setUIVisible(name: string, visible: boolean) { const e = this.uiByName(name); if (e) this.uiState.set(e.id, { ...this.uiState.get(e.id), visible }); }
  setUIValue(name: string, value: number) { const e = this.uiByName(name); if (e) this.uiState.set(e.id, { ...this.uiState.get(e.id), value }); }

  // ---- parameter animation + tweens
  setAnimParam(o: RObj, name: string, v: number | boolean) { this.animators.get(o.id)?.set(name, v); }
  triggerAnim(o: RObj, name: string) { this.animators.get(o.id)?.trigger(name); }
  animState(o: RObj) { return this.animators.get(o.id)?.state?.name ?? o.anim.name; }
  tween(o: RObj, prop: string, to: number, duration: number, easing: string, loop: string, relative: boolean) {
    if (!TWEEN_PROPS.includes(prop)) return;
    this.tweens = this.tweens.filter((t) => !(t.o === o && t.prop === prop));
    const from = (o as any)[prop] as number;
    this.tweens.push({ o, prop, from, to: relative ? from + to : to, t: 0, dur: Math.max(0.001, duration), easing, loop, dir: 1 });
  }
  private updateTweens(dt: number) {
    if (!this.tweens.length) return;
    this.tweens = this.tweens.filter((tw) => {
      if (tw.o.destroyed) return false;
      tw.t += (dt / tw.dur) * tw.dir;
      let done = false;
      if (tw.t >= 1 || tw.t <= 0) {
        if (tw.loop === 'pingpong') { tw.t = Math.max(0, Math.min(1, tw.t)); tw.dir = (tw.dir * -1) as 1 | -1; }
        else if (tw.loop === 'loop') tw.t = tw.t % 1;
        else { tw.t = 1; done = true; }
      }
      (tw.o as any)[tw.prop] = tw.from + (tw.to - tw.from) * ease(tw.easing, Math.max(0, Math.min(1, tw.t)));
      return !done;
    });
  }

  // ---- scriptable data
  private fieldId(d: DataAsset, field: string) {
    const schema = this.project.dataSchemas?.[d.schemaId];
    return schema?.fields.find((f) => f.name === field || f.id === field);
  }
  dataField(dataId: string, field: string) {
    const d = this.data[dataId];
    if (!d) return null;
    const f = this.fieldId(d, field);
    if (!f) { this.log('warn', `Data "${d.name}" has no field "${field}"`); return null; }
    return f.id in d.values ? d.values[f.id] : f.default;
  }
  setDataField(dataId: string, field: string, v: unknown) {
    const d = this.data[dataId];
    const f = d && this.fieldId(d, field);
    if (d && f) d.values[f.id] = v;
  }
  findData(name: string) { return Object.values(this.data).find((d) => d.name === name)?.id ?? null; }
  allData(schemaId: string) {
    const sc = this.project.dataSchemas?.[schemaId] ?? Object.values(this.project.dataSchemas ?? {}).find((x) => x.name === schemaId);
    return sc ? Object.values(this.data).filter((d) => d.schemaId === sc.id).map((d) => d.id) : [];
  }
  objectData(o: RObj) {
    for (const c of o.components) if (c.type === 'logic' && c.dataId) return c.dataId;
    return null;
  }

  callEvent(target: RObj, name: string) {
    this.instances.get(target.id)?.forEach((g) => g.fire('event.custom', 'exec', {}, (n) => n.values.name === name));
  }
}

function pairKey(a: string, b: string) {
  return a < b ? a + '|' + b : b + '|' + a;
}


