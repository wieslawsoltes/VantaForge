# Validation report

Delivery date: 2026-09-06.

## Summary

| Suite | Result | What executed |
|---|---:|---|
| Core | **24 / 24 passed** | Node.js 22.16.0, built-in test runner |
| Browser workflows | **31 / 31 passed** | Chromium 144, WebGL2 through SwiftShader, portable HTML |
| Independent game export | **Passed** | Exported HTML booted without editor JS and executed all six collectible behaviors |
| Final visual smoke check | **Passed** | Portable editor rendered the actual scene, without uncaught JavaScript or console errors |
| Native WebGPU device execution | **Not verified** | Not exposed in the available browser test origin |
| IndexedDB read/write/recovery | **Not verified** | Denied in the opaque test origin |
| Hardware-GPU performance / mobile Safari | **Not benchmarked / not tested** | No claims inferred from the software-rendered run |

The rendering/UI tests used the real graphics backend, scene geometry, physics implementation, input handlers, graph interpreter, Worker import pipeline, and exported runtime. They did not replace these with stubs or prerecorded outputs. Headless software-rendering frame rate is not a hardware-performance measurement.

## Core coverage

The tests cover TRS inversion, WebGPU depth mapping, frustum rejection, ray bounds, exact BVH triangle hits, stable serialization, hierarchy cloning, malformed scene rejection, undo/redo branching, OBJ index handling and normals, seeded heightfield generation and edits, typed graph/cycle validation, event/action execution, typed data/branch execution, sphere contacts, spatial-pair deduplication, runtime isolation, repeatable fixed-step state, gravity settling, trigger-once behavior, all-six collectible completion, animation evaluation, exact single-step count, and bounded accumulator catch-up.

Additional regression cases verify the vertical look-at basis, rebased absolute-position animation keys for prefab placement, and rejection of moved terrain, missing graph references, and invalid animation keys.

The exact names and TAP output are in `core-test-output.txt`. Run:

```sh
npm test
```

## Browser coverage

`browser-test-results.json` records each of the 31 passed checks. The workflow exercised:

- Initial real WebGL2 rendering; actor creation; Details transform edits; undo/redo; real pointer-driven translation.
- Node creation, parameter editing, wire disconnection, port-to-port reconnection, and graph compilation.
- Play-world isolation; real keyboard-controlled player movement; paused single-step; all-six trigger scoring/destruction; HUD updates; unchanged authoring data after Stop.
- Prefab creation/instantiation; actual OBJ Worker import; heightfield edits/undo; real pointer-driven terrain brush changes and atomic stroke undo.
- Self-contained HTML export; independent runtime startup with no editor object; matching gameplay logic in that exported document.
- Narrow coarse-pointer viewport controls and pointer-button-driven player movement.
- No uncaught JavaScript exceptions over the workflow.

The six-pickup completion checks deliberately teleport the runtime player to each collectible and execute a real physics tick. That isolates overlap, graph, destruction, and scoring behavior. A separate keyboard test verifies genuine movement. The suite does not claim an uninterrupted human-style navigation run through all six shards.

Likewise, the coarse-pointer check emulates a narrow mobile layout and drives its on-screen button through browser pointer input. It does not validate a physical iPhone, Safari, or mobile GPU driver.

## Environment boundary

This container's managed Chromium policy blocks ordinary page navigation, including local development URLs. The test therefore loaded the generated portable HTML with Playwright `set_content` into `about:blank`. That origin is opaque and not a valid secure-origin environment for the APIs in question.

The application correctly surfaced WebGPU unavailability and IndexedDB denial, then rendered using WebGL2. Those expected warnings are not evidence that native WebGPU or IndexedDB works on a normal deployment. Both paths are present in the source, but they need verification under localhost/HTTPS on supported hardware and browsers before a production release.

The supplied browser harness can use a normal URL with `--url` on an unrestricted machine. The native backend must visibly report **WebGPU**, and its output log must remain free of shader/pipeline/device errors. For storage validation, save an edited project, reload the same origin, verify restoration, then test recovery failure and JSON fallback deliberately.

## Release-level work not claimed

This is not a browser/device compatibility matrix, a long-running stress test, a fuzzing campaign, a full physics conformance suite, or a performance certification. In particular, not covered here are native WGSL compilation/device submission, actual IndexedDB round trips, WebGL context-loss recovery, native GPU device-loss recovery beyond diagnostic reporting, sustained large imports, thousands of animated actors, memory budgets under many texture/history revisions, skeletal animation, arbitrary mesh collision, or Unreal project compatibility.

Rendered screenshots in `test-artifacts/` show the actual application under the tested fallback backend. No GPU model, feature badge, scene result, or gameplay score was substituted to imply a native WebGPU test.
