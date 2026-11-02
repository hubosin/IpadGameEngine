import { create } from 'zustand';
import { produce } from 'immer';
import type { Project } from './types';
import { createDefaultProject } from './defaults';

/**
 * Project store with built-in undo/redo. Every change to project data goes through
 * `commit` (one undo step) or `begin`/`live`/`end` (a continuous gesture = one undo step).
 * Immer gives structural sharing, so snapshots are cheap and unchanged objects keep their
 * identity (render caches key off that identity).
 */
export interface HistoryEntry { label: string; project: Project; mergeKey?: string; time: number }

interface ProjectState {
  project: Project;
  past: HistoryEntry[];
  future: HistoryEntry[];
  revision: number; // bumps on every change (autosave trigger)
  savedRevision: number;
  gestureBase: Project | null;
  commit: (label: string, recipe: (draft: Project) => void, mergeKey?: string) => void;
  begin: () => void;
  live: (recipe: (draft: Project) => void) => void;
  end: (label: string) => void;
  cancel: () => void;
  undo: () => void;
  redo: () => void;
  load: (p: Project) => void;
  markSaved: () => void;
}

const MAX_HISTORY = 150;

export const useProject = create<ProjectState>((set, get) => ({
  project: createDefaultProject(),
  past: [],
  future: [],
  revision: 0,
  savedRevision: 0,
  gestureBase: null,

  commit(label, recipe, mergeKey) {
    const { project, past } = get();
    const next = produce(project, (d) => { recipe(d); });
    if (next === project) return;
    const last = past[past.length - 1];
    const now = Date.now();
    const merge = mergeKey && last && last.mergeKey === mergeKey && now - last.time < 1500;
    const newPast = merge ? [...past.slice(0, -1), { ...last, time: now }] : [...past, { label, project, mergeKey, time: now }].slice(-MAX_HISTORY);
    set({ project: next, past: newPast, future: [], revision: get().revision + 1 });
  },

  begin() {
    if (!get().gestureBase) set({ gestureBase: get().project });
  },
  live(recipe) {
    const project = get().project;
    const next = produce(project, (d) => { recipe(d); });
    if (next !== project) set({ project: next });
  },
  end(label) {
    const { gestureBase, project, past } = get();
    if (!gestureBase) return;
    if (gestureBase === project) return set({ gestureBase: null });
    set({ gestureBase: null, past: [...past, { label, project: gestureBase, time: Date.now() }].slice(-MAX_HISTORY), future: [], revision: get().revision + 1 });
  },
  cancel() {
    const { gestureBase } = get();
    if (gestureBase) set({ project: gestureBase, gestureBase: null });
  },

  undo() {
    const { past, future, project } = get();
    const e = past[past.length - 1];
    if (!e) return;
    set({ project: e.project, past: past.slice(0, -1), future: [...future, { label: e.label, project, time: Date.now() }], revision: get().revision + 1 });
  },
  redo() {
    const { past, future, project } = get();
    const e = future[future.length - 1];
    if (!e) return;
    set({ project: e.project, future: future.slice(0, -1), past: [...past, { label: e.label, project, time: Date.now() }], revision: get().revision + 1 });
  },

  load(p) {
    set({ project: p, past: [], future: [], revision: get().revision + 1, savedRevision: get().revision + 1, gestureBase: null });
  },
  markSaved() {
    set({ savedRevision: get().revision });
  },
}));

export const commit = (label: string, recipe: (d: Project) => void, mergeKey?: string) => useProject.getState().commit(label, recipe, mergeKey);
export const getProject = () => useProject.getState().project;
