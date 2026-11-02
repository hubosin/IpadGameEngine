// Project data model. Everything the editor, runtime and exporter share lives here.
// The project is plain JSON (versioned) so it can be saved, synced to the iPad and diffed.

export type ID = string;
export const PROJECT_VERSION = 4;

export interface Project {
  version: number;
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  assets: Record<ID, Asset>;
  assetFolders: Record<ID, AssetFolder>;
  scenes: Record<ID, Scene>;
  sceneOrder: ID[];
  graphs: Record<ID, Graph>;
  prefabs: Record<ID, Prefab>;
  snippets: Record<ID, Snippet>;
  variables: VariableDef[]; // global game variables
  input: InputAction[];
  animControllers: Record<ID, AnimController>;
  dataSchemas: Record<ID, DataSchema>;
  dataAssets: Record<ID, DataAsset>;
  palettes: Palette[];
  brushPresets: BrushPreset[];
  brushResources: BrushResource[]; // imported brush tips and paper textures
}

// ---------------------------------------------------------------- Brushes

export type BrushRotation = 'fixed' | 'follow' | 'random';

export interface BrushSettings {
  size: number; // px diameter
  opacity: number; // 0..1, per stroke (dabs don't build up past this)
  flow: number; // 0..1, per dab (lower = builds up gradually)
  hardness: number; // 0..1 (round tip only)
  color: string;
  spacing: number; // fraction of diameter between dabs
  pressureSize: boolean;
  pressureOpacity: boolean;
  tip: string; // 'round', a built-in tip id, or a BrushResource id
  angle: number; // degrees
  roundness: number; // 1 = as drawn, <1 squashes the tip (calligraphy)
  rotation: BrushRotation;
  scatter: number; // random offset, in brush diameters
  sizeJitter: number; // 0..1
  opacityJitter: number; // 0..1
  grain: string | null; // paper texture: built-in id or BrushResource id
  grainScale: number;
  grainStrength: number; // 0..1
  smoothing: number; // 0..0.95 stroke stabilizer
}

export interface BrushPreset { id: ID; name: string; settings: BrushSettings }
export interface BrushResource { id: ID; name: string; kind: 'tip' | 'grain'; data: string }

/** Named set of saved colors (shared by Art, World painting and the iPad). */
export interface Palette { id: ID; name: string; colors: string[] }

export interface ProjectSettings {
  width: number; // game view resolution
  height: number;
  background: string;
  startSceneId: ID;
  pixelArt: boolean;
}

export interface InputAction {
  name: string;
  keys: string[]; // KeyboardEvent.code values
}

// ---------------------------------------------------------------- Assets / art

export type AssetKind = 'sprite' | 'background' | 'texture' | 'vector' | 'tileset' | 'animated' | 'particle' | 'audio';

export interface AssetFolder {
  id: ID;
  name: string;
  parentId: ID | null;
}

export interface Asset {
  id: ID;
  name: string;
  kind: AssetKind;
  folderId: ID | null;
  art?: ArtDoc;
  audio?: { data: string }; // data URL
  tile?: { w: number; h: number }; // tileset cell size
}

/** Layered art document. Layers are shared across frames; each layer holds one cel per frame. */
export interface ArtDoc {
  width: number;
  height: number;
  layers: ArtLayer[]; // bottom -> top
  frames: ArtFrame[];
  animations: AnimationDef[];
}

export interface ArtFrame {
  id: ID;
  duration: number; // ms
}

export interface AnimationDef {
  id: ID;
  name: string;
  frameIds: ID[];
  fps: number;
  loop: boolean;
}

export type LayerKind = 'raster' | 'vector' | 'group';

export interface ArtLayer {
  id: ID;
  name: string;
  kind: LayerKind;
  parentId: ID | null; // group membership
  visible: boolean;
  locked: boolean;
  opacity: number;
  cels: Record<ID, Cel>; // frameId -> cel
}

export interface Cel {
  tiles?: Record<string, string>; // raster: "tx,ty" -> PNG data URL
  paths?: VectorPath[]; // vector
}

export interface PathPoint {
  x: number; y: number;
  ix: number; iy: number; // incoming handle (absolute)
  ox: number; oy: number; // outgoing handle (absolute)
}

export interface VectorPath {
  id: ID;
  points: PathPoint[];
  closed: boolean;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
}

// ---------------------------------------------------------------- World

export interface Scene {
  id: ID;
  name: string;
  background: string;
  layers: WorldLayer[]; // bottom -> top
  entities: Entity[]; // tree via parentId; sibling order = array order
  ui: UIElement[]; // screen-space game UI, drawn above the world (array order = draw order)
}

export interface WorldLayer {
  id: ID;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  parallax: number; // 1 = moves with camera
  paint: Record<string, string>; // painted chunks "cx,cy" -> PNG data URL
}

export interface Entity {
  id: ID;
  name: string;
  kind: 'object' | 'folder';
  parentId: ID | null;
  layerId: ID;
  x: number; y: number;
  rotation: number; // degrees
  scaleX: number; scaleY: number;
  visible: boolean;
  locked: boolean;
  tags: string[];
  prefabId?: ID;
  components: Component[];
}

export type Component =
  | SpriteComponent
  | AnimatorComponent
  | ColliderComponent
  | BodyComponent
  | PlatformerComponent
  | LogicComponent
  | CameraComponent
  | AudioComponent;

export type ComponentType = Component['type'];

export interface SpriteComponent { type: 'sprite'; assetId: ID | null; flipX: boolean; opacity: number }
export interface AnimatorComponent { type: 'animator'; animation: string; playing: boolean; speed: number; controllerId?: ID | null }
export interface ColliderComponent { type: 'collider'; w: number; h: number; ox: number; oy: number; isTrigger: boolean }
export interface BodyComponent { type: 'body'; gravityScale: number; vx: number; vy: number }
/**
 * Built-in platformer controller. Each sub-system can be switched off so node graphs can
 * replace just that part (abstraction levels 1-4 from the design brief).
 */
export interface PlatformerComponent {
  type: 'platformer';
  speed: number; accel: number; jumpHeight: number; gravity: number; maxFall: number;
  builtinHorizontal: boolean; builtinJump: boolean; builtinGravity: boolean;
}
export interface LogicComponent { type: 'logic'; graphId: ID | null; enabled: boolean; dataId?: ID | null }
export interface CameraComponent { type: 'camera'; zoom: number; primary: boolean }
export interface AudioComponent { type: 'audio'; assetId: ID | null; autoplay: boolean; loop: boolean; volume: number }

export interface Prefab {
  id: ID;
  name: string;
  entities: Entity[]; // [0] is the root; parent links refer to ids inside this list
}

// ---------------------------------------------------------------- Logic graphs

export type PinType = 'exec' | 'number' | 'boolean' | 'vector' | 'string' | 'object' | 'resource' | 'event' | 'list' | 'any';
export type DataType = Exclude<PinType, 'exec' | 'event'>;

export interface VariableDef {
  id: ID;
  name: string;
  type: DataType;
  value: unknown;
}

export interface GraphNode {
  id: ID;
  type: string;
  x: number; y: number;
  values: Record<string, unknown>; // literal values for unconnected inputs + node properties
}

export interface GraphEdge {
  id: ID;
  source: ID; sourcePin: string;
  target: ID; targetPin: string;
}

export interface GraphComment {
  id: ID;
  x: number; y: number; w: number; h: number;
  text: string;
  color: string;
}

export interface Graph {
  id: ID;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  variables: VariableDef[];
  comments: GraphComment[];
}

/** Reusable graph section (saved selection of nodes + internal edges). */
export interface Snippet {
  id: ID;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Vec2 { x: number; y: number }

// ---------------------------------------------------------------- Game UI

export type UIKind = 'panel' | 'text' | 'image' | 'button' | 'bar';

/**
 * A screen-space UI element. Position = anchor point on the screen (0..1) + offset in
 * design pixels, so layouts adapt to wider/taller screens (iPad vs PC).
 */
export interface UIElement {
  id: ID;
  name: string;
  kind: UIKind;
  visible: boolean;
  anchorX: number; anchorY: number; // 0..1 of the screen
  pivotX: number; pivotY: number; // 0..1 of the element
  x: number; y: number; // offset from anchor (design px)
  w: number; h: number;
  text: string; // supports {variable} placeholders
  fontSize: number;
  textColor: string;
  align: 'left' | 'center' | 'right';
  fill: string | null;
  stroke: string | null;
  radius: number;
  opacity: number;
  assetId: ID | null; // image
  barVar: string; // bar: variable providing the value
  barMax: number;
  barColor: string;
}

// ---------------------------------------------------------------- Parameter-driven animation

export type AnimParamType = 'number' | 'bool' | 'trigger';
export interface AnimParam { id: ID; name: string; type: AnimParamType; value: number | boolean }
export interface AnimState { id: ID; name: string; animation: string; speed: number; x: number; y: number }
export interface AnimCondition { param: string; op: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'true' | 'false' | 'trigger'; value: number }
export interface AnimTransition { id: ID; from: ID | 'any'; to: ID; conditions: AnimCondition[]; exitTime: number | null }

/** State machine that picks sprite animations from parameters (Unity Animator-style). */
export interface AnimController {
  id: ID;
  name: string;
  params: AnimParam[];
  states: AnimState[];
  transitions: AnimTransition[];
  defaultState: ID | null;
  anyX: number; anyY: number; // editor position of the "Any State" node
}

// ---------------------------------------------------------------- Scriptable objects (data assets)

export type DataFieldType = 'number' | 'boolean' | 'string' | 'vector' | 'color' | 'asset' | 'prefab' | 'data';
export interface DataField { id: ID; name: string; type: DataFieldType; default: unknown; ref?: ID | null }

/** A data type definition ("class"), e.g. EnemyStats with health, speed, sprite. */
export interface DataSchema { id: ID; name: string; fields: DataField[] }

/** A data object instance ("ScriptableObject"), e.g. Goblin: health 30, speed 80. */
export interface DataAsset { id: ID; name: string; schemaId: ID; values: Record<ID, unknown> }
