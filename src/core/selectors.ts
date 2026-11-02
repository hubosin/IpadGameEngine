import { useProject, getProject } from './store';
import { useEditor, editor } from './editorStore';
import type { Asset, Graph, Project, Scene } from './types';

export function sceneOf(p: Project, id: string | null): Scene {
  return (id && p.scenes[id]) || p.scenes[p.sceneOrder[0]];
}
export function useScene(): Scene {
  const p = useProject((s) => s.project);
  const id = useEditor((s) => s.activeSceneId);
  return sceneOf(p, id);
}
export function currentSceneId(): string {
  return sceneOf(getProject(), editor().activeSceneId).id;
}

export function useAsset(): Asset | undefined {
  const p = useProject((s) => s.project);
  const id = useEditor((s) => s.activeAssetId);
  return id ? p.assets[id] : undefined;
}

export function useGraph(): Graph | undefined {
  const p = useProject((s) => s.project);
  const id = useEditor((s) => s.activeGraphId);
  return id ? p.graphs[id] : undefined;
}

/** Active frame of the active asset (falls back to the first frame). */
export function activeFrameId(a: Asset | undefined, fid: string | null): string | null {
  const frames = a?.art?.frames;
  if (!frames?.length) return null;
  return fid && frames.some((f) => f.id === fid) ? fid : frames[0].id;
}

export function activeLayerId(a: Asset | undefined, lid: string | null): string | null {
  const layers = a?.art?.layers;
  if (!layers?.length) return null;
  return lid && layers.some((l) => l.id === lid) ? lid : layers[layers.length - 1].id;
}
