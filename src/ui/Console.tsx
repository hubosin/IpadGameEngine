import { useEffect, useRef } from 'react';
import { useEditor } from '../core/editorStore';

export function Console() {
  const logs = useEditor((s) => s.logs);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [logs.length]);
  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <button className="btn sm" onClick={() => useEditor.getState().set({ logs: [] })}>Clear</button>
      </div>
      {logs.map((l) => (
        <div key={l.id} className={'log ' + l.level}>
          <span className="src">{new Date(l.time).toLocaleTimeString()}{l.source ? ' · ' + l.source : ''}</span>{l.message}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
