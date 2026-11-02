import { useProject } from '../core/store';

/** Undo history. Click an entry to step back/forward to that point. */
export function HistoryPanel() {
  const past = useProject((s) => s.past);
  const future = useProject((s) => s.future);
  const st = useProject.getState;
  const goto = (undoSteps: number) => {
    for (let i = 0; i < undoSteps; i++) st().undo();
    for (let i = 0; i < -undoSteps; i++) st().redo();
  };
  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <button className="btn sm" disabled={!past.length} onClick={() => st().undo()}>Undo</button>
        <button className="btn sm" disabled={!future.length} onClick={() => st().redo()}>Redo</button>
      </div>
      <div className="list-item dim" onClick={() => goto(past.length)}>(start)</div>
      {past.map((h, i) => (
        <div key={'p' + i} className={'list-item' + (i === past.length - 1 ? ' sel' : '')} onClick={() => goto(past.length - 1 - i)}>
          <span className="name">{h.label}</span>
        </div>
      ))}
      {[...future].reverse().map((h, i) => (
        <div key={'f' + i} className="list-item dim" onClick={() => goto(-(i + 1))}>
          <span className="name">↷ {h.label}</span>
        </div>
      ))}
    </div>
  );
}
