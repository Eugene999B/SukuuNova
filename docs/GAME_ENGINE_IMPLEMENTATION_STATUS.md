# Sukuunova Game Engine — Implementation Status

## Purpose

This branch turns the game redesign from a content-variation system into a reusable gameplay foundation. The implementation deliberately remains independent of a heavy third-party renderer/physics dependency until movement feel, game variety, mobile performance and migration boundaries are proven.

## Development-only playable routes

These routes intentionally return `404` outside development builds.

### `/labs/game-feel`

Movement tuning laboratory with two modes:

- Responsive platformer
- Nova Run movement

It demonstrates:

- fixed 60 Hz gameplay simulation independent from render cadence
- acceleration/deceleration
- coyote time
- jump buffering
- variable jump height
- air control
- immediate logical lane switching with visual interpolation
- keyboard and touch controls
- live simulation-step and dropped-time telemetry

### `/labs/nova-run`

Playable runner vertical slice using the actual modular course runtime.

It currently includes:

- deterministic seeded course generation
- three-lane movement
- jump and slide
- modular chunk templates
- mirrored chunk variants
- safe-route validation
- no immediate chunk-template repetition
- difficulty-banded chunk selection
- obstacle rows rendered from the generated course
- pickups
- combo scoring
- recoverable collisions
- Guided, Balanced and Challenge presets
- world-speed and hazard changes without retuning lane timing or jump controls
- keyboard and touch controls
- fixed 60 Hz simulation

The current prototype is deliberately finite rather than pretending to be a production endless-run streaming system. Endless paging, content streaming, pooling and persistence belong after the vertical slice passes feel/performance validation.

### `/labs/failure-point`

Playable engineering simulation using a real linear 2D truss solver.

It currently includes:

- editable applied load
- editable member cross-sectional area
- pin/roller-style support constraints
- direct stiffness method
- small-displacement linear elastic solution
- node displacement
- member strain
- stress
- axial force
- tension/compression classification
- yield utilization
- member failure state
- reaction forces
- amplified deformation visualization

The simulation is explicitly an educational/game model, not professional engineering software. It should never be presented as construction-design certification.

## Core runtime modules

### `types.ts`

Shared engine vocabulary: game categories, input intent, movement/camera profiles, Game DNA, gameplay telemetry and runtime director actions.

### `movement-profiles.ts`

Distinct control identities for:

- responsive platformer
- arcade runner
- open-world exploration
- investigation walk
- strategy cursor
- physics builder

Movement fundamentals are marked as locked during an active run so adaptive difficulty cannot secretly rewrite player muscle memory.

### `fixed-step.ts`

Accumulator-based fixed simulation clock with:

- default 60 Hz timestep
- frame-duration clamp
- maximum substep guard
- dropped-time accounting
- interpolation alpha

This prevents frame-rate-dependent physics and limits catch-up spirals after browser pauses.

### `collision.ts`

Basic AABB collision helpers with optional player-hitbox inset. Visual geometry and collision geometry are intentionally allowed to differ slightly when that improves fairness.

### `input-adapter.ts`

Engine-neutral input normalization for:

- keyboard
- analog input/gamepad-like axes
- radial deadzone
- multi-device intent merging

Gameplay should consume input intent rather than raw DOM/device events.

### `platformer-simulation.ts`

Pure platformer control simulation:

- acceleration/deceleration
- sprint profile support
- coyote time
- jump buffer
- held/released jump shaping
- stronger falling gravity
- air control

Collision resolution remains the responsibility of the eventual world/renderer adapter.

### `runner-simulation.ts`

Pure runner locomotion:

- logical lane state
- independently interpolated rendered lane
- rapid re-targeting before animation completion
- auto-forward distance
- jump buffering
- slide state
- adaptive world pace separated from lane timing

### `runner-chunks.ts`

Deterministic procedural course layer:

- seeded generator
- difficulty-tagged modular chunks
- mirrored variants
- route reachability checks
- impossible all-lane obstacle rejection
- no direct consecutive template repetition

### `nova-run-session.ts`

Actual runner gameplay loop layered on movement/chunks:

- row evaluation
- blocked-lane collision
- jump/slide action gates
- pickups
- score
- combo/best combo
- recoverable hits
- continuous movement after failure

### `open-world-simulation.ts`

Renderer-independent foundations for Field Expedition:

- camera-relative movement
- walk/sprint acceleration
- smooth stopping
- turn-to-movement facing
- contextual interaction targeting using distance + facing cone + target priority
- orbit-camera yaw/pitch/zoom bounds

### `structural-simulation.ts`

2D pin-jointed truss simulation for Failure Point using the direct stiffness method.

### `difficulty-envelope.ts`

Bridge from the existing adaptive learning plan to world-level game challenge. It can adjust:

- world pace at mission start
- hazard density
- hints
- resource generosity
- route complexity
- objective timing
- boss gates

It does not mutate movement controls.

### `performance-monitor.ts`

Rolling frame pacing measurement with:

- average frame time/FPS
- p95 frame time
- worst frame
- stutter ratio
- low/balanced/high quality recommendation

Quality decisions intentionally consider frame-time spikes, not only average FPS.

### `game-dna.ts`

Anti-reskin similarity scoring. Subject labels are not enough to make identical interactions a new game.

### `director.ts`

Runtime pacing/learning director that can:

- maintain current challenge
- add support
- raise challenge
- rotate repeated mechanics
- trigger contextual remediation

It cannot change core movement feel during the active run.

## Automated test coverage added

The branch contains dedicated tests for:

- Game DNA similarity and variety gate
- runtime director behavior
- fixed timestep equivalence across render cadence
- long-frame catch-up protection
- coyote time
- jump buffering
- variable jump height
- rapid runner lane re-targeting
- adaptive pace without lane-timing changes
- forgiving collision
- deterministic runner generation
- runner route validity
- no immediate chunk repetition
- mirrored chunks
- low-density difficulty ceilings
- Nova Run score/combo/pickups
- recoverable runner collisions
- jump and slide action gates
- camera-relative open-world traversal
- sprint and deceleration
- contextual interaction selection
- orbit-camera bounds
- analog deadzone
- keyboard/analog input merging
- adaptive gameplay envelope isolation from movement profiles
- frame-pacing quality recommendations
- analytical truss displacement/stress
- yield failure
- singular/unstable structural models
- invalid structural references

## Intentional limitations

### No heavy renderer dependency yet

The repository currently has no dedicated game renderer/physics package. Phaser/Three.js/Rapier/Matter or another stack should be selected from measured prototype requirements rather than installed speculatively.

### No production student route yet

The prototypes are development-only. They should not be exposed through the student portal until:

1. CI is clean.
2. controls are play-tested on representative keyboard/touch devices.
3. performance budgets are measured on low/mid/high target hardware.
4. accessibility controls are added.
5. persistence/telemetry privacy boundaries are finalized.
6. subject integration demonstrates learning through action instead of popup quizzes.

### No claim of professional structural analysis

Failure Point uses a valid linear truss method but intentionally limits scope. Large deformation, buckling, connection behavior, fatigue, dynamic loading and code compliance are outside the current learning simulation.

## Next highest-value work

1. Make Nova Run course paging effectively endless while preserving deterministic replay.
2. Add object pooling/content streaming at the rendering adapter layer.
3. Add one genuine academic route mechanic to Nova Run without stopping movement.
4. Build a compact Field Expedition developer traversal scene around the open-world simulation contracts.
5. Add editing interactions to Failure Point so learners place/move members rather than only adjust load/material sliders.
6. Add controller/gamepad browser adapter and accessibility remapping UI.
7. Connect frame-pacing monitor to automatic visual-quality budgets after representative-device testing.
8. Persist structured game telemetry for the adaptive director without collecting unnecessary raw input traces.
9. Establish release performance gates for game modules.
10. Migrate legacy quiz-style missions selectively instead of mass-reskinning them.
