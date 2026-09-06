# Vanta Forge

[Open the editor](https://wieslawsoltes.github.io/VantaForge/) · [Play Aether Relay](https://wieslawsoltes.github.io/VantaForge/aether-relay-game.html) · [Portable editor](https://wieslawsoltes.github.io/VantaForge/vanta-forge.html)

**An original, dependency-free browser scene editor and executable game engine.**

Vanta Forge uses an Unreal-inspired workspace: an actor palette, central 3D viewport, hierarchical World Outliner, component Details panel, Content Browser, gameplay graph, and Play controls. The included **Aether Relay** world is playable: move the Rover, jump, push rigid bodies, collect six energy shards, and restore the relay. Pickup behavior is executed by the editable gameplay graph; it is not a prerecorded animation.

This distribution contains all source, native WebGPU and WebGL2 renderers, generated portable builds, a standalone exported game, tests, and technical documentation. No React, Three.js, Babylon.js, game-engine package, CDN, account, or asset download is needed.

## Run

Use Node.js 20 or newer. No `npm install` is necessary.

```sh
git clone https://github.com/wieslawsoltes/VantaForge.git
cd VantaForge
npm start
```

Open `http://localhost:8080` in your browser. The console prints the address. To use a different port:

```sh
# macOS / Linux
PORT=8765 npm start

# PowerShell
$env:PORT=8765; npm start
```

The server binds to loopback by default. Set `HOST=0.0.0.0` deliberately to expose it on a local network. Native WebGPU requires a secure context; use localhost for local development or HTTPS when hosting. A plain HTTP LAN address generally does not satisfy that requirement. The renderer tries WebGPU first and visibly identifies a WebGL2 fallback when necessary. Browser policy, device, driver, and adapter availability also matter.

For the quickest self-contained version, open **`vanta-forge.html`**. It embeds the editor, runtime, shaders, styles, and starter-world generator. Direct file opening and browser previewers may restrict WebGPU or local storage; serving the file is the more reliable route.

**`aether-relay-game.html`** is the actual standalone export of the starter world. It contains the scene, processed assets, runtime, shaders, and HUD, without the editor JavaScript.

Useful query switches: `?webgl=1` forces WebGL2; `?fresh=1` starts with the demo instead of recovering the local autosave. The latter does not delete saved data until a subsequent save overwrites the autosave slot.

## First five minutes

1. Click **Play**. Use **WASD / arrow keys**, **Space** to jump, and **R** to respawn. Collect the six gold shards. **Escape** stops Play and returns to the unchanged authoring scene. Pause and single-step are available in the desktop toolbar.
2. Double-click a Cube in **Place Actors** or drag an asset into the viewport. Select the actor, drag a colored transform handle, and change its fields in **Details**. Try undo and redo.
3. Open **Gameplay Graph**. The default graph contains `On Player Overlap → Add Score → Destroy Actor`, plus `On Fixed Tick → Rotate Actor`. Change the score amount or rotation speed, compile, and play again.
4. Add or select the Landscape, activate its sculpt tool, and drag to raise terrain; hold **Shift** to lower it. Radius and strength are editable. Undo reverses an entire stroke.
5. Use **Export game** to download a new single-file playable HTML containing your edited scene. **File → Download project JSON** preserves the editable project itself.

## Implemented workflows

| Area | Working implementation |
|---|---|
| Scene authoring | Stable entity IDs, component records, parent-child transforms, grouping, outliner search/folding, visibility, locking, duplicate and delete |
| Viewport | Orbit, pan, zoom, focus, camera presets, exact triangle-BVH picking after AABB rejection, translation/rotation/scale handles, snapping, selection bounds, collider overlay |
| Assets | Procedural cube/sphere/cylinder/ring/crystal meshes; OBJ parsing in a Worker; triangulation and missing-normal generation; PNG/JPEG/WebP processing and embedding; asset search and material application |
| Prefabs | Save and instantiate entity-subtree snapshots with remapped IDs and rebased root-position animation keys |
| Materials | Base color and optional image texture; metallic, roughness, emission; linear-light shading and tone mapping |
| Lighting | Directional light with a 2048² shadow map and 3×3 PCF; up to eight unshadowed point lights; sky and distance fog |
| Landscape | Seeded heightfield generation, versioned mesh regeneration, raise/lower brush, undo, runtime heightfield contact |
| Animation | Editable, linear-interpolated local transform keyframes, looping/non-looping clips, scrubbing on an isolated preview scene |
| Physics | Dynamic/static bodies, gravity, box and sphere collision, broadphase spatial hash, restitution, friction, iterative penetration correction, grounded jumping, trigger-enter events |
| Gameplay | Isolated Play world, fixed updates, keyboard/touch controller, typed visual graph, score/message/destroy/impulse/transform/respawn actions, restart and game export |
| Persistence | IndexedDB local autosave, explicit local save, versioned project JSON import/export, embedded custom mesh/texture assets |
| Rendering | Native WebGPU shaders and command encoding; explicit vertex/instance layouts; material/mesh batching; camera and shadow frustum culling; cached GPU resources; WebGL2 fallback |

## Editing controls

| Input | Action |
|---|---|
| Left click | Select geometry; drag a transform handle |
| Right mouse drag / Alt + drag | Orbit camera |
| Middle mouse drag | Pan camera |
| Wheel | Dolly / zoom |
| Right mouse held + WASD | Fly the editor camera; Shift increases speed |
| W / E / R | Translate / rotate / scale tools, outside Play |
| F | Frame the selected actor |
| Ctrl/Cmd + D | Duplicate selected subtree |
| Delete / Backspace | Delete selected unlocked actor |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z / Ctrl + Y | Redo |
| Ctrl/Cmd + S / O | Local save / import dialog |
| Alt + P / Escape | Play / stop |
| Shift + terrain stroke | Lower terrain |

Transform snapping uses 0.5 world units, 15-degree rotation, and 0.1 scale increments. Translation and rotation are world-oriented; scale handles follow the selected local axes. Rotating below nonuniformly scaled parents can introduce shear that a TRS-only representation cannot preserve exactly; use uniformly scaled parents for predictable rigid editing.

Graph nodes move by their title bars. Click an output port, then a compatible input port. Click a wire to remove it. Connecting a replacement input is transactional and rejects incompatible types or cycles. Nodes are interpreted without JavaScript `eval`.

A mouse and keyboard are the primary editing interface. The narrow-screen layout has a Window-menu Details overlay and touch gameplay buttons; it does not implement a complete multi-touch 3D authoring gesture system.

## Build and test

```sh
npm run build       # regenerate the two bundles and portable editor
npm test            # Node built-in test runner; no test dependencies
```

The distributed builds are already generated. After changing `src/`, rebuild before using the portable HTML or exporting from the module-based editor: export uses `runtime.bundle.js`.

The build script is deliberately small and tailored to the current modules, not a general-purpose JavaScript bundler. Keep their top-level import statements on single lines or update the bundler accordingly.

The test report for this delivery records **24 passing core tests** and **31 passing browser workflow checks**. Browser checks executed the **WebGL2 backend in Chromium/SwiftShader**. They include actual pointer-driven translation, graph connections, keyboard movement, runtime isolation, OBJ Worker import, prefab instantiation, export, and independent exported gameplay. The browser harness and captured results are included under `tests/` and `docs/`. The browser suite also exercises actual pointer-driven terrain sculpting and on-screen movement controls.

The optional Python browser suite requires Playwright and its Chromium browser. Run `python tests/browser_smoke.py --software`, or specify `--browser /path/to/chromium`. Use `--url http://localhost:8080/vanta-forge.html?fresh=1` to exercise the editor in a real served origin; the independent exported-document check still uses the self-contained HTML content harness. These are test-only dependencies, not application dependencies.

**Native WebGPU execution and real IndexedDB persistence were not verified in the available browser environment.** That environment blocked normal page navigation, so the browser test used a portable document in an opaque `about:blank` context. WebGPU and IndexedDB were unavailable there. WebGPU is implemented, but its presence in source is not a hardware validation or performance benchmark. See `docs/VALIDATION.md` for exactly what was and was not exercised.

## Architecture and scope

Read **`docs/ARCHITECTURE.md`** for buffer layouts, coordinate conventions, scheduling order, asset and graph semantics, source extension points, and engineering tradeoffs.

This is a compact, working engine/editor foundation, **not feature parity with Unreal Engine**. Important boundaries:

- No Unreal `.uasset`, `.umap`, Blueprint, or project compatibility; no Unreal assets or proprietary source are included.
- Physics uses axis-aligned box proxies and spheres, not a general rigid-body solver with angular inertia, joints, continuous collision detection, or mesh collision. Fast/thin objects can tunnel.
- Animation is local transform-keyframe animation, not skeletal skinning, animation state machines, or FBX/glTF import.
- One project heightfield, one directional shadow map, eight point lights; no global illumination, cascaded shadows, virtualized geometry, ray tracing, or image-based environment lighting.
- Prefabs are reusable snapshots, not linked override-aware assets. Undo uses up to 60 full before/after snapshots, suitable for compact scenes rather than enormous projects.
- Gameplay graphs are typed and acyclic, with a bounded execution budget; they are not a general Blueprint-compatible language. Simulation ordering is deterministic for the same initial state and tick-stamped inputs within the same JavaScript environment, not a promise of cross-platform bit-identical lockstep.
- GPU instancing reduces draw submissions, but this version still rebuilds visible instance lists on the CPU each frame. It has no GPU-driven indirect culling, geometry LOD, streaming system, or measured hardware-performance guarantee.
- Local persistence has one autosave slot per origin; it is not a cloud service, project catalog, multi-user database, or backup. Download JSON checkpoints for durable copies.
- Project validation catches structural, numerical, reference, and graph errors. It is not a hardened hostile-content service. Large accepted projects can still consume substantial CPU, GPU, and snapshot memory.

## Source map

```text
src/math.js          vectors, matrices, frusta, rays, bounds
src/scene.js         entity database, validation, history, IndexedDB
src/assets.js        procedural meshes, heightfield, triangle BVH, OBJ Worker
src/graph.js         typed node definitions, compiler validation, interpreter
src/physics.js       broadphase, contacts, body integration, triggers
src/renderer.js      WebGPU/WGSL and WebGL2/GLSL backends, render extraction
src/runtime.js       input, fixed-step game world, controller, animation, export host
src/demo.js          Aether Relay starter world and original procedural assets
src/editor-ui.js     inspector, graph editor, DOM helpers and original icons
src/editor.js        authoring interactions, transactions, Play, import/export
styles.css           responsive editor and standalone-game styling
index.html           module-based editor shell
```

## References and licensing

The original UI organization is inspired by Epic's documented editor workflows, not an attempt to distribute Epic branding or proprietary implementations.

- WebGPU: https://www.w3.org/TR/webgpu/
- WGSL: https://www.w3.org/TR/WGSL/
- Secure contexts: https://www.w3.org/TR/secure-contexts/
- Unreal Editor interface: https://dev.epicgames.com/documentation/unreal-engine/unreal-editor-interface

Code, procedural starter content, and original icons in this distribution are available under the included MIT license. Unreal Engine is a trademark of Epic Games; this project is independent and unaffiliated.


## GitHub Pages deployment

The `.github/workflows/pages.yml` workflow runs the core tests and rebuilds the dependency-free editor/runtime on every push to `main`. It stages only the web application and exports under `_site/`, uploads a Pages artifact, and deploys to the `github-pages` environment. Pull requests run the same build without publishing.

All application URLs are relative so both the module-based editor and the portable editor work at the `/VantaForge/` project path. The generated `version.json` records the deployed source commit.

To reproduce the deployed directory locally:

```sh
npm test
npm run build
node tools/site.mjs
```

Pages must use **GitHub Actions** as its publishing source. Deployment needs only the repository's built-in `GITHUB_TOKEN`, with `pages: write` and `id-token: write` limited to the deployment job; no personal access token or third-party hosting account is used.
