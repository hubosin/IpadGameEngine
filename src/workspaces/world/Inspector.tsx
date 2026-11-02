import { useState } from 'react';
import { commit, useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { useScene } from '../../core/selectors';
import { newComponent, newGraph } from '../../core/defaults';
import type { Component, ComponentType, Entity, Project } from '../../core/types';
import { BrushPanel } from '../../ui/BrushPanel';
import { Check, NumField, Section, Select, Slider, TextField } from '../../ui/widgets';
import { draftScene } from './worldOps';
import { IconBtn } from '../../ui/Icon';

const COMPONENT_INFO: Record<ComponentType, { label: string; help: string }> = {
  sprite: { label: 'Sprite Renderer', help: 'Draws an art asset.' },
  animator: { label: 'Animation', help: 'Plays an animation of the sprite asset.' },
  collider: { label: 'Collider', help: 'Box used for collisions. Without a Body/Platformer it is a solid wall/floor.' },
  body: { label: 'Physics Body', help: 'Moves with velocity + gravity and collides with solids.' },
  platformer: { label: 'Platformer Controller', help: 'Built-in run/jump. Untick parts to replace them with node logic.' },
  logic: { label: 'Logic Graph', help: 'Runs a node graph on this object.' },
  camera: { label: 'Camera', help: 'The primary camera follows this object.' },
  audio: { label: 'Audio Source', help: 'Plays an audio asset.' },
};

function editEntity(id: string, label: string, f: (e: Entity) => void, mergeKey?: string) {
  commit(label, (d) => { const e = draftScene(d).entities.find((x) => x.id === id); if (e) f(e); }, mergeKey);
}

export function Inspector() {
  const tool = useEditor((s) => s.worldTool);
  const selection = useEditor((s) => s.selection);
  const scene = useScene();
  const project = useProject((s) => s.project);
  const e = scene.entities.find((x) => x.id === selection[0]);
  const [addType, setAddType] = useState<ComponentType>('sprite');

  return (
    <div>
      {(tool === 'paint' || tool === 'erase') && <BrushPanel eraser={tool === 'erase'} />}
      {!e && tool !== 'paint' && tool !== 'erase' && <div className="hint">Nothing selected</div>}
      {e && (
        <>
          <Section title={e.kind === 'folder' ? 'Folder' : 'Object'}>
            <TextField label="Name" value={e.name} onChange={(v) => editEntity(e.id, 'Rename', (x) => { x.name = v; })} />
            <TextField label="Tags" value={e.tags.join(', ')} placeholder="player, enemy" onChange={(v) => editEntity(e.id, 'Edit tags', (x) => { x.tags = v.split(',').map((t) => t.trim()).filter(Boolean); })} />
            <Select label="Layer" value={e.layerId} options={scene.layers.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => editEntity(e.id, 'Change layer', (x) => { x.layerId = v; })} />
            <Check label="Visible" value={e.visible} onChange={(v) => editEntity(e.id, 'Toggle visibility', (x) => { x.visible = v; })} />
            <Check label="Locked" value={e.locked} onChange={(v) => editEntity(e.id, 'Toggle lock', (x) => { x.locked = v; })} />
            {e.prefabId && <div className="dim small">Instance of prefab "{project.prefabs[e.prefabId]?.name ?? 'missing'}"</div>}
          </Section>
          <Section title="Transform">
            <div className="row"><NumField label="X" value={e.x} onChange={(v) => editEntity(e.id, 'Move', (x) => { x.x = v; }, 'tx' + e.id)} /></div>
            <NumField label="Y" value={e.y} onChange={(v) => editEntity(e.id, 'Move', (x) => { x.y = v; }, 'ty' + e.id)} />
            <NumField label="Rotation°" value={e.rotation} onChange={(v) => editEntity(e.id, 'Rotate', (x) => { x.rotation = v; }, 'tr' + e.id)} />
            <NumField label="Scale X" step={0.1} value={e.scaleX} onChange={(v) => editEntity(e.id, 'Scale', (x) => { x.scaleX = v; }, 'tsx' + e.id)} />
            <NumField label="Scale Y" step={0.1} value={e.scaleY} onChange={(v) => editEntity(e.id, 'Scale', (x) => { x.scaleY = v; }, 'tsy' + e.id)} />
          </Section>
          {e.kind === 'object' && e.components.map((c, i) => <ComponentEditor key={i} e={e} c={c} index={i} project={project} />)}
          {e.kind === 'object' && (
            <div className="row" style={{ marginTop: 8 }}>
              <select className="inp" value={addType} onChange={(ev) => setAddType(ev.target.value as ComponentType)}>
                {(Object.keys(COMPONENT_INFO) as ComponentType[]).map((t) => <option key={t} value={t}>{COMPONENT_INFO[t].label}</option>)}
              </select>
              <button className="btn" onClick={() => editEntity(e.id, 'Add component', (x) => { x.components.push(newComponent(addType)); })}>+ Add component</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ComponentEditor({ e, c, index, project }: { e: Entity; c: Component; index: number; project: Project }) {
  const info = COMPONENT_INFO[c.type];
  const edit = (label: string, f: (x: any) => void, mk?: string) => editEntity(e.id, label, (x) => f(x.components[index]), mk ? mk + e.id + index : undefined);
  const remove = () => editEntity(e.id, 'Remove component', (x) => { x.components.splice(index, 1); });
  const artAssets = Object.values(project.assets).filter((a) => a.art);
  const body = (() => {
    switch (c.type) {
      case 'sprite':
        return (
          <>
            <Select label="Asset" value={c.assetId ?? ''} options={[{ value: '', label: '(none)' }, ...artAssets.map((a) => ({ value: a.id, label: a.name }))]} onChange={(v) => edit('Set sprite', (x) => { x.assetId = v || null; })} />
            <Check label="Flip X" value={c.flipX} onChange={(v) => edit('Flip', (x) => { x.flipX = v; })} />
            <Slider label="Opacity" min={0} max={1} value={c.opacity} onChange={(v) => edit('Opacity', (x) => { x.opacity = v; }, 'op')} />
            {c.assetId && <button className="btn sm" onClick={() => editor().set({ workspace: 'art', activeAssetId: c.assetId })}>✎ Edit art</button>}
          </>
        );
      case 'animator': {
        const sp = e.components.find((x) => x.type === 'sprite') as any;
        const anims = sp?.assetId ? project.assets[sp.assetId]?.art?.animations ?? [] : [];
        return (
          <>
            <Select label="Animation" value={c.animation} options={[{ value: '', label: '(all frames)' }, ...anims.map((a) => ({ value: a.name, label: a.name }))]} onChange={(v) => edit('Set animation', (x) => { x.animation = v; })} />
            <Select label="Controller" value={c.controllerId ?? ''} options={[{ value: '', label: '(none)' }, ...Object.values(project.animControllers ?? {}).map((a) => ({ value: a.id, label: a.name }))]} onChange={(v) => edit('Set controller', (x) => { x.controllerId = v || null; })} />
            <Check label="Playing" value={c.playing} onChange={(v) => edit('Toggle playing', (x) => { x.playing = v; })} />
            <NumField label="Speed" step={0.1} value={c.speed} onChange={(v) => edit('Anim speed', (x) => { x.speed = v; }, 'as')} />
          </>
        );
      }
      case 'collider': {
        const sp = e.components.find((x) => x.type === 'sprite') as any;
        const art = sp?.assetId ? project.assets[sp.assetId]?.art : undefined;
        return (
          <>
            <NumField label="Width" value={c.w} min={1} onChange={(v) => edit('Collider size', (x) => { x.w = v; }, 'cw')} />
            <NumField label="Height" value={c.h} min={1} onChange={(v) => edit('Collider size', (x) => { x.h = v; }, 'ch')} />
            <NumField label="Offset X" value={c.ox} onChange={(v) => edit('Collider offset', (x) => { x.ox = v; }, 'cox')} />
            <NumField label="Offset Y" value={c.oy} onChange={(v) => edit('Collider offset', (x) => { x.oy = v; }, 'coy')} />
            <Check label="Trigger" value={c.isTrigger} title="Triggers report collisions but don't block" onChange={(v) => edit('Toggle trigger', (x) => { x.isTrigger = v; })} />
            {art && <button className="btn sm" onClick={() => edit('Fit collider', (x) => { x.w = art.width; x.h = art.height; x.ox = 0; x.oy = 0; })}>Fit to sprite</button>}
          </>
        );
      }
      case 'body':
        return (
          <>
            <NumField label="Gravity ×" step={0.1} value={c.gravityScale} onChange={(v) => edit('Gravity scale', (x) => { x.gravityScale = v; }, 'gs')} />
            <NumField label="Start vel X" value={c.vx} onChange={(v) => edit('Velocity', (x) => { x.vx = v; }, 'bvx')} />
            <NumField label="Start vel Y" value={c.vy} onChange={(v) => edit('Velocity', (x) => { x.vy = v; }, 'bvy')} />
          </>
        );
      case 'platformer':
        return (
          <>
            <NumField label="Run speed" value={c.speed} onChange={(v) => edit('Platformer', (x) => { x.speed = v; }, 'ps')} />
            <NumField label="Accel" value={c.accel} onChange={(v) => edit('Platformer', (x) => { x.accel = v; }, 'pa')} />
            <NumField label="Jump height" value={c.jumpHeight} onChange={(v) => edit('Platformer', (x) => { x.jumpHeight = v; }, 'pj')} />
            <NumField label="Gravity" value={c.gravity} onChange={(v) => edit('Platformer', (x) => { x.gravity = v; }, 'pg')} />
            <NumField label="Max fall" value={c.maxFall} onChange={(v) => edit('Platformer', (x) => { x.maxFall = v; }, 'pm')} />
            <div className="dim small" style={{ margin: '6px 0 2px' }}>Built-in</div>
            <Check label="Horizontal" value={c.builtinHorizontal} onChange={(v) => edit('Platformer parts', (x) => { x.builtinHorizontal = v; })} />
            <Check label="Jump" value={c.builtinJump} onChange={(v) => edit('Platformer parts', (x) => { x.builtinJump = v; })} />
            <Check label="Gravity" value={c.builtinGravity} onChange={(v) => edit('Platformer parts', (x) => { x.builtinGravity = v; })} />
          </>
        );
      case 'logic':
        return (
          <>
            <Select label="Graph" value={c.graphId ?? ''} options={[{ value: '', label: '(none)' }, ...Object.values(project.graphs).map((g) => ({ value: g.id, label: g.name }))]} onChange={(v) => edit('Set graph', (x) => { x.graphId = v || null; })} />
            <Select label="Data" value={c.dataId ?? ''} options={[{ value: '', label: '(none)' }, ...Object.values(project.dataAssets ?? {}).map((a) => ({ value: a.id, label: a.name }))]} onChange={(v) => edit('Set data', (x) => { x.dataId = v || null; })} />
            <Check label="Enabled" value={c.enabled} onChange={(v) => edit('Toggle logic', (x) => { x.enabled = v; })} />
            <div className="row">
              {c.graphId && <button className="btn sm" onClick={() => editor().set({ workspace: 'logic', activeGraphId: c.graphId })}>✎ Open graph</button>}
              <button className="btn sm" onClick={() => {
                const g = newGraph(e.name + ' Logic');
                commit('New graph', (d) => {
                  d.graphs[g.id] = g;
                  const x = draftScene(d).entities.find((y) => y.id === e.id);
                  const comp = x?.components[index];
                  if (comp?.type === 'logic') comp.graphId = g.id;
                });
              }}>+ New graph</button>
            </div>
          </>
        );
      case 'camera':
        return (
          <>
            <NumField label="Zoom" step={0.1} min={0.05} value={c.zoom} onChange={(v) => edit('Camera zoom', (x) => { x.zoom = v; }, 'cz')} />
            <Check label="Primary" value={c.primary} onChange={(v) => edit('Camera primary', (x) => { x.primary = v; })} />
          </>
        );
      case 'audio': {
        const audios = Object.values(project.assets).filter((a) => a.kind === 'audio');
        return (
          <>
            <Select label="Sound" value={c.assetId ?? ''} options={[{ value: '', label: '(none)' }, ...audios.map((a) => ({ value: a.id, label: a.name }))]} onChange={(v) => edit('Set sound', (x) => { x.assetId = v || null; })} />
            <Check label="Autoplay" value={c.autoplay} onChange={(v) => edit('Audio', (x) => { x.autoplay = v; })} />
            <Check label="Loop" value={c.loop} onChange={(v) => edit('Audio', (x) => { x.loop = v; })} />
            <Slider label="Volume" min={0} max={1} value={c.volume} onChange={(v) => edit('Volume', (x) => { x.volume = v; }, 'vol')} />
          </>
        );
      }
    }
  })();
  return (
    <Section title={info.label} actions={<IconBtn icon="x" size={13} title="Remove component" onClick={remove} />}>
      {body}
    </Section>
  );
}
