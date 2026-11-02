import { commit, getProject } from '../../core/store';
import { editor } from '../../core/editorStore';
import { activeFrameId, activeLayerId } from '../../core/selectors';
import { newLayer } from '../../core/defaults';
import type { ArtDoc, ArtLayer, Cel, LayerKind, Project } from '../../core/types';

/** Art document editing helpers (all undoable). */

export function currentArt() {
  const p = getProject();
  const ed = editor();
  const asset = ed.activeAssetId ? p.assets[ed.activeAssetId] : undefined;
  const doc = asset?.art;
  return { asset, doc, frameId: activeFrameId(asset, ed.activeFrameId), layerId: activeLayerId(asset, ed.activeLayerId) };
}

export function draftDoc(d: Project, assetId: string): ArtDoc | undefined {
  return d.assets[assetId]?.art;
}

export function celOf(layer: ArtLayer, frameId: string): Cel {
  if (!layer.cels[frameId]) layer.cels[frameId] = layer.kind === 'vector' ? { paths: [] } : { tiles: {} };
  return layer.cels[frameId];
}

export function editCel(label: string, assetId: string, layerId: string, frameId: string, f: (cel: Cel, layer: ArtLayer) => void, mergeKey?: string) {
  commit(label, (d) => {
    const layer = draftDoc(d, assetId)?.layers.find((l) => l.id === layerId);
    if (layer) f(celOf(layer, frameId), layer);
  }, mergeKey);
}

/** Add a layer above the active one; returns its id. */
export function addLayer(kind: LayerKind): string | null {
  const { asset, doc, layerId } = currentArt();
  if (!asset || !doc) return null;
  const n = doc.layers.filter((l) => l.kind === kind).length + 1;
  const layer = newLayer(kind, doc, (kind === 'group' ? 'Group ' : kind === 'vector' ? 'Vector ' : 'Layer ') + n);
  const active = doc.layers.find((l) => l.id === layerId);
  if (active && kind !== 'group') layer.parentId = active.kind === 'group' ? active.id : active.parentId;
  commit('Add ' + kind + ' layer', (d) => {
    const ls = draftDoc(d, asset.id)!.layers;
    const i = ls.findIndex((l) => l.id === layerId);
    ls.splice(i < 0 ? ls.length : i + 1, 0, layer);
  });
  editor().set({ activeLayerId: layer.id });
  return layer.id;
}

export function editLayer(label: string, layerId: string, f: (l: ArtLayer) => void, mergeKey?: string) {
  const { asset } = currentArt();
  if (!asset) return;
  commit(label, (d) => { const l = draftDoc(d, asset.id)?.layers.find((x) => x.id === layerId); if (l) f(l); }, mergeKey);
}
