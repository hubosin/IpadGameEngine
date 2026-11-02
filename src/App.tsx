import { useEffect, useState } from 'react';
import { useProject } from './core/store';
import { useEditor, editor } from './core/editorStore';
import { createDefaultProject } from './core/defaults';
import { hasServer, loadLocal, loadServer } from './core/storage';
import { resetEditorFor, saveNow } from './core/projectActions';
import type { Project } from './core/types';
import { Layout, layoutApi } from './ui/Layout';
import { TopBar } from './ui/TopBar';

export function App() {
  const [ready, setReady] = useState(false);

  // initial load: ?project=<id> from the PC, else the last project on this device, else a starter
  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(location.search);
      let p: Project | null = null;
      try {
        const sid = q.get('project');
        if (sid) p = await loadServer(sid);
        if (!p) {
          const last = localStorage.getItem('lastProjectId');
          if (last) p = await loadLocal(last);
        }
      } catch (e) {
        editor().log('warn', 'Could not open last project: ' + (e as Error).message, 'storage');
      }
      const fresh = !p;
      if (!p) p = createDefaultProject();
      useProject.getState().load(p);
      resetEditorFor(p);
      setReady(true);
      if (fresh) saveNow('auto');
      editor().log('info', `Opened "${p.name}". Autosaves to this device${(await hasServer()) ? ' and to the PC (shared with iPad)' : ''}.`, 'editor');
    })();
  }, []);

  // autosave (debounced)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useProject.subscribe((s, prev) => {
      if (s.revision === prev.revision || s.revision === s.savedRevision) return;
      clearTimeout(t);
      t = setTimeout(() => saveNow('auto'), 1500);
    });
    return () => { unsub(); clearTimeout(t); };
  }, []);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); return; }
      if (typing || useEditor.getState().workspace === 'preview') return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) useProject.getState().redo(); else useProject.getState().undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); useProject.getState().redo(); }
      else if (e.key === '`') { e.preventDefault(); layoutApi.toggleMax(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) return <div className="hint" style={{ padding: 20 }}>Loading…</div>;
  return (
    <div className="app">
      <TopBar />
      <Layout />
    </div>
  );
}
