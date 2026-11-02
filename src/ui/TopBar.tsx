import { useState, type ReactNode } from 'react';
import { useProject, commit } from '../core/store';
import { useEditor, type Workspace } from '../core/editorStore';
import { downloadText, safeFileName } from '../core/storage';
import { saveNow } from '../core/projectActions';
import { exportStandaloneHtml } from '../export/exportGame';
import { BUILTIN_PRESETS, layoutApi, useLayout } from './Layout';
import { IpadDialog, OpenDialog, importProjectFile } from './Dialogs';
import { Icon, IconBtn } from './Icon';

const WORKSPACES: { id: Workspace; label: string }[] = [
  { id: 'world', label: 'World' },
  { id: 'art', label: 'Art' },
  { id: 'logic', label: 'Logic' },
  { id: 'preview', label: 'Play' },
];

type Item = { label: string; run: () => void } | '-';

function Menu({ trigger, items, align = 'left' }: { trigger: ReactNode; items: Item[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <span onClick={() => setOpen(!open)}>{trigger}</span>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onPointerDown={() => setOpen(false)} />
          <div className="menu" style={{ top: '100%', [align]: 0, marginTop: 4 }}>
            {items.map((it, i) => it === '-' ? <div key={i} className="msep" /> : (
              <div key={i} className="mi" onClick={() => { setOpen(false); it.run(); }}>{it.label}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TopBar() {
  const ws = useEditor((s) => s.workspace);
  const status = useEditor((s) => s.status);
  const name = useProject((s) => s.project.name);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const dirty = useProject((s) => s.revision !== s.savedRevision);
  const lay = useLayout();
  const [dialog, setDialog] = useState<'open' | 'ipad' | null>(null);
  const setWs = (w: Workspace) => useEditor.getState().set({ workspace: w });

  const exportJson = () => {
    const p = useProject.getState().project;
    downloadText(safeFileName(p.name) + '.json', JSON.stringify(p));
  };
  const exportHtml = async () => {
    try { await exportStandaloneHtml(useProject.getState().project); }
    catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="topbar">
      <Menu trigger={<button className="ib" title="Menu"><Icon name="menu" /></button>} items={[
        { label: 'Open / New project…', run: () => setDialog('open') },
        { label: 'Save', run: () => saveNow() },
        '-',
        { label: 'Import project (.json)…', run: importProjectFile },
        { label: 'Export project (.json)', run: exportJson },
        { label: 'Export game (.html)', run: exportHtml },
      ]} />
      <div className="tabs">
        {WORKSPACES.map((w) => (
          <button key={w.id} className={'tab' + (ws === w.id ? ' active' : '')} onClick={() => setWs(w.id)}>{w.label}</button>
        ))}
      </div>
      <span className="grow" />
      <input className="projname" value={name} title={status || 'Project name'}
        onChange={(e) => commit('Rename project', (d) => { d.name = e.target.value; }, 'projname')} />
      <span className="status" title={status}>{dirty ? <span className="dirty">●</span> : null}</span>
      <span className="grow" />
      <IconBtn icon="undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => useProject.getState().undo()} />
      <IconBtn icon="redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useProject.getState().redo()} />
      <span className="sep" />
      <IconBtn icon="play" title="Play" on={ws === 'preview'} onClick={() => setWs('preview')} />
      <IconBtn icon="tablet" title="Run on iPad" onClick={() => setDialog('ipad')} />
      <span className="sep" />
      <IconBtn icon="panelLeft" title="Left panel" on={!lay.left} onClick={() => layoutApi.toggle('left')} />
      <IconBtn icon="panelBottom" title="Bottom panel" on={!lay.bottom} onClick={() => layoutApi.toggle('bottom')} />
      <IconBtn icon="panelRight" title="Right panel" on={!lay.right} onClick={() => layoutApi.toggle('right')} />
      <IconBtn icon="maximize" title="Focus main view ( ` )" on={lay.maximized} onClick={() => layoutApi.toggleMax()} />
      <Menu align="right" trigger={<button className="ib" title="Layouts"><Icon name="chevDown" /></button>} items={[
        ...Object.keys(BUILTIN_PRESETS).map((n) => ({ label: n, run: () => layoutApi.applyPreset(n) })),
        ...(Object.keys(lay.presets).length ? ['-' as const] : []),
        ...Object.keys(lay.presets).map((n) => ({ label: '★ ' + n, run: () => layoutApi.applyPreset(n) })),
        '-',
        { label: 'Save layout…', run: () => { const n = prompt('Layout name'); if (n) layoutApi.savePreset(n); } },
        ...(Object.keys(lay.presets).length ? [{ label: 'Delete layout…', run: () => { const n = prompt('Delete which layout?\n' + Object.keys(lay.presets).join(', ')); if (n) layoutApi.deletePreset(n); } }] : []),
      ]} />
      {dialog === 'open' && <OpenDialog onClose={() => setDialog(null)} />}
      {dialog === 'ipad' && <IpadDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
