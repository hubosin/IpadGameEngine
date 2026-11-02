import type { PinType, Vec2 } from '../core/types';
import type { ExecContext, RObj } from './types';

/**
 * The node library. One definition per node type, shared by the Logic editor (pins, labels,
 * categories, inline editors) and the runtime interpreter (exec/evaluate). Graphs are stored
 * as data and interpreted, never compiled to code.
 */

export type ResourceKind = 'prefab' | 'scene' | 'asset' | 'action' | 'variable' | 'animation' | 'ui' | 'animParam' | 'data' | 'schema' | 'dataField';

export interface PinDef {
  id: string;
  label?: string;
  type: PinType;
  default?: unknown;
  options?: string[]; // fixed choice list (for props)
  resource?: ResourceKind;
}

export interface NodeDef {
  type: string;
  title: string;
  category: string;
  description: string;
  inputs: PinDef[];
  outputs: PinDef[];
  props?: PinDef[];
  pure?: boolean; // no exec pins; evaluated on demand when an output is read
  event?: boolean; // entry point fired by the runtime
  exec?: (c: ExecContext) => string | null | void;
  evaluate?: (c: ExecContext) => Record<string, unknown>;
}

export const PIN_COLORS: Record<PinType, string> = {
  exec: '#ffffff', number: '#7cd36b', boolean: '#e05252', vector: '#f0c419', string: '#e07ad8',
  object: '#4aa3ff', resource: '#ff9f43', event: '#ff5f5f', list: '#a0a0ff', any: '#bbbbbb',
};

export function canConnect(from: PinType, to: PinType): boolean {
  if (from === 'exec' || to === 'exec') return from === to;
  if (from === to) return true;
  if (to === 'any' || from === 'any') return true;
  if (to === 'string') return true; // anything can be shown as text
  if ((from === 'number' && to === 'boolean') || (from === 'boolean' && to === 'number')) return true;
  return false;
}

// ---------------------------------------------------------------- helpers

export function formatValue(v: unknown): string {
  if (v == null) return 'none';
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
  if (Array.isArray(v)) return `[${v.length} items]`;
  if (typeof v === 'object') {
    const o = v as any;
    if ('components' in o && 'name' in o) return o.name;
    if (typeof o.x === 'number' && typeof o.y === 'number') return `(${formatValue(o.x)}, ${formatValue(o.y)})`;
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

export function coerce(type: PinType, v: unknown): unknown {
  switch (type) {
    case 'number': return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0;
    case 'boolean': return typeof v === 'string' ? v === 'true' : !!v;
    case 'string': return typeof v === 'string' ? v : formatValue(v);
    case 'vector': return v && typeof (v as Vec2).x === 'number' ? v : { x: 0, y: 0 };
    case 'list': return Array.isArray(v) ? v : [];
    default: return v;
  }
}

const n = (id: string, def = 0, label?: string): PinDef => ({ id, type: 'number', default: def, label });
const b = (id: string, def = false, label?: string): PinDef => ({ id, type: 'boolean', default: def, label });
const s = (id: string, def = '', label?: string): PinDef => ({ id, type: 'string', default: def, label });
const v = (id: string, def: Vec2 = { x: 0, y: 0 }, label?: string): PinDef => ({ id, type: 'vector', default: def, label });
const o = (id = 'object', label = 'Object'): PinDef => ({ id, type: 'object', label });
const any = (id: string, label?: string): PinDef => ({ id, type: 'any', label });
const X = (id = 'exec', label = ''): PinDef => ({ id, type: 'exec', label });

/** Object inputs left unconnected mean "Self". */
const obj = (c: ExecContext, pin = 'object'): RObj | null => {
  const val = c.in(pin);
  if (val == null || val === 'self' || val === '') return c.self;
  return (val as RObj).destroyed ? null : (val as RObj);
};

const PROPS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'visible', 'opacity', 'flipX', 'name'];

const defs: NodeDef[] = [
  // ---------------- Events
  { type: 'event.start', title: 'On Start', category: 'Events', event: true, description: 'Fires once when the object is created.', inputs: [], outputs: [X()] },
  { type: 'event.update', title: 'On Update', category: 'Events', event: true, description: 'Fires every frame. dt = seconds since last frame.', inputs: [], outputs: [X(), n('dt')] },
  { type: 'event.collision', title: 'On Collision', category: 'Events', event: true, description: 'Fires when this object starts touching another collider.', inputs: [], outputs: [X(), o('other', 'Other')] },
  { type: 'event.input', title: 'On Input', category: 'Events', event: true, description: 'Fires when an input action is pressed or released.', inputs: [], outputs: [X('pressed', 'Pressed'), X('released', 'Released')], props: [{ id: 'action', type: 'string', default: 'jump', resource: 'action', label: 'Action' }] },
  { type: 'event.timer', title: 'On Timer', category: 'Events', event: true, description: 'Fires every N seconds (or once).', inputs: [], outputs: [X()], props: [n('interval', 1, 'Seconds'), b('repeat', true, 'Repeat')] },
  { type: 'event.custom', title: 'Custom Event', category: 'Events', event: true, description: 'Named entry point. Trigger it with Call Event (reusable logic).', inputs: [], outputs: [X()], props: [s('name', 'MyEvent', 'Name')] },
  {
    type: 'event.call', title: 'Call Event', category: 'Events', description: 'Runs the Custom Event with this name on the target object (default Self).',
    inputs: [X(), o('target', 'Target')], outputs: [X()], props: [s('name', 'MyEvent', 'Name')],
    exec: (c) => { const t = obj(c, 'target'); if (t) c.rt.callEvent(t, c.prop('name')); return 'exec'; },
  },

  // ---------------- Input
  { type: 'input.get', title: 'Get Input', category: 'Input', pure: true, description: 'True while the action is held.', inputs: [], outputs: [b('value', false, 'Held')], props: [{ id: 'action', type: 'string', default: 'jump', resource: 'action', label: 'Action' }], evaluate: (c) => ({ value: c.rt.input.held.has(c.prop('action')) }) },
  { type: 'input.pressed', title: 'Is Pressed', category: 'Input', pure: true, description: 'True on the frame the action was pressed.', inputs: [], outputs: [b('value', false, 'Pressed')], props: [{ id: 'action', type: 'string', default: 'jump', resource: 'action', label: 'Action' }], evaluate: (c) => ({ value: c.rt.input.pressed.has(c.prop('action')) }) },
  { type: 'input.released', title: 'Is Released', category: 'Input', pure: true, description: 'True on the frame the action was released.', inputs: [], outputs: [b('value', false, 'Released')], props: [{ id: 'action', type: 'string', default: 'jump', resource: 'action', label: 'Action' }], evaluate: (c) => ({ value: c.rt.input.released.has(c.prop('action')) }) },
  { type: 'input.movement', title: 'Movement Input', category: 'Input', pure: true, description: 'Direction vector from left/right/up/down (-1..1).', inputs: [], outputs: [v('value', undefined, 'Direction')], evaluate: (c) => ({ value: c.rt.input.axis() }) },

  // ---------------- Math
  { type: 'math.add', title: 'Add', category: 'Math', pure: true, description: 'A + B', inputs: [n('a'), n('b')], outputs: [n('result')], evaluate: (c) => ({ result: c.in('a') + c.in('b') }) },
  { type: 'math.sub', title: 'Subtract', category: 'Math', pure: true, description: 'A - B', inputs: [n('a'), n('b')], outputs: [n('result')], evaluate: (c) => ({ result: c.in('a') - c.in('b') }) },
  { type: 'math.mul', title: 'Multiply', category: 'Math', pure: true, description: 'A × B', inputs: [n('a'), n('b', 1)], outputs: [n('result')], evaluate: (c) => ({ result: c.in('a') * c.in('b') }) },
  { type: 'math.div', title: 'Divide', category: 'Math', pure: true, description: 'A ÷ B (0 if B is 0)', inputs: [n('a'), n('b', 1)], outputs: [n('result')], evaluate: (c) => { const d = c.in<number>('b'); return { result: d === 0 ? 0 : c.in<number>('a') / d }; } },
  { type: 'math.clamp', title: 'Clamp', category: 'Math', pure: true, description: 'Limit value between min and max.', inputs: [n('value'), n('min'), n('max', 1)], outputs: [n('result')], evaluate: (c) => ({ result: Math.min(c.in('max'), Math.max(c.in('min'), c.in('value'))) }) },
  {
    type: 'math.compare', title: 'Compare', category: 'Math', pure: true, description: 'Compare two numbers.', inputs: [n('a'), n('b')], outputs: [b('result')], props: [{ id: 'op', type: 'string', default: '==', options: ['==', '!=', '<', '<=', '>', '>='], label: 'Op' }],
    evaluate: (c) => {
      const a = c.in<number>('a'), bb = c.in<number>('b');
      const r = { '==': a === bb, '!=': a !== bb, '<': a < bb, '<=': a <= bb, '>': a > bb, '>=': a >= bb }[c.prop<string>('op')] ?? false;
      return { result: r };
    },
  },
  { type: 'math.random', title: 'Random Number', category: 'Math', pure: true, description: 'Random number between min and max.', inputs: [n('min'), n('max', 1)], outputs: [n('value')], props: [b('integer', false, 'Integer')], evaluate: (c) => { const lo = c.in<number>('min'), hi = c.in<number>('max'); const r = lo + Math.random() * (hi - lo); return { value: c.prop('integer') ? Math.floor(lo + Math.random() * (hi - lo + 1)) : r }; } },
  { type: 'math.makeVector', title: 'Make Vector', category: 'Math', pure: true, description: 'Build a vector from X and Y.', inputs: [n('x'), n('y')], outputs: [v('value', undefined, 'Vector')], evaluate: (c) => ({ value: { x: c.in('x'), y: c.in('y') } }) },
  { type: 'math.breakVector', title: 'Break Vector', category: 'Math', pure: true, description: 'Split a vector into X and Y.', inputs: [v('vector')], outputs: [n('x'), n('y')], evaluate: (c) => { const p = c.in<Vec2>('vector'); return { x: p.x, y: p.y }; } },
  { type: 'math.vadd', title: 'Vector Add', category: 'Math', pure: true, description: 'A + B (vectors)', inputs: [v('a'), v('b')], outputs: [v('result')], evaluate: (c) => { const a = c.in<Vec2>('a'), bb = c.in<Vec2>('b'); return { result: { x: a.x + bb.x, y: a.y + bb.y } }; } },
  { type: 'math.vscale', title: 'Vector Scale', category: 'Math', pure: true, description: 'Vector × number', inputs: [v('vector'), n('scale', 1)], outputs: [v('result')], evaluate: (c) => { const a = c.in<Vec2>('vector'), k = c.in<number>('scale'); return { result: { x: a.x * k, y: a.y * k } }; } },

  // ---------------- Movement
  {
    type: 'move.move', title: 'Move Object', category: 'Movement', description: 'Move by an offset (per second when "Per second" is on).', inputs: [X(), o(), v('delta', { x: 100, y: 0 }, 'Delta')], outputs: [X()], props: [b('perSecond', true, 'Per second')],
    exec: (c) => { const t = obj(c); const d = c.in<Vec2>('delta'); const k = c.prop('perSecond') ? c.dt : 1; if (t) { t.x += d.x * k; t.y += d.y * k; } return 'exec'; },
  },
  { type: 'move.setPosition', title: 'Set Position', category: 'Movement', description: 'Teleport to a position.', inputs: [X(), o(), v('position', undefined, 'Position')], outputs: [X()], exec: (c) => { const t = obj(c); const p = c.in<Vec2>('position'); if (t) { t.x = p.x; t.y = p.y; } return 'exec'; } },
  { type: 'move.getPosition', title: 'Get Position', category: 'Movement', pure: true, description: 'Position of an object.', inputs: [o()], outputs: [v('value', undefined, 'Position')], evaluate: (c) => { const t = obj(c); return { value: t ? { x: t.x, y: t.y } : { x: 0, y: 0 } }; } },
  { type: 'move.setRotation', title: 'Set Rotation', category: 'Movement', description: 'Rotation in degrees.', inputs: [X(), o(), n('degrees')], outputs: [X()], exec: (c) => { const t = obj(c); if (t) t.rotation = c.in('degrees'); return 'exec'; } },
  { type: 'move.setScale', title: 'Set Scale', category: 'Movement', description: 'Scale (1,1 = normal).', inputs: [X(), o(), v('scale', { x: 1, y: 1 }, 'Scale')], outputs: [X()], exec: (c) => { const t = obj(c); const k = c.in<Vec2>('scale'); if (t) { t.scaleX = k.x; t.scaleY = k.y; } return 'exec'; } },
  {
    type: 'move.applyVelocity', title: 'Apply Velocity', category: 'Movement', description: 'Set or add velocity (px/sec). Physics moves the object with collisions.',
    inputs: [X(), o(), v('velocity', { x: 0, y: 0 }, 'Velocity')], outputs: [X()],
    props: [{ id: 'mode', type: 'string', default: 'set', options: ['set', 'add'], label: 'Mode' }, { id: 'axes', type: 'string', default: 'both', options: ['both', 'x', 'y'], label: 'Axes' }],
    exec: (c) => {
      const t = obj(c); const vel = c.in<Vec2>('velocity'); const add = c.prop('mode') === 'add'; const axes = c.prop<string>('axes');
      if (t) {
        if (axes !== 'y') t.vx = add ? t.vx + vel.x : vel.x;
        if (axes !== 'x') t.vy = add ? t.vy + vel.y : vel.y;
      }
      return 'exec';
    },
  },
  { type: 'move.getVelocity', title: 'Get Velocity', category: 'Movement', pure: true, description: 'Current velocity.', inputs: [o()], outputs: [v('value', undefined, 'Velocity')], evaluate: (c) => { const t = obj(c); return { value: t ? { x: t.vx, y: t.vy } : { x: 0, y: 0 } }; } },
  { type: 'move.isGrounded', title: 'Is Grounded', category: 'Movement', pure: true, description: 'True when standing on a solid collider.', inputs: [o()], outputs: [b('value', false, 'Grounded')], evaluate: (c) => ({ value: !!obj(c)?.grounded }) },

  // ---------------- Objects
  { type: 'obj.self', title: 'Get Object (Self)', category: 'Objects', pure: true, description: 'The object running this graph.', inputs: [], outputs: [o('value', 'Self')], evaluate: (c) => ({ value: c.self }) },
  { type: 'obj.find', title: 'Find Object', category: 'Objects', pure: true, description: 'Find an object by name.', inputs: [s('name', '', 'Name')], outputs: [o('value', 'Object')], evaluate: (c) => ({ value: c.rt.find(c.in('name')) }) },
  { type: 'obj.findTag', title: 'Find Objects With Tag', category: 'Objects', pure: true, description: 'All objects with a tag.', inputs: [s('tag', '', 'Tag')], outputs: [{ id: 'value', type: 'list', label: 'Objects' }], evaluate: (c) => ({ value: c.rt.findByTag(c.in('tag')) }) },
  { type: 'obj.hasTag', title: 'Has Tag', category: 'Objects', pure: true, description: 'Does the object have this tag?', inputs: [o(), s('tag', '', 'Tag')], outputs: [b('result')], evaluate: (c) => ({ result: !!obj(c)?.tags.includes(c.in('tag')) }) },
  { type: 'obj.isValid', title: 'Is Valid', category: 'Objects', pure: true, description: 'True if the object exists (not destroyed).', inputs: [{ id: 'object', type: 'object', label: 'Object' }], outputs: [b('result')], evaluate: (c) => { const t = c.in<RObj | null>('object'); return { result: !!t && typeof t === 'object' && !t.destroyed }; } },
  {
    type: 'obj.setProp', title: 'Set Property', category: 'Objects', description: 'Set a property of an object.', inputs: [X(), o(), any('value', 'Value')], outputs: [X()], props: [{ id: 'prop', type: 'string', default: 'x', options: PROPS, label: 'Property' }],
    exec: (c) => {
      const t = obj(c); const p = c.prop<string>('prop'); const val = c.in('value');
      if (t && PROPS.includes(p)) (t as any)[p] = p === 'name' ? String(val) : p === 'visible' || p === 'flipX' ? !!val : Number(val) || 0;
      return 'exec';
    },
  },
  { type: 'obj.getProp', title: 'Get Property', category: 'Objects', pure: true, description: 'Read a property of an object.', inputs: [o()], outputs: [any('value', 'Value')], props: [{ id: 'prop', type: 'string', default: 'x', options: PROPS, label: 'Property' }], evaluate: (c) => { const t = obj(c); return { value: t ? (t as any)[c.prop<string>('prop')] : null }; } },
  { type: 'obj.destroy', title: 'Destroy Object', category: 'Objects', description: 'Remove an object (and its children) from the game.', inputs: [X(), o()], outputs: [X()], exec: (c) => { const t = obj(c); if (t) c.rt.destroy(t); return 'exec'; } },
  {
    type: 'obj.spawn', title: 'Spawn Object', category: 'Objects', description: 'Create an instance of a prefab.', inputs: [X(), { id: 'prefab', type: 'resource', resource: 'prefab', label: 'Prefab' }, v('position', undefined, 'Position')], outputs: [X(), o('spawned', 'Spawned')],
    exec: (c) => { const r = c.rt.spawn(c.in('prefab'), c.in('position')); c.out('spawned', r); return 'exec'; },
  },

  // ---------------- Logic / flow
  { type: 'logic.branch', title: 'Branch', category: 'Logic', description: 'If condition is true go one way, else the other.', inputs: [X(), b('condition', false, 'Condition')], outputs: [X('true', 'True'), X('false', 'False')], exec: (c) => (c.in('condition') ? 'true' : 'false') },
  { type: 'logic.and', title: 'AND', category: 'Logic', pure: true, description: 'True if both are true.', inputs: [b('a'), b('b')], outputs: [b('result')], evaluate: (c) => ({ result: c.in('a') && c.in('b') }) },
  { type: 'logic.or', title: 'OR', category: 'Logic', pure: true, description: 'True if either is true.', inputs: [b('a'), b('b')], outputs: [b('result')], evaluate: (c) => ({ result: c.in('a') || c.in('b') }) },
  { type: 'logic.not', title: 'NOT', category: 'Logic', pure: true, description: 'Inverts a boolean.', inputs: [b('a')], outputs: [b('result')], evaluate: (c) => ({ result: !c.in('a') }) },
  {
    type: 'logic.forEach', title: 'For Each', category: 'Logic', description: 'Run Body once per item, then Completed.', inputs: [X(), { id: 'list', type: 'list', label: 'List' }], outputs: [X('body', 'Body'), any('element', 'Element'), n('index', 0, 'Index'), X('completed', 'Completed')],
    exec: (c) => { const list = c.in<unknown[]>('list').slice(); list.forEach((el, i) => { c.out('element', el); c.out('index', i); c.run('body'); }); return 'completed'; },
  },
  { type: 'logic.delay', title: 'Delay', category: 'Logic', description: 'Wait, then continue.', inputs: [X(), n('seconds', 1, 'Seconds')], outputs: [X('then', 'Then')], exec: (c) => { c.delay(c.in('seconds'), 'then'); return null; } },
  { type: 'logic.sequence', title: 'Sequence', category: 'Logic', description: 'Run several chains in order.', inputs: [X()], outputs: [X('then0', 'Then 0'), X('then1', 'Then 1'), X('then2', 'Then 2')], exec: (c) => { c.run('then0'); c.run('then1'); return 'then2'; } },

  // ---------------- Animation
  { type: 'anim.play', title: 'Play Animation', category: 'Animation', description: 'Play an animation from the start.', inputs: [X(), o(), { id: 'name', type: 'string', resource: 'animation', default: '', label: 'Animation' }], outputs: [X()], exec: (c) => { const t = obj(c); if (t) c.rt.playAnimation(t, c.in('name'), true); return 'exec'; } },
  { type: 'anim.stop', title: 'Stop Animation', category: 'Animation', description: 'Freeze the current animation.', inputs: [X(), o()], outputs: [X()], exec: (c) => { const t = obj(c); if (t) c.rt.stopAnimation(t); return 'exec'; } },
  { type: 'anim.setState', title: 'Set Animation State', category: 'Animation', description: 'Switch animation only if different (good for idle/run/jump).', inputs: [X(), o(), { id: 'name', type: 'string', resource: 'animation', default: '', label: 'State' }], outputs: [X()], exec: (c) => { const t = obj(c); if (t) c.rt.playAnimation(t, c.in('name'), false); return 'exec'; } },

  // ---------------- Parameter animation + tweens
  { type: 'anim.setNumber', title: 'Set Anim Number', category: 'Animation', description: 'Set a number parameter on the object\'s animator.', inputs: [X(), o(), n('value')], outputs: [X()], props: [{ id: 'param', type: 'string', default: '', resource: 'animParam', label: 'Param' }], exec: (c) => { const t = obj(c); if (t) c.rt.setAnimParam(t, c.prop('param'), c.in('value')); return 'exec'; } },
  { type: 'anim.setBool', title: 'Set Anim Bool', category: 'Animation', description: 'Set a bool parameter on the object\'s animator.', inputs: [X(), o(), b('value')], outputs: [X()], props: [{ id: 'param', type: 'string', default: '', resource: 'animParam', label: 'Param' }], exec: (c) => { const t = obj(c); if (t) c.rt.setAnimParam(t, c.prop('param'), c.in('value')); return 'exec'; } },
  { type: 'anim.trigger', title: 'Fire Anim Trigger', category: 'Animation', description: 'Fire a trigger parameter (consumed by the next transition that uses it).', inputs: [X(), o()], outputs: [X()], props: [{ id: 'param', type: 'string', default: '', resource: 'animParam', label: 'Trigger' }], exec: (c) => { const t = obj(c); if (t) c.rt.triggerAnim(t, c.prop('param')); return 'exec'; } },
  { type: 'anim.getState', title: 'Get Anim State', category: 'Animation', pure: true, description: 'Name of the current animator state.', inputs: [o()], outputs: [s('value', '', 'State')], evaluate: (c) => { const t = obj(c); return { value: t ? c.rt.animState(t) : '' }; } },
  {
    type: 'anim.tween', title: 'Tween', category: 'Animation', description: 'Smoothly animate a property over time. Finished fires when done (not for loops).',
    inputs: [X(), o(), n('to', 0, 'To'), n('duration', 0.5, 'Seconds')], outputs: [X(), X('finished', 'Finished')],
    props: [
      { id: 'prop', type: 'string', default: 'y', options: ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'], label: 'Property' },
      b('relative', false, 'Relative'),
      { id: 'easing', type: 'string', default: 'easeInOut', options: ['linear', 'easeIn', 'easeOut', 'easeInOut', 'back', 'bounce'], label: 'Easing' },
      { id: 'loop', type: 'string', default: 'once', options: ['once', 'loop', 'pingpong'], label: 'Loop' },
    ],
    exec: (c) => {
      const t = obj(c);
      const dur = c.in<number>('duration');
      if (t) c.rt.tween(t, c.prop('prop'), c.in('to'), dur, c.prop('easing'), c.prop('loop'), !!c.prop('relative'));
      if (c.prop('loop') === 'once') c.delay(dur, 'finished');
      return 'exec';
    },
  },

  // ---------------- Game UI
  { type: 'ui.click', title: 'On UI Click', category: 'UI', event: true, description: 'Fires when a UI button with this name is tapped/clicked.', inputs: [], outputs: [X()], props: [{ id: 'element', type: 'string', default: '', resource: 'ui', label: 'Button' }] },
  { type: 'ui.setText', title: 'Set UI Text', category: 'UI', description: 'Replace the text of a UI element.', inputs: [X(), any('text', 'Text')], outputs: [X()], props: [{ id: 'element', type: 'string', default: '', resource: 'ui', label: 'Element' }], exec: (c) => { c.rt.setUIText(c.prop('element'), formatValue(c.in('text'))); return 'exec'; } },
  { type: 'ui.setVisible', title: 'Set UI Visible', category: 'UI', description: 'Show or hide a UI element.', inputs: [X(), b('visible', true, 'Visible')], outputs: [X()], props: [{ id: 'element', type: 'string', default: '', resource: 'ui', label: 'Element' }], exec: (c) => { c.rt.setUIVisible(c.prop('element'), c.in('visible')); return 'exec'; } },
  { type: 'ui.setValue', title: 'Set Bar Value', category: 'UI', description: 'Set the value of a bar (0..max).', inputs: [X(), n('value')], outputs: [X()], props: [{ id: 'element', type: 'string', default: '', resource: 'ui', label: 'Bar' }], exec: (c) => { c.rt.setUIValue(c.prop('element'), c.in('value')); return 'exec'; } },

  // ---------------- Scriptable data
  { type: 'data.self', title: 'Get Object Data', category: 'Data', pure: true, description: 'The data asset assigned on this object\'s Logic component.', inputs: [o()], outputs: [{ id: 'value', type: 'resource', resource: 'data', label: 'Data' }], evaluate: (c) => { const t = obj(c); return { value: t ? c.rt.objectData(t) : null }; } },
  { type: 'data.asset', title: 'Data Asset', category: 'Data', pure: true, description: 'Pick a data asset.', inputs: [], outputs: [{ id: 'value', type: 'resource', resource: 'data', label: 'Data' }], props: [{ id: 'data', type: 'resource', default: '', resource: 'data', label: 'Asset' }], evaluate: (c) => ({ value: c.prop('data') || null }) },
  { type: 'data.get', title: 'Get Data Field', category: 'Data', pure: true, description: 'Read a field of a data asset.', inputs: [{ id: 'data', type: 'resource', resource: 'data', label: 'Data' }], outputs: [any('value', 'Value')], props: [{ id: 'field', type: 'string', default: '', resource: 'dataField', label: 'Field' }], evaluate: (c) => { const d = c.in<string>('data') || (c.rt.objectData(c.self) ?? ''); return { value: d ? c.rt.dataField(d, c.prop('field')) : null }; } },
  { type: 'data.set', title: 'Set Data Field', category: 'Data', description: 'Change a field while the game runs (shared by everything using this asset).', inputs: [X(), { id: 'data', type: 'resource', resource: 'data', label: 'Data' }, any('value', 'Value')], outputs: [X()], props: [{ id: 'field', type: 'string', default: '', resource: 'dataField', label: 'Field' }], exec: (c) => { const d = c.in<string>('data') || (c.rt.objectData(c.self) ?? ''); if (d) c.rt.setDataField(d, c.prop('field'), c.in('value')); return 'exec'; } },
  { type: 'data.find', title: 'Find Data', category: 'Data', pure: true, description: 'Data asset by name.', inputs: [s('name', '', 'Name')], outputs: [{ id: 'value', type: 'resource', resource: 'data', label: 'Data' }], evaluate: (c) => ({ value: c.rt.findData(c.in('name')) }) },
  { type: 'data.all', title: 'All Data Of Type', category: 'Data', pure: true, description: 'Every data asset of a type (use with For Each).', inputs: [], outputs: [{ id: 'value', type: 'list', label: 'List' }], props: [{ id: 'schema', type: 'resource', default: '', resource: 'schema', label: 'Type' }], evaluate: (c) => ({ value: c.rt.allData(c.prop('schema')) }) },

  // ---------------- Game state
  { type: 'state.setVar', title: 'Set Variable', category: 'Game State', description: 'Set a graph or global variable.', inputs: [X(), any('value', 'Value')], outputs: [X()], props: [{ id: 'name', type: 'string', default: '', resource: 'variable', label: 'Variable' }], exec: (c) => { c.setVar(c.prop('name'), c.in('value')); return 'exec'; } },
  { type: 'state.getVar', title: 'Get Variable', category: 'Game State', pure: true, description: 'Read a graph or global variable.', inputs: [], outputs: [any('value', 'Value')], props: [{ id: 'name', type: 'string', default: '', resource: 'variable', label: 'Variable' }], evaluate: (c) => ({ value: c.getVar(c.prop('name')) }) },
  { type: 'state.changeScene', title: 'Change Scene', category: 'Game State', description: 'Load another scene.', inputs: [X(), { id: 'scene', type: 'resource', resource: 'scene', label: 'Scene' }], outputs: [], exec: (c) => { c.rt.changeScene(c.in('scene')); return null; } },
  { type: 'state.restart', title: 'Restart Scene', category: 'Game State', description: 'Reload the current scene.', inputs: [X()], outputs: [], exec: (c) => { c.rt.restart(); return null; } },
  { type: 'debug.print', title: 'Print', category: 'Game State', description: 'Write a message to the Console.', inputs: [X(), any('message', 'Message')], outputs: [X()], exec: (c) => { c.rt.log('info', formatValue(c.in('message')), c.self.name); return 'exec'; } },
];

export const NODE_DEFS: Record<string, NodeDef> = Object.fromEntries(defs.map((d) => [d.type, d]));
export const NODE_CATEGORIES = [...new Set(defs.map((d) => d.category))];
export const NODE_LIST = defs;

export function getDef(type: string): NodeDef | undefined {
  return NODE_DEFS[type];
}
