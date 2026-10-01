# Sukuunova Game Engine Research and Architecture

## Objective

Sukuunova Games should feel like real games that happen to teach, not quizzes wrapped in game artwork. The engine therefore needs to protect moment-to-moment play quality — input, movement, camera, animation, collision, physics, feedback and performance — while allowing academic content, adaptive difficulty and story systems to vary around that stable core.

This document translates lessons from successful platformers, endless runners, open-world games and traversal-heavy modern games into original Sukuunova design rules. It is not a plan to clone any title, characters, maps or protected content.

## Research findings

### 1. Mario: surprise works because the controls and world remain trustworthy

Nintendo's Super Mario Bros. Wonder developers describe intentionally pushing level ideas into surprising transformations while preserving rules players trust — for example, what surfaces are safe and how objects are expected to react. The team also moved away from a strictly sequential course structure so players can choose different routes and difficulty levels.

Sukuunova implication: novelty should come from changing situations, level ideas and mission possibilities, not from making the same movement input behave unpredictably. Platformer controls should be stable enough for muscle memory while worlds, objectives and academic interactions can transform around them.

### 2. Celeste: forgiving movement can still support high skill

Celeste's developer documented several small forgiveness techniques: coyote time, jump buffering, reduced gravity near a held jump's apex, and corner correction. These systems do not remove challenge; they reduce frustrating failures where the player intended the correct action but missed by a few frames or pixels.

Sukuunova implication: platform challenges should judge the learner's decision and skill, not punish tiny input timing errors. Coyote time, jump buffering and mild collision correction belong in the default platforming vocabulary.

### 3. Subway Surfers: simple controls require sophisticated tuning

Unity's case study with SYBO explains that Subway Surfers balances difficulty through generated level structure, obstacle collider size and swipe-detection timing. Importantly, underlying game logic can react to a lane-change swipe before the visible movement animation finishes. This keeps experienced players' anticipated inputs responsive.

A 2026 Subway Surfers City case study adds several modern lessons: modular chunk-based level construction, multiple variations inside chunks, continuous device profiling, adaptive quality and a strong priority on stable frame pacing. The team reports consistently targeting 60 fps and explicitly argues that players notice frame-time spikes more than headline peak frame rate.

Sukuunova implication: runner controls must be immediate; animation must never lock out correct input. Levels should be assembled from modular chunks with controlled variation. The engine should support lower-end devices from the beginning rather than treating performance as a final polish step.

### 4. GTA-style open worlds: freedom is a structure, not a theme

Rockstar describes GTA V around open-world freedom, storytelling and mission-based gameplay, and GTA Online around free exploration, cooperative missions, ambient activities, competitive modes and a persistent evolving world. The transferable lesson for Sukuunova is the coexistence of free exploration and directed missions — not GTA's adult or criminal content.

Sukuunova implication: an educational open world can contain towns, farms, laboratories, businesses, transport systems and research sites. Learners should be free to travel, discover optional work, select missions in different orders and use vehicles or transit where appropriate. Academic objectives should become world actions: survey a river, diagnose a crop problem, plan a delivery, inspect a network cabinet, interview a resident or compare evidence.

### 5. Spider-Man traversal: physically plausible is not the same as playable

A Spider-Man 2 postmortem describes early swinging experiments that were more physically direct but difficult to control. The successful direction used physics to create the sensation of swinging while automating parts of the interaction that were frustrating for players. Later Insomniac GDC material similarly emphasizes traversal usability, camera design and maintaining fluidity as movement speed increases.

Sukuunova implication: physics should create believable consequences while the control scheme remains intentional and accessible. We should avoid simulation purity when it damages flow. Camera, auto-assist, target selection and contextual correction are legitimate parts of good movement design.

### 6. Physics simulation should run on a stable time base

Glenn Fiedler's widely cited game-physics guidance explains the benefits of stepping simulation with a fixed delta time rather than tying physics directly to variable render frame duration.

Sukuunova implication: physics-enabled games should use a fixed simulation step, initially 60 Hz, with rendering interpolated independently where the eventual runtime supports it. This reduces frame-rate-dependent movement and makes tuning/testing more reproducible.

## Sukuunova movement philosophy

### The player controls intent, not animation

Keyboard, touch and controller input must first become a shared `InputIntent`. Gameplay state changes from intent; animation represents that state. Animation is never allowed to delay an input that game rules say is valid.

### Game feel is protected during an active run

The adaptive learning system may change:

- obstacle density
- enemy or opponent logic
- available resources
- clue strength
- mission complexity
- time pressure
- route risk/reward
- academic concept emphasis
- next mechanic

It should not secretly alter these during an active run:

- jump arc
- steering sensitivity
- acceleration/deceleration
- lane-change timing
- coyote time
- jump buffer
- core collision forgiveness

Those properties form player muscle memory. If a mode intentionally uses different movement, it should be a clearly distinct game/mode with its own profile.

## Movement profiles

### Responsive platformer

Use for Mario-like side-view educational adventures without copying Mario content.

Required characteristics:

- rapid acceleration with predictable stopping
- variable-height jump support at runtime
- coyote time
- jump buffering
- useful but not excessive air control
- faster fall than rise for crisp landings
- mild corner/collision forgiveness
- camera that anticipates forward movement without lagging behind precision jumps

Good Sukuunova uses:

- mathematics obstacle courses
- science micro-world adventures
- language collection quests
- historical side adventures

### Arcade runner

Use for Subway-Surfers-like flow without cloning its characters, world or visual identity.

Required characteristics:

- automatic forward movement
- immediate lane intent
- jump and slide
- input logic independent of animation completion
- generous but consistent collision tuning
- visible obstacle telegraphing
- gradual speed and complexity ramps
- procedural chunks with multiple internal variants
- forward camera visibility sufficient for anticipation

Academic integration should alter routes and actions rather than pause the run for a popup question.

Example: a chemistry-symbol gate can lead to different lanes; recognising the correct symbol changes the safe route. The game never freezes to ask a multiple-choice question.

### Open-world exploration

Use for a non-violent educational sandbox borrowing the structural strengths of modern open worlds.

Required characteristics:

- camera-relative walking/jogging/sprinting
- smooth acceleration and stopping
- contextual interactions with forgiving proximity
- orbit camera with collision avoidance
- mission markers that do not eliminate exploration
- optional discoveries and side activities
- transport/vehicle adapters later
- district streaming/chunking so the world can grow without loading everything at once

First proposed world: **Field Expedition**, connecting a town, farms, river, laboratory, market and research sites. Different subjects can coexist within one place while missions remain optional and non-linear.

### Investigation movement

Movement is slower and more precise. Interaction targeting matters more than speed. Evidence targets should use cones/radii and soft snapping so the player does not fight pixel-perfect positioning.

### Strategy/simulation movement

Some great games should have no avatar. Their movement language is pan, zoom, selection, placement, drag/drop, path preview and simulation speed. Forcing a walking character into these games would make them worse.

### Construction/physics movement

Separate edit mode from simulation mode. During simulation, show force, load, stress, trajectory or failure visually. A collapsed bridge is better feedback than a red `WRONG` banner.

## Camera rules

Camera design is part of control design.

- Platformer: low lag, modest look-ahead, stable framing.
- Runner: strong forward visibility and modest speed-based field-of-view increase.
- Open world: orbit camera, obstacle avoidance, optional auto-follow and user-adjustable sensitivity.
- Investigation: stable close framing, low dramatic motion.
- Strategy: smooth pan/zoom with strict world bounds.
- Construction: orbit/pan around the object rather than following an avatar.

Accessibility settings should eventually include camera sensitivity, inversion, camera shake strength and auto-follow where relevant.

## Physics rules

1. Run simulation on a fixed step where the runtime permits it.
2. Separate visual size from collision size when small forgiveness improves fairness.
3. Prefer predictable collision response over chaotic realism in core educational challenges.
4. Use physically meaningful failure in engineering/science simulations.
5. Do not make every category physics-heavy; language/debate/strategy games need different interaction systems.
6. Record deterministic-enough gameplay telemetry so a failure can be explained and reproduced during testing.

## Performance rules

Sukuunova must assume that some learners will use modest phones and laptops.

- Target stable frame pacing before visual extravagance.
- Profile on representative low/mid/high devices.
- Build levels/worlds from chunks and load only what is needed soon.
- Pool frequently created gameplay objects.
- Avoid unnecessary UI redraws during action.
- Establish geometry, texture, memory and effect budgets per game category.
- Provide quality tiers rather than letting low-end devices stutter.
- Treat performance regressions as release blockers for game modules.

The Subway Surfers City case study is especially important here: modular content architecture and continuous profiling were designed into production, not added after the game was complete.

## Anti-repetition architecture

The new `GameDNA` model measures similarity using dimensions such as:

- category
- genre
- setting
- player role
- primary/secondary mechanics
- interaction style
- story structure
- pacing
- failure model
- ending model
- movement profile
- camera profile

A game that crosses the default 60% similarity threshold against recent games is flagged for redesign. Academic subject is deliberately not a major similarity dimension because changing Biology to Mathematics does not make identical gameplay new.

## Runtime Game Director

The director observes gameplay telemetry and academic mastery. It can:

- maintain the current beat
- add contextual support
- raise challenge
- rotate to a different mechanic
- re-teach a weak concept through an in-world action

The director explicitly does not retune movement fundamentals during an active run.

## Initial catalog

The foundation seeds deliberately different experiences:

1. **Blackout Protocol** — systems crisis simulation.
2. **Nova Run** — high-flow endless runner.
3. **Field Expedition** — open-world educational exploration.
4. **Geometry Forge** — direct spatial construction with no required story.
5. **Engineer: Failure Point** — build/test/fail/redesign physics simulation.
6. **The Archive** — evidence-driven historical investigation.
7. **The Last Harvest** — seasonal farming survival strategy.
8. **Argument Arena** — reasoning and rebuttal competition.

Future additions should include sports/arcade physics, vehicle/logistics play, creative language play and real-time biological strategy, but they must pass the same variety gate.

## Migration from the existing arcade system

The current `arcade-variation.ts` is useful for question freshness but its central object is still a `prompt` plus `answer`. That should remain as a legacy/quiz mechanic where a question game is actually appropriate.

Migration approach:

1. Keep existing quiz-based missions operational.
2. Build new games against the engine-agnostic Game DNA, input, movement and director contracts.
3. Prototype one 2D movement game first (Nova Run) and one non-avatar simulation (Geometry Forge or Failure Point).
4. Introduce renderer/physics adapters only after measuring bundle size, mobile compatibility and prototype needs.
5. Add open-world rendering only after the movement/camera prototype proves acceptable performance on representative devices.
6. Convert old missions selectively; do not automatically reskin every quiz into an action game.

## Next engineering milestones

### Milestone A — playable movement lab

Create a developer-only route where movement profiles can be tested without academic content. Expose live values for acceleration, stopping, jump buffer, coyote time, collider size, camera lag and field of view. Store tested presets rather than tuning by guesswork.

### Milestone B — Nova Run vertical slice

Build a small runner with:

- keyboard and touch intent adapters
- three lanes
- jump/slide
- modular chunks
- obstacle telegraphing
- collision forgiveness
- score/combo system
- one academic route-choice mechanic
- 60 fps target on representative devices

### Milestone C — construction vertical slice

Build Failure Point or Geometry Forge with:

- direct object manipulation
- edit/simulate modes
- force/failure feedback
- no mandatory multiple-choice interruptions

### Milestone D — Field Expedition traversal lab

Only after A-C are stable, prototype third-person movement, orbit camera, interactions and one compact district. Do not attempt a GTA-scale world. Prove movement, loading and mission structure first, then grow the world modularly.

## Sources

1. Nintendo. “Ask the Developer Vol. 11, Super Mario Bros. Wonder — Part 1.” October 17, 2023. https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-11-super-mario-bros-wonder-part-1/
2. Nintendo. “Ask the Developer Vol. 11, Super Mario Bros. Wonder — Chapter 3.” October 2023. https://www.nintendo.com/au/news-and-articles/ask-the-developer-vol-11-super-mario-bros-wonder-chapter-3/
3. Maddy Thorson / Maddy Makes Games. “Celeste & Forgiveness.” https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html
4. Unity / SYBO. “How partnership helped Subway Surfers hit 3B.” July 18, 2025. https://unity.com/resources/subway-surfers
5. Unity / SYBO. “Scaling Subway Surfers City for performance and speed.” March 24, 2026. https://unity.com/resources/sybo-subway-surfers-city
6. Rockstar Games. “GRAND THEFT AUTO V Official Announcement.” November 3, 2011. https://www.rockstargames.com/newswire/article/o349k552544449/grand-theft-auto-vi-official-announcement.html
7. Rockstar Games. “Watch the GTA Online Official Gameplay Video.” August 15, 2013. https://www.rockstargames.com/newswire/article/1748koo9o5734o/watch-the-gta-online-official-gameplay-video.html
8. GDC Vault / Insomniac Games. “Concrete Jungle Gym: Building Traversal in Marvel's Spider-Man.” GDC 2019. https://www.gdcvault.com/play/1026084/Concrete-Jungle-Gym-Building-Traversal
9. Game Developer. “Spider-Man 2 Postmortem.” September 2004. https://media.gdcvault.com/GD_Mag_Archives/Game.Developer.2004.09.pdf
10. Glenn Fiedler. “Fix Your Timestep!” June 10, 2004. https://gafferongames.com/post/fix_your_timestep/
