# Vanta Forge — engine architecture

## 1. Data ownership and scene format

An editable project is a version-1 JSON object containing a name, environment settings, an entity array, and asset dictionaries. Identity comes from stable string IDs, not array positions or drawing order. IDs are preserved by serialization and remapped when duplicating or instantiating an entity subtree. The current generator combines a time prefix and a process-local sequence; it is not a distributed identifier scheme.

A representative entity:

```js
{
  id: "entity_17",
  name: "Physics crate",
  parent: null,
  visible: true,
  locked: false,
  transform: {
    position: [0, 2, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  },
  components: {
    mesh: { asset: "cube", material: "stone", castShadow: true },
    body: {
      type: "dynamic", shape: "box", mass: 2,
      friction: 0.6, restitution: 0.1,
      velocity: [0, 0, 0]
    }
  }
}
```

`Scene` owns a copy of project data, an ID-to-entity index, and a lazily populated world-matrix cache. World matrices compose the parent world transform with local TRS. Mutations invalidate that cache. This is a component-oriented scene database with ordered systems, not an archetype/chunk ECS.

Coordinates are right-handed with +Y up. Distances are treated as meters in the demo, time is seconds, and body mass as kilograms. Inspector rotation values are degrees. Matrices are column-major; local Euler composition is Rz × Ry × Rx. WebGPU projection uses depth 0…1. The WebGL vertex shader remaps clip-space depth to −1…1.

`validateScene` rejects malformed IDs, cycles, unresolved mesh/material/graph references, invalid vectors/scales, unsupported body types, invalid terrain layouts, bad animation tracks, and ill-typed or cyclic graphs. Editor command mutations validate before creating a history entry. Import, Play, and export validate their input. Live pointer transforms and terrain strokes commit at release; not every intermediate pointer sample runs a full schema pass.

Dynamic bodies must be root entities. The landscape is a unique, static, identity-transform heightfield. A translated or rotated terrain would require corresponding collision-space conversion, which is intentionally not silently approximated.

## 2. Authoring transactions and persistence

An editor command captures a `before` snapshot, applies a mutation, validates it, rebuilds indexes, and records an `after` snapshot. A failing mutation restores the original state and reports the reason. A drag or sculpt stroke records one transaction instead of hundreds of pointer samples. Undo/redo retain at most 60 commands; a new edit after undo discards the redo branch.

The simplicity of snapshots has an explicit memory cost: imported arrays and embedded textures are part of those snapshots. There is no copy-on-write asset store or compressed command journal. For larger projects, asset blobs should move behind immutable content hashes and history should retain component patches instead.

IndexedDB stores the whole editable project under a single `autosave` key in database `vanta-forge`, object store `projects`. Writes are debounced by 1.2 seconds after edits. Explicit save and download-project actions are separate. Import/export embeds custom geometry arrays and image data, so exported projects do not depend on inaccessible relative asset URLs.

A prefab contains copied entity records for one subtree. Instantiation remaps IDs/parents and offsets the root. Absolute local position-animation keys are shifted with the root to preserve the motion path after placement. Child-local transforms are unchanged. A prefab is a snapshot: later source-asset edits do not automatically propagate to its existing instances.

## 3. Editor/runtime boundary

`GameRuntime` does not depend on the editor DOM or editor classes. It receives validated scene data and owns a separate `Scene`, `Assets`, physics world, input state, graph programs, fixed clock, and deferred-destruction queue. Animation preview similarly owns a separate scene.

Play constructs this runtime from authoring data. The viewport then renders the runtime scene and its camera. Editor mutation methods reject edits during Play. Stop discards the runtime rather than trying to reverse physics and gameplay changes. Consequently destruction, score, velocities, contact state, animation playback, and player motion cannot leak back into authoring data.

The standalone bundle includes engine modules and a small DOM host, not `editor.js`, `editor-ui.js`, or `demo.js`. Game export serializes the already constructed scene and embeds custom assets, styles, the runtime bundle, and bootstrap code in one HTML document. Serialized JSON escapes `<` before placement in a script data element. Export does not require a service, Node runtime, or server-side compiler after delivery.

## 4. Fixed-step gameplay ordering

The simulation step is **1/120 second**. An accumulator consumes elapsed render time, performs at most 12 simulation ticks per update, and accounts for discarded catch-up time rather than running an unbounded spiral. The render host also clamps frame elapsed time. Time is derived from integer tick count, not repeated floating-point time accumulation.

Each tick runs in this order:

```text
controller velocity / jump intent
    ↓
On Fixed Tick graphs, entities ordered by stable ID
    ↓
transform-keyframe animation, entities ordered by stable ID
    ↓
world-transform invalidation
    ↓
gravity / position integration / contact resolution / trigger detection
    ↓
new player-overlap graph events
    ↓
deferred entity destruction
    ↓
consume input-edge state → increment tick and simulation time
```

`Start` events run during runtime construction. Destruction is deferred until event iteration completes. Graph failures disable the affected entity's behavior and report a diagnostic rather than repeatedly throwing every frame. Paused single-step executes exactly one full tick.

The order is deliberately explicit: an animated property can overwrite a graph's earlier transform write in the same tick. Avoid driving the same property from multiple systems unless this priority is intended. Animating a dynamic body's position conflicts with physically integrated position and should be treated as an authored kinematic-style effect, not a general dynamic constraint.

Repeatability assumes identical initial state and inputs presented on identical ticks in the same JavaScript environment. Browser input arrives asynchronously and is sampled by ticks; there is no recorded-input editor, networking layer, rollback netcode, or guarantee of bit-identical floating-point/contact ordering across engines/locales.

## 5. Physics and spatial queries

`SpatialHash` bins body AABBs into 4-unit cells and deduplicates candidate pairs. Very large proxies use a global list to avoid exploding grid insertion costs. Candidate pairs are sorted by stable IDs before narrowphase. Contact routines implement sphere/sphere, sphere/AABB, and AABB/AABB tests.

The solver uses semi-implicit velocity integration, gravity, optional damping, restitution and friction impulses, and four contact-correction iterations. It tracks grounded bodies and trigger pairs; only newly entered player-trigger contacts dispatch overlap events. Terrain contact samples the exact triangular heightfield interpolation at a body's horizontal center and resolves the body bottom against that height.

Box proxies remain world-axis-aligned, including for visually rotated meshes. There is no angular impulse response, shape inertia, capsule controller, joint solver, sweep/CCD, arbitrary triangle-mesh collision, or sleeping/island management. Terrain contact at one horizontal location is not a full shape-heightfield manifold. These choices are adequate for the starter level and simple games but must not be mistaken for a complete general-purpose physics engine.

Editor selection is more precise than body collision. Each mesh lazily builds a median-split triangle BVH, with small triangle leaves. The editor first rejects ray/world-AABB misses, transforms the ray into mesh-local space without renormalizing its direction, and intersects actual triangles. Keeping that parameterization makes hit distances comparable between differently scaled instances.

## 6. Gameplay graph

Graphs store node records, positions, typed parameters, and edges. Ports are `exec`, `number`, or `boolean`. Supported event nodes are Start, Fixed Tick, and Player Overlap. Numeric/boolean data nodes include constants, key state, time, sine, multiplication, comparison, and a branch. Action nodes cover rotation, translation, impulse, score, destroy, message, and respawn.

Validation checks node types/IDs, referenced ports, port compatibility, a single incoming edge per input, and cycles. Both executable and data dependencies are acyclic. Compilation builds maps for node and edge lookup. Execution follows explicit event outputs, memoizes data reads within an invocation, and enforces a 256-step evaluation/action budget. There is no arbitrary source-code compilation or `eval`.

The default shard graph:

```text
Player Overlap ──exec──▶ Add Score(amount=1) ──exec──▶ Destroy Actor
Fixed Tick     ──exec──▶ Rotate Actor(axis=y, speed=70)
```

Shards also have a trigger collider and a position-keyframe animation. Thus overlap, scoring, destruction, bobbing, and rotation are genuine separate systems acting on scene data.

## 7. Assets and mesh processing

Built-in shapes are generated as indexed position/normal/UV triangle meshes. An interleaved vertex occupies 32 bytes: position float3 at 0, normal float3 at 12, UV float2 at 24. Index buffers are Uint32.

OBJ import uses a Blob-backed Worker. The parser accepts positive/negative position, UV, and normal indices, expands indexed attribute combinations, triangulates polygons by a fan, and reconstructs missing smooth normals. The import interface does not process MTL files, binary formats, skeletons, glTF, FBX, or tangent-space normal maps. Fan triangulation assumes suitable polygons; concave/self-intersecting faces should be triangulated before import. Input files are limited to 50 MB.

Images are decoded, reduced to at most 2048 pixels on the longest dimension, and embedded as PNG material textures. Heightfields carry a version that invalidates their generated mesh after a brush edit. The renderer reuses GPU mesh resources while the same mesh object remains active; unused mesh and instance buffers are retired periodically. Texture caches remain keyed by source data for the backend lifetime and are not a streaming texture pool.

## 8. Render extraction and GPU layout

Render extraction walks visible mesh entities, respects hidden ancestors, resolves world matrices, computes transformed bounds, and tests camera and shadow frusta separately. It groups surviving instances by mesh/material. Shadow casters can be absent from the main view and still enter the shadow pass.

The per-frame uniform buffer is **448 bytes**:

| Offset | Data |
|---|---|
| 0 | View-projection mat4, 64 bytes |
| 64 | Directional-light view-projection mat4, 64 bytes |
| 128 | Eye float4 |
| 144 | Sun direction float4 |
| 160 | Sun color RGB + intensity |
| 176 | Ambient, fog, exposure, point count |
| 192 | Eight point lights, two float4 records each |

The per-instance record is **144 bytes**: model mat4, padded inverse-transpose normal mat3, base-color float4, and roughness/metallic/emission/flags float4. Flat interpolation keeps per-instance flags from changing across rasterization. The grid derivative is calculated in uniform control flow before the optional grid branch in WGSL.

Native WebGPU records a shadow render pass followed by the main pass. It uses a 2048² depth32float shadow map, comparison sampling with a 3×3 PCF kernel, 4× MSAA color/depth targets, indexed instanced draws, explicit bind-group layouts, and cached buffer/texture objects. A procedural fullscreen sky precedes opaque meshes. Shader compilation diagnostics are reported via `getCompilationInfo`; uncaptured device errors and device loss are surfaced in the output log.

The material model uses GGX distribution, Schlick Fresnel and geometry approximations, metalness/roughness parameterization, a simple ambient term, directional and point lighting, fog, and an ACES-like display mapping. It does not contain environment-map IBL, baked lighting, GI, screen-space effects, transparency sorting, or normal mapping. Point lights do not cast shadows. The directional shadow covers a fixed orthographic region around the camera target, not cascades.

The WebGL2 backend mirrors the same scene extraction, buffers, material semantics, instancing, and PCF shadow algorithm with GLSL. Canvas antialiasing is requested, but actual fallback sample count is implementation-dependent. Device pixel ratio is capped at 2.

CPU-side extraction still allocates transient instance records and uploads the visible list each frame. Static transforms have cached matrices, but this is not a fully incremental render database. GPU-driven culling, indirect draws, LOD, workers for world extraction, immutable asset caching, and patch-based history are concrete next architectural steps for substantially larger scenes; they are not claimed features here.

## 9. Extension points

Add a component by defining its serialized shape and validation in `scene.js`, authoring fields in `InspectorUI`, and its system behavior in `GameRuntime`. Keep runtime systems independent of editor controls.

Add a graph node in `NODE_TYPES`, then implement its data/action semantics in `GraphProgram`. Port and parameter descriptions drive the graph UI. Add a validation and execution test for each new node.

Add a mesh through `Assets.mesh`, or import and register an interleaved custom mesh. Both graphics backends share that vertex contract. Changes to shaders, instance stride, or frame fields must update both API implementations and corresponding buffer-packing code.

The starter scene is pure source in `createDemo()`. Changing it and rebuilding produces a new portable editor. Standalone export packages the current authored data rather than rerunning the demo generator.
