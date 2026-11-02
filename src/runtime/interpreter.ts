import type { Graph, GraphEdge, GraphNode } from '../core/types';
import { coerce, getDef, type NodeDef } from './nodes';
import type { ExecContext, RObj, RuntimeAPI } from './types';

const MAX_STEPS_PER_FRAME = 20000;
const MAX_EVAL_DEPTH = 128;

/**
 * Executes one graph for one object. Execution follows exec wires from an event node;
 * data inputs are pulled lazily: pure nodes are evaluated on demand, impure nodes expose
 * the outputs they produced when they last ran (Unreal Blueprint semantics).
 */
export class GraphInstance {
  private nodes = new Map<string, GraphNode>();
  private dataIn = new Map<string, GraphEdge>();
  private execOut = new Map<string, GraphEdge[]>();
  private outputs = new Map<string, Record<string, unknown>>();
  private vars = new Map<string, unknown>();
  private delays: { at: number; nodeId: string; pin: string }[] = [];
  private timers: { nodeId: string; next: number; interval: number; repeat: boolean }[] = [];
  private time = 0;
  private dt = 0;
  steps = 0;

  constructor(public graph: Graph, public self: RObj, private rt: RuntimeAPI, private onExec?: (graphId: string, nodeId: string) => void) {
    for (const n of graph.nodes) this.nodes.set(n.id, n);
    for (const e of graph.edges) {
      if (!this.nodes.has(e.source) || !this.nodes.has(e.target)) continue;
      const sDef = getDef(this.nodes.get(e.source)!.type);
      const pin = sDef?.outputs.find((p) => p.id === e.sourcePin);
      if (pin?.type === 'exec') {
        const k = e.source + '|' + e.sourcePin;
        if (!this.execOut.has(k)) this.execOut.set(k, []);
        this.execOut.get(k)!.push(e);
      } else {
        this.dataIn.set(e.target + '|' + e.targetPin, e);
      }
    }
    for (const vd of graph.variables) this.vars.set(vd.name, structuredClone(vd.value));
    for (const n of graph.nodes) {
      if (n.type === 'event.timer') {
        const interval = Math.max(0.01, Number(n.values.interval ?? 1));
        this.timers.push({ nodeId: n.id, next: interval, interval, repeat: n.values.repeat !== false });
      }
    }
  }

  hasVar(name: string) { return this.vars.has(name); }

  // ---------------------------------------------------------------- events

  /** Fire every event node of a type. `filter` picks which nodes; `payload` sets their outputs. */
  fire(type: string, pin = 'exec', payload: Record<string, unknown> = {}, filter?: (n: GraphNode) => boolean) {
    for (const n of this.graph.nodes) {
      if (n.type !== type || (filter && !filter(n))) continue;
      this.outputs.set(n.id, payload);
      this.guard(n, () => {
        this.onExec?.(this.graph.id, n.id);
        this.runPin(n.id, pin);
      });
    }
  }

  update(dt: number) {
    this.dt = dt;
    this.time += dt;
    if (this.delays.length) {
      const due = this.delays.filter((d) => d.at <= this.time);
      this.delays = this.delays.filter((d) => d.at > this.time);
      for (const d of due) {
        const n = this.nodes.get(d.nodeId);
        if (n) this.guard(n, () => this.runPin(d.nodeId, d.pin));
      }
    }
    for (const t of this.timers) {
      if (t.next < 0 || this.time < t.next) continue;
      t.next = t.repeat ? this.time + t.interval : -1;
      const n = this.nodes.get(t.nodeId)!;
      this.guard(n, () => { this.onExec?.(this.graph.id, n.id); this.runPin(n.id, 'exec'); });
    }
    this.fire('event.update', 'exec', { dt });
  }

  private guard(n: GraphNode, fn: () => void) {
    if (this.self.destroyed && n.type !== 'event.collision') return;
    try {
      fn();
    } catch (e) {
      const def = getDef(n.type);
      this.rt.log('error', `${(e as Error).message}`, `${this.graph.name} › ${def?.title ?? n.type} (${this.self.name})`);
    }
  }

  // ---------------------------------------------------------------- execution

  private runPin(nodeId: string, pin: string) {
    const edges = this.execOut.get(nodeId + '|' + pin);
    if (!edges) return;
    for (const e of edges) this.execNode(e.target);
  }

  private execNode(nodeId: string) {
    if (++this.steps > MAX_STEPS_PER_FRAME) throw new Error('Execution limit reached (infinite loop?)');
    const node = this.nodes.get(nodeId);
    if (!node) return;
    const def = getDef(node.type);
    if (!def) throw new Error(`Unknown node type "${node.type}"`);
    if (!def.exec) return;
    this.onExec?.(this.graph.id, nodeId);
    const next = def.exec(this.ctx(node, def, 0));
    if (next) this.runPin(nodeId, next);
  }

  private ctx(node: GraphNode, def: NodeDef, depth: number): ExecContext {
    const self = this;
    return {
      node, graph: this.graph, self: this.self, rt: this.rt, dt: this.dt,
      in(pin) {
        const p = def.inputs.find((x) => x.id === pin);
        const raw = self.readInput(node, pin, depth, p?.default);
        return (p ? coerce(p.type, raw) : raw) as any;
      },
      prop(name) {
        const p = def.props?.find((x) => x.id === name);
        return (node.values[name] ?? p?.default) as any;
      },
      out(pin, value) {
        const o = self.outputs.get(node.id) ?? {};
        o[pin] = value;
        self.outputs.set(node.id, o);
      },
      run(pin) { self.runPin(node.id, pin); },
      delay(seconds, pin) { self.delays.push({ at: self.time + Math.max(0, seconds), nodeId: node.id, pin }); },
      getVar(name) { return self.vars.has(name) ? self.vars.get(name) : self.rt.getGlobal(name); },
      setVar(name, v) {
        if (self.vars.has(name)) self.vars.set(name, v);
        else self.rt.setGlobal(name, v);
      },
    };
  }

  private readInput(node: GraphNode, pin: string, depth: number, fallback: unknown): unknown {
    const e = this.dataIn.get(node.id + '|' + pin);
    if (!e) return node.values[pin] ?? fallback;
    const src = this.nodes.get(e.source)!;
    const def = getDef(src.type);
    if (def?.pure && def.evaluate) {
      if (depth > MAX_EVAL_DEPTH) throw new Error('Data wires form a loop');
      const out = def.evaluate(this.ctx(src, def, depth + 1));
      this.onExec?.(this.graph.id, src.id);
      return out[e.sourcePin];
    }
    return this.outputs.get(src.id)?.[e.sourcePin];
  }
}
