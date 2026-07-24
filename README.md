# n-sides-GOL: Multi-Tiling Game of Life

A high-performance, multi-geometry cellular automata simulator built with HTML5 Canvas, Web Workers, and `SharedArrayBuffer`. 

Unlike standard Game of Life implementations restricted to 2D square grids, **n-sides-GOL** allows cellular automata to evolve across diverse regular tessellations (Square, Hexagonal, Triangular, Diamond) as well as non-periodic, **aperiodic "Hat" monotile (Einstein Tile)** universes.

## Play Live
https://star-fs.github.io/n-sides-GOL/

---

## ✨ Key Features & Differentiation

What sets **n-sides-GOL** apart from standard Conway's Game of Life implementations:

### 1. 🧩 Aperiodic "Hat" Monotile (Einstein Tile) Universe
* **True Mathematical Substitution Engine**: Implements the exact recursive substitution hierarchy ($H, T, P, F$ metatiles) published by Smith, Myers, Kaplan & Goodman-Strauss (*"An aperiodic monotile"*, 2023).
* **Non-Periodic Topology**: Cells live on 13-vertex polykite "hat" monotiles that tile the plane deterministically without any translational periodicity.
* **Vertex-Sharing Adjacency Graph**: Automatically constructs exact topological neighbor maps for non-uniform, non-grid aligned monotile geometry in $O(N)$ setup time.

> [!NOTE]
> **Implementation Note**: The original attempt to implement the Aperiodic "Hat" Monotile was performed by Gemini 3.4, but after many, many prompt iterations it was unable to make a correct implementation. Claude Sonnet 5 Medium was able to determine that an $H, T, P, F$ metatiles representation was needed and implemented it successfully in 1 prompt.


### 2. 🔷 Multi-Tiling Geometry Support
Switch between 5 distinct planar tilings seamlessly:
* **Square (8-neighbor Moore)**: Classic Conway neighborhood.
* **Hexagonal (6-neighbor)**: Smooth 6-way isotropic propagation.
* **Triangular (3-neighbor)**: Tight 3-neighbor face-sharing connectivity.
* **Diamond (4-neighbor von Neumann)**: 4-way orthogonal grid.
* **Hat (Aperiodic)**: Non-periodic 13-vertex polykite tiling.

### 3. ⚡ Multi-Core Parallelized Engine
* **Web Worker Pipeline**: Offloads generation computations across available CPU threads (`navigator.hardwareConcurrency`).
* **Lock-Free Memory Sharing**: Uses `SharedArrayBuffer` (with fallback to `ArrayBuffer`) and pre-allocated TypedArrays (`Uint8Array`, `Int32Array`) for zero-garbage-collection tick updates.
* **Flat Neighbor Stride Buffers**: Pre-computed 1D neighbor buffers eliminate real-time coordinate transformations during generation steps.

### 4. 🎯 High-Performance Canvas Viewport
* **Frustum Culling**: Viewport caching (`visibleIndices`) only renders cells currently within the screen boundaries.
* **Point-in-Polygon Interaction**: Draw and erase cells directly on non-rectangular polygons (including aperiodic hats) via ray-casting point-in-polygon collision detection.
* **Smooth Navigation**: Pan and zoom across infinite space with smooth scale handling.

### 5. ⚙️ Customizable Rule Engine (B/S Notation)
* Fully customizable **Birth ($B$)** and **Survival ($S$)** rules per tiling type (e.g. `B3/S23` for standard Conway, `B2/S23` for Diamond grids, etc.).

---

## 🎮 Instructions for Use

### Quick Start

No build step, node modules, or external frameworks are required.

1. **Clone or Download** the repository:
   ```bash
   git clone https://github.com/star-fs/n-sides-GOL.git
   cd game-of-life
   ```

2. **Serve the project**:
   Open `index.html` directly in any web browser, or run a local HTTP server (recommended for `SharedArrayBuffer` support):
   ```bash
   # Python 3
   python3 -m http.server 8000

   # or Node / npx
   npx serve .
   ```

3. Open `http://localhost:8000` in your browser.

---

### Controls & Mouse Interaction

| Action | Control |
| :--- | :--- |
| **Draw / Toggle Cells** | Left Click & Drag |
| **Pan Viewport** | Right Click & Drag **OR** Shift + Left Click & Drag |
| **Zoom Viewport** | Mouse Scroll Wheel **OR** `+` / `-` On-screen Controls |
| **Reset Viewport** | Click `1:1` Zoom Button |

---

### Sidebar Controls

* **Simulation Controls**: `Play`, `Pause`, `Step` generation by generation, `Clear` board, `Reset` board, `Random` spawn.
* **Presets**: Load famous standard patterns (Gliders, Medium Spaceships, Pulsars, Blinkers, Penta-decathlons, Gosper Glider Guns, Infinite Growth).
* **Grid Config**:
  * **Tiling**: Select between `Square`, `Hexagonal`, `Triangle`, `Diamond`, and `Hat (Aperiodic)`.
  * **Width / Height**: Adjust grid resolution (5 to 200 units).
* **Rules (B/S)**: Specify custom birth and survival neighbor counts (e.g., Birth: `3`, Survival: `23`).
* **Speed & View**: Control tick interval (10ms to 1000ms) and initial random density (0.0 to 1.0).

---

## 🏗️ Architecture & Codebase

The project is structured with pure JavaScript modules and native web APIs:

* [index.html](file:///home/dad/gol_play/game-of-life/index.html): Responsive UI layout containing side controls, statistical counters, presets, and main `<canvas>` viewport.
* [style.css](file:///home/dad/gol_play/game-of-life/style.css): Modern CSS design system featuring custom scrollbars, dark mode aesthetic (`#0f172a`), and fluid control sidebars.
* [app.js](file:///home/dad/gol_play/game-of-life/app.js): Core application logic:
  * `buildHatTiling()` / `HatGeom`: Aperiodic monotile geometry generator & substitution system ([lines 73-255](file:///home/dad/gol_play/game-of-life/app.js#L73-L255)).
  * `setupGridData()` / `setupHatGrid()`: Pre-calculates topology, cell bounds, and neighbor indices ([lines 339-447](file:///home/dad/gol_play/game-of-life/app.js#L339-L447)).
  * `triggerStep()` & `handleWorkerMessage()`: Multi-core Web Worker generation coordinator ([lines 309-323](file:///home/dad/gol_play/game-of-life/app.js#L309-L323), [471-483](file:///home/dad/gol_play/game-of-life/app.js#L471-L483)).
  * `draw()` & `updateVisibilityCache()`: Frustum-culled Canvas renderer ([lines 455-501](file:///home/dad/gol_play/game-of-life/app.js#L455-L501)).
* [worker.js](file:///home/dad/gol_play/game-of-life/worker.js): Background Web Worker script handling parallel cell state transitions.

---

## 📜 Credits & License

* Created by **Star Morin** (Copyleft 2026).
* **Hat Monotile Geometry**: Based on the reference substitution algorithm by David Smith, Joseph Samuel Myers, Craig S. Kaplan, and Chaim Goodman-Strauss (*"An aperiodic monotile"*, 2023, [hatviz](https://github.com/isohedral/hatviz)).
* **Implementation History**: The original attempt to implement the Aperiodic "Hat" Monotile was performed by Gemini 3.4, but after many, many prompt iterations it was unable to make a correct implementation. Claude Sonnet 5 Medium determined that an $H, T, P, F$ metatiles representation was needed and implemented it in 1 prompt.

