import { useState, type ReactNode } from 'react';
import { useEditor, type Workspace } from '../core/editorStore';
import { layoutApi } from './Layout';
import { WorldViewport } from '../workspaces/world/WorldViewport';
import { SceneTree, WorldLayersPanel, ScenesPanel } from '../workspaces/world/SceneTree';
import { Inspector } from '../workspaces/world/Inspector';
import { UIEditor, UIInspector, UIList } from '../workspaces/world/UIEditor';
import { AssetBrowser, PrefabBrowser } from '../workspaces/world/AssetBrowser';
import { ArtCanvas } from '../workspaces/art/ArtCanvas';
import { AssetLibrary } from '../workspaces/art/AssetLibrary';
import { ArtSidebar, LayersPanel } from '../workspaces/art/ArtSidebar';
import { Timeline } from '../workspaces/art/Timeline';
import { ArtDockers, ArtLeftDockers } from '../workspaces/art/ArtDockers';
import { LogicEditor } from '../workspaces/logic/LogicEditor';
import { GraphList } from '../workspaces/logic/GraphList';
import { NodeInspector, NodePalette } from '../workspaces/logic/NodeInspector';
import { NodeDebug } from '../workspaces/logic/NodeDebug';
import { AnimatorEditor, AnimInspector, ControllerList } from '../workspaces/logic/AnimatorEditor';
import { DataEditor, DataList } from '../workspaces/logic/DataEditor';
import { PreviewView } from '../workspaces/preview/PreviewView';
import { InputSettings, ProjectSettingsPanel } from '../workspaces/preview/Settings';
import { Console } from './Console';
import { HistoryPanel } from './HistoryPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { IconBtn } from './Icon';

type Tab = { id: string; label: string; render: () => ReactNode; flush?: boolean };

/** A panel with contextual tabs; remembers the chosen tab per workspace. */
function TabbedPanel({ slot, tabs, onClose }: { slot: string; tabs: Tab[]; onClose?: () => void }) {
  const ws = useEditor((s) => s.workspace);
  const key = `${slot}:${ws}`;
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const activeId = chosen[key] && tabs.some((t) => t.id === chosen[key]) ? chosen[key] : tabs[0]?.id;
  const active = tabs.find((t) => t.id === activeId);
  return (
    <div className="panel">
      <div className="panel-head">
        {tabs.map((t) => (
          <span key={t.id} className={'ptab' + (t.id === activeId ? ' active' : '')} onClick={() => setChosen({ ...chosen, [key]: t.id })}>{t.label}</span>
        ))}
        <span style={{ flex: 1 }} />
        {onClose && <IconBtn icon="x" size={13} title="Hide panel" onClick={onClose} />}
      </div>
      <div className={'panel-body' + (active?.flush ? ' flush' : '')}><ErrorBoundary key={key + activeId} name={active?.label ?? 'Panel'}>{active?.render()}</ErrorBoundary></div>
    </div>
  );
}

const LEFT: Record<Workspace, Tab[]> = {
  world: [
    { id: 'tree', label: 'Hierarchy', render: () => <WorldTreeOrUI /> },
    { id: 'layers', label: 'Layers', render: () => <WorldLayersPanel /> },
    { id: 'scenes', label: 'Scenes', render: () => <ScenesPanel /> },
  ],
  art: [{ id: 'dockers', label: 'Assets & Brushes', render: () => <ArtLeftDockers />, flush: true }],
  logic: [
    { id: 'graphs', label: 'Graphs', render: () => <GraphList /> },
    { id: 'anim', label: 'Animators', render: () => <ControllerList /> },
    { id: 'data', label: 'Data', render: () => <DataList /> },
  ],
  preview: [
    { id: 'scenes', label: 'Scenes', render: () => <ScenesPanel /> },
    { id: 'input', label: 'Input', render: () => <InputSettings /> },
  ],
};

const RIGHT: Record<Workspace, Tab[]> = {
  world: [{ id: 'inspector', label: 'Inspector', render: () => <InspectorOrUI /> }],
  art: [{ id: 'dockers', label: 'Dockers', render: () => <ArtDockers />, flush: true }],
  logic: [
    { id: 'node', label: 'Properties', render: () => <LogicInspector /> },
    { id: 'palette', label: 'Nodes', render: () => <NodePalette /> },
  ],
  preview: [{ id: 'settings', label: 'Settings', render: () => <ProjectSettingsPanel /> }],
};

const BOTTOM: Record<Workspace, Tab[]> = {
  world: [
    { id: 'assets', label: 'Assets', render: () => <AssetBrowser /> },
    { id: 'prefabs', label: 'Prefabs', render: () => <PrefabBrowser /> },
    { id: 'console', label: 'Console', render: () => <Console /> },
    { id: 'history', label: 'History', render: () => <HistoryPanel /> },
  ],
  art: [
    { id: 'timeline', label: 'Timeline', render: () => <Timeline /> },
    { id: 'console', label: 'Console', render: () => <Console /> },
    { id: 'history', label: 'History', render: () => <HistoryPanel /> },
  ],
  logic: [
    { id: 'debug', label: 'Debug', render: () => <NodeDebug /> },
    { id: 'console', label: 'Console', render: () => <Console /> },
    { id: 'history', label: 'History', render: () => <HistoryPanel /> },
  ],
  preview: [
    { id: 'console', label: 'Console', render: () => <Console /> },
    { id: 'debug', label: 'Debug', render: () => <NodeDebug /> },
  ],
};

function LogicMain() {
  const v = useEditor((s) => s.logicView);
  return v === 'animator' ? <AnimatorEditor /> : v === 'data' ? <DataEditor /> : <LogicEditor />;
}
function LogicInspector() {
  const v = useEditor((s) => s.logicView);
  return v === 'animator' ? <AnimInspector /> : v === 'data' ? <div className="hint">Edit data in the main view</div> : <NodeInspector />;
}
function WorldTreeOrUI() { return useEditor((s) => s.worldMode) === 'ui' ? <UIList /> : <SceneTree />; }
function InspectorOrUI() { return useEditor((s) => s.worldMode) === 'ui' ? <UIInspector /> : <Inspector />; }
function WorldMain() { return useEditor((s) => s.worldMode) === 'ui' ? <UIEditor /> : <WorldViewport />; }

export function LeftPanel() {
  const ws = useEditor((s) => s.workspace);
  return <TabbedPanel slot="left" tabs={LEFT[ws]} onClose={() => layoutApi.toggle('left')} />;
}
export function RightPanel() {
  const ws = useEditor((s) => s.workspace);
  return <TabbedPanel slot="right" tabs={RIGHT[ws]} onClose={() => layoutApi.toggle('right')} />;
}
export function BottomPanel() {
  const ws = useEditor((s) => s.workspace);
  return <TabbedPanel slot="bottom" tabs={BOTTOM[ws]} onClose={() => layoutApi.toggle('bottom')} />;
}

export function MainPanel() {
  const ws = useEditor((s) => s.workspace);
  return (
    <div className="panel">
      <div className="panel-body flush">
        <ErrorBoundary key={ws} name={ws + ' workspace'}>
          {ws === 'world' && <WorldMain />}
          {ws === 'art' && <ArtCanvas />}
          {ws === 'logic' && <LogicMain />}
          {ws === 'preview' && <PreviewView />}
        </ErrorBoundary>
      </div>
    </div>
  );
}
