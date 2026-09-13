# Sukuunova Game Engine — Implementation Status

## Purpose

This branch turns the game redesign from a content-variation system into a reusable gameplay foundation. The implementation deliberately remains independent of a heavy third-party renderer/physics dependency until movement feel, game variety, mobile performance and migration boundaries are proven.

The guiding rule is simple: changing a school subject, background image or story wrapper is **not** enough to count as a new game. Different games need meaningfully different player actions, pacing, failure, progression and decision structures.

## Development-only Games Lab

`/labs/games` is the development hub for the playable slices below. Every route intentionally returns `404` outside development builds.

### `/labs/game-feel` — Movement Lab

- fixed 60 Hz gameplay simulation independent from render cadence
- platformer acceleration/deceleration
- coyote time and jump buffering
- variable jump height and air control
- runner lane switching with logical state separated from visual interpolation
- keyboard/touch controls
- live dropped-simulation telemetry

### `/labs/nova-run` — reflex runner

- deterministic seeded modular course generation
- three-lane movement, jump and slide
- mirrored chunk variants and difficulty bands
- safe-route validation and no immediate template repetition
- pickups, score and combo
- recoverable collisions that do not end the run
- Guided/Balanced/Challenge presets
- world difficulty separated from control timing

The current prototype is finite. Endless paging, object pooling and streaming should come after play/performance validation.

### `/labs/field-expedition` — open-world fieldwork

- free camera-relative traversal
- sprint/deceleration and orbit-camera controls
- contextual interaction targeting using distance/facing/priority
- river, soil, erosion and community field sites
- notebook, sample-kit, camera and meter tools
- contextual learning actions instead of popup multiple-choice interruptions
- score/streak/discovery feedback

### `/labs/failure-point` — engineering construction simulation

- editable load and member cross-sectional area
- pin/roller support constraints
- direct stiffness method for a linear 2D truss
- displacement, strain, stress and axial force
- tension/compression classification
- yield utilization/failure and reaction forces
- amplified deformation visualization

This is an educational linear-truss model, not professional structural-design software.

### `/labs/the-archive` — branching historical investigation

- fictional case so invented story details are never presented as real Ghanaian history
- nonlinear source collection
- technical memo, photographs, official ledger, press editorial, oral history and council minutes
- source-criticism prompts that distinguish what evidence can and cannot establish
- evidence-gated interpretations
- multiple endings, including a legitimate "not enough evidence" conclusion
- versioned local checkpoint that resumes the exact investigation instead of replaying an opening sequence

### `/labs/blackout-protocol` — systems crisis

- 104 MW initial demand against 72 MW damaged-grid capacity
- load shedding/restoration for five city services
- service criticality and health
- delayed substation repair with finite crews
- spreading cyber incident, network isolation and one cyber analyst
- overload stress, service degradation and public-trust consequences
- resilient, strained and cascade outcomes

Electricity/networking are expressed through operating the system under pressure rather than stopping for definition questions.

### `/labs/last-harvest` — seasonal strategy

- three fields across an eight-week season
- maize, cowpea, cassava and fallow/cover-crop strategies
- crop-specific water need, nutrient demand, resilience, yield and price
- irrigation, compost and pest protection with finite budget
- mixed, dry and stormy replay scenarios
- soil fertility, moisture, crop health, yield and revenue consequences
- endings that consider both harvest output and long-term farm condition

## Core runtime modules

### Shared runtime

- `types.ts` — game categories, input intent, movement/camera profiles, Game DNA, telemetry and director actions
- `input-adapter.ts` — keyboard/analog normalization, radial deadzone and multi-device intent merging
- `fixed-step.ts` — 60 Hz accumulator clock, frame clamp, substep guard, dropped-time accounting and interpolation alpha
- `performance-monitor.ts` — average FPS, p95/worst frame, stutter ratio and quality recommendation
- `collision.ts` — AABB helpers with optional forgiving player hitbox inset
- `difficulty-envelope.ts` — changes world challenge without secretly retuning controls during a run
- `director.ts` — challenge/support/mechanic rotation/contextual-remediation decisions

### Movement and action games

- `platformer-simulation.ts` — acceleration, coyote time, jump buffer, variable jump shaping and air control
- `runner-simulation.ts` — logical/rendered lane separation, rapid retargeting, jump, slide and world-speed scaling
- `runner-chunks.ts` — deterministic modular generation, mirrored variants, difficulty selection and reachability validation
- `nova-run-session.ts` — scoring, combo, pickups, action gates and recoverable collision loop
- `open-world-simulation.ts` — camera-relative traversal, sprint, facing, contextual targets and orbit-camera bounds
- `field-expedition-session.ts` — contextual tool/action mission layer for open-world fieldwork

### Simulation and strategy games

- `structural-simulation.ts` — educational 2D truss solver for Failure Point
- `blackout-protocol.ts` — deterministic power/cyber crisis system with cascading service consequences
- `last-harvest.ts` — seasonal crop/soil/weather/resource strategy simulation

### Story and investigation

- `branching-story.ts` — reusable branching narrative graph with conditions, effects, evidence grants, multiple endings and versioned checkpoint serialization/restoration
- `archive-case.ts` — first complete evidence mystery built on that runtime

### Variety enforcement

- `game-dna.ts` — anti-reskin similarity scoring using category, genre, setting, role, mechanics, interaction style, story structure, pacing, failure/ending model, movement and camera identity
- `catalog.ts` — seeded design catalogue covering Blackout Protocol, Nova Run, Field Expedition, Geometry Forge, Failure Point, The Archive, The Last Harvest and Argument Arena

The automated suite checks every pair in the seeded catalogue against the anti-reskin threshold.

## Automated coverage added

Dedicated tests now cover:

- pairwise Game DNA diversity and reskin rejection
- runtime director behavior
- fixed-step equivalence and long-frame catch-up protection
- platformer coyote time, jump buffering and variable jump height
- rapid runner retargeting and control-vs-world-speed isolation
- forgiving collision
- deterministic runner generation, mirrored chunks, density ceilings and route validity
- Nova Run score/combo/pickups/recoverable hits/jump-slide gates
- camera-relative open-world traversal, sprint/deceleration, target selection and orbit-camera bounds
- Field Expedition tool/action flow, scoring, streaks and no double-scoring
- analog deadzone, diagonal normalization, keyboard mapping and multi-device merging
- adaptive challenge isolation from movement profiles
- frame-pacing quality recommendation
- analytical truss displacement/stress, yield failure and unstable model handling
- branching-story graph validation, nonlinear collection, evidence-gated endings and checkpoint restore/fallback
- Blackout Protocol overload, load shedding, delayed repair, cyber spread/isolation and containment
- Last Harvest planning gate, budget actions, crop/soil consequences, pest protection and full-season completion

## Intentional boundaries

### No heavy renderer dependency yet

The repository still has no dedicated Phaser/Three.js/Rapier/Matter-style game dependency. The current core is renderer-independent so a future stack can be selected from measured needs instead of speculation.

### No production student-route replacement yet

The existing school platform and current arcade remain intact. New labs should not enter production navigation until:

1. final CI is green on the branch head;
2. controls are play-tested on representative keyboard/touch devices;
3. low/mid/high device performance budgets are measured;
4. accessibility/remapping/reduced-motion options exist;
5. persistent progress/telemetry privacy and account-sync boundaries are finalized;
6. learning-through-action designs are reviewed with real curriculum content;
7. each flagship prototype passes a short learner playtest for clarity and fun.

### No professional engineering claim

Failure Point uses a valid linear truss method but does not model buckling, large deformation, fatigue, detailed connections, dynamic loads or building-code compliance.

## Next highest-value work

1. Hands-on playtest all seven routes from `/labs/games` and tune feel before production exposure.
2. Add account-backed checkpoint/progress contracts for persistent games while keeping local checkpoints as an offline fallback.
3. Make Field Expedition save/resume position, completed sites and selected tool.
4. Make Nova Run course paging effectively endless with pooling/streaming after performance measurement.
5. Add one genuine academic route mechanic to Nova Run without stopping movement.
6. Add direct member/node editing to Failure Point rather than only load/material sliders.
7. Prototype Argument Arena so language learning is represented by construction/rebuttal rather than quiz cards.
8. Add controller/gamepad browser adapter plus remapping, reduced-motion and accessibility controls.
9. Connect frame-pacing monitor to measured automatic quality budgets.
10. Define privacy-minimal structured gameplay telemetry for the adaptive director.
11. Establish game-specific release performance gates and regression journeys.
12. Migrate legacy quiz-style missions selectively; do not mass-reskin existing question templates.
