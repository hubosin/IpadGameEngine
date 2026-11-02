import { useEffect, useRef, useState } from 'react';
import { useProject } from '../../core/store';
import { useEditor, editor } from '../../core/editorStore';
import { GameRuntime } from '../../runtime/runtime';
import { IconBtn } from '../../ui/Icon';

/** Runs the current project with the same runtime used on iPad / in exported games. */
export function PreviewView() {
  const host = useRef<HTMLDivElement>(null);
  const rt = useRef<GameRuntime | null>(null);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const touch = useEditor((s) => s.touchControls);
  const sceneId = useEditor((s) => s.previewSceneId ?? s.activeSceneId);
  const project = useProject((s) => s.project);

  useEffect(() => {
    if (!running || !host.current) return;
    // node stats are batched so the editor isn't re-rendered for every executed node
    let pending: Record<string, number> = {};
    const flush = setInterval(() => {
      const ids = Object.keys(pending);
      if (!ids.length) return;
      const now = Date.now();
      const stats = { ...editor().nodeStats };
      for (const id of ids) stats[id] = { count: (stats[id]?.count ?? 0) + pending[id], last: now };
      pending = {};
      editor().set({ nodeStats: stats });
    }, 250);
    editor().set({ nodeStats: {} });
    editor().log('info', '▶ Game started', 'preview');
    const r = new GameRuntime(useProject.getState().project, host.current, {
      touchControls: touch,
      sceneId,
      onLog: (level, msg, source) => editor().log(level, msg, source),
      onNodeExec: (_g, nodeId) => { pending[nodeId] = (pending[nodeId] ?? 0) + 1; },
    });
    rt.current = r;
    try { r.start(); } catch (e) { editor().log('error', 'Runtime failed to start: ' + (e as Error).message, 'preview'); }
    host.current.focus();
    return () => {
      r.stop();
      rt.current = null;
      clearInterval(flush);
      editor().log('info', '■ Game stopped', 'preview');
    };
  }, [running, runId, touch, sceneId]);

  // start automatically when the Preview workspace opens
  useEffect(() => { setRunning(true); }, []);

  return (
    <div className="viewport" style={{ background: '#000' }}>
      <div ref={host} tabIndex={0} style={{ position: 'absolute', inset: 0, outline: 'none' }} />
      <div className="float topcenter">
        {!running
          ? <IconBtn icon="play" title="Play" onClick={() => setRunning(true)} />
          : <IconBtn icon="stop" title="Stop" onClick={() => setRunning(false)} />}
        <IconBtn icon="restart" title="Restart" onClick={() => { setRunning(true); setRunId((x) => x + 1); }} />
        <span className="sep" />
        <select value={sceneId ?? ''} onChange={(e) => editor().set({ previewSceneId: e.target.value })}>
          {project.sceneOrder.map((id) => <option key={id} value={id}>{project.scenes[id].name}</option>)}
        </select>
        <IconBtn icon="gamepad" title="Touch controls" on={touch} onClick={() => editor().set({ touchControls: !touch })} />
      </div>
    </div>
  );
}
