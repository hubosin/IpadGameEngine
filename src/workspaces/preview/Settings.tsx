import { commit, useProject } from '../../core/store';
import { Check, ColorField, NumField, Section, Select } from '../../ui/widgets';

export function ProjectSettingsPanel() {
  const p = useProject((s) => s.project);
  const set = (label: string, f: (s: typeof p.settings) => void, mk?: string) => commit(label, (d) => f(d.settings), mk);
  return (
    <div>
      <Section title="Game">
        <NumField label="View width" min={64} value={p.settings.width} onChange={(v) => set('Resolution', (s) => { s.width = v; }, 'resw')} />
        <NumField label="View height" min={64} value={p.settings.height} onChange={(v) => set('Resolution', (s) => { s.height = v; }, 'resh')} />
        <Select label="Start scene" value={p.settings.startSceneId} options={p.sceneOrder.map((id) => ({ value: id, label: p.scenes[id].name }))} onChange={(v) => set('Start scene', (s) => { s.startSceneId = v; })} />
        <Check label="Pixel art" value={p.settings.pixelArt} onChange={(v) => set('Pixel art', (s) => { s.pixelArt = v; })} title="Crisp, unsmoothed scaling" />
        <ColorField label="Letterbox" value={p.settings.background} onChange={(v) => set('Background', (s) => { s.background = v ?? '#000000'; }, 'bg')} />
      </Section>
      <Section title="Project">
        <div className="dim small">ID: <code>{p.id}</code></div>
        <div className="dim small">Format version {p.version} · {Object.keys(p.assets).length} assets · {p.sceneOrder.length} scenes · {Object.keys(p.graphs).length} graphs</div>
      </Section>
    </div>
  );
}

export function InputSettings() {
  const input = useProject((s) => s.project.input);
  return (
    <div>
      {input.map((a, i) => (
        <div key={i} className="field">
          <label>{a.name}</label>
          <input type="text" defaultValue={a.keys.join(', ')} onBlur={(e) => commit('Edit input', (d) => { d.input[i].keys = e.target.value.split(',').map((k) => k.trim()).filter(Boolean); })} />
          <button className="ibtn" onClick={() => commit('Remove action', (d) => { d.input.splice(i, 1); })}>✕</button>
        </div>
      ))}
      <button className="btn sm" onClick={() => { const n = prompt('Action name'); if (n) commit('Add action', (d) => { d.input.push({ name: n, keys: [] }); }); }}>+ Action</button>
    </div>
  );
}
