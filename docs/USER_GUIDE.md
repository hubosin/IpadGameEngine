# ArtEngine User Guide

ArtEngine is an art-first 2D game engine. You draw your art, build levels, wire up behavior with
visual nodes, and play the result on Windows or iPad. Everything lives in one project.

**Contents**
1. [Getting started](#1-getting-started)
2. [Running on iPad](#2-running-on-ipad)
3. [The interface](#3-the-interface)
4. [Art workspace](#4-art-workspace)
5. [World workspace](#5-world-workspace)
6. [Game UI](#6-game-ui)
7. [Logic: node graphs](#7-logic-node-graphs)
8. [Animators: parameter-driven animation](#8-animators-parameter-driven-animation)
9. [Data: scriptable objects](#9-data-scriptable-objects)
10. [Play, test and debug](#10-play-test-and-debug)
11. [Saving, sharing and exporting](#11-saving-sharing-and-exporting)
12. [Tutorials](#12-tutorials)
13. [Node reference](#13-node-reference)
14. [Keyboard shortcuts](#14-keyboard-shortcuts)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Getting started

**Install once:** install [Node.js](https://nodejs.org) (version 20 or newer).

**Start the engine:** double-click **`Start iPad Server.bat`** in the project folder. You can also
open a terminal there and run:

```bash
npm install
npm run dev
```

Then open <http://localhost:5173> in Edge or Chrome. The first time, you get a **starter project**:
a small platformer with a hero, platforms, coins, a score display and a restart button. Every
system in this guide is already used in it, so it's worth taking apart.

**New project:** ☰ menu → **Open / New project**, then choose:
- **New blank project**: an empty scene with the standard layers and a camera, plus the built-in brushes and palettes. No art or logic.
- **New from starter template**: the example platformer described above.

---

## 2. Running on iPad

No Mac is needed. The PC runs a small server on your Wi-Fi, and the iPad opens it in Safari.

1. Start the engine on the PC (see above). Leave the terminal window open.
2. In the editor, click the **tablet icon** in the top bar (*Run on iPad*). Two QR codes appear:
   - **Play this game**: opens the game full-screen with on-screen touch buttons.
   - **Open the editor on iPad**: the full editor. Drawing with Apple Pencil is pressure-sensitive.
3. Scan a QR code with the iPad camera and tap the link.
4. Optional: in Safari tap **Share → Add to Home Screen** for an app icon.

Both devices save into the same `projects` folder on the PC. Edit on one, then reload on the other.

**Away from your Wi-Fi:** use ☰ → **Export game (.html)**. It produces one file that runs in any
browser. Upload it to any web host (GitHub Pages, Netlify Drop, itch.io) and open the link.

---

## 3. The interface

```
┌──────────────────────────── top bar ────────────────────────────┐
│ ☰  World  Art  Logic  Play      Project name     ↶ ↷ ▶ 📱 ◧⬓◨ ⛶ ⌄ │
├──────────┬────────────────────────────────────────┬─────────────┤
│  Left    │               Main                     │   Right     │
│ (lists)  │  (canvas / world / node graph / game)  │ (properties)│
│          ├────────────────────────────────────────┤             │
│          │        Bottom (assets, console…)       │             │
└──────────┴────────────────────────────────────────┴─────────────┘
```

- **Workspaces** (top-left tabs): **World** builds levels, **Art** draws assets, **Logic** holds behavior, animators and data, and **Play** runs the game.
- **Panels:** drag any border to resize. The panel icons at the top right hide or show the Left, Bottom and Right panels; **✕** on a panel hides it too. The **focus** icon (or the `` ` `` key) maximizes the main view, and pressing it again restores the layout.
- **Layouts:** each workspace remembers its own panel sizes. The **⌄** menu applies built-in layouts, and **Save layout…** stores your own.
- **Undo/redo:** **↶ ↷** or Ctrl+Z / Ctrl+Shift+Z. Every change can be undone. The **History** tab lists the steps; click one to jump back to it.
- **Saving is automatic.** A dot next to the project name means a save is pending. Ctrl+S saves immediately.
- **Navigating any canvas:** mouse wheel zooms; middle-drag, Space+drag or right-drag pans; on iPad, pinch and two-finger drag.

---

## 4. Art workspace

The Art workspace is laid out like Krita:

| Area | What's there |
|---|---|
| Left | **Assets** (sprites, backgrounds, sounds, folders) and **Brushes** (saved brushes, tips, textures), stacked and resizable |
| Left strip | **Toolbox**, with the **active color** at the bottom |
| Top bar | **Tool options** for the current tool (brush presets, size, opacity, hardness…) |
| Right | **Palette**, **Tool Options** (settings for the current tool) and **Layers**, stacked and resizable |
| Bottom | **Timeline**: frames and animations |

### Assets
- **+** creates an asset. Pick a type (sprite, background, tileset…) and a size; the preset buttons fill in common sizes.
- **Import image** brings in a PNG or JPG as an editable asset. **Import sound** adds audio for Audio components.
- **Folders:** **+ Folder**, then drag assets onto a folder. Selecting an asset shows **Rename**, **Duplicate**, **Place in world** and **Delete**.

### Tools

| Tool | Key | Use |
|---|---|---|
| Brush | B | Paint with the current brush. Pick brushes, tips and textures in the Brushes docker (left); flow, spacing and dynamics are in Tool Options (right). Apple Pencil pressure works. |
| Eraser | E | Erase pixels |
| Fill | G | Fill an area. It looks at **all visible layers** to find edges, so you can fill inside line art drawn on another layer. *Tolerance* sets how similar colors must be. |
| Eyedropper | I | Pick a color from the canvas |
| Select | M | Drag a rectangle. Drag inside it to move the pixels; corners scale (Shift keeps proportions); the circle rotates (Shift snaps to 15°). **Enter/Apply** commits, **Esc/Cancel** cancels, **Delete/Clear** erases. Ctrl+A selects all. **Transform layer** grabs the whole layer. |
| Pen | P | Vector paths: click for corner points, click-and-drag for curves, click the first point to close, Enter or double-click to finish |
| Rectangle / Ellipse | R / O | Vector shapes. Shift makes squares and circles. |
| Edit paths | A | Click a vector path, then drag points or handles (Alt moves one handle on its own), drag the shape to move it, use the yellow corner to scale and the circle to rotate. Delete removes it. |
| Pan | H | Move the view |

Brush tools need a **raster** layer and vector tools need a **vector** layer. If the selected layer
is the wrong kind, a suitable layer is added for you. `[` and `]` change brush size.

### Brushes, tips and textures (Brushes docker, left)
- The docker has three tabs: **Brushes**, **Tip** and **Texture**.
- **Brushes:** each tile shows a live stroke preview. Tap one to load it: Pencil, Ink, Marker, Soft Airbrush, Chalk, Charcoal, Calligraphy, Bristle, Splatter, Square Pixel and Leaves. The icons underneath: **+** saves the current settings as a new brush · ✓ overwrites the selected brush · rename · duplicate · delete. Brushes are saved in the project, so they come with you to the iPad. The **Brushes…** dropdown in the top bar picks one quickly.
- **Tip:** the shape stamped along the stroke (round, square, pencil, chalk, bristle, splatter, leaf, grass). **+** imports your own tip from an image: a black shape on white, or a shape on a transparent PNG. Hover over an imported tip and click × to remove it.
- **Texture:** a paper grain that the paint sits on (paper, canvas, noise, hatching). **+** imports your own texture image (lighter areas take more paint). *Scale* sets the grain size and *Strength* sets how much it shows. The texture stays fixed to the canvas, like real paper.
- The following settings are in the **Tool Options** docker on the right while the brush or eraser is selected.
- **Flow:** how much paint each dab adds. Low flow builds up gradually, like an airbrush; *Opacity* caps the whole stroke.
- **Spacing:** the gap between dabs. Wide spacing gives stamp brushes such as leaves or splatter.
- **Shape & dynamics:**
  - *Angle* and *Roundness* flatten and tilt the tip (calligraphy).
  - *Rotation*: fixed, follow the stroke direction (good for bristles), or random.
  - *Scatter*: random offset around the stroke.
  - *Size jitter* and *Opacity jitter*: random variation per dab.
  - *Smoothing*: steadies your line; higher values give smoother, laggier lines.
  - *Pressure → size / opacity*: Apple Pencil and pen pressure. A normal press gives close to full size; the size and opacity sliders are the maximum at a firm press.
- **Brush cursor:** the outline shows the brush's full size and shape (angle/roundness). While you draw with a pen, a dashed outline marks the full size and a solid one shows the size at your current pressure.
- The same brushes work when painting in the World workspace.

### Colors and palettes
- **Active color** (the round swatch in the toolbox and at the top of the Palette docker): click it to open the color picker. Drag in the square for shade, the strip for hue, or type a hex code. Recently used colors appear under the picker. Click anywhere outside to close it.
- **Palette docker:**
  - Click a swatch to make it the active color. Double-click a swatch to edit it.
  - **+** (after the last swatch) adds the active color to the palette.
  - The row of icons under the swatches, from left to right: edit the selected swatch · replace it with the active color · move it earlier/later · remove it. After a gap: new palette · duplicate · rename · delete palette.
  - Switch palettes with the dropdown. Palettes are saved in the project, so they come with you to the iPad.

### Layers (Layers docker)
- Icons: new **raster** layer · new **vector** layer · new **group** · move up/down · duplicate · delete.
- Click a layer to make it active. Use the eye to hide it and the lock to protect it. Double-click a name to rename it.
- Below the list, set the layer's **opacity**, move it **into a group**, or **clear** the current frame.

### Animation frames (Timeline)
- **+ Blank frame** / **+ Duplicate frame** add a frame after the current one. You can also move or delete frames and set each frame's **duration**.
- **Onion skin** shows the neighboring frames faintly while you draw.
- **+ Animation** creates a named animation (idle, run, jump…). Tick which frames it uses and set its FPS and looping. ▶ previews it.
- Objects play these animations using an Animation component, an Animator (section 8), or animation nodes.

**Export:** Tool Options → Asset → **Export PNG**, or **Export sprite sheet** if the asset has several frames.

---

## 5. World workspace

### Viewport tools (left toolbox)

| Tool | Key | Use |
|---|---|---|
| Select | V | Click to select, Shift+click to add, drag empty space for a box selection. Drag to move; the white corners scale; the circle rotates. |
| Paint | B | Paint straight into the world on the chosen layer (dropdown at the top right). The sliders next to the toolbox set size and opacity. |
| Erase | E | Erase painted world pixels |
| Collision box | C | Drag to create an invisible solid box (for floors and walls you've painted) |
| Pan | H | Move the view |

Top right: **World / UI** switch, **grid**, **snap**, grid size, and zoom (click the zoom value to reset the view).

Keys: Delete removes objects, Ctrl+D duplicates, Ctrl+C / Ctrl+V copy and paste, the arrow keys
nudge (Shift for 10 px), Esc deselects.

### Placing things
- Drag an asset from the bottom **Assets** tab into the world, or tap **Place** to drop it in the middle of the view. Placed assets get a Sprite and a Collider automatically.
- **Prefabs** are reusable objects: select an object, then use the ★ icon in the Hierarchy (*Make prefab*). Drag prefabs in from the **Prefabs** tab, or spawn them while the game runs with the **Spawn Object** node.

### Hierarchy (left)
- The icons add an object or folder, duplicate, make a prefab, move up/down, unparent, and delete.
- **Drag rows** to reorder them. Drop onto the middle of a row to make it a child. Children move, rotate and scale with their parent (for example, a camera parented to the hero follows it).
- The eye and lock icons hide or lock an object, including its children.

### World layers (Layers tab)
The default layers, back to front, are Background, Scenery, Objects, Characters, Effects,
Foreground and Collision. Each has visibility, lock and opacity settings, plus **parallax**
(1 = moves with the camera, 0.3 = distant background that scrolls slowly). The active layer is
where painting and placed objects go.

### Scenes (Scenes tab)
Add, duplicate or delete scenes and set each scene's background color. The **★** marks the scene
the game starts in.

### Inspector and components
Select an object to edit its name, **tags** (comma-separated, used by logic, e.g. `player`), layer
and transform. Below that, add **components**:

| Component | Does |
|---|---|
| Sprite Renderer | Draws an art asset (with flip and opacity) |
| Animation | Plays a sprite animation, or is driven by an **Animator** controller |
| Collider | A box for collisions. On its own it's solid ground or wall. **Trigger** reports touches without blocking. |
| Physics Body | Gravity + velocity; collides with solids |
| Platformer Controller | Ready-made run and jump. Tune speed, acceleration, jump height and gravity. Untick *Horizontal*, *Jump* or *Gravity* to drive that part with your own nodes instead. |
| Logic Graph | Runs a node graph. Its **Data** field links a data asset (section 9). An object can have several. |
| Camera | The primary camera follows this object, with zoom |
| Audio Source | Plays a sound (autoplay / loop / volume) |

**Behavior levels:** you can use the Platformer as-is, tune its numbers, replace only part of it
with nodes (see the *Custom Horizontal Move* graph in the starter project), or remove it and write
all the movement yourself with a Physics Body and nodes.

---

## 6. Game UI

Switch the World view to **UI** (top right). This is the screen overlay: score, buttons, health bars and so on.

- **Add elements** from the toolbox: Text, Button, Panel, Image, Bar.
- Drag to move, drag the orange corner to resize, use the arrow keys to nudge, Delete to remove.
- **Anchor** (the 3×3 grid in the Inspector) pins an element to a part of the screen. A top-right button stays top-right on every screen shape. Use the dropdown at the top right to preview **16:9, iPad and phone** shapes.
- **Text** can include variables in braces: `Score: {score}` updates live from the global variable `score`.
- **Bar** fills from a variable (*Variable* and *Max*), or from the **Set Bar Value** node.
- **Buttons** fire the **On UI Click** node, matched by the button's **name**.
- The left panel lists the elements, back to front. Use the eye to hide one, and the arrows to change which draws on top.

Nodes: On UI Click, Set UI Text, Set UI Visible, Set Bar Value.

---

## 7. Logic: node graphs

Logic is built by connecting nodes, in the style of Unreal Blueprints. A graph does nothing until
an object uses it: give the object a **Logic Graph** component and pick the graph.

### Editing
- **Add a node:** the **+** button, right-click, double-click empty space, or press Space. Type to search.
- **Drag from a pin into empty space** to get a list of only the nodes that fit, already connected.
- **Connect** by dragging from an output (right side) to an input (left side). Mismatched types are refused.
- The **Properties** tab (right) shows the selected node's settings. The **Nodes** tab is a tap-friendly list for adding nodes.
- **Comments:** the speech-bubble icon wraps the selected nodes in a box. Moving the box moves what's inside; double-click it to change the text.
- Copy, paste and duplicate with Ctrl+C / V / D. This works across graphs.
- **Save section** (bookmark icon) saves the selected nodes for reuse. Insert it from the search menu under *Sections*.
- **Fit view** zooms to show everything.

### How graphs run
- **White diamond pins** are *execution*: they carry the "do this, then this" flow, starting from an **Event** node (On Start, On Update, On Collision, On Input, On Timer, On UI Click, Custom Event).
- **Colored pins** carry values: green = number, red = true/false, yellow = vector (x, y), pink = text, blue = object, orange = resource (asset, prefab, data…), purple = list, grey = any.
- Value nodes (Add, Compare, Get Position…) work out their result whenever something reads it.
- An **object input left unconnected means "Self"**, the object running the graph.

### Variables (Graphs tab, left)
- **Graph variables:** each object running the graph gets its own copy (e.g. health).
- **Global variables:** shared by the whole game (e.g. score, lives). UI text can show these with `{name}`.
- Read and write them with **Get Variable** and **Set Variable**.

### Reusing logic
**Custom Event** + **Call Event** let you run a named piece of a graph from anywhere, including on
another object (via *Target*).

---

## 8. Animators: parameter-driven animation

An Animator is a state machine, like Unity's Animator. Its **parameters** decide which sprite
animation plays.

1. **Logic → Animators** tab → **+** to create an animator.
2. Add **parameters** in the left panel: *number*, *bool* or *trigger* (a one-shot signal).
   Parameters named **`speed`**, **`vx`**, **`vy`** and **`grounded`** fill in automatically from physics.
3. **+ (Add state)** creates a state. In the Properties panel, pick the **Animation** it plays and its speed. The orange state is the **default**.
4. **Drag from one state's right dot to another state** to create a transition. Select the arrow to add **conditions** (e.g. `speed > 20`, `grounded false`) and optionally an **exit time** (wait until the animation has played that far; 1 = one full play-through).
5. **Any State** transitions can fire from any state (good for hurt or jump).
6. In the World, give the object an **Animation** component and choose the animator as its **Controller**.

Control it from nodes with Set Anim Number, Set Anim Bool, Fire Anim Trigger and Get Anim State.

**Tweens:** the **Tween** node animates x, y, rotation, scale or opacity smoothly (easing, once,
loop or ping-pong). *Relative* adds to the current value. *Finished* fires when a one-time tween ends.

---

## 9. Data: scriptable objects

Data assets hold settings outside your graphs, like Unity's ScriptableObjects. For example, an
`Enemy` type with *health* and *speed*, then *Goblin* and *Troll* assets with different numbers.

1. **Logic → Data** tab → **+** creates a **data type**.
2. In the main view, add **fields** (number, boolean, text, vector, color, asset, prefab, or a link to other data) and set default values.
3. Under **Assets**, use **+** to create instances and edit their values in the table.
4. In the World, a **Logic Graph** component's **Data** field links an object to one data asset.
5. In graphs, read it with **Get Object Data → Get Data Field** (pick the field). You can also pick a specific asset with **Data Asset**, look one up with **Find Data**, or loop over all of a type with **All Data Of Type → For Each**.
6. **Set Data Field** changes a value while the game runs. Every object using that asset sees the change. The saved project isn't modified.

The starter coins use a *Collectible* type: each coin links to *Gold Coin*, whose **points** value is added to the score.

---

## 10. Play, test and debug

- **Play** workspace (or ▶ in the top bar) runs the game with the same engine used on iPad. Use the floating bar for **play/stop**, **restart**, the **scene** picker and **touch controls** (on-screen buttons, as on iPad).
- **Default controls:** arrows or WASD to move, Space or Z to jump, X or Enter for action. Change the keys in the **Input** tab (left). On iPad, the on-screen buttons map to left/right/up/down/jump/action.
- **Console** (bottom): messages from **Print** nodes, plus errors that name the graph and node that failed.
- **Debug** tab: how many times each node ran in the last session. Click a row to jump to that node. The nodes themselves show a count badge in the graph editor.
- **Settings** (right): game resolution (the area always visible; wider screens show more), start scene, pixel-art mode.
- Press **Restart** after editing to pick up your changes.

---

## 11. Saving, sharing and exporting

| How | Where it goes |
|---|---|
| Automatic / Ctrl+S | This browser's storage **and** the PC's `projects/` folder (shared with the iPad) |
| ☰ → Open / New project | Lists projects on the PC and on this device |
| ☰ → Export project (.json) | A backup file you can keep or send. Load it with **Import project**. |
| ☰ → Export game (.html) | A single-file playable game for any browser or web host |
| `npm run ipad` | Builds an optimized version and serves it on port 4173 for fast Wi-Fi play |

---

## 12. Tutorials

### A. Draw a character and make it playable
1. **Art** → **+** → type *animated*, 64×64. Draw with the Brush (B). Pick colors from the Palette.
2. Timeline → **+ Duplicate frame**, then change the pose. Turn on **Onion skin** to see the previous frame.
3. **+ Animation** → name it `run`, set FPS 10. Add another named `idle` that uses only frame 1.
4. **World** → drag the asset in from **Assets**. In the Inspector, add **Platformer Controller** and **Camera**.
5. Press ▶. You can run and jump.

### B. Automatic idle/run/jump animation
1. **Logic → Animators → +**. Add parameters `speed` (number) and `grounded` (bool).
2. Add states *Idle* (animation `idle`), *Run* (`run`) and *Jump* (any pose).
3. Transitions: Idle→Run `speed > 20`; Run→Idle `speed < 20`; Any State→Jump `grounded false`; Jump→Idle `grounded true`.
4. On the character's **Animation** component, set **Controller** to your animator. Press ▶.

### C. A collectible with a score display
1. Place a coin sprite. On its Collider, tick **Trigger**. Give the player the tag `player`.
2. **Logic → Graphs → + Graph**, then build: **On Collision** → **Branch** (condition: **Has Tag** on *Other* = `player`) → **Set Variable** `score` (value: **Get Variable** `score` + 1) → **Destroy Object**.
3. Add a **Logic Graph** component to the coin with this graph. Duplicate the coin a few times (Ctrl+D).
4. **World → UI** → add **Text** with the text `Score: {score}`, then anchor it top-left.

### D. A pause/restart button
1. **World → UI** → add a **Button**, name it `Restart Button`, and anchor it top-right.
2. In any graph used in the scene: **On UI Click** (Button: `Restart Button`) → **Restart Scene**.

### E. Enemy stats as data
1. **Logic → Data → +** → type `Enemy` with fields `speed` (number) and `damage` (number). Add assets *Slime* (40, 1) and *Bat* (90, 2).
2. Enemy graph: **On Update** → **Move Object** with delta from **Make Vector** (x = **Get Data Field** `speed` from **Get Object Data**).
3. On each enemy's Logic component, set **Data** to *Slime* or *Bat*. Same graph, different behavior.

---

## 13. Node reference

Object inputs left empty mean **Self**. Inputs with a value box use that value when nothing is connected.

**Events**: entry points
| Node | Does |
|---|---|
| On Start | Once, when the object is created |
| On Update | Every frame; *dt* = seconds since the last frame |
| On Collision | When this object starts touching another collider; *Other* = that object |
| On Input | When an input action is pressed or released |
| On Timer | Every N seconds (or once) |
| Custom Event / Call Event | Named entry point / run it (optionally on another object) |
| On UI Click | A UI button with this name was tapped |

**Input**: Get Input (held) · Is Pressed (this frame) · Is Released · Movement Input (direction vector −1..1)

**Math**: Add · Subtract · Multiply · Divide (0 if dividing by 0) · Clamp · Compare (==, !=, <, <=, >, >=) · Random Number (optionally whole numbers) · Make Vector · Break Vector · Vector Add · Vector Scale

**Movement**
| Node | Does |
|---|---|
| Move Object | Move by an offset (per second, or instantly) |
| Set / Get Position | Teleport / read position |
| Set Rotation · Set Scale | Degrees · scale (1,1 = normal) |
| Apply Velocity / Get Velocity | Set or add speed in px/sec (physics handles collisions); choose axes |
| Is Grounded | True when standing on something |

**Objects**: Get Object (Self) · Find Object (by name) · Find Objects With Tag (list) · Has Tag · Is Valid · Set Property / Get Property (x, y, rotation, scaleX, scaleY, visible, opacity, flipX, name) · Destroy Object · Spawn Object (prefab at a position)

**Logic**: Branch (if/else) · AND · OR · NOT · For Each (runs *Body* per item, then *Completed*) · Delay · Sequence (run several chains in order)

**Animation**: Play Animation (restart) · Stop Animation · Set Animation State (only switches if different) · Set Anim Number · Set Anim Bool · Fire Anim Trigger · Get Anim State · Tween

**UI**: On UI Click · Set UI Text · Set UI Visible · Set Bar Value

**Data**: Get Object Data · Data Asset · Get Data Field · Set Data Field · Find Data · All Data Of Type

**Game State**: Set Variable · Get Variable · Change Scene · Restart Scene · Print (to Console)

---

## 14. Keyboard shortcuts

| Everywhere | |
|---|---|
| Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) | Undo / redo |
| Ctrl+S | Save now |
| `` ` `` | Focus or unfocus the main view |
| Space + drag, middle-drag | Pan |
| Wheel / pinch | Zoom |

| Art | |
|---|---|
| B E G I M P R O A H | Brush, eraser, fill, eyedropper, select, pen, rectangle, ellipse, edit paths, pan |
| [ ] | Smaller / bigger brush |
| Enter / Esc | Apply / cancel a transform, finish / cancel a pen path |
| Delete | Clear the selection or delete the selected path |
| Ctrl+A | Select all |

| World | |
|---|---|
| V B E C H | Select, paint, erase, collision box, pan |
| Delete, Ctrl+D, Ctrl+C / V | Delete, duplicate, copy / paste |
| Arrows (+Shift) | Nudge 1 px (10 px) |
| Esc | Deselect |

| Logic | |
|---|---|
| Space, right-click, double-click | Add node |
| Delete | Delete nodes or wires |
| Ctrl+C / V / D | Copy / paste / duplicate nodes |

---

## 15. Troubleshooting

| Problem | Fix |
|---|---|
| iPad can't open the link | Same Wi-Fi on both? Allow **Node.js** through Windows Firewall on *Private* networks (Windows Security → Firewall → Allow an app). Guest Wi-Fi networks often block devices from seeing each other. |
| The PC's address changed | Open the iPad dialog again; it always shows the current address. |
| Edits don't show on the iPad | Reload the page on the iPad. Check the dot next to the project name has cleared (saved). |
| No sound on iPad | iPad audio starts only after a tap; the play page's "Tap to play" handles this. |
| Nothing happens in my graph | Does an object have a **Logic Graph** component using it? Does the chain start from an **Event** node? Check the **Console** and **Debug** tabs. |
| Character falls through the floor | The floor needs a **Collider** (not a trigger), and the character needs a Collider plus a Platformer or Physics Body. |
| Can't paint | Is the layer locked or hidden? Brush tools need a raster layer (one is added for you). Very low Flow or Opacity can make strokes nearly invisible. |
| Something looks broken | Every panel recovers on its own; press **Retry** if a panel shows an error. Undo (Ctrl+Z) reverses any change. |
