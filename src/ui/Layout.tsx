import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelGroupHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { useEditor, type Workspace } from '../core/editorStore';
import { LeftPanel, MainPanel, RightPanel, BottomPanel } from './Panels';

/**
 * Four-window layout (Left / Main / Right / Bottom). Every window except Main can be
 * resized, collapsed and restored; Main can be maximized. Each workspace remembers its own
 * arrangement, and named layouts can be saved and re-applied.
 */

export interface LayoutSnapshot { h: number[]; v: number[] }

const DEFAULTS: Record<Workspace, LayoutSnapshot> = {
  world: { h: [18, 62, 20], v: [76, 24] },
  art: { h: [20, 58, 22], v: [80, 20] },
  logic: { h: [16, 64, 20], v: [78, 22] },
  preview: { h: [14, 70, 16], v: [78, 22] },
};

export const BUILTIN_PRESETS: Record<string, LayoutSnapshot> = {
  'Default': { h: [18, 62, 20], v: [76, 24] },
  'Main only': { h: [0, 100, 0], v: [100, 0] },
  'No bottom': { h: [18, 62, 20], v: [100, 0] },
  'Wide sidebars': { h: [25, 50, 25], v: [72, 28] },
  'Big bottom': { h: [16, 68, 16], v: [55, 45] },
};

function loadJson<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
function saveJson(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

interface LayoutState {
  left: boolean; right: boolean; bottom: boolean; // collapsed?
  maximized: boolean;
  presets: Record<string, LayoutSnapshot>;
  set: (p: Partial<LayoutState>) => void;
}
export const useLayout = create<LayoutState>((set) => ({
  left: false, right: false, bottom: false, maximized: false,
  presets: loadJson('layoutPresets', {}),
  set: (p) => set(p),
}));

const refs: {
  h: ImperativePanelGroupHandle | null; v: ImperativePanelGroupHandle | null;
  left: ImperativePanelHandle | null; right: ImperativePanelHandle | null; bottom: ImperativePanelHandle | null;
  beforeMax: LayoutSnapshot | null;
} = { h: null, v: null, left: null, right: null, bottom: null, beforeMax: null };

function snapshot(): LayoutSnapshot | null {
  if (!refs.h || !refs.v) return null;
  return { h: refs.h.getLayout(), v: refs.v.getLayout() };
}
function apply(s: LayoutSnapshot) {
  try {
    refs.h?.setLayout(s.h);
    refs.v?.setLayout(s.v);
  } catch { /* panels not registered yet */ }
}

export const layoutApi = {
  toggle(which: 'left' | 'right' | 'bottom') {
    const p = refs[which];
    if (!p) return;
    if (p.isCollapsed()) p.expand(); else p.collapse();
    useLayout.getState().set({ maximized: false });
  },
  toggleMax() {
    const st = useLayout.getState();
    if (st.maximized && refs.beforeMax) {
      apply(refs.beforeMax);
      st.set({ maximized: false });
    } else {
      refs.beforeMax = snapshot();
      refs.left?.collapse(); refs.right?.collapse(); refs.bottom?.collapse();
      st.set({ maximized: true });
    }
  },
  applyPreset(name: string) {
    const s = useLayout.getState().presets[name] ?? BUILTIN_PRESETS[name];
    if (s) { apply(s); useLayout.getState().set({ maximized: false }); }
  },
  savePreset(name: string) {
    const s = snapshot();
    if (!s) return;
    const presets = { ...useLayout.getState().presets, [name]: s };
    saveJson('layoutPresets', presets);
    useLayout.getState().set({ presets });
  },
  deletePreset(name: string) {
    const presets = { ...useLayout.getState().presets };
    delete presets[name];
    saveJson('layoutPresets', presets);
    useLayout.getState().set({ presets });
  },
};

export function Layout() {
  const workspace = useEditor((s) => s.workspace);
  const wsRef = useRef(workspace);
  const applying = useRef(false);

  // restore this workspace's own layout when switching
  useEffect(() => {
    wsRef.current = workspace;
    const saved = loadJson<Record<string, LayoutSnapshot>>('wsLayouts', {})[workspace] ?? DEFAULTS[workspace];
    requestAnimationFrame(() => {
      applying.current = true;
      apply(saved);
      applying.current = false;
    });
    useLayout.getState().set({ maximized: false });
  }, [workspace]);

  const persist = () => {
    if (applying.current) return;
    const s = snapshot();
    if (!s) return;
    const all = loadJson<Record<string, LayoutSnapshot>>('wsLayouts', {});
    all[wsRef.current] = s;
    saveJson('wsLayouts', all);
  };
  // panels register after the first layout pass, so read their state on the next frame
  const flags = () => requestAnimationFrame(() => {
    try {
      useLayout.getState().set({ left: !!refs.left?.isCollapsed(), right: !!refs.right?.isCollapsed(), bottom: !!refs.bottom?.isCollapsed() });
    } catch { /* not registered yet */ }
  });

  return (
    <div className="layout-root">
      <PanelGroup direction="horizontal" ref={(r) => { refs.h = r; }} onLayout={() => { persist(); flags(); }}>
        <Panel id="left" order={1} ref={(r) => { refs.left = r; }} collapsible collapsedSize={0} minSize={10} defaultSize={DEFAULTS.world.h[0]}>
          <LeftPanel />
        </Panel>
        <PanelResizeHandle className="rh" />
        <Panel id="center" order={2} minSize={25} defaultSize={DEFAULTS.world.h[1]}>
          <PanelGroup direction="vertical" ref={(r) => { refs.v = r; }} onLayout={() => { persist(); flags(); }}>
            <Panel id="main" order={1} minSize={20} defaultSize={DEFAULTS.world.v[0]}>
              <MainPanel />
            </Panel>
            <PanelResizeHandle className="rh" />
            <Panel id="bottom" order={2} ref={(r) => { refs.bottom = r; }} collapsible collapsedSize={0} minSize={8} defaultSize={DEFAULTS.world.v[1]}>
              <BottomPanel />
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="rh" />
        <Panel id="right" order={3} ref={(r) => { refs.right = r; }} collapsible collapsedSize={0} minSize={12} defaultSize={DEFAULTS.world.h[2]}>
          <RightPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}
