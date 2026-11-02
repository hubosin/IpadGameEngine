import type { Component, Graph, GraphNode, Vec2 } from '../core/types';
import type { InputSystem } from './input';

/** A live object in the running game (a mutable copy of a scene Entity). */
export interface RObj {
  id: string;
  name: string;
  tags: string[];
  parentId: string | null;
  layerId: string;
  x: number; y: number; rotation: number; scaleX: number; scaleY: number;
  visible: boolean;
  opacity: number;
  flipX: boolean;
  components: Component[];
  vx: number; vy: number;
  grounded: boolean;
  jumpBuffer: number;
  anim: { name: string; time: number; playing: boolean; speed: number };
  destroyed: boolean;
}

/** What node implementations may ask of the running game. */
export interface RuntimeAPI {
  input: InputSystem;
  time: number;
  find(name: string): RObj | null;
  findByTag(tag: string): RObj[];
  get(id: string): RObj | null;
  destroy(o: RObj): void;
  spawn(prefabId: string, pos: Vec2): RObj | null;
  changeScene(nameOrId: string): void;
  restart(): void;
  log(level: 'info' | 'warn' | 'error', msg: string, source?: string): void;
  getGlobal(name: string): unknown;
  hasGlobal(name: string): boolean;
  setGlobal(name: string, v: unknown): void;
  playAnimation(o: RObj, name: string, restart: boolean): void;
  stopAnimation(o: RObj): void;
  callEvent(target: RObj, name: string): void;
  // game UI (elements are addressed by name)
  setUIText(name: string, text: string): void;
  setUIVisible(name: string, visible: boolean): void;
  setUIValue(name: string, value: number): void;
  // parameter-driven animation + tweens
  setAnimParam(o: RObj, name: string, v: number | boolean): void;
  triggerAnim(o: RObj, name: string): void;
  animState(o: RObj): string;
  tween(o: RObj, prop: string, to: number, duration: number, easing: string, loop: string, relative: boolean): void;
  // scriptable data assets (ids)
  dataField(dataId: string, field: string): unknown;
  setDataField(dataId: string, field: string, v: unknown): void;
  findData(name: string): string | null;
  allData(schemaId: string): string[];
  objectData(o: RObj): string | null;
}

export interface ExecContext {
  node: GraphNode;
  graph: Graph;
  self: RObj;
  rt: RuntimeAPI;
  dt: number;
  /** Resolved + type-coerced input value (connected wire or literal). */
  in<T = any>(pin: string): T;
  /** Node property (non-pin setting). */
  prop<T = any>(name: string): T;
  out(pin: string, value: unknown): void;
  /** Run the exec chain from one of this node's exec outputs right now (loops). */
  run(pin: string): void;
  /** Continue from an exec output after a delay (seconds). */
  delay(seconds: number, pin: string): void;
  getVar(name: string): unknown;
  setVar(name: string, v: unknown): void;
}
