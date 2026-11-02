import { create } from 'zustand';
import type { ID } from './types';
import type { BrushSettings } from '../core/types';
import { DEFAULT_BRUSH } from './defaults';

/** Non-undoable editor UI state (selection, tools, view settings, logs). */

export type Workspace = 'world' | 'art' | 'logic' | 'preview';
export type ArtTool = 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'select' | 'pen' | 'rect' | 'ellipse' | 'direct' | 'pan';
export type WorldTool = 'select' | 'paint' | 'erase' | 'collider' | 'pan';

export interface LogEntry { id: number; time: number; level: 'info' | 'warn' | 'error'; message: string; source?: string }

let logId = 0;

interface EditorState {
  workspace: Workspace;
  activeSceneId: ID | null;
  selection: ID[]; // selected entity ids (world)
  activeWorldLayerId: ID | null;
  worldTool: WorldTool;
  grid: { show: boolean; snap: boolean; size: number };

  activeAssetId: ID | null;
  activeFrameId: ID | null;
  activeLayerId: ID | null; // art layer
  artTool: ArtTool;
  brush: BrushSettings;
  vectorStyle: { fill: string | null; stroke: string | null; strokeWidth: number };
  onionSkin: boolean;
  selectedPathId: ID | null;
  fillTolerance: number;

  activeGraphId: ID | null;
  selectedNodeIds: ID[];

  worldMode: 'world' | 'ui';
  uiSelection: ID | null;
  uiAspect: number; // preview aspect for the UI editor (w/h)
  logicView: 'graph' | 'animator' | 'data';
  activeControllerId: ID | null;
  animSel: { kind: 'state' | 'transition'; id: ID } | null;
  activeSchemaId: ID | null;
  recentColors: string[];
  activePaletteId: ID | null;
  swatchIndex: number | null;

  logs: LogEntry[];
  nodeStats: Record<ID, { count: number; last: number }>;
  touchControls: boolean;
  previewSceneId: ID | null;
  status: string;

  set: (patch: Partial<EditorState>) => void;
  log: (level: LogEntry['level'], message: string, source?: string) => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  workspace: 'world',
  activeSceneId: null,
  selection: [],
  activeWorldLayerId: null,
  worldTool: 'select',
  grid: { show: true, snap: false, size: 32 },

  activeAssetId: null,
  activeFrameId: null,
  activeLayerId: null,
  artTool: 'brush',
  brush: { ...DEFAULT_BRUSH },
  vectorStyle: { fill: '#3b82f6', stroke: '#111111', strokeWidth: 3 },
  onionSkin: false,
  selectedPathId: null,
  fillTolerance: 24,

  activeGraphId: null,
  selectedNodeIds: [],

  worldMode: 'world',
  uiSelection: null,
  uiAspect: 16 / 9,
  logicView: 'graph',
  activeControllerId: null,
  animSel: null,
  activeSchemaId: null,
  recentColors: ['#000000', '#ffffff', '#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#7f8c8d'],
  activePaletteId: null,
  swatchIndex: null,

  logs: [],
  nodeStats: {},
  touchControls: typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  previewSceneId: null,
  status: '',

  set: (patch) => set(patch),
  log: (level, message, source) => {
    const logs = get().logs;
    set({ logs: [...logs.slice(-499), { id: ++logId, time: Date.now(), level, message, source }] });
  },

}));

export const editor = () => useEditor.getState();
