import { useState, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Icon } from '../../ui/Icon';
import { PaletteDocker } from '../../ui/ColorSelector';
import { BrushLibrary } from '../../ui/BrushPanel';
import { useEditor } from '../../core/editorStore';
import { ArtSidebar, LayersPanel } from './ArtSidebar';
import { AssetLibrary } from './AssetLibrary';

/** Krita-style dockers on both sides of the canvas, each resizable and collapsible. */
function Docker({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="docker">
      <div className="docker-head" onClick={() => setOpen(!open)}>
        <Icon name={open ? 'chevDown' : 'chevRight'} size={11} /> {title}
      </div>
      {open && <div className="docker-body">{children}</div>}
    </div>
  );
}

function BrushesDocker() {
  const tool = useEditor((s) => s.artTool);
  return <BrushLibrary eraser={tool === 'eraser'} tabbed />;
}

/** Left: assets and the brush library. */
export function ArtLeftDockers() {
  return (
    <div className="krita" style={{ position: 'absolute', inset: 0 }}>
      <PanelGroup direction="vertical" autoSaveId="art-dockers-left">
        <Panel defaultSize={45} minSize={10}><Docker title="Assets"><AssetLibrary /></Docker></Panel>
        <PanelResizeHandle className="rh" />
        <Panel defaultSize={55} minSize={10}><Docker title="Brushes"><BrushesDocker /></Docker></Panel>
      </PanelGroup>
    </div>
  );
}

/** Right: colors, options for the current tool, layers. */
export function ArtDockers() {
  return (
    <div className="krita" style={{ position: 'absolute', inset: 0 }}>
      <PanelGroup direction="vertical" autoSaveId="art-dockers">
        <Panel defaultSize={28} minSize={8}><Docker title="Palette"><PaletteDocker /></Docker></Panel>
        <PanelResizeHandle className="rh" />
        <Panel defaultSize={32} minSize={8}><Docker title="Tool Options"><ArtSidebar /></Docker></Panel>
        <PanelResizeHandle className="rh" />
        <Panel defaultSize={40} minSize={10}><Docker title="Layers"><LayersPanel /></Docker></Panel>
      </PanelGroup>
    </div>
  );
}
