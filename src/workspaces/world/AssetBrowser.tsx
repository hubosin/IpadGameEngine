import { commit, useProject } from '../../core/store';
import { editor } from '../../core/editorStore';
import { AssetThumb } from '../../ui/AssetThumb';
import { placeAsset, placePrefab } from './worldOps';
import { worldViewCenter } from './WorldViewport';
import { getComp } from '../../core/sceneUtils';

/** Bottom-panel asset strip for the World: drag into the viewport, or tap "Place". */
export function AssetBrowser() {
  const assets = useProject((s) => s.project.assets);
  const list = Object.values(assets).filter((a) => a.art);
  return (
    <div>
      <div className="asset-grid">
        {list.map((a) => (
          <div key={a.id} className="asset-card" draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/x-asset', a.id); e.dataTransfer.effectAllowed = 'copy'; }}
            onDoubleClick={() => editor().set({ workspace: 'art', activeAssetId: a.id })}>
            <AssetThumb asset={a} />
            <span className="name">{a.name}</span>
            <button className="btn sm" onClick={() => placeAsset(a.id, worldViewCenter().x, worldViewCenter().y)}>Place</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrefabBrowser() {
  const project = useProject((s) => s.project);
  const list = Object.values(project.prefabs);
  return (
    <div>
      {!list.length && <div className="hint">No prefabs</div>}
      <div className="asset-grid">
        {list.map((pf) => {
          const sp = pf.entities[0] && getComp(pf.entities[0], 'sprite');
          const asset = sp?.assetId ? project.assets[sp.assetId] : undefined;
          return (
            <div key={pf.id} className="asset-card" draggable onDragStart={(e) => { e.dataTransfer.setData('text/x-prefab', pf.id); e.dataTransfer.effectAllowed = 'copy'; }}>
              {asset ? <AssetThumb asset={asset} /> : <div style={{ width: 72, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>◆</div>}
              <span className="name">{pf.name}</span>
              <div className="row">
                <button className="btn sm" onClick={() => placePrefab(pf.id, worldViewCenter().x, worldViewCenter().y)}>Place</button>
                <button className="btn sm danger" title="Delete prefab" onClick={() => confirm(`Delete prefab "${pf.name}"? Placed copies stay.`) && commit('Delete prefab', (d) => { delete d.prefabs[pf.id]; })}>✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
