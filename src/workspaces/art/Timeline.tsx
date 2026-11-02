import { useEffect, useRef, useState } from 'react';
import { commit } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { useAsset, activeFrameId } from '../../core/selectors';
import { uid } from '../../core/ids';
import { AssetThumb } from '../../ui/AssetThumb';
import { Check, EditableName, NumField } from '../../ui/widgets';

/** Frames + animation states for the active asset. */
export function Timeline() {
  const asset = useAsset();
  const fid = useEditor((s) => activeFrameId(asset, s.activeFrameId));
  const onion = useEditor((s) => s.onionSkin);
  const [playing, setPlaying] = useState<string | null>(null); // animation id or '*' = all frames
  const [renaming, setRenaming] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const doc = asset?.art;

  useEffect(() => {
    clearTimeout(timer.current);
    if (!playing || !doc) return;
    const anim = doc.animations.find((a) => a.id === playing);
    const ids = anim ? anim.frameIds : doc.frames.map((f) => f.id);
    if (!ids.length) return;
    let i = 0;
    const step = () => {
      const id = ids[i % ids.length];
      editor().set({ activeFrameId: id });
      const dur = anim ? 1000 / Math.max(0.1, anim.fps) : doc.frames.find((f) => f.id === id)?.duration ?? 100;
      i++;
      if (anim && !anim.loop && i >= ids.length) { setPlaying(null); return; }
      timer.current = window.setTimeout(step, dur);
    };
    step();
    return () => clearTimeout(timer.current);
  }, [playing, doc?.animations, doc?.frames]);

  if (!asset || !doc) return <div className="hint">No asset</div>;
  const idx = doc.frames.findIndex((f) => f.id === fid);
  const editDoc = (label: string, f: (d: NonNullable<typeof doc>) => void, mk?: string) => commit(label, (dr) => { const a = dr.assets[asset.id]?.art; if (a) f(a); }, mk);

  const addFrame = (copy: boolean) => {
    const id = uid('f');
    editDoc(copy ? 'Duplicate frame' : 'Add frame', (d) => {
      const cur = d.frames[idx];
      d.frames.splice(idx + 1, 0, { id, duration: cur?.duration ?? 100 });
      for (const l of d.layers) {
        if (l.kind === 'group') continue;
        const src = cur && l.cels[cur.id];
        l.cels[id] = copy && src ? structuredClone(src) : l.kind === 'vector' ? { paths: [] } : { tiles: {} };
      }
    });
    editor().set({ activeFrameId: id });
  };
  const deleteFrame = () => {
    if (doc.frames.length < 2 || !fid) return;
    editDoc('Delete frame', (d) => {
      d.frames = d.frames.filter((f) => f.id !== fid);
      for (const l of d.layers) delete l.cels[fid];
      for (const a of d.animations) a.frameIds = a.frameIds.filter((x) => x !== fid);
    });
    editor().set({ activeFrameId: doc.frames[Math.max(0, idx - 1)]?.id ?? null });
  };
  const moveFrame = (dir: number) => editDoc('Reorder frames', (d) => {
    const j = idx + dir;
    if (j < 0 || j >= d.frames.length) return;
    [d.frames[idx], d.frames[j]] = [d.frames[j], d.frames[idx]];
  });

  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <button className="btn sm" onClick={() => addFrame(false)}>+ Blank frame</button>
        <button className="btn sm" onClick={() => addFrame(true)}>+ Duplicate frame</button>
        <button className="btn sm" disabled={idx <= 0} onClick={() => moveFrame(-1)}>◀ Move</button>
        <button className="btn sm" disabled={idx >= doc.frames.length - 1} onClick={() => moveFrame(1)}>Move ▶</button>
        <button className="btn sm danger" disabled={doc.frames.length < 2} onClick={deleteFrame}>Delete frame</button>
        <button className={'btn sm' + (onion ? ' on' : '')} onClick={() => editor().set({ onionSkin: !onion })}>Onion skin</button>
        <button className={'btn sm' + (playing === '*' ? ' on' : '')} onClick={() => setPlaying(playing ? null : '*')}>{playing ? '■ Stop' : '▶ Play frames'}</button>
        {doc.frames[idx] && <span style={{ width: 160 }}><NumField label="Duration ms" min={10} value={doc.frames[idx].duration} onChange={(v) => editDoc('Frame duration', (d) => { d.frames[idx].duration = v; }, 'fd' + fid)} /></span>}
      </div>
      <div className="row" style={{ flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 6 }}>
        {doc.frames.map((f, i) => (
          <div key={f.id} className={'asset-card' + (f.id === fid ? ' sel' : '')} style={{ flex: 'none' }} onClick={() => editor().set({ activeFrameId: f.id })}>
            <AssetThumb asset={asset} frameId={f.id} w={64} h={48} />
            <span className="small">{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="section-title" style={{ cursor: 'default' }}>
        Animations <span className="grow" />
        <button className="btn sm" onClick={() => editDoc('Add animation', (d) => { d.animations.push({ id: uid('an'), name: d.animations.length ? 'anim' + (d.animations.length + 1) : 'idle', frameIds: d.frames.map((f) => f.id), fps: 8, loop: true }); })}>+ Animation</button>
      </div>
      {doc.animations.map((a, ai) => (
        <div key={a.id} className="section">
          <div className="row">
            <EditableName value={a.name} editing={renaming === a.id} setEditing={(b) => setRenaming(b ? a.id : null)} onChange={(v) => editDoc('Rename animation', (d) => { d.animations[ai].name = v; })} />
            <button className="btn sm" onClick={() => setRenaming(a.id)}>Rename</button>
            <span style={{ width: 110 }}><NumField label="FPS" min={0.1} value={a.fps} onChange={(v) => editDoc('Animation fps', (d) => { d.animations[ai].fps = v; }, 'afps' + a.id)} /></span>
            <span style={{ width: 90 }}><Check label="Loop" value={a.loop} onChange={(v) => editDoc('Animation loop', (d) => { d.animations[ai].loop = v; })} /></span>
            <button className={'btn sm' + (playing === a.id ? ' on' : '')} onClick={() => setPlaying(playing === a.id ? null : a.id)}>{playing === a.id ? '■' : '▶'}</button>
            <button className="btn sm danger" onClick={() => editDoc('Delete animation', (d) => { d.animations.splice(ai, 1); })}>✕</button>
          </div>
          <div className="row small">
            Frames:
            {doc.frames.map((f, i) => (
              <label key={f.id} className="row" style={{ gap: 2 }}>
                <input type="checkbox" checked={a.frameIds.includes(f.id)}
                  onChange={(e) => editDoc('Animation frames', (d) => {
                    const an = d.animations[ai];
                    an.frameIds = e.target.checked ? d.frames.map((x) => x.id).filter((x) => x === f.id || an.frameIds.includes(x)) : an.frameIds.filter((x) => x !== f.id);
                  })} />{i + 1}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
