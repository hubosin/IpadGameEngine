import { uid } from './ids';
import { ellipsePath, rectPath } from './geometry';
import {
  PROJECT_VERSION, type ArtDoc, type ArtLayer, type Asset, type AssetKind, type Component, type ComponentType,
  type Entity, type Graph, type UIElement, type AnimController, type DataSchema, type DataFieldType, type DataAsset, type Palette, type BrushSettings, type BrushPreset, type GraphEdge, type GraphNode, type LayerKind, type Project, type Scene, type VectorPath,
} from './types';

export const DEFAULT_WORLD_LAYERS = ['Background', 'Scenery', 'Objects', 'Characters', 'Effects', 'Foreground', 'Collision'];

export const DEFAULT_INPUT = [
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'up', keys: ['ArrowUp', 'KeyW'] },
  { name: 'down', keys: ['ArrowDown', 'KeyS'] },
  { name: 'jump', keys: ['Space', 'KeyZ'] },
  { name: 'action', keys: ['KeyX', 'Enter'] },
];

export function newLayer(kind: LayerKind, doc: Pick<ArtDoc, 'frames'>, name?: string): ArtLayer {
  const cels: ArtLayer['cels'] = {};
  if (kind !== 'group') for (const f of doc.frames) cels[f.id] = kind === 'raster' ? { tiles: {} } : { paths: [] };
  return { id: uid('l'), name: name ?? (kind === 'group' ? 'Group' : kind === 'vector' ? 'Vector' : 'Layer'), kind, parentId: null, visible: true, locked: false, opacity: 1, cels };
}

export function newArtDoc(width: number, height: number, firstLayer: LayerKind = 'raster'): ArtDoc {
  const doc: ArtDoc = { width, height, layers: [], frames: [{ id: uid('f'), duration: 100 }], animations: [] };
  doc.layers.push(newLayer(firstLayer, doc, firstLayer === 'vector' ? 'Vector 1' : 'Layer 1'));
  return doc;
}

export function newAsset(name: string, kind: AssetKind, w = 64, h = 64, folderId: string | null = null): Asset {
  const a: Asset = { id: uid('a'), name, kind, folderId };
  if (kind !== 'audio') a.art = newArtDoc(w, h, kind === 'vector' ? 'vector' : 'raster');
  if (kind === 'tileset') a.tile = { w: 16, h: 16 };
  return a;
}

export function newComponent(type: ComponentType): Component {
  switch (type) {
    case 'sprite': return { type, assetId: null, flipX: false, opacity: 1 };
    case 'animator': return { type, animation: '', playing: true, speed: 1 };
    case 'collider': return { type, w: 32, h: 32, ox: 0, oy: 0, isTrigger: false };
    case 'body': return { type, gravityScale: 1, vx: 0, vy: 0 };
    case 'platformer': return { type, speed: 220, accel: 1800, jumpHeight: 110, gravity: 1400, maxFall: 900, builtinHorizontal: true, builtinJump: true, builtinGravity: true };
    case 'logic': return { type, graphId: null, enabled: true };
    case 'camera': return { type, zoom: 1, primary: true };
    case 'audio': return { type, assetId: null, autoplay: false, loop: false, volume: 1 };
  }
}

export function newEntity(layerId: string, name = 'Object', patch: Partial<Entity> = {}): Entity {
  return { id: uid('e'), name, kind: 'object', parentId: null, layerId, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, visible: true, locked: false, tags: [], components: [], ...patch };
}

export function newScene(name: string): Scene {
  return {
    id: uid('s'), name, background: '#6fa8dc',
    layers: DEFAULT_WORLD_LAYERS.map((n) => ({ id: uid('wl'), name: n, visible: true, locked: false, opacity: 1, parallax: n === 'Background' ? 0.3 : 1, paint: {} })),
    entities: [],
    ui: [],
  };
}

export function newUIElement(kind: UIElement['kind'], name?: string): UIElement {
  const base: UIElement = {
    id: uid('ui'), name: name ?? kind[0].toUpperCase() + kind.slice(1), kind, visible: true,
    anchorX: 0.5, anchorY: 0.5, pivotX: 0.5, pivotY: 0.5, x: 0, y: 0, w: 160, h: 48,
    text: '', fontSize: 22, textColor: '#ffffff', align: 'center', fill: null, stroke: null, radius: 8, opacity: 1,
    assetId: null, barVar: '', barMax: 100, barColor: '#4caf50',
  };
  if (kind === 'text') Object.assign(base, { text: 'Text', w: 200, h: 32 });
  if (kind === 'button') Object.assign(base, { text: 'Button', fill: '#3b6fd1', stroke: '#ffffff' });
  if (kind === 'panel') Object.assign(base, { w: 300, h: 200, fill: 'rgba(0,0,0,0.5)', radius: 12 });
  if (kind === 'bar') Object.assign(base, { w: 220, h: 18, fill: 'rgba(0,0,0,0.5)', radius: 9 });
  if (kind === 'image') Object.assign(base, { w: 64, h: 64 });
  return base;
}

export const DEFAULT_BRUSH: BrushSettings = {
  size: 8, opacity: 1, flow: 1, hardness: 0.9, color: '#000000', spacing: 0.08, pressureSize: true, pressureOpacity: false,
  tip: 'round', angle: 0, roundness: 1, rotation: 'fixed', scatter: 0, sizeJitter: 0, opacityJitter: 0,
  grain: null, grainScale: 1, grainStrength: 0.6, smoothing: 0,
};

/** Older settings objects (presets saved before a field existed) get defaults for the rest. */
export function fullBrush(s: Partial<BrushSettings>): BrushSettings {
  return { ...DEFAULT_BRUSH, ...s };
}

export function defaultBrushPresets(): BrushPreset[] {
  const P = (name: string, s: Partial<BrushSettings>): BrushPreset => ({ id: uid('bp'), name, settings: fullBrush(s) });
  return [
    P('Pencil', { tip: 'pencil', size: 4, spacing: 0.15, grain: 'paper', grainStrength: 0.7, pressureOpacity: true, rotation: 'random' }),
    P('Ink', { size: 8, hardness: 0.95, smoothing: 0.4 }),
    P('Marker', { size: 22, opacity: 0.6, hardness: 0.75 }),
    P('Soft Airbrush', { size: 80, opacity: 0.5, flow: 0.3, hardness: 0, pressureSize: false, pressureOpacity: true }),
    P('Chalk', { tip: 'chalk', size: 26, spacing: 0.12, rotation: 'random', grain: 'paper', grainStrength: 0.8 }),
    P('Charcoal', { tip: 'chalk', size: 18, flow: 0.7, rotation: 'random', grain: 'canvas', grainScale: 1.5, grainStrength: 0.85, sizeJitter: 0.2 }),
    P('Calligraphy', { tip: 'round', hardness: 1, size: 18, roundness: 0.25, angle: 45, spacing: 0.04, smoothing: 0.5 }),
    P('Bristle', { tip: 'bristle', size: 30, spacing: 0.05, rotation: 'follow', flow: 0.8 }),
    P('Splatter', { tip: 'splatter', size: 60, spacing: 0.6, rotation: 'random', scatter: 0.6, sizeJitter: 0.5, pressureSize: false }),
    P('Square Pixel', { tip: 'square', size: 1, hardness: 1, spacing: 0.5, pressureSize: false }),
    P('Leaves', { tip: 'leaf', size: 40, spacing: 0.7, rotation: 'random', scatter: 0.8, sizeJitter: 0.4, opacityJitter: 0.3, pressureSize: false }),
  ];
}

export function defaultPalettes(): Palette[] {
  return [
    { id: uid('pal'), name: 'Basic', colors: ['#000000', '#3c3c3c', '#7f7f7f', '#c3c3c3', '#ffffff', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#2b6cff', '#9b59b6', '#e84393', '#8d5524', '#f5cba7'] },
    { id: uid('pal'), name: 'Retro 16', colors: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'] },
  ];
}

export function newController(name: string): AnimController {
  return { id: uid('ac'), name, params: [], states: [], transitions: [], defaultState: null, anyX: -260, anyY: 0 };
}

export function newSchema(name: string): DataSchema {
  return { id: uid('ds'), name, fields: [{ id: uid('df'), name: 'value', type: 'number', default: 0 }] };
}

export function defaultForField(t: DataFieldType): unknown {
  switch (t) {
    case 'number': return 0;
    case 'boolean': return false;
    case 'vector': return { x: 0, y: 0 };
    case 'color': return '#ffffff';
    case 'asset': case 'prefab': case 'data': return null;
    default: return '';
  }
}

export function newGraph(name: string): Graph {
  return { id: uid('g'), name, nodes: [], edges: [], variables: [], comments: [] };
}

function vectorAsset(name: string, kind: AssetKind, w: number, h: number, frames: VectorPath[][]): Asset {
  const a = newAsset(name, kind, w, h);
  const doc = a.art!;
  while (doc.frames.length < frames.length) doc.frames.push({ id: uid('f'), duration: 250 });
  const layer = doc.layers[0];
  layer.kind = 'vector';
  layer.name = 'Vector 1';
  doc.frames.forEach((f, i) => (layer.cels[f.id] = { paths: frames[i] }));
  if (frames.length > 1) doc.animations.push({ id: uid('an'), name: 'idle', frameIds: doc.frames.map((f) => f.id), fps: 4, loop: true });
  return a;
}

/** Small helper for building demo graphs in code. */
function graphBuilder(g: Graph) {
  const node = (type: string, x: number, y: number, values: Record<string, unknown> = {}): GraphNode => {
    const n = { id: uid('n'), type, x, y, values };
    g.nodes.push(n);
    return n;
  };
  const link = (a: GraphNode, ap: string, b: GraphNode, bp: string) => {
    const e: GraphEdge = { id: uid('ed'), source: a.id, sourcePin: ap, target: b.id, targetPin: bp };
    g.edges.push(e);
  };
  return { node, link };
}

/** Empty project: one scene with the standard layers and a camera, no art or logic. */
export function createBlankProject(name = 'Untitled'): Project {
  const scene = newScene('Scene 1');
  const objects = scene.layers.find((l) => l.name === 'Objects')!.id;
  scene.entities.push(newEntity(objects, 'Main Camera', { x: 480, y: 270, components: [{ type: 'camera', zoom: 1, primary: true }] }));
  const now = Date.now();
  return {
    version: PROJECT_VERSION, id: uid('proj'), name, createdAt: now, updatedAt: now,
    settings: { width: 960, height: 540, background: '#000000', startSceneId: scene.id, pixelArt: false },
    assets: {}, assetFolders: {},
    scenes: { [scene.id]: scene }, sceneOrder: [scene.id],
    graphs: {}, prefabs: {}, snippets: {}, variables: [],
    input: DEFAULT_INPUT.map((a) => ({ ...a, keys: [...a.keys] })),
    animControllers: {}, dataSchemas: {}, dataAssets: {},
    palettes: defaultPalettes(), brushPresets: defaultBrushPresets(), brushResources: [],
  };
}

export function createDefaultProject(name = 'My Game'): Project {
  const scene = newScene('Level 1');
  const L = (n: string) => scene.layers.find((l) => l.name === n)!.id;

  const hero = vectorAsset('Hero', 'animated', 32, 48, [
    [rectPath(2, 6, 28, 42, '#2b6cff', '#14306e', 2), rectPath(18, 14, 8, 8, '#ffffff'), rectPath(21, 16, 4, 4, '#111111')],
    [rectPath(2, 8, 28, 40, '#2b6cff', '#14306e', 2), rectPath(18, 16, 8, 6, '#ffffff'), rectPath(21, 17, 4, 4, '#111111')],
  ]);
  {
    const d = hero.art!;
    const [f1, f2] = d.frames.map((f) => f.id);
    d.animations.push({ id: uid('an'), name: 'run', frameIds: [f1, f2], fps: 10, loop: true });
    d.animations.push({ id: uid('an'), name: 'jump', frameIds: [f2], fps: 1, loop: true });
  }
  const ground = vectorAsset('Ground', 'sprite', 64, 16, [[rectPath(0, 0, 64, 16, '#5a8f29', '#2f4f12', 2), rectPath(0, 0, 64, 4, '#8bd14b')]]);
  const coin = vectorAsset('Coin', 'sprite', 24, 24, [[ellipsePath(12, 12, 10, 10, '#ffd34d', '#b8860b', 2), ellipsePath(12, 12, 4, 6, '#fff3b0')]]);
  const folderId = uid('af');

  for (const a of [hero, ground, coin]) a.folderId = folderId;

  // --- Parameter-driven animation for the hero (speed/grounded are filled in by the platformer)
  const heroAnim = newController('Hero Animator');
  {
    const P = (name: string, type: 'number' | 'bool' | 'trigger', value: number | boolean) => heroAnim.params.push({ id: uid('ap'), name, type, value });
    P('speed', 'number', 0); P('grounded', 'bool', true);
    const S = (name: string, animation: string, x: number, y: number) => { const st = { id: uid('as'), name, animation, speed: 1, x, y }; heroAnim.states.push(st); return st.id; };
    const idle = S('Idle', 'idle', 0, 0), run = S('Run', 'run', 300, 0), jump = S('Jump', 'jump', 150, 200);
    heroAnim.defaultState = idle;
    const T = (from: string, to: string, conditions: AnimController['transitions'][0]['conditions']) => heroAnim.transitions.push({ id: uid('at'), from, to, conditions, exitTime: null });
    T(idle, run, [{ param: 'speed', op: '>', value: 20 }]);
    T(run, idle, [{ param: 'speed', op: '<', value: 20 }]);
    T('any', jump, [{ param: 'grounded', op: 'false', value: 0 }]);
    T(jump, idle, [{ param: 'grounded', op: 'true', value: 0 }]);
    heroAnim.anyX = -150; heroAnim.anyY = 200;
  }

  // --- Scriptable data: a Collectible type and a Gold Coin instance the coins point at
  const collectible = newSchema('Collectible');
  collectible.fields = [
    { id: uid('df'), name: 'points', type: 'number', default: 1 },
    { id: uid('df'), name: 'label', type: 'string', default: 'Coin' },
  ];
  const goldCoin: DataAsset = { id: uid('da'), name: 'Gold Coin', schemaId: collectible.id, values: { [collectible.fields[0].id]: 1, [collectible.fields[1].id]: 'Gold' } };

  // --- Graphs
  const coinGraph = newGraph('Coin Pickup');
  {
    const { node, link } = graphBuilder(coinGraph);
    const ev = node('event.collision', 0, 0);
    const tag = node('obj.hasTag', 260, 120, { tag: 'player' });
    const br = node('logic.branch', 520, 0);
    const getS = node('state.getVar', 520, 220, { name: 'score' });
    const add = node('math.add', 760, 220, { b: 1 });
    const own = node('data.self', 260, 300);
    const pts = node('data.get', 520, 340, { field: 'points' });
    link(own, 'value', pts, 'data');
    link(pts, 'value', add, 'b');
    const st = node('event.start', 0, 460);
    const bob = node('anim.tween', 260, 460, { prop: 'y', relative: true, to: -6, duration: 0.6, easing: 'easeInOut', loop: 'pingpong' });
    link(st, 'exec', bob, 'exec');
    const setS = node('state.setVar', 760, 0, { name: 'score' });
    const print = node('debug.print', 1020, 0, { message: '' });
    const getS2 = node('state.getVar', 1020, 200, { name: 'score' });
    const destroy = node('obj.destroy', 1260, 0);
    link(ev, 'exec', br, 'exec');
    link(ev, 'other', tag, 'object');
    link(tag, 'result', br, 'condition');
    link(getS, 'value', add, 'a');
    link(br, 'true', setS, 'exec');
    link(add, 'result', setS, 'value');
    link(setS, 'exec', print, 'exec');
    link(getS2, 'value', print, 'message');
    link(print, 'exec', destroy, 'exec');
    coinGraph.comments.push({ id: uid('c'), x: -30, y: -70, w: 1500, h: 700, text: 'Touching the player adds this coin\'s data "points" to score. On Start: bob up and down with a tween.', color: '#3a4a2a' });
  }
  const heroGraph = newGraph('Hero Logic');
  {
    const { node, link } = graphBuilder(heroGraph);
    const st = node('event.start', 0, 0);
    const p = node('debug.print', 260, 0, { message: 'Hero ready! Arrows/WASD move, Space jumps, X = action.' });
    link(st, 'exec', p, 'exec');
    const inp = node('event.input', 0, 200, { action: 'action' });
    const p2 = node('debug.print', 260, 200, { message: 'Action pressed!' });
    const sc = node('move.setScale', 520, 200, { scale: { x: 1.3, y: 1.3 } });
    const d = node('logic.delay', 780, 200, { seconds: 0.2 });
    const sc2 = node('move.setScale', 1020, 200, { scale: { x: 1, y: 1 } });
    link(inp, 'pressed', p2, 'exec');
    link(p2, 'exec', sc, 'exec');
    link(sc, 'exec', d, 'exec');
    link(d, 'then', sc2, 'exec');
    const up = node('event.update', 0, 420);
    const pos = node('move.getPosition', 260, 520);
    const brk = node('math.breakVector', 480, 520);
    const cmp = node('math.compare', 700, 520, { op: '>', b: 1200 });
    const br = node('logic.branch', 920, 420);
    const rs = node('state.restart', 1140, 420);
    link(up, 'exec', br, 'exec');
    link(pos, 'value', brk, 'vector');
    link(brk, 'y', cmp, 'a');
    link(cmp, 'result', br, 'condition');
    link(br, 'true', rs, 'exec');
    const click = node('ui.click', 0, 720, { element: 'Restart Button' });
    const rs2 = node('state.restart', 260, 720);
    link(click, 'exec', rs2, 'exec');
    heroGraph.comments.push({ id: uid('c'), x: -30, y: 370, w: 1340, h: 280, text: 'Fell off the world? Restart the scene.', color: '#4a2a2a' });
  }
  const customMove = newGraph('Custom Horizontal Move (level 3 demo)');
  {
    const { node, link } = graphBuilder(customMove);
    const up = node('event.update', 0, 0);
    const mv = node('input.movement', 0, 160);
    const brk = node('math.breakVector', 230, 160);
    const mul = node('math.mul', 450, 160, { b: 320 });
    const mk = node('math.makeVector', 670, 160, { y: 0 });
    const av = node('move.applyVelocity', 900, 0, { mode: 'set', axes: 'x' });
    link(up, 'exec', av, 'exec');
    link(mv, 'value', brk, 'vector');
    link(brk, 'x', mul, 'a');
    link(mul, 'result', mk, 'x');
    link(mk, 'value', av, 'velocity');
    customMove.comments.push({ id: uid('c'), x: -30, y: -70, w: 1200, h: 330, text: 'Attach to the Hero (add a Logic component) and untick "Built-in horizontal" on its Platformer to replace only horizontal movement.', color: '#2a3a4a' });
  }

  // --- Entities
  const ents: Entity[] = scene.entities;
  const player = newEntity(L('Characters'), 'Hero', {
    x: 120, y: 300, tags: ['player'],
    components: [
      { type: 'sprite', assetId: hero.id, flipX: false, opacity: 1 },
      { type: 'animator', animation: 'idle', playing: true, speed: 1, controllerId: heroAnim.id },
      { type: 'collider', w: 28, h: 44, ox: 0, oy: 2, isTrigger: false },
      newComponent('platformer'),
      { type: 'logic', graphId: heroGraph.id, enabled: true },
    ],
  });
  ents.push(player);
  ents.push(newEntity(L('Characters'), 'Camera', { parentId: player.id, components: [{ type: 'camera', zoom: 1, primary: true }] }));
  const plats = newEntity(L('Objects'), 'Platforms', { kind: 'folder' });
  ents.push(plats);
  const platform = (name: string, x: number, y: number, sx: number) =>
    ents.push(newEntity(L('Objects'), name, {
      parentId: plats.id, x, y, scaleX: sx,
      components: [{ type: 'sprite', assetId: ground.id, flipX: false, opacity: 1 }, { type: 'collider', w: 64, h: 16, ox: 0, oy: 0, isTrigger: false }],
    }));
  platform('Ground', 480, 420, 16);
  platform('Ledge A', 380, 320, 3);
  platform('Ledge B', 620, 240, 3);
  platform('Ledge C', 900, 330, 4);
  const coins = newEntity(L('Objects'), 'Coins', { kind: 'folder' });
  ents.push(coins);
  [[380, 280], [620, 200], [900, 290], [760, 380]].forEach(([x, y], i) =>
    ents.push(newEntity(L('Objects'), 'Coin ' + (i + 1), {
      parentId: coins.id, x, y, tags: ['coin'],
      components: [
        { type: 'sprite', assetId: coin.id, flipX: false, opacity: 1 },
        { type: 'collider', w: 20, h: 20, ox: 0, oy: 0, isTrigger: true },
        { type: 'logic', graphId: coinGraph.id, enabled: true, dataId: goldCoin.id },
      ],
    })));

  // --- Game UI
  const scoreText = newUIElement('text', 'Score Text');
  Object.assign(scoreText, { anchorX: 0, anchorY: 0, pivotX: 0, pivotY: 0, x: 20, y: 16, w: 240, text: 'Score: {score}', align: 'left', fontSize: 24 });
  const coinBar = newUIElement('bar', 'Coin Bar');
  Object.assign(coinBar, { anchorX: 0, anchorY: 0, pivotX: 0, pivotY: 0, x: 20, y: 52, w: 180, h: 14, barVar: 'score', barMax: 4, barColor: '#ffd34d' });
  const restart = newUIElement('button', 'Restart Button');
  Object.assign(restart, { anchorX: 1, anchorY: 0, pivotX: 1, pivotY: 0, x: -16, y: 16, w: 120, h: 40, text: 'Restart', fontSize: 18 });
  scene.ui.push(scoreText, coinBar, restart);

  const now = Date.now();
  return {
    version: PROJECT_VERSION, id: uid('proj'), name, createdAt: now, updatedAt: now,
    settings: { width: 960, height: 540, background: '#000000', startSceneId: scene.id, pixelArt: false },
    assets: { [hero.id]: hero, [ground.id]: ground, [coin.id]: coin },
    assetFolders: { [folderId]: { id: folderId, name: 'Starter Art', parentId: null } },
    scenes: { [scene.id]: scene }, sceneOrder: [scene.id],
    graphs: { [coinGraph.id]: coinGraph, [heroGraph.id]: heroGraph, [customMove.id]: customMove },
    prefabs: {}, snippets: {},
    variables: [{ id: uid('v'), name: 'score', type: 'number', value: 0 }],
    input: DEFAULT_INPUT.map((a) => ({ ...a, keys: [...a.keys] })),
    animControllers: { [heroAnim.id]: heroAnim },
    dataSchemas: { [collectible.id]: collectible },
    dataAssets: { [goldCoin.id]: goldCoin },
    palettes: defaultPalettes(),
    brushPresets: defaultBrushPresets(),
    brushResources: [],
  };
}

/** Upgrade older project files to the current format. Add a case per version bump. */
export function migrateProject(raw: any): Project {
  if (!raw || typeof raw !== 'object' || !raw.scenes) throw new Error('Not a project file');
  const p = raw as Project;
  if ((p.version ?? 0) > PROJECT_VERSION) throw new Error(`Project version ${p.version} is newer than this editor (${PROJECT_VERSION})`);
  // v0 -> v1: fill in fields that might be missing
  p.snippets ??= {};
  p.prefabs ??= {};
  p.variables ??= [];
  p.input ??= DEFAULT_INPUT.map((a) => ({ ...a, keys: [...a.keys] }));
  p.assetFolders ??= {};
  // v1 -> v2: game UI, animation controllers, data assets
  p.animControllers ??= {};
  p.dataSchemas ??= {};
  p.dataAssets ??= {};
  for (const sc of Object.values(p.scenes)) sc.ui ??= [];
  // v2 -> v3: color palettes
  p.palettes ??= defaultPalettes();
  // v3 -> v4: brush presets + imported brush tips/textures live in the project
  p.brushPresets ??= defaultBrushPresets();
  p.brushResources ??= [];
  p.version = PROJECT_VERSION;
  return p;
}
