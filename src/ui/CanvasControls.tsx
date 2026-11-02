import { useEditor, editor } from '../core/editorStore';
import { ActiveColor } from './ColorSelector';

/** Procreate-style vertical slider. `t` is 0..1 (bottom..top). */
function VSlider({ t, onChange, title }: { t: number; onChange: (t: number) => void; title: string }) {
  const set = (el: HTMLElement, y: number) => {
    const r = el.getBoundingClientRect();
    onChange(Math.min(1, Math.max(0, 1 - (y - r.top) / r.height)));
  };
  return (
    <div className="vslider" title={title}
      onPointerDown={(e) => { e.stopPropagation(); try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } set(e.currentTarget, e.clientY); }}
      onPointerMove={(e) => { if (e.buttons) set(e.currentTarget, e.clientY); }}>
      <div className="fill" style={{ height: t * 100 + '%' }} />
      <div className="knob" style={{ bottom: t * 100 + '%' }} />
    </div>
  );
}

const MAX_SIZE = 300;

/** Brush size + opacity sliders on the canvas edge. */
export function BrushSliders() {
  const b = useEditor((s) => s.brush);
  const set = (patch: Partial<typeof b>) => editor().set({ brush: { ...editor().brush, ...patch } });
  return (
    <div className="float vert vsliders">
      <VSlider title="Size" t={Math.sqrt((b.size - 1) / (MAX_SIZE - 1))} onChange={(t) => set({ size: Math.max(1, Math.round(1 + t * t * (MAX_SIZE - 1))) })} />
      <div className="vslider-val">{Math.round(b.size)}</div>
      <VSlider title="Opacity" t={b.opacity} onChange={(t) => set({ opacity: Math.max(0.01, Math.round(t * 100) / 100) })} />
      <div className="vslider-val">{Math.round(b.opacity * 100)}%</div>
    </div>
  );
}

/** Current color as a round swatch (tap to open the picker). */
export function ColorSwatch() {
  return <ActiveColor />;
}
