# SukuuNova Learning Arcade — Technical Architecture Reset

Status: **Pre-production architecture standard**  
Applies to: **all current and future Learning Arcade flagships**  
Purpose: prevent the platform layer from forcing unlike games into the same quiz-shaped interaction model.

---

## 1. Why this reset exists

The current Learning Arcade has strong individual art direction attempts, dedicated CSS, named worlds, progression labels and several promising bespoke interactions. The core technical contract, however, still assumes that nearly every learning experience can be represented as:

```ts
Question {
  prompt: string;
  options: string[];
}

Round {
  questions: Question[];
  answers: string[];
}
```

and later saved through one generic `answers: string[]` route.

That contract is convenient for conventional quizzes. It is not a sufficient substrate for a circuit workbench, business simulator, map expedition, evidence-reading investigation, coding environment, biology system model, animation studio, preschool garden or cyber-defence console.

The result is architectural gravity: teams can give a title a new background, HUD, fictional resource and terminology, yet the easiest implementation path remains “show prompt, choose option, store string, advance.” The product then feels like one interaction wearing eighteen costumes.

This document changes the platform contract so the Arcade can host genuinely different games without losing shared authentication, accessibility, reporting, save/resume, security and curriculum intelligence.

---

## 2. Source audit: what is and is not the problem

### 2.1 Shared shell chrome is not the enemy

`ArcadeV5GameShell` currently owns concerns such as:

- game identity/theme variables;
- shared music and SFX settings;
- fullscreen/focus mode;
- a small amount of launch/session chrome;
- a child component slot for the actual title.

Those are reasonable platform responsibilities. A future shell can become even thinner, but the existence of shared chrome is not why games feel identical.

### 2.2 The universal question/answer model is the bottleneck

`LearningArcadeV5` defines one generic question shape with `prompt` and `options`, one generic round containing `questions` and `answers: string[]`, and one common callback shape for most titles. The guardian Arcade API similarly accepts a universal array of answer strings when a session is saved.

This is the architectural bottleneck.

A direct-manipulation action such as “place six seeds into this garden bed,” “wire the battery through the switch and lamp,” “highlight two clauses supporting the inference,” or “quarantine this message, revoke the session and require MFA” should not need to pretend to be a string answer.

### 2.3 The fake-pressure pattern is a second bottleneck

Several existing titles add a thematic timer around the same decision loop: heat, storm, threat, strain, fog, queue pressure, ecological stress, drift or integrity loss. This creates visual differentiation without interaction differentiation, and worse, it can punish a learner simply for thinking or reading carefully.

Time may exist in a game only when it belongs to the skill or world simulation. It must not be used as a universal difficulty knob.

### 2.4 Dedicated CSS is not dedicated gameplay

A title can own 10,000 lines of visual styling and still be mechanically a quiz. Visual identity remains important, but the architecture review must begin with player verbs, state transitions and simulation—not screenshots.

---

## 3. Architectural principle: share the platform, not the game

SukuuNova should operate as a **game platform hosting multiple game runtimes**, not as one quiz runtime with multiple skins.

### Shared platform services — encouraged

These concerns should be reusable across titles:

- authentication, guardian/learner identity and tenant isolation;
- age-band eligibility and curriculum targeting;
- session creation and ownership;
- accessibility preferences and reduced-motion/high-contrast settings;
- master audio preferences and browser audio unlocking;
- save/resume envelope and crash recovery;
- secure server-authoritative assessment infrastructure;
- mastery graph / skill evidence storage;
- generic telemetry primitives and privacy controls;
- teacher/guardian reporting;
- curriculum standard mapping;
- launcher, discovery, age gate and parental navigation;
- generic progression record primitives where the title chooses to use them;
- achievements only where they are meaningful to that title;
- offline/cache/update/performance infrastructure;
- abuse prevention, rate limits and audit logs;
- feature flags, experiments and rollout controls.

### Game-owned systems — must not be universalized

Each title owns its own:

- renderer and camera model;
- moment-to-moment controls;
- input grammar;
- world/scene graph;
- domain state and simulation;
- mission state machine;
- content schema;
- failure and recovery model;
- HUD and screen composition;
- feedback language;
- reward loop;
- moment-to-moment pacing;
- art direction beyond launcher branding;
- sound bank and dynamic music logic;
- tutorial/onboarding flow;
- replay structure;
- game-specific accessibility adaptations;
- grading adapter and evidence extraction.

A new game should never be required to use a shared answer grid, progress meter, fictional health bar, timer, question card or four-option component.

---

## 4. Replace `Question + answers[]` with a session envelope

The next Arcade API should expose a small universal envelope and a versioned, game-specific payload.

Illustrative TypeScript:

```ts
type ArcadeSessionEnvelope = {
  sessionId: string;
  game: ArcadeGameKey;
  gameSchema: string;       // e.g. "number-bloom/v1"
  learnerId: string;
  ageBand: AgeBand;
  skillTargets: string[];
  progressionRef?: string;
  accessibility: ArcadeAccessibilityProfile;
  seed: string;
  missionPayload: unknown;  // validated by the selected game schema
};
```

The platform knows *which* game and learner this session belongs to. The title-specific adapter knows what `missionPayload` means.

Examples:

- Number Bloom: beds, manipulatives, quantities, target relationships and narration keys;
- CodeBots: world grid, robot capabilities, starter program, available blocks/syntax, tests and visible objectives;
- Signal Shield: incident evidence set, simulated accounts/assets, player tools, policy rules and case objectives;
- Circuit Forge: nodes, components, terminals, test points and constraints;
- GeoQuest: map layer, landmarks, route objective and spatial constraints.

The start response must never contain hidden correct answers, hidden tests or authoritative grading rules that allow trivial client inspection.

---

## 5. Structured player evidence instead of answer strings

The platform needs to record what the learner **did**, not only which label they selected.

Illustrative event envelope:

```ts
type ArcadeAttemptEnvelope = {
  sessionId: string;
  game: ArcadeGameKey;
  gameSchema: string;
  checkpointId: string;
  clientSequence: number;
  idempotencyKey: string;
  actionType: string;
  payload: unknown;
};
```

Examples of `payload`:

```ts
// Number Bloom
{ bedId: "bed-a", operation: "place", objectId: "seed-7", slot: 5 }

// CodeBots
{ operation: "run", programAst: [...], runId: "run-3" }

// Signal Shield
{ operation: "quarantine_message", evidenceIds: ["sender-domain", "link-target"] }
```

The client timestamp may be retained for telemetry when useful, but it must not become a grading authority. Server receipt order, session sequence and idempotency control are authoritative.

### Why structured evidence matters

It enables SukuuNova to assess:

- construction process, not merely final choice;
- revision and debugging strategies;
- misconceptions visible in intermediate actions;
- transfer of knowledge into unfamiliar states;
- teacher-facing explanations such as “correctly grouped seven objects after first building six,” rather than “selected option B.”

---

## 6. Game schemas and adapters

Every flagship receives a versioned schema package, conceptually:

```text
arcade/games/
  number-bloom/
    schema-v1
    server-grader
    progress-adapter
    telemetry-adapter
  codebots/
    schema-v1
    server-grader
    progress-adapter
    telemetry-adapter
  signal-shield/
    schema-v1
    server-grader
    progress-adapter
    telemetry-adapter
```

Exact folder names can follow the repository’s later implementation conventions; the separation is mandatory even if file placement changes.

Each schema defines:

1. public mission payload sent to the client;
2. accepted action/event payloads;
3. snapshot/resume state;
4. server-private solution/rules;
5. authoritative grading procedure;
6. safe feedback returned to the learner;
7. skill evidence emitted to mastery/reporting;
8. migration path for future schema versions.

Game-specific schemas should use discriminated unions and strict runtime validation (for example Zod where it remains appropriate).

---

## 7. Persistence model

A mature session should separate four kinds of data.

### 7.1 Session record

Stable ownership and configuration:

- session ID;
- learner/school;
- game and schema version;
- age band;
- curriculum/skill targets;
- creation/completion status;
- deterministic seed where relevant;
- public mission version;
- progression node/campaign reference.

### 7.2 Attempt journal

Append-oriented structured actions:

- sequence;
- idempotency key;
- action type;
- validated payload;
- server receipt time;
- safe result code;
- optional game-specific derived state hash.

The journal supports auditability, recovery and richer learning evidence.

### 7.3 World/session snapshot

A compact resumable state produced periodically rather than replaying an unlimited event stream on every load.

Examples:

- current Number Bloom garden state;
- CodeBots current source/program and robot state;
- Signal Shield incident queue and already-completed containment actions.

### 7.4 Derived assessment/progression

Server-produced results:

- mastery evidence;
- rubric scores;
- mission outcome;
- title-specific resources/unlocks;
- stars only if that title actually uses stars;
- teacher-facing evidence summary.

Derived values must be reproducible from authoritative inputs where practical.

---

## 8. Server-authoritative grading boundary

The browser is an interaction client, not the source of truth.

For assessed sessions:

1. server creates a mission from a protected generator/template;
2. client receives only public world state;
3. client submits structured actions/artifacts;
4. server validates session ownership, schema, sequence and payload limits;
5. game-specific grader evaluates action or submitted artifact;
6. server persists authoritative state/evidence;
7. client receives only feedback safe for that stage of play.

### Mandatory protections

- no correct-answer field in public mission payload;
- no hidden CodeBots tests sent to the browser;
- no authoritative Signal Shield scoring table embedded in client code;
- no client-submitted XP/stars/mastery accepted as truth;
- idempotent action handling for retries;
- action-size and event-count limits;
- replay/duplicate sequence rejection or deterministic reconciliation;
- tenant and learner ownership checks on every mutation;
- schema version validation;
- safe rate limiting;
- final grading immutable after lock where the game requires a lock.

This preserves the security principle already used in Nova Millionaire while allowing richer game evidence.

---

## 9. Timing and simulation policy

There are three valid timing classes.

### A. Skill-speed

The measured skill is speed itself.

Current flagship example: **TurboType**.

Typing pace, rhythm and reaction can affect results because they are explicit learning targets. Accuracy remains protected from reckless speed incentives.

### B. Intrinsic world motion

The world moves because movement is the game, not because the learner is being hurried to answer a school question.

Current likely example: **Nova Runner**.

A runner can have moving platforms, jumps and hazards. Educational decisions should be embedded in movement in a way that is fair and learnable.

### C. Thinking-neutral

Strategy, construction, reading, science, coding, money, investigation and creative titles default here.

The simulation may animate, NPCs may idle and ambience may continue, but the learner cannot lose health, money, ecological stability, body integrity, factory condition, defence rating, fuel, reward or score merely because they took longer to reason.

A world event may advance only when:

- the player deliberately takes an action;
- the mission explicitly models time as curriculum content;
- a clearly signalled optional challenge mode measures a relevant mastered skill and is not the default learning path.

---

## 10. Rendering and dependency policy

There is no single mandated game engine for all SukuuNova titles.

### React DOM / SVG

Prefer when:

- interaction is workbench/dashboard/editor-like;
- accessibility and semantic controls matter heavily;
- dragging/manipulation is moderate;
- a deterministic data simulation is more important than continuous physics.

Likely candidates: Number Bloom prototype, Cedi City management interfaces, Signal Shield, Reading Quest, Chronicle Vault, portions of Circuit Forge.

### Canvas / 2D game framework

Consider when:

- there are many moving entities;
- continuous world movement is a core verb;
- camera/scene transitions and animation state are central;
- DOM performance becomes a demonstrated bottleneck.

Phaser or another 2D framework may be justified for runner/adventure/physics-heavy titles, but only after a technical spike proves the value.

### Blockly or equivalent blocks

Potentially appropriate for Primary/early JHS CodeBots because the manipulation itself represents program structure. Adoption requires:

- acceptable bundle size;
- touch usability;
- keyboard accessibility plan;
- localization/label control;
- safe conversion into SukuuNova’s internal program representation.

Do not let Blockly become a visual multiple-choice palette.

### Text editor / Monaco

Potentially appropriate for SHS CodeBots where actual text coding is a learning goal. It must be lazy-loaded only for that mode/title. A lighter editor remains an option if Monaco’s mobile/performance cost is too high.

### Terminal / xterm-style UI

Use only when the learner genuinely needs a terminal concept. Do not add a terminal merely to make a game look technical.

### Three.js / 3D

Use only where spatial 3D reasoning materially improves the learning/game fantasy and measured device performance remains acceptable. “Looks premium” alone is not sufficient.

### Physics engines

Use when physics behavior itself is part of the playable model, not as decoration.

---

## 11. Per-title lazy loading

A guardian opening Learning Arcade must not download every game engine, code editor, sound library and simulation runtime.

Requirements:

- launcher bundle contains metadata and lightweight previews only;
- each game route/runtime is code-split;
- large dependencies load only after a title is entered;
- age-ineligible experiences should not eagerly load;
- audio banks load per title/zone;
- 3D/editor/Blockly dependencies remain isolated;
- low-memory device recovery is tested;
- game exit releases timers, audio nodes, animation loops and workers.

Bundle budgets must be defined before each vertical slice is promoted.

---

## 12. Audio architecture

Audio settings may be shared. Audio identity may not.

### Shared

- master music/SFX/voice preference;
- mute state;
- browser audio unlock/resume utilities;
- accessibility settings;
- safe volume limiting;
- common lifecycle hooks.

### Per game

- music language;
- instruments/timbres;
- interaction sound vocabulary;
- ambient world loops;
- success/failure cues;
- character voice/narration;
- dynamic layers tied to actual game state.

Number Bloom should not sound like a cyber SOC. CodeBots should not reuse the same success sting as a history archive simply because both use `playArcadeSound("success")` today.

The shared API may dispatch game-specific sound IDs, but the banks/directors belong to the title.

---

## 13. Content architecture

The phrase “content bank” means different things for different games.

Do not force all content into `{ prompt, options, answer }`.

Examples:

### Number Bloom mission

```ts
{
  mechanic: "plant_count",
  target: 7,
  beds: [{ id: "a", slots: 10 }],
  draggableObjects: [...],
  narrationKey: "plant-seven-seeds"
}
```

### CodeBots mission

```ts
{
  mechanic: "robot_route",
  world: {...},
  availableLanguage: ["move", "turn", "repeat"],
  visibleTests: [...],
  objective: {...}
}
```

### Signal Shield case

```ts
{
  incidentType: "phishing",
  evidence: [...],
  assets: [...],
  availableTools: ["inspect_link", "report", "quarantine"],
  objectives: [...]
}
```

Content quality pipelines should validate:

- grammar;
- reading level;
- curriculum alignment;
- duplicate/repetition ceilings;
- answer/solution correctness where applicable;
- impossible or ambiguous state combinations;
- cultural/local-context review;
- safety constraints;
- enough variation in starting state and goal state.

---

## 14. Mastery and reporting adapter

Teacher reporting should remain consistent at the platform level without flattening gameplay.

Every title emits a normalized evidence summary such as:

```ts
type ArcadeSkillEvidence = {
  skillKey: string;
  evidenceType: string;
  confidence: number;
  outcome: "demonstrated" | "developing" | "not_yet";
  artifactRef?: string;
  misconceptionCode?: string;
};
```

The *way* evidence is generated remains game-specific:

- Number Bloom: object placements and grouping strategy;
- CodeBots: program execution and debugging traces;
- Reading Quest: highlighted evidence and reasoning links;
- Cedi City: transaction/ledger decisions;
- Signal Shield: evidence identification and containment procedure.

This gives teachers comparable mastery information without forcing comparable controls.

---

## 15. Testing pyramid for real games

### Layer 1 — domain/mechanics unit tests

Pure deterministic rules:

- counting/grouping state;
- circuit propagation;
- transaction arithmetic;
- robot interpreter;
- incident policy engine;
- progression gates.

### Layer 2 — schema contract tests

For every game/schema version:

- valid mission payload accepted;
- malformed payload rejected;
- action bounds enforced;
- legacy schema migration tested;
- no private solution fields escape public serializer.

### Layer 3 — authoritative grader tests

- correct constructed solutions pass;
- common misconceptions produce safe targeted feedback;
- client tampering cannot award mastery;
- retries are idempotent;
- finalization locks where required.

### Layer 4 — game integration tests

- start → interact → save → resume → finish;
- disconnected/retry behavior;
- accessibility input paths;
- state restored exactly enough to continue play.

### Layer 5 — performance tests

Per title/device tier:

- startup/download budget;
- frame pacing where relevant;
- memory after repeated enter/exit;
- input latency;
- long-session leak checks;
- low-power/mobile behavior.

### Layer 6 — usability and child playtests

Automated tests cannot establish fun, comprehension or age suitability.

A vertical slice does not graduate until representative learners can demonstrate:

- what they believe their role is;
- what action they should try next;
- why an outcome happened;
- willingness to replay without being instructed;
- learning behavior visible in play rather than only in a post-game quiz.

---

## 16. Migration strategy: strangler, not big bang

Do not stop the entire product for one enormous rewrite and do not port all eighteen games to a half-tested framework simultaneously.

### Step 0 — freeze the anti-pattern

Effective immediately for new Arcade work:

- no new flagship may use the generic question/options grid as its default mechanic;
- no new fake health/heat/storm timer may punish thinking;
- no new dependency becomes global without architecture review.

### Step 1 — build Arcade Session API vNext alongside legacy

Legacy games continue to run while vNext supports structured game schemas/events.

### Step 2 — prove four contrasting vertical slices

Recommended proof set:

1. Number Bloom — touch-first early-years manipulation;
2. Cedi City — simulation/economy;
3. CodeBots — executable programming;
4. Signal Shield — evidence/incident investigation.

If the platform supports those four cleanly, it is less likely to collapse every future game into one template.

### Step 3 — migrate game by game

Each title gets:

- approved Game Bible;
- greybox;
- learning prototype;
- vertical slice;
- child playtest;
- schema/adapter;
- controlled rollout;
- legacy adapter removal only after replacement is stable.

### Step 4 — retire generic contracts deliberately

Only once all remaining titles have migrated should `Question.options` and `answers:string[]` cease to be Arcade-wide assumptions.

They may still exist inside a title where a question is genuinely the mechanic, such as Nova Millionaire.

---

## 17. Vertical-slice architecture gate

A vertical slice cannot be approved until engineering and game design can answer all of these:

### Interaction

- What are the three most common player verbs?
- Does the input model match the fantasy?
- Can the main learning action be demonstrated without an answer grid?

### State

- What game-owned state changes after each action?
- Can the player observe why the world changed?
- Is recovery possible after a misconception?

### Assessment

- What structured evidence is sent to the server?
- What remains private to the grader?
- Can the learner cheat by reading the start payload/client source?

### Timing

- Which of the three timing classes applies?
- If the learner does nothing for 60 seconds, what happens and why?
- Is any negative consequence pedagogically justified rather than cosmetic?

### Technology

- Why is each major dependency needed?
- Is it lazy-loaded?
- What happens on a low-power phone/tablet?
- Is there an accessible alternative path?

### Product quality

- Does this feel mechanically different from at least the other approved vertical slices?
- Is audio/game feedback title-specific?
- Does the game remain understandable when decorative art is replaced by grey boxes?

A “no” on any core question blocks production promotion.

---

## 18. Architecture definition of done

The Arcade architecture reset is not done when this document is merged. It is done when:

- a vNext session contract supports structured game-specific missions and actions;
- authoritative grading works without universal answer strings;
- at least four mechanically contrasting vertical slices run through the new contract;
- thinking-neutral games have no elapsed-time punishment;
- titles lazy-load their heavy runtimes;
- shared audio preferences coexist with per-title sound direction;
- teacher reporting consumes normalized evidence rather than requiring identical interactions;
- save/resume works for constructed world state;
- security tests verify no answer/hidden-test leakage;
- accessibility and performance gates pass;
- child playtests show that players understand the fantasy and voluntarily engage with the core toy.

Until those conditions are met, SukuuNova should describe this work as **pre-production / architecture migration**, not as a completed Arcade rebuild.
