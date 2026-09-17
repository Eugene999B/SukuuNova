# CodeBots — Game Bible

Status: **Pre-production / vertical-slice candidate**  
Primary audience: **Upper Primary, JHS and SHS with genuinely different maturity layers**  
Core principle: **programs must execute in a world; coding is not ordering answer labels**

---

# 1. Identity

**Title:** CodeBots  
**Working codename:** Botworks  
**Genre:** Programming puzzle + robotics simulation + software-engineering progression  
**Target age bands:** Upper Primary, JHS, SHS  
**Primary platform/input:** Desktop/laptop first for JHS/SHS; tablet viable for block mode; keyboard becomes essential in text-code mode  
**Player fantasy:** I am a robotics/software engineer who writes programs that make machines solve real problems.  
**Learning promise:** Learners understand computational thinking by building, running, observing and debugging executable programs.  
**Differentiation:** CodeBots is the Arcade title where the learner creates an algorithm, runs it in a deterministic simulated world, inspects behavior and repairs code.

## Shipping sentence

> In CodeBots, the learner is a robotics engineer who repeatedly builds or edits programs, runs them against a visible world, watches bots execute instructions, investigates failures and improves the program until the system meets its specification. The world responds to the code itself. Learning sequencing, loops, conditions, variables, functions, debugging and software reasoning makes the learner better at the game. They return because new robots, production systems, logistics zones and increasingly authentic engineering projects become available.

---

# 2. Design pillars

- **Code must run** — no programming concept is considered playable until the learner can execute it and see a consequence.
- **Debugging is normal** — a failed run is information, not punishment.
- **Concrete to authentic** — blocks and visible robots mature into real text code and professional-lite tooling.
- **Tests are part of the world** — requirements and test cases make correctness observable.
- **Think first, run when ready** — no factory damage, heat or reward loss while the learner reasons.
- **Optimization comes after correctness** — command count, energy or elegance may become optional mastery goals, never the first gate.

## Anti-pillars

CodeBots must never become:

- a permutation quiz where every required command is already supplied as an option;
- multiple-choice questions about syntax as the main loop;
- a fake IDE where code is decorative and answers are selected below it;
- an elapsed-time “factory overheat” pressure mechanic;
- a typing-speed contest disguised as coding;
- a terminal-looking screen with no executable system underneath;
- unrestricted browser/server code execution.

---

# 3. Age-band architecture

The same CodeBots universe matures strongly across bands.

## Upper Primary — Robot Builder

**Player identity:** junior robotics engineer.  
**Reading:** short mission statements, icons, voiced hints optional.  
**Session:** 8–20 minutes.  
**Core input:** drag blocks or tap commands into a program rail; run/step/reset.  
**Concepts:** sequence, direction, repetition, simple event/condition, decomposition.  
**World:** grid/room factory, delivery floor, greenhouse, warehouse, rescue routes.  
**Failure:** bot visibly stops, turns wrong, misses target or repeats unexpectedly.  
**Assessment:** executable program reaches goal across more than one test arrangement.

## JHS — Automation Engineer

**Player identity:** automation apprentice/engineer.  
**Session:** 15–35 minutes.  
**Core input:** blocks or transitional hybrid editor; variable/watch panels; debugger.  
**Concepts:** loops, conditionals, variables, boolean logic, functions, nested control, debugging, data/state.  
**World:** production cells, sorting lines, sensor systems, traffic/logistics, multi-bot coordination.  
**Assessment:** program correctness across visible and protected tests, debugging decisions and transfer tasks.

## SHS — Software/Robotics Developer

**Player identity:** developer/engineering intern.  
**Session:** 20–60+ minutes.  
**Core input:** real text editor, run/tests, console/logs, breakpoints or step-through where feasible.  
**Concepts:** functions, collections/data structures appropriate to curriculum, algorithms, state, input validation, modularity, testing, debugging, refactoring; optional web/robotics domains later.  
**Assessment:** executable project + hidden tests + process evidence + optional written rationale/portfolio artifact.

SHS must not look like Primary with smaller blocks and harder numbers.

---

# 4. World and story

## Premise

SukuuNova Botworks is a network of robotics facilities that support communities: moving supplies, sorting materials, monitoring greenhouses, routing deliveries, inspecting infrastructure and coordinating automated systems. The player joins as an apprentice and earns responsibility by making systems dependable.

The world avoids the tired “answer quickly or the factory explodes” trope. Engineering pressure comes from specifications, edge cases and system complexity—not a countdown attached to reading.

## Long-term goal

Grow from **Botworks Apprentice** to **Systems Architect**, restoring and expanding increasingly complex automation zones and building a portfolio of working programs.

## Campaign zones

### 1. Motion Bay

Sequence, movement, orientation, run/reset.

### 2. Loop Yard

Repeated routes, efficient repetition, nested patterns later.

### 3. Sensor Works

Conditions and events based on visible sensors.

### 4. Variable Depot

Counters, inventory state, thresholds and data.

### 5. Function Foundry

Reusable procedures and decomposition.

### 6. Debug District

Faulty existing programs, trace tools, tests and diagnosis.

### 7. Systems Port

Multi-system projects, logistics, multi-bot coordination and SHS capstones.

---

# 5. Characters

## Ama Mensah — Lead Engineer

**Role:** mentor and project lead.  
**Personality:** exact, encouraging, values evidence.  
**Gameplay function:** defines specifications and asks the player to demonstrate behavior, not recite definitions.  
**Teaching style:** “Run it. What did the bot actually do?”

## Kweku — Test Technician

**Role:** owns the test bench.  
**Gameplay:** introduces visible tests, edge cases and later hidden-test concepts.  
**Character rule:** never simply tells the correct code.

## BOT-0 / “Zero”

**Role:** learner’s first robot.  
**Gameplay:** expressive physical feedback makes program behavior legible.  
**Progression:** gains sensors/tools as the learner unlocks corresponding concepts.

## Sena — Systems Operator

**Role:** later JHS/SHS partner who reports real system symptoms and logs, creating debugging missions.

---

# 6. Core gameplay

## Primary verbs

- assemble;
- type/edit;
- run;
- step;
- observe;
- debug;
- inspect;
- test;
- refactor;
- deploy.

## 10–60 second loop

1. Player inspects a world and a concrete specification.
2. Player creates or edits an executable program.
3. Player presses Run or Step.
4. Bot/world executes deterministically.
5. Player sees movement, sensor state, logs/tests and exact point of failure/success.
6. Player modifies program.
7. Player reruns until required tests pass.

This loop is the heart of CodeBots. If a mission can be completed without executing code, it is probably not a core CodeBots mission.

## Session loop

- enter a project zone;
- inspect objective and available robot capabilities;
- build/run/debug 2–4 related tasks or one larger project;
- encounter a transfer/edge-case test;
- finish with a functioning deployment;
- unlock a tool, project, robot capability or portfolio entry.

## Meta loop

- earn engineering licences by concept families;
- upgrade lab/workbench capabilities;
- unlock new robot hardware only when it creates new programming possibilities;
- maintain a portfolio of solved/open projects;
- revisit earlier missions under optional optimization constraints;
- branch into later specializations.

## Toy test

A Sandbox mode allows the learner to place a bot, obstacles, pickups/sensors and write any permitted program. If free experimentation is not fun, the execution world needs work.

---

# 7. Programming model

CodeBots needs one internal representation independent of visual editor technology.

## Internal AST/IR

Conceptual example:

```ts
type BotStatement =
  | { type: "move"; steps: number }
  | { type: "turn"; direction: "left" | "right" }
  | { type: "repeat"; count: number; body: BotStatement[] }
  | { type: "if"; condition: BotCondition; then: BotStatement[]; else?: BotStatement[] }
  | { type: "set"; variable: string; expression: BotExpression }
  | { type: "call"; functionName: string; args: BotExpression[] };
```

Primary block mode compiles to this representation. JHS hybrid mode can manipulate it through richer constructs. SHS text code may compile/translate into a sandboxed execution representation or run inside a hardened language runtime, depending on technical spike results.

The content system specifies capabilities and tests, not a list containing every command in the correct answer.

---

# 8. World simulation

## Launch grid-world simulator

Use a deterministic 2D tile/grid world for the first proof.

State may include:

- robot position/orientation;
- traversable/blocked tiles;
- target/drop-off tiles;
- collectible/cargo state;
- switches/doors;
- simple sensors;
- counters/resources where curriculum needs them;
- execution step counter;
- mission-specific state.

Each program instruction advances deterministic simulation state.

## Execution modes

### Run

Executes at a readable animation speed.

### Step

Executes one statement/operation at a time and highlights corresponding block/code.

### Reset

Restores mission initial state immediately.

### Fast run

Optional after learner understands behavior; useful for long programs.

### Breakpoint/debug mode — later

JHS/SHS can pause on lines/blocks and inspect variables.

---

# 9. Mission families

## 9.1 Route and deliver

Program bot to reach/drop an object at a destination.

**Concepts:** sequence, orientation, decomposition.

**Variation:** obstacles/layouts and destinations change; not just command labels.

## 9.2 Repeat a pattern

Long repeated route makes naive duplication possible but cumbersome; loop becomes meaningful.

**Concept:** repeat/loop.

**Learning rule:** introduce the need for a loop through the world before showing terminology.

## 9.3 React to sensors

Bot must behave differently based on a signal, colour-independent marker, obstacle sensor, item type or threshold.

**Concept:** conditionals.

## 9.4 Count and track

Bot sorts/delivers while tracking counts or inventory.

**Concept:** variables/state.

## 9.5 Build a helper

Repeated subtask invites function/procedure extraction.

**Concept:** functions/decomposition.

## 9.6 Debug a broken program

Player receives executable but faulty code plus failing tests/logs.

**Actions:** run, observe, step, identify failure, edit.

**Concept:** debugging and reasoning from evidence.

## 9.7 Test the edge cases

Program works on visible example but must generalize across changed worlds.

**Concept:** robustness, abstraction, avoiding hard-coded solutions.

## 9.8 Open project

SHS/advanced JHS project has a brief and rubric rather than one prescribed path.

---

# 10. Success, failure and recovery

## Local success

A run satisfies the current observable test.

## Mission success

All required tests pass and the program obeys prohibited-action/resource constraints where those constraints are pedagogically meaningful.

## Long-term success

Learner can transfer programming concepts into novel projects and debugging situations.

## Failure

Failure is executable evidence:

- collision;
- wrong destination;
- infinite/repeated behavior stopped by execution limit;
- wrong item sorted;
- assertion/test fails;
- variable state unexpected.

No factory integrity damage occurs because the learner took time before pressing Run.

## Recovery

- Reset always available;
- Undo/redo in editor;
- Step mode;
- variable/state inspection;
- progressively stronger hints;
- compare expected vs actual world event in accessible form.

## Infinite-loop handling

Runtime imposes a deterministic instruction/step budget. When reached, execution stops safely and tells the learner that the bot kept running beyond the mission limit. It does not freeze the browser.

---

# 11. Learning architecture

| Concept | In-game action | Evidence | Common misconception | Feedback |
| --- | --- | --- | --- | --- |
| Sequence | Arrange executable commands | Bot reaches target in correct order | Thinks commands occur simultaneously | Step highlights command-by-command |
| Loop | Replace repeated actions with repeat construct | Works across repeated route/tests | Repeats wrong body or count | Trace loop iterations in world/editor |
| Condition | Program branch based on sensor/state | Correct behavior under multiple states | Condition checked only once/branch reversed | Show sensor value + chosen branch |
| Variable | Update/use named state | Program tracks changing count/value | Treats assignment like equality | Watch panel shows changes over time |
| Function | Define/call reusable behavior | Repeated task solved through reusable procedure | Copies code instead of generalizing | Call trace / function highlight |
| Debugging | Run/step/edit failing program | Learner isolates and fixes fault | Random edits without evidence | Tests/logs identify actual vs expected |
| Testing | Run multiple cases | Solution generalizes | Hard-codes visible example | New protected test reveals brittle behavior |

## Prerequisite graph

Sequence → repetition → condition → variable/state → procedures/functions → combined systems → testing/debugging → open projects.

Order can branch; debugging begins on day one at simple level.

---

# 12. Assessment model

## What is assessed

- submitted program representation/source;
- execution outcome against visible and protected tests;
- prohibited API/capability use;
- concept evidence;
- optional process evidence (number of runs, use of step/debug) used diagnostically, not as punitive scoring;
- optional optimization rubric after correctness.

## What is not assessed by default

- time spent thinking;
- number of revisions;
- whether the learner used exactly the authored solution;
- stylistic preferences before the curriculum introduces style/refactoring.

## Multiple solutions

The grader must accept any solution that satisfies the specification and allowed-language constraints.

## Hidden tests

Hidden tests exist server-side only for missions that need generalization checks. The client receives sanitized feedback such as:

- “Your program works on the practice route but misses a case when the path length changes.”

Do not reveal the hidden test payload if that would collapse the challenge.

---

# 13. Progression

## Licences

- Motion Licence;
- Loop Licence;
- Sensor Licence;
- State Licence;
- Function Licence;
- Debug Licence;
- Systems Licence.

Licences represent demonstrated capability and unlock mechanics, not arbitrary XP thresholds alone.

## Robot progression

New hardware changes what programs can do:

- gripper;
- colour/marker sensor;
- distance sensor;
- cargo rack;
- multi-channel controller;
- later multi-bot tools.

Avoid cosmetic “better robot = automatic success.”

## Portfolio

JHS/SHS can keep selected project snapshots:

- mission brief;
- final code/program;
- tests passed;
- optional reflection;
- revision history summary.

This can later connect to teacher review/export.

---

# 14. UI/UX Bible

## Primary presentation metaphor

An engineering workbench split between **world** and **program**.

The exact balance changes by age band.

### Primary layout

- large simulated world;
- block tray;
- program rail;
- giant Run / Step / Reset controls;
- minimal panels.

### JHS layout

- world pane;
- structured editor;
- tests/objective pane;
- variable/sensor watch where relevant;
- debug/run controls.

### SHS layout

- professional-lite IDE;
- source editor;
- simulation preview;
- test results/log console;
- project files only when curriculum genuinely needs them.

## First five minutes — Primary

1. Bot Zero waits one tile from a glowing delivery pad.
2. Child drags `move` into the program rail.
3. Run makes bot move and celebrate at the pad.
4. Next route requires move + turn + move.
5. Third route repeats movement and introduces a repeat block through need.

No vocabulary lecture before execution.

## First five minutes — SHS

1. Open a small existing program with one visible bug.
2. Run tests; one passes, one fails.
3. Simulation/log makes failure concrete.
4. Learner edits code and reruns.
5. Successful fix opens the project dashboard and explains available tools.

---

# 15. Art Bible

**Mood:** capable, inventive, industrial-clean, playful robotics for younger bands, progressively more authentic engineering for older learners.

**Primary world:** bright readable tile spaces and expressive robots; obstacles identifiable by shape.

**JHS:** richer automation floor with sensors, conveyors and machines, but keep important state legible.

**SHS:** restrained professional UI, not cartoonified; simulation still visually clear.

**Animation principles:** robot anticipation/follow-through helps learners understand command boundaries. Debug highlighting must synchronize accurately with execution.

**Do not resemble:** a quiz game with robot wallpaper, a casino factory, or a fake hacker terminal.

---

# 16. Audio Bible

## Identity

Percussive/mechanical rhythm, servo clicks, relay ticks and warm synth layers. Primary is playful; SHS becomes more restrained.

## Functional sounds

- command placed;
- run start;
- step tick;
- bot movement;
- sensor trigger;
- pickup/drop;
- test pass;
- test fail (neutral diagnostic tone);
- breakpoint/pause;
- deployment complete.

Audio must reinforce program execution timing.

## No pressure siren

Do not create constant heat alarms while learner edits. Alerts may occur only if their running program causes a simulated problem that is part of the model.

---

# 17. Technology plan

## Vertical-slice recommendation

Build the first simulator with a **small deterministic TypeScript game core** separated from rendering.

```text
mission data -> interpreter -> deterministic world reducer -> render adapter
                         -> event trace -> grader/tests
```

This lets unit tests run without a browser and later allows more than one renderer/editor.

## Renderer

For a simple grid-world greybox, React/SVG/DOM or Canvas can both work. Choose after benchmarking interaction clarity and animation performance; do not adopt a heavy engine before the simulation core proves fun.

## Blockly investigation

Blockly is a candidate, not a decision.

Spike criteria:

- touch usability;
- keyboard accessibility;
- bundle size/lazy loading;
- visual density on school devices;
- ability to define SukuuNova blocks cleanly;
- conversion to stable internal AST;
- localization control.

If Blockly feels like dragging answer tiles rather than constructing programs, redesign the blocks/world—not merely the styling.

## SHS text editor investigation

Monaco is a candidate for authentic editor behavior, but must be compared against lighter editors for:

- first-load weight;
- lower-power laptops;
- mobile fallback;
- accessibility;
- syntax services actually required by curriculum.

Lazy-load it only inside relevant CodeBots modes.

---

# 18. Safe code execution architecture

This is a hard security boundary.

## Block/internal AST mode

Prefer executing a bounded interpreter written for CodeBots. It has no arbitrary OS/network capability by design.

Controls:

- allowed instruction set;
- max AST size;
- max nesting;
- execution step budget;
- deterministic random seed if randomness is introduced;
- no network/file/browser privileged APIs;
- server re-execution for authoritative grading.

## Text-code mode

Do not `eval` arbitrary learner code inside the application/server process.

Before SHS production, conduct a dedicated sandbox architecture spike. Requirements:

- isolated execution environment;
- strict CPU/time/memory limits;
- no outbound network by default;
- no host filesystem/secrets;
- syscall/API allowlist appropriate to runtime;
- per-run teardown;
- output size limits;
- abuse/rate limits;
- deterministic fixture inputs where grading requires it;
- server-side hidden tests protected from learner source/runtime inspection;
- observability and kill switches.

A text-code feature cannot ship until this boundary has independent security review.

---

# 19. Server-authoritative session schema

Example public mission:

```ts
type CodeBotsMissionV1 = {
  mechanic: "route" | "loop" | "sensor" | "debug";
  world: PublicBotWorld;
  language: AllowedConstruct[];
  starterProgram?: PublicProgram;
  visibleTests: VisibleTest[];
  objective: PublicObjective;
};
```

Example actions/artifacts:

```ts
type CodeBotsActionV1 =
  | { type: "save_program"; revision: number; program: ProgramAst }
  | { type: "run"; runId: string; programHash: string }
  | { type: "request_hint"; hintLevel: number }
  | { type: "submit"; program: ProgramAst };
```

The final grader reruns the submitted program against authoritative mission state and protected tests. Client-reported “pass” is never authoritative.

---

# 20. Accessibility

- keyboard operation for blocks/editor where feasible;
- non-drag insertion path for block users;
- screen-reader labels for program structure;
- execution trace available textually as well as visually;
- colour-independent sensor/state indicators;
- reduced motion slows/removes decorative animation without hiding execution state;
- adjustable execution speed;
- pause/step always available;
- error messages explain behavior, not just syntax codes;
- no important learning information available only through sound;
- editor font scaling and high-contrast themes.

---

# 21. Analytics and telemetry

Useful events:

- program revision created;
- run/step/reset;
- execution outcome;
- first failing operation/test;
- hint/debug tool usage;
- successful generalization to changed test;
- concept construct used;
- optional optimization attempt;
- crash/runtime guard trigger;
- editor/simulator performance.

Do not rank children by “fewest edits.” Productive debugging often requires many revisions.

Useful learning diagnostics:

- repeated off-by-one loop counts;
- condition branch inversion;
- hard-coded path vs generalized logic;
- variable not updated;
- function created but not called;
- random-edit behavior vs evidence-led debugging.

---

# 22. First vertical slice

The proof should contain **two primary/JHS mechanics and one debug task**, not a giant campaign.

## Slice A — Primary route world

- 8×8-ish readable grid;
- move/turn/pick/drop;
- Run/Step/Reset;
- three missions;
- final mission varies layout enough to prevent memorizing one command list.

## Slice B — Loop introduction

- repeated collection/delivery pattern;
- naive solution possible initially;
- repeat block becomes meaningful;
- optional efficiency challenge after correctness.

## Slice C — JHS condition/debug proof

- bot reads a simple sensor;
- starter program contains one logic error;
- visible test fails;
- step/watch reveals condition state;
- learner fixes and reruns;
- protected variant verifies transfer.

## SHS spike — separate technical experiment

One tiny text-code prototype may be explored in parallel, but it must not block the first fun/playability proof and it must not ship without sandbox review.

---

# 23. Playtest plan

## Primary test questions

Observe:

- Does child understand that blocks control the bot?
- After a wrong run, do they look back at the program and revise?
- Is Step understandable?
- Can they predict one next action before running?
- Does repeated route naturally motivate a loop?

## JHS test questions

- Do learners use test output/logs rather than random edits?
- Can they explain why a condition chose a branch?
- Does debugger reduce confusion or create extra UI burden?
- Can they solve a changed test without rebuilding from scratch?

## SHS future tests

- Does the workspace feel credible rather than childish?
- Are error messages useful?
- Does text coding teach transferable conventions rather than a proprietary toy language only?

### Promotion blockers

- learner can pass by ordering all supplied options without understanding;
- no visible causal link between code and world;
- elapsed editing time affects score/health;
- one authored solution is required when alternatives are valid;
- hidden tests leak to browser;
- infinite code can hang the client/server;
- editor/runtime bundle makes normal Arcade launch heavy;
- learner spends more time fighting UI than debugging code.

---

# 24. Production gate

CodeBots enters full production only after:

- the deterministic interpreter/world core is separately unit-testable;
- learner programs visibly execute;
- run/step/reset form a satisfying loop;
- at least sequence, loop and one condition/debug scenario are demonstrated through execution;
- authoritative grader accepts multiple valid programs;
- no thinking-time punishment remains;
- schema does not rely on `options[]` as the program definition;
- hidden tests stay server-side;
- block editor choice passes usability/performance/accessibility spike;
- actual learners debug from evidence rather than merely guessing;
- security architecture exists before any arbitrary text-code execution ships.

CodeBots should feel like the beginning of becoming a programmer, not a quiz about programming vocabulary.
