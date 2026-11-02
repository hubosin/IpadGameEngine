import { useProject } from './store';
import { editor } from './editorStore';
import { hasServer, saveLocal, saveServer } from './storage';
import type { Project } from './types';

/** Point editor selections at valid things after a project loads. */
export function resetEditorFor(p: Project) {
  const firstGraph = Object.keys(p.graphs)[0] ?? null;
  const firstAsset = Object.keys(p.assets)[0] ?? null;
  editor().set({
    activeSceneId: p.settings.startSceneId ?? p.sceneOrder[0], selection: [], activeWorldLayerId: null,
    activeAssetId: firstAsset, activeFrameId: null, activeLayerId: null, selectedPathId: null,
    activeGraphId: firstGraph, selectedNodeIds: [], nodeStats: {}, previewSceneId: null,
  });
}

let saving = false;
let again = false;

/** Save to this browser and (when served from the PC) to the shared projects folder. */
export async function saveNow(reason: 'auto' | 'manual' = 'manual') {
  if (saving) { again = true; return; }
  saving = true;
  const st = useProject.getState();
  const rev = st.revision;
  const p: Project = { ...st.project, updatedAt: Date.now() };
  const parts: string[] = [];
  try {
    await saveLocal(p);
    parts.push('this device');
    if (await hasServer()) {
      await saveServer(p);
      parts.push('PC');
    }
    if (useProject.getState().revision === rev) useProject.getState().markSaved();
    editor().set({ status: `${reason === 'auto' ? 'Autosaved' : 'Saved'} to ${parts.join(' + ')} · ${new Date().toLocaleTimeString()}` });
  } catch (e) {
    editor().set({ status: 'Save failed: ' + (e as Error).message });
    editor().log('error', 'Save failed: ' + (e as Error).message, 'storage');
  } finally {
    saving = false;
    if (again) { again = false; saveNow(reason); }
  }
}

export function openProject(p: Project) {
  useProject.getState().load(p);
  resetEditorFor(p);
  saveNow('auto');
  editor().log('info', `Opened "${p.name}"`, 'editor');
}
