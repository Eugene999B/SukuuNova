# RFC — Arcade Session API vNext

Status: **Pre-production RFC / not yet implemented**  
Audience: game engineering, platform engineering, curriculum/content, QA/security  
Depends on: `STUDIO_CONSTITUTION.md`, `TECHNICAL_ARCHITECTURE_RESET.md`, prototype Game Bibles  
Migration stance: **strangler migration; legacy ArcadeRound remains operational during rollout**

---

# 1. Problem statement

The current Learning Arcade start/save boundary is optimized around a universal round containing questions and an `answers: string[]` array. That shape works for quiz-like experiences, but it creates a structural incentive to turn every title into a question card with a themed wrapper.

The next Arcade platform needs to support, with equal legitimacy:

- direct object manipulation in Number Bloom;
- transactions, baskets, cash, inventory and ledgers in Cedi City;
- executable programs and deterministic robot worlds in CodeBots;
- evidence inspection and stateful incident response in Signal Shield;
- later wiring, maps, text evidence, environmental systems, body systems, creative artifacts and simulations.

The platform must preserve the useful shared guarantees already present in SukuuNova:

- guardian/learner/tenant authorization;
- age-band eligibility;
- secure server-side assessment;
- save/resume;
- curriculum/mastery reporting;
- telemetry;
- progression;
- safe error handling.

vNext changes the **gameplay contract**, not those guarantees.

---

# 2. Goals

1. Remove `prompt + options + answers[]` as the universal Arcade gameplay model.
2. Allow every game to expose a versioned public mission schema suited to its mechanics.
3. Record structured learner actions and submitted artifacts.
4. Keep authoritative solutions, hidden tests and rubric details server-side.
5. Support resumable constructed world state.
6. Make retries and flaky networks idempotent.
7. Emit normalized mastery evidence without requiring normalized gameplay.
8. Allow legacy and vNext titles to coexist during migration.
9. Avoid forcing heavy game/editor dependencies into the launcher bundle.
10. Make security/performance/testability first-class before four prototype slices scale.

---

# 3. Non-goals

This RFC does **not**:

- choose Phaser/Blockly/Monaco/Three.js for the whole Arcade;
- define final Prisma migration names;
- mandate event sourcing as the only permanent storage strategy;
- redesign guardian authentication;
- redesign all progression/leaderboards in one step;
- implement a generic game engine;
- define a universal HUD or reward system;
- replace Nova Millionaire’s valid choice/lock mechanic merely for architectural purity;
- allow arbitrary learner code execution in the production server process.

---

# 4. Core terminology

## Session

One resumable play instance for one learner and one game/schema version.

## Public mission

Game-owned data the client is allowed to see in order to render/play the mission.

## Private mission state

Server-only answer model, protected tests, rubric, generation secrets or other truth that must not reach the browser.

## Action

A structured player operation that changes or inspects game state: place seed, move money, run program, mark evidence, revoke session, etc.

## Artifact

A larger constructed result submitted by a title: program AST/source, completed ledger, circuit topology, storyboard, map route.

## Snapshot

Compact resumable game state produced from authoritative state at a known event sequence.

## Assessment

Server-generated mission/skill result derived from authoritative actions/artifacts/private rules.

## Adapter

Game/version-specific server module that validates missions/actions, transitions state, grades outcomes and emits safe feedback/mastery evidence.

---

# 5. High-level architecture

```text
Learning Arcade Launcher
        |
        v
Arcade Session vNext API
        |
        +--> shared auth / tenant / learner / age-band / progression services
        |
        +--> Game Adapter Registry
                |
                +--> number-bloom/v1
                +--> cedi-city/v1
                +--> codebots/v1
                +--> signal-shield/v1
                +--> ...future adapters
        |
        +--> authoritative session store
        +--> event/action journal
        +--> snapshot store
        +--> assessment/mastery bridge
        +--> telemetry/audit
```

The launcher knows **which game** to launch. It does not know how that game’s world works.

---

# 6. Shared session envelope

Illustrative contract:

```ts
type ArcadeVNextGameKey =
  | "number-bloom"
  | "cedi-city"
  | "codebots"
  | "signal-shield"
  | string;

type ArcadeSessionEnvelopeV1 = {
  apiVersion: "arcade-session/v1";
  sessionId: string;
  game: ArcadeVNextGameKey;
  gameSchema: string;             // e.g. "number-bloom/v1"
  learner: {
    id: string;
    displayName: string;
  };
  ageBand: AgeBand;
  status: "active" | "completed" | "abandoned";
  progression: {
    campaignRef?: string;
    node?: number;
    level?: number;
  };
  skillTargets: string[];
  accessibility: ArcadeAccessibilityProfile;
  sessionSequence: number;
  publicMission: unknown;
  publicState: unknown;
  safeFeedback?: ArcadeSafeFeedback[];
};
```

`publicMission` and `publicState` are validated by the selected game adapter before leaving the server.

The browser never receives raw private mission state.

---

# 7. Game adapter contract

Conceptual server interface:

```ts
interface ArcadeGameAdapter<
  PublicMission,
  PrivateMission,
  State,
  Action,
  Artifact,
  SafeFeedback,
> {
  readonly game: ArcadeVNextGameKey;
  readonly schemaVersion: string;

  createMission(ctx: MissionContext): Promise<{
    publicMission: PublicMission;
    privateMission: PrivateMission;
    initialState: State;
    skillTargets: string[];
  }>;

  parseAction(input: unknown): Action;
  parseArtifact(input: unknown): Artifact;

  applyAction(input: {
    publicMission: PublicMission;
    privateMission: PrivateMission;
    state: State;
    action: Action;
    ctx: ActionContext;
  }): Promise<{
    state: State;
    feedback: SafeFeedback[];
    evidence?: ArcadeSkillEvidence[];
    terminal?: boolean;
  }>;

  grade(input: {
    publicMission: PublicMission;
    privateMission: PrivateMission;
    state: State;
    artifact?: Artifact;
    events: ReadonlyArray<ValidatedArcadeEvent>;
  }): Promise<ArcadeAssessment>;

  serializePublicState(state: State): unknown;
  createSnapshot(state: State): unknown;
  restoreSnapshot(snapshot: unknown): State;
}
```

Exact types can change during implementation. The important boundaries cannot:

- adapter owns its domain schema;
- platform owns authorization/session/concurrency/persistence;
- public and private mission data are separate;
- client payload is never trusted as final mastery truth.

---

# 8. Adapter registry

Game/version lookup must be explicit rather than dynamic arbitrary imports.

Conceptual example:

```ts
const ARCADE_ADAPTERS = {
  "number-bloom/v1": numberBloomV1Adapter,
  "cedi-city/v1": cediCityV1Adapter,
  "codebots/v1": codeBotsV1Adapter,
  "signal-shield/v1": signalShieldV1Adapter,
} satisfies Record<string, ArcadeGameAdapterAny>;
```

Requirements:

- unknown schemas fail closed;
- old schemas remain available while active sessions depend on them;
- mission records pin an exact schema version;
- a deployed code change cannot silently reinterpret an existing session under a new schema;
- migrations may transform snapshots only through explicit tested migration functions.

---

# 9. API surface

Final path naming can follow existing Next route conventions. The behavior below is the contract.

## 9.1 Start session

`POST /api/guardian/arcade/vnext/sessions`

Request:

```json
{
  "studentId": "...",
  "game": "number-bloom",
  "ageBand": "age_4_5",
  "node": 1
}
```

Server:

1. authenticate guardian;
2. require password-change policy as existing Arcade does;
3. enter tenant scope;
4. verify learner belongs to guardian/school;
5. verify age/progression availability;
6. select adapter/schema version through server config/feature flag;
7. create public/private mission + initial state;
8. persist session atomically;
9. return public envelope only.

Response:

```json
{
  "apiVersion": "arcade-session/v1",
  "sessionId": "...",
  "game": "number-bloom",
  "gameSchema": "number-bloom/v1",
  "status": "active",
  "sessionSequence": 0,
  "publicMission": {},
  "publicState": {}
}
```

## 9.2 Resume/read session

`GET /api/guardian/arcade/vnext/sessions/:sessionId`

Server verifies ownership and returns current public state at authoritative sequence.

No private mission fields are serialized.

## 9.3 Submit action

`POST /api/guardian/arcade/vnext/sessions/:sessionId/actions`

Request:

```json
{
  "gameSchema": "number-bloom/v1",
  "clientSequence": 12,
  "expectedSessionSequence": 11,
  "idempotencyKey": "uuid-or-client-generated-key",
  "actionType": "place",
  "payload": {}
}
```

Response:

```json
{
  "accepted": true,
  "sessionSequence": 12,
  "publicStateDelta": {},
  "safeFeedback": [],
  "checkpoint": null
}
```

The server may return the full public state instead of a delta in v1 if simplicity/reliability outweigh bandwidth. Do not prematurely optimize a delta protocol before the four slices establish state sizes.

## 9.4 Submit/checkpoint artifact

`POST /api/guardian/arcade/vnext/sessions/:sessionId/artifacts`

Used when a game needs to persist a larger constructed object such as a CodeBots program or Cedi City ledger snapshot.

Artifact submission does not automatically mean final completion.

## 9.5 Finish mission/session

`POST /api/guardian/arcade/vnext/sessions/:sessionId/finish`

Request includes expected sequence and optional final artifact reference/payload as defined by adapter.

Server:

- validates state is finishable;
- grades through pinned adapter;
- writes assessment/mastery/progression atomically;
- locks terminal session state;
- returns safe debrief/result.

## 9.6 Abandon/save-and-exit

A normal exit does **not** need a special answer array. Because actions/snapshots are already persisted, save-and-exit can simply mark last-seen/resumable state where policy requires.

---

# 10. Action concurrency and idempotency

School/mobile networks are imperfect. Double-submit protection is mandatory.

Each mutating action includes:

- `idempotencyKey` unique within session;
- `expectedSessionSequence`;
- optional monotonic `clientSequence` for diagnostics.

Server behavior:

### Duplicate idempotency key

Return the previously committed result without applying the action twice.

### Stale expected sequence

Return `409 SESSION_OUT_OF_DATE` with authoritative current sequence and enough safe state for client reconciliation/reload.

### Future/impossible sequence

Reject.

### Two tabs/devices

Only one action can advance a session from sequence N to N+1. Database transaction/optimistic concurrency must enforce this.

Never resolve conflicts by accepting both placements/transactions silently.

---

# 11. Persistence proposal

Names are illustrative; implementation should match repository conventions.

## `ArcadeGameSession`

Fields conceptually:

- id;
- schoolId;
- studentId;
- game;
- gameSchema;
- status;
- ageBand;
- progression/campaign reference;
- skillTargets JSON;
- publicMission JSON or immutable mission ref;
- privateMission JSON encrypted/protected at rest according to normal DB policy;
- currentSequence;
- currentSnapshotVersion;
- startedAt;
- lastActiveAt;
- completedAt;
- assessment/result refs.

## `ArcadeGameEvent`

- id;
- sessionId;
- sequence;
- idempotencyKey;
- actionType;
- validatedPayload JSON;
- safeResultCode;
- receivedAt;
- optional state hash;
- optional telemetry flags.

Unique constraints:

- `(sessionId, sequence)`;
- `(sessionId, idempotencyKey)`.

## `ArcadeGameSnapshot`

- sessionId;
- sequence;
- schemaVersion;
- snapshot JSON;
- createdAt.

Retention can later compact old snapshots/events subject to audit/reporting requirements.

## `ArcadeGameAssessment`

- sessionId;
- grader schema version;
- normalized skill evidence;
- game-specific summary;
- progression rewards;
- createdAt.

Do not accept assessment values from the browser.

---

# 12. Snapshot strategy

Event journals are useful for learning evidence and recovery but do not require replaying thousands of events on every load.

Suggested v1 policy:

- current authoritative state held in session/snapshot record;
- append accepted action event;
- update current state/snapshot in the same transaction where feasible;
- produce milestone snapshots every N significant actions or checkpoint;
- preserve event history needed for grading/diagnosis.

The adapter decides which transient visual state should **not** be persisted. A flower’s 300ms bounce animation does not belong in the database; which seed occupies which bed slot does.

---

# 13. Safe feedback model

Feedback returned during play must not accidentally disclose protected answers/tests.

Normalized wrapper:

```ts
type ArcadeSafeFeedback = {
  code: string;
  severity: "info" | "success" | "try-again" | "warning";
  messageKey?: string;
  message?: string;
  focusRef?: string;
  data?: Record<string, string | number | boolean>;
};
```

Game adapters control semantics.

Examples:

### Number Bloom

“Count this bed again.” Safe because the child can see the bed state.

### CodeBots

“Visible test 2 stopped at the blue gate.” Safe.  
“Hidden test expects turn-left at row 4” is **not** safe.

### Signal Shield

“One active session remains after the credential change.” Safe world-state feedback.  
“The correct sequence is revoke → reset → MFA” may be too revealing in an assessed first attempt.

---

# 14. Normalized mastery evidence

Games emit evidence into a shared reporting bridge:

```ts
type ArcadeSkillEvidence = {
  skillKey: string;
  evidenceType: string;
  outcome: "demonstrated" | "developing" | "not_yet";
  confidence: number; // normalized server-produced 0..1
  misconceptionCode?: string;
  artifactRef?: string;
  context?: Record<string, string | number | boolean>;
};
```

Rules:

- game grader generates it;
- browser cannot award itself mastery;
- confidence is not exposed as a child-facing probability unless UX explicitly justifies it;
- teacher report translates evidence into human language;
- title-specific evidence can remain richer in assessment JSON.

---

# 15. Four proof adapters

The first four adapters deliberately stress different parts of the architecture.

## 15.1 Number Bloom v1

### Public mission

- mechanic family;
- target quantity/relationship;
- visible manipulatives;
- bed/container layout;
- narration key;
- helper affordances.

### Private mission

- accepted mathematical target states;
- alternate valid compositions;
- misconception rules;
- mastery rubric.

### Actions

- place;
- move;
- remove;
- group/split;
- relationship-marker placement;
- help request;
- finish patch.

### State

Object locations and mathematical grouping state.

### Stress tested

High-frequency small direct-manipulation events and multiple valid final states.

---

## 15.2 Cedi City v1

### Public mission

- customer/order/business context;
- products/prices/stock;
- available notes/coins or account balances;
- shop/ledger state;
- objective/rules.

### Private mission

- authoritative transaction math;
- acceptable change/payment combinations;
- hidden later scenario variations;
- accounting/business rubric.

### Actions

- scan/add/remove basket item;
- move currency;
- give change;
- restock;
- choose supplier/price where mission supports it;
- post ledger transaction;
- close sale/day.

### State

Cash drawer, basket, stock, ledger, customer/business state.

### Stress tested

Atomic financial state transitions, exact decimal/currency rules and larger persistent simulation state.

---

## 15.3 CodeBots v1

### Public mission

- deterministic world;
- robot capabilities;
- allowed language constructs;
- starter program if any;
- visible tests;
- specification.

### Private mission

- protected tests;
- rubric/generalization constraints;
- execution resource limits.

### Actions/artifacts

- save program revision;
- run;
- step/reset may remain partly client-local but significant assessed runs can be journaled;
- request hint;
- submit program AST.

### State

Program revisions, current mission world/checkpoints, test results.

### Stress tested

Large structured artifact, deterministic execution, protected tests and secure sandbox boundary.

---

## 15.4 Signal Shield v1

### Public mission

- fictional incident brief;
- public evidence artifacts;
- accounts/devices/permissions/session state safe to expose;
- available defensive tools;
- public objectives.

### Private mission

- evidence truth model;
- acceptable containment states;
- misconception/feedback rules;
- mastery rubric.

### Actions

- inspect evidence;
- mark/tag;
- link evidence;
- verify;
- quarantine/report;
- revoke session;
- change simulated protection state;
- adjust permission;
- patch;
- submit case.

### State

Case evidence marks + affected account/device/network state.

### Stress tested

Investigation actions where many inspections are non-mutating but assessment requires a defensible action sequence/outcome.

---

# 16. Read-only inspection events

Not every UI click belongs in authoritative storage.

Distinguish:

### Ephemeral UI interactions

- open/close a purely visual panel;
- hover;
- scroll;
- decorative animation;
- camera movement.

These may be analytics only or not recorded.

### Learning-relevant inspections

- inspected the actual sender domain;
- opened a key evidence document;
- stepped through a CodeBots run;
- requested a count-along scaffold.

Adapters decide whether these become journaled learning evidence.

Avoid event spam merely because a UI emits many pointer events.

---

# 17. Client architecture

Each game runtime receives a typed session client wrapper rather than direct knowledge of the legacy round API.

Conceptual interface:

```ts
interface ArcadeSessionClient<Mission, State, Action, Artifact> {
  session: ArcadeSessionEnvelopeV1;
  mission: Mission;
  state: State;

  dispatch(action: Action): Promise<ActionResult<State>>;
  saveArtifact(artifact: Artifact): Promise<ArtifactResult>;
  finish(artifact?: Artifact): Promise<ArcadeDebrief>;
  refresh(): Promise<void>;
}
```

Game UI still owns optimistic animation and local transient state. The session client owns:

- sequence/idempotency;
- network retry policy;
- stale-state reconciliation;
- auth/error normalization;
- explicit offline state;
- safe server feedback delivery.

Do not create a universal React `GameQuestion` component in vNext.

---

# 18. Offline and flaky-network behavior

v1 does not need full offline authoritative grading, but it must fail gracefully.

## Required

- local transient play may continue only where safe;
- mutating actions show clear “saving/reconnecting” state if server confirmation is required;
- never claim mastery/reward before authoritative confirmation;
- idempotency allows retry after timeout;
- save/resume works after browser refresh once confirmed actions are persisted;
- client can refresh current authoritative sequence/state after conflict.

## Deferred option

A signed/bounded offline action queue may be investigated later for environments with poor connectivity, but it must not weaken tenant/assessment integrity.

---

# 19. Security model

## Authorization

Reuse existing guardian session and tenant boundaries.

Every vNext mutation verifies:

- authenticated actor;
- session school/tenant;
- learner relationship/access;
- session status;
- pinned game/schema.

## Input validation

- strict adapter action schema;
- bounded strings/arrays/numbers;
- payload-size limits;
- action-rate limits where needed;
- reject unknown discriminators/fields where safe parsing requires it.

## Answer/solution secrecy

Public serializers must be tested to ensure private mission fields never leak.

## CodeBots

Arbitrary learner text code is a separate sandbox security project. vNext API must support the artifact/run flow without assuming unsafe `eval`.

## Signal Shield

All identities/domains/accounts are fictional or controlled fixtures. Never solicit learner real credentials.

---

# 20. Performance model

The API architecture must not force every tiny drag motion through a network round-trip.

Adapters classify interactions:

### Authoritative discrete action

Example: seed placed into slot, sale posted, defensive control changed.

### Locally simulated continuous motion

Example: dragging seed between start/end points, robot animation frames, cursor movement.

Only meaningful state transitions are journaled.

For high-frequency titles, the client may batch a short series of validated operations if the adapter can apply them atomically/deterministically. Batching is an optimization after the basic contract works.

---

# 21. Telemetry separation

Do not conflate three streams:

1. **authoritative game actions** — required to reconstruct/grade state;
2. **learning evidence** — derived or selectively journaled for mastery diagnosis;
3. **product analytics** — UX/performance/funnel events.

A pointer hover may be analytics. A seed placement may be authoritative. A repeated one-off counting error may become learning evidence.

Separate retention and privacy policies can then evolve appropriately.

---

# 22. Error model

Suggested stable error codes:

- `ARCADE_SESSION_NOT_FOUND`;
- `ARCADE_SESSION_FORBIDDEN`;
- `ARCADE_SCHEMA_UNSUPPORTED`;
- `ARCADE_ACTION_INVALID`;
- `ARCADE_SESSION_OUT_OF_DATE`;
- `ARCADE_ACTION_ALREADY_APPLIED` (or return idempotent prior result);
- `ARCADE_SESSION_FINISHED`;
- `ARCADE_ARTIFACT_INVALID`;
- `ARCADE_GRADE_UNAVAILABLE`;
- `ARCADE_EXECUTION_LIMIT` (CodeBots-safe runtime);
- `ARCADE_SESSION_CONFLICT`.

Child-facing UI maps these to calm title-appropriate messages; raw technical errors stay in logs.

---

# 23. Legacy coexistence

The existing `/api/guardian/arcade` route remains unchanged initially.

## Launch routing

Server/feature config determines whether a title/node launches:

- legacy `ArcadeRound`; or
- vNext `ArcadeGameSession`.

Do not infer from client version alone.

## Progress bridge

vNext assessments write into the existing learner-facing progress/mastery model through a compatibility adapter until a later reporting redesign is justified.

## No dual-write grading

A session is either legacy or vNext. Do not submit the same assessed result through both systems and attempt to reconcile two truth sources.

## Resume

Sessions always resume using the schema they started with.

---

# 24. Feature flag / rollout plan

Suggested dimensions:

- school/tenant;
- learner cohort;
- game;
- age band;
- progression node;
- internal QA vs pilot;
- percentage only after deterministic eligibility rules are established.

Rollout order per game:

1. local/dev fixtures;
2. automated integration;
3. internal dogfood;
4. controlled test learner accounts;
5. representative child playtest environment;
6. pilot schools/cohort if product process supports it;
7. staged production replacement;
8. legacy path retirement after stability/evidence review.

---

# 25. Testing plan

## Registry tests

- every configured schema resolves to exactly one adapter;
- unknown schema rejected;
- pinned old schema remains resolvable while active sessions exist.

## Public/private serialization tests

For each adapter:

- public mission contains required fields;
- private solution/rubric fields absent;
- snapshot public serializer cannot expose private state.

## Action contract tests

- malformed discriminators rejected;
- numeric/string/list bounds enforced;
- foreign object/session IDs rejected;
- stale sequence conflict;
- duplicate idempotency returns prior result;
- completed session rejects mutation.

## Grading tests

- multiple valid solutions accepted where rules permit;
- common misconceptions produce expected safe feedback/evidence;
- client cannot submit its own mastery/reward;
- server recomputes final outcome.

## Persistence tests

- action + sequence + state update transactional;
- simulated retry does not duplicate effects;
- snapshot restores equivalent state;
- resume after process restart works.

## End-to-end journeys

Per prototype title:

- start;
- perform meaningful action;
- refresh/resume;
- continue;
- finish;
- report/progression visible;
- no private solution in network payload fixtures.

## Property/fuzz tests

Especially valuable for:

- Number Bloom state permutations;
- Cedi City currency arithmetic/invariants;
- CodeBots interpreter step limits;
- Signal Shield case state machines.

---

# 26. Observability

Required structured logs/metrics:

- session starts/completions by game/schema;
- action reject rate by code;
- sequence conflicts;
- idempotent retries;
- adapter processing latency;
- snapshot size;
- mission payload size;
- grading latency/failure;
- CodeBots execution-limit kills;
- client reconnect/resume frequency;
- schema-specific crash/error rate.

Never log secrets/private learner content unnecessarily.

---

# 27. Database migration strategy

Before implementing migrations:

1. inspect current Prisma/database conventions;
2. design minimal vNext tables without modifying/removing legacy ArcadeRound;
3. add migration + generated client changes;
4. test migration on clean state and production-like fixture;
5. add rollback/forward-fix strategy;
6. deploy database support before enabling any vNext game flag.

No legacy data conversion is required for the first prototype if vNext sessions are new records.

---

# 28. Work packages

## WP-A — Domain contracts

- TypeScript envelope/evidence/error types;
- adapter interface;
- game registry;
- strict runtime validators.

## WP-B — Persistence

- vNext schema/migration;
- session/event/snapshot repository;
- idempotency/concurrency transaction tests.

## WP-C — API routes

- start/read/action/artifact/finish;
- auth/tenant/progression integration;
- safe serializers.

## WP-D — Client session SDK

- typed dispatch;
- retries/idempotency;
- stale-state recovery;
- resume;
- error mapping.

## WP-E — Number Bloom adapter + greybox

First high-frequency direct-manipulation proof.

## WP-F — Cedi City adapter + greybox

Financial/simulation proof.

## WP-G — CodeBots interpreter + adapter + greybox

Executable artifact proof.

## WP-H — Signal Shield state machine + adapter + greybox

Evidence/investigation proof.

## WP-I — mastery/report bridge

Normalize vNext evidence into current reporting/progression safely.

## WP-J — security/performance/playtest gates

Independent promotion requirement, not cleanup at the end.

---

# 29. Recommended implementation sequence

1. Create domain types/adapter registry behind zero enabled games.
2. Add persistence + API contract with a tiny fixture adapter used only in tests.
3. Prove idempotency, concurrency, public/private separation and resume.
4. Implement Number Bloom v1 adapter + greybox.
5. Run interaction/playtest review; change the platform contract if direct manipulation exposes flaws.
6. Implement CodeBots v1 deterministic interpreter/adapter proof.
7. Implement Signal Shield v1 state machine proof.
8. Implement Cedi City v1 financial state proof.
9. Only then declare the vNext platform shape stable enough for the next migration wave.

The order of the four proof games may change for staffing reasons, but at least one direct-manipulation, one executable-artifact, one investigation and one economy simulation must stress the contract before generalization.

---

# 30. RFC acceptance criteria

The RFC is ready to become implementation work when the team agrees that:

- the platform/game ownership boundary is clear;
- universal answer strings are no longer required;
- public/private mission separation is enforceable/testable;
- action sequencing/idempotency behavior is unambiguous;
- save/resume model covers constructed world state;
- four proof games fit without inventing a universal gameplay component;
- legacy coexistence requires no risky big-bang conversion;
- CodeBots text execution is explicitly separated into a sandbox security track;
- thinking-time policy remains a product rule outside API scoring tricks.

This RFC should be revised if a greybox proves the contract awkward. The architecture serves the games; the games do not contort themselves to preserve this document.
