# ArtEngine — art-first 2D game engine (early prototype)

> 📖 **New here? Read the [User Guide](docs/USER_GUIDE.md)**: how to use every part of the engine, with tutorials and a node reference.

Draw assets, build worlds, wire up game logic with visual nodes, and play the result on
Windows **or iPad** — with no Mac required.

---

## 1. Quick start (Windows)

Requires [Node.js 20+](https://nodejs.org).

```bash
npm install
npm run dev
```

Or just double-click **`Start iPad Server.bat`**.

The editor opens at <http://localhost:5173>. The terminal prints the PC's Wi-Fi address and a
QR code.

## 2. Run on iPad (no Mac, about 10 seconds)

The engine is a web app, and the PC acts as a small server on your Wi-Fi.

1. Start the engine on the PC (`npm run dev` or the `.bat` file).
2. In the editor, click the **tablet icon** (Run on iPad) in the top bar. It saves the project to the PC and shows two QR codes:
   - **▶ Play this game**: opens the game full-screen with on-screen touch controls.
   - **✎ Open the editor on iPad**: the full editor, including Apple Pencil pressure for drawing.
3. Point the iPad camera at a QR code and tap the link.
4. Optional: in Safari, tap **Share → Add to Home Screen** to get an app icon that opens full-screen.

Projects are saved to `./projects/*.json` on the PC, so the iPad and the PC see the same projects.
Edit on the PC, then reload the game on the iPad to get the latest version.

**If the iPad can't connect:** both devices must be on the same Wi-Fi, and Windows Firewall must
allow **Node.js** on *Private* networks. Windows asks about this the first time; you can change it
later under *Windows Security → Firewall → Allow an app*. Guest or "isolated" Wi-Fi networks block
devices from seeing each other.

**Without the PC: GitHub Pages.** Every push to `main` builds the editor and publishes it to
`https://<your-user>.github.io/<repo>/` (see `.github/workflows/deploy.yml`). Open that link in
Safari on the iPad and tap **Share → Add to Home Screen**. With no PC server there, projects save
in the iPad's browser storage; use **File → Export project (.json)** and **Import project (.json)** to move them between devices.
One-time setup: in the repo on GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

**Away from your home Wi-Fi:** use **File → Export Game (.html)**. You get one self-contained file
(about 60 KB plus your art) that runs in any browser. Upload it to any static host (GitHub Pages,
Netlify Drop, itch.io) and open the link on the iPad.

**Production-style LAN server** (faster loading, no dev tooling): `npm run ipad` builds, then
serves on port 4173 with the same QR code.

**Native App Store app:** not set up. That needs Apple signing (a developer account) and a build
service such as Capacitor plus a cloud macOS builder. Nothing in the runtime blocks it, but this
repo makes no such promise yet.

---

## 3. Using the editor

The window has four panels: **Left**, **Main**, **Right** and **Bottom**. Drag the borders to
resize them. Use the panel icons at the top right (or ✕ on a panel) to collapse and restore them. The focus icon (or the
`` ` `` key) maximizes the Main window and restores it again. Each workspace remembers its own
layout, and the ⌄ menu next to them applies built-in or saved layouts.

| Workspace | Main | Left | Right | Bottom |
|---|---|---|---|---|
| **World** (default) | scene viewport | Hierarchy / Layers / Scenes | Inspector (components, brush) | Assets, Prefabs, Console, History |
| **Art** | painting canvas | Asset Library | Tool & Brush, Layers | Timeline / Animation, Console, History |
| **Logic** | node graph | Graphs & Variables | Node details, Add Node palette | Node Debug, Console, History |
| **Preview** | running game | Scenes, Input mapping | Project settings | Console, Node Debug |

Shortcuts: **Ctrl+Z / Ctrl+Shift+Z** (undo/redo) and **Ctrl+S** (save). Art tools: B, E, G, I,
M, P, R, O, A, H, and `[` `]` for brush size. World tools: V, B, E, C, H, plus Del, Ctrl+D,
Ctrl+C/V and the arrow keys. In Logic: right-click, double-click or Space to add a node; drag a
wire into empty space to add a connected node. To pan and zoom: mouse wheel, middle-drag,
Space+drag, or two fingers on iPad.

### Game UI, animation and data systems
- **Game UI** (World → **UI** switch, top right): text, buttons, panels, images and bars, placed on the screen with anchors so a top-right button stays top-right on a PC, an iPad or a phone (preview these shapes with the dropdown). Text can show variables, e.g. `Score: {score}`, and bars can follow a variable. Nodes: **On UI Click**, **Set UI Text**, **Set UI Visible** and **Set Bar Value**.
- **Parameter-driven animation** (Logic → **Animators**): Unity-style state machines with number, bool and trigger parameters. States play sprite animations; transitions have conditions and an optional exit time, plus an "Any State" source. Parameters named `speed`, `vx`, `vy` or `grounded` fill in automatically from physics. Assign a state machine on the object's Animation component. Nodes: **Set Anim Number**, **Set Anim Bool**, **Fire Anim Trigger** and **Get Anim State**.
- **Tweens**: the **Tween** node animates x, y, rotation, scale or opacity with easing (once, loop or ping-pong), and fires **Finished** when it's done.
- **Scriptable objects** (Logic → **Data**): define a data type (fields: number, bool, text, vector, color, asset, prefab, or a reference to other data), then create instances in a spreadsheet view. Give an object a data asset on its Logic component, then read or change fields with **Get Object Data**, **Get Data Field**, **Set Data Field**, **Find Data** and **All Data Of Type**.
- **Art studio** follows Krita: a docked toolbox on the left, tool options across the top (presets, size, opacity, hardness), and docker panels on the right (palette, tool options and layers, all visible together and resizable). The active color swatch opens a color picker; palettes are named, editable color sets saved in the project.

### The starter project shows every system working together
- **Hero**: a vector-art sprite with a 2-frame idle animation and a **Platformer** controller (built-in level 1/2 logic). Its *Hero Logic* graph prints on start, makes the hero pulse on **X** (On Input → Set Scale → Delay → Set Scale), and restarts the scene if the hero falls off the world.
- **Coins**: trigger colliders sharing the *Coin Pickup* graph. On touch, it adds the coin's *Gold Coin* data `points` to the score. A Tween makes each coin bob.
- **Hero Animator**: switches between Idle, Run and Jump automatically using the platformer's speed and grounded values.
- **UI**: a score text (`Score: {score}`), a coin bar, and a Restart button handled by an On UI Click node in *Hero Logic*.
- **Custom Horizontal Move**: a level-3 example. Add a Logic component to the Hero with this graph, then untick *Built-in horizontal* on its Platformer. The nodes now drive horizontal movement, while the built-in gravity, jumping and collision keep working.

---

## 4. Architecture

```
src/
  core/        data model (types.ts), defaults + migrations, undo store, editor UI state, storage
  render/      Canvas2D rendering: tiled raster surfaces, brush engine, flood fill,
               art compositing (layers/groups/vector), shared world renderer
  runtime/     game runtime: node library (nodes.ts), graph interpreter, input, physics, GameRuntime
  player/      standalone player entry (LAN play page + single-file export template)
  export/      standalone HTML export
  ui/          layout system, panels, top bar, dialogs, shared widgets
  workspaces/  world/ art/ logic/ preview/  (one folder per workspace)
server/        project API + LAN server shared by dev and production (plain Node, no deps besides qrcode)
```

Key decisions:

- **One versioned JSON project** (`core/types.ts`, `PROJECT_VERSION`, `migrateProject`) connects everything. Art, world, logic and runtime all read the same data. Raster pixels are stored as PNG tiles inside it.
- **Undo is built into the store.** Every change goes through `commit()` or `begin/live/end` (a continuous gesture counts as one step). Immer's structural sharing makes snapshots cheap, and unchanged objects keep their identity, which the render caches rely on.
- **Graphs are data that gets interpreted, not generated code.** `runtime/nodes.ts` defines each node once (pins, types, editor hints, and `exec`/`evaluate`). The Logic editor and the interpreter both use those definitions. Execution follows exec wires from event nodes. Pure nodes are pulled lazily, and impure nodes expose their last outputs (Blueprint semantics). There are guards against infinite loops and data cycles.
- **Abstraction levels for behavior:** each component is independent (Sprite, Animation, Collider, Body, Platformer, Logic, Camera, Audio). The Platformer's horizontal, jump and gravity parts can each be switched off and replaced by graphs. An object can have several Logic components, or none of the built-ins at all (level 4).
- **The runtime is separate from the editor.** `runtime/` imports no React or editor code. The same `GameRuntime` class runs the Preview, the iPad play page and exported games.
- **Platform independence:** no Windows APIs are used anywhere. Storage is IndexedDB plus the optional PC server. Input is keyboard plus multi-touch on-screen buttons. Pens use Pointer Events (Apple Pencil pressure works in Safari).

### Stack: what changed from the suggested stack, and why
| Suggested | Used now | Why |
|---|---|---|
| TypeScript, React, Vite | ✅ same | |
| React Flow | ✅ `@xyflow/react` | |
| **Tauri** | **Installable web app (PWA) + tiny Node LAN server** | The iPad requirement is met best by a web app: the same build runs in Edge/Chrome on Windows (and can be "installed" as an app window) and in Safari on iPad. Tauri needs a Rust toolchain, and its Windows build cannot run on iPad. Nothing here prevents wrapping the app in Tauri later for a native Windows `.exe` with direct file access. |
| **PixiJS** | **Canvas2D behind `render/`** | Painting needs Canvas2D anyway. It works the same on every iPad Safari version with no WebGL context limits, and keeps exported games around 60 KB. Rendering sits behind `renderWorld()` and `drawAsset()`, so a PixiJS/WebGL backend can replace it when scenes need thousands of sprites. |

---

## 5. Feature status

### Working (tested)
- **Layout:** four panels, resizable and collapsible; maximize/restore of Main; per-workspace layouts; built-in and saved named layouts; touch-sized resize handles on iPad.
- **Projects:** autosave to IndexedDB and to the PC (`projects/`); open/new dialog; import/export `.json`; versioned format with migrations; reopen on launch.
- **Undo/redo** for every edit, plus a History panel where you can jump to any step.
- **Brush engine:** 11 built-in brushes saved in the project; tips (8 built-in, plus import your own); paper textures (4 built-in, plus import your own) with scale and strength; flow, angle, roundness, rotation (fixed/follow/random), scatter, size and opacity jitter, smoothing; live stroke previews.
- **Raster art:** brush and eraser with size, opacity, hardness, spacing and pen pressure (size and/or opacity; coalesced events for smooth Pencil strokes); brush presets (saved per device); color picker; eyedropper; flood fill that finds regions using all visible layers; rectangular selection with move/scale/rotate, apply, cancel and clear; "Transform layer"; zoom, pan and pinch; pixel grid when zoomed in.
- **Layers:** raster, vector and group layers; opacity; visibility; lock; reorder; duplicate; delete; assign to a group (group opacity composites correctly).
- **Vector art:** pen tool (corner and curve points, close, finish), rectangle and ellipse, fill/stroke/width, point and handle editing (Alt breaks handle symmetry), move/scale/rotate of a path, flip, bring forward, delete. Raster and vector layers mix freely in one asset.
- **Assets:** create (with type and size), import PNG/JPG and sounds, folders, rename, duplicate, delete (references are cleaned up), thumbnails, export PNG and sprite sheet.
- **Animation foundations:** frames with durations, add/duplicate/reorder/delete, onion skin, named animations (frame list, fps, loop) with playback in the editor and at runtime.
- **World:** pan, zoom and pinch; select, multi-select and marquee; move, scale and rotate gizmo; grid and snapping; nudge; duplicate, copy/paste and delete; drag assets or prefabs from the library (or tap Place); painting directly into any world layer (unbounded 512 px chunks, with undo); collision-box tool; default layers (Background, Scenery, Objects, Characters, Effects, Foreground, Collision) with visibility, lock, opacity, parallax and order; hierarchy with folders, nesting by drag-and-drop, visibility and lock toggles, rename; prefabs; multiple scenes with a start scene.
- **Components:** Transform, Sprite, Animation, Collider (solid or trigger), Physics Body, Platformer (with parts that can be replaced), Logic graph, Camera (follow + zoom), Audio.
- **Logic:** about 50 nodes across Events, Input, Math, Movement, Objects, Logic, Animation and Game State; typed, colored pins with connection validation (exec only connects to exec, incompatible data types are refused); inline value editors; search palette (also filtered to pins that fit when you drag out of a pin); comments that carry their nodes; copy/paste/duplicate (across graphs too); reusable saved sections; Custom Event and Call Event for reusing logic; graph and global variables.
- **Runtime:** a graph interpreter shared with the editor's node definitions; AABB physics with gravity and grounding; collision and trigger events; input actions (keyboard and on-screen touch buttons); spawn/destroy; change/restart scene; animations; camera; audio.
- **Preview and debugging:** play, stop, restart, scene picker, touch-controls toggle, Console (Print and runtime errors with graph and node names), per-node execution counts (badges on nodes plus the Node Debug list).
- **iPad and export:** QR-code play/edit links over Wi-Fi; full-screen play page with tap-to-start; home-screen icon; standalone single-file HTML export; production LAN server.

### Incomplete / not yet built
- Lasso and magic-wand selection; selection on vector layers (use the path tools); canvas resize/crop for existing assets.
- Smudge/blend (color-mixing) brushes; custom blend modes per layer; creating a brush tip from a canvas selection.
- Tile painting with tilesets (the tileset type and tile size are stored, but there is no tile brush yet).
- Prefab instances are copies: editing a prefab does not update instances already placed.
- No visual blend trees, and no keyframe timeline for property animation (use Tween nodes for now).
- UI elements can't be nested inside each other yet, and there's no text wrapping.
- Scatter, procedural placement and object painting (the architecture leaves room for them).
- Node graph "functions" with their own inputs and outputs (reuse currently works through Custom Events and saved sections).
- Step-through or breakpoint debugging of graphs, and live value inspection.
- Gamepad input; key remapping is edited as text (Preview → Input).

### Known limitations
- Physics uses axis-aligned boxes: rotation is ignored for collisions, and physics bodies should be top-level objects (not children of moving or scaled parents).
- Over plain-http Wi-Fi, iPad Safari does not allow service workers, so the home-screen app needs the PC running. The game does cache the last project it loaded, but the page itself won't open offline. For offline or remote play, use the exported HTML on an HTTPS host.
- Large paintings are stored as PNG data inside the project JSON. This is fine for prototypes, but very large worlds will make project files big (a future step is storing binaries separately).
- Undo history is per session and is not saved with the project.
- Audio on iOS only starts after a tap (handled by the play page's "Tap to play").

---

## 6. Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Builds the player template, starts the editor on all network interfaces (port 5173), prints the QR code |
| `npm run build` | Type-checks and builds `dist/` |
| `npm run ipad` | Builds, then serves `dist/` + project API on port 4173 for LAN play |
| `npm run typecheck` | TypeScript only |
