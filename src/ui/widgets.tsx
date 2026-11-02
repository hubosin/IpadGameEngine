import { useEffect, useState, type ReactNode } from 'react';

/** Small form widgets used by every property panel. */

export function NumField({ label, value, onChange, step = 1, min, max, title }: {
  label?: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; title?: string;
}) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  const input = (
    <input
      type="number" value={text} step={step} min={min} max={max} title={title}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(clamp(v, min, max));
      }}
      onBlur={() => setText(fmt(value))}
    />
  );
  return label === undefined ? input : <div className="field"><label title={label}>{label}</label>{input}</div>;
}

function fmt(v: number) {
  return String(Math.round(v * 1000) / 1000);
}
function clamp(v: number, min?: number, max?: number) {
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

export function Slider({ label, value, onChange, min, max, step = 0.01, display, width }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; display?: (v: number) => string; width?: number;
}) {
  const set = (el: HTMLElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const v = Math.round((min + t * (max - min)) / step) * step;
    onChange(Math.min(max, Math.max(min, v)));
  };
  const pct = ((value - min) / (max - min || 1)) * 100;
  const bar = (
    <div className="bslider" style={width ? { flex: 'none', width } : undefined}
      onPointerDown={(e) => { try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } set(e.currentTarget, e.clientX); }}
      onPointerMove={(e) => { if (e.buttons) set(e.currentTarget, e.clientX); }}>
      <div className="fill" style={{ width: pct + '%' }} />
      <span className="lbl">{label}</span>
      <span className="val">{display ? display(value) : fmt(value)}</span>
    </div>
  );
  return width ? bar : <div className="field">{bar}</div>;
}

export function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="field">
      <label>{label}</label>
      <input type="text" value={text} placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onChange(text)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}

export function Check({ label, value, onChange, title }: { label: string; value: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <div className="field" title={title}>
      <label>{label}</label>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function ColorField({ label, value, onChange, allowNone }: { label: string; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="color" value={value ?? '#000000'} onChange={(e) => onChange(e.target.value)} disabled={value === null} />
      {allowNone && (
        <button className={'btn sm' + (value === null ? ' on' : '')} onClick={() => onChange(value === null ? '#000000' : null)} title="No color">∅</button>
      )}
    </div>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: (T | { value: T; label: string })[]; onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </div>
  );
}

export function Section({ title, children, actions, defaultOpen = true }: { title: string; children: ReactNode; actions?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <div className="section-title" onClick={() => setOpen(!open)}>
        <span className="tri">{open ? '▾' : '▸'}</span><span>{title}</span><span className="grow" />
        <span onClick={(e) => e.stopPropagation()} className="row">{actions}</span>
      </div>
      {open && children}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2 style={{ flex: 1, margin: 0 }}>{title}</h2>
          <button className="ib" onClick={onClose} title="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Inline rename: shows text, double-click (or double-tap) to edit. */
export function EditableName({ value, onChange, editing, setEditing }: { value: string; onChange: (v: string) => void; editing: boolean; setEditing: (b: boolean) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value, editing]);
  if (!editing) return <span className="name" onDoubleClick={() => setEditing(true)}>{value}</span>;
  return (
    <input className="rename" autoFocus value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { setEditing(false); if (text.trim() && text !== value) onChange(text.trim()); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(value); setEditing(false); } }}
      onPointerDown={(e) => e.stopPropagation()} />
  );
}
