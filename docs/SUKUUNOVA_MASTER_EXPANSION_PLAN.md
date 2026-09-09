# SukuuNova master expansion plan

## Product direction
SukuuNova should grow the current Learning Arcade into a full **Learning Universe** rather than a collection of unrelated mini-games. The existing `ArcadeRound` engine remains the canonical attempt/progression record. New work should generalize it rather than introduce a second practice engine.

The target launch catalogue is **64 educational games** across numeracy, literacy, science, social studies/geography/civics, ICT/computing, logic/memory, financial literacy and life skills. Games should be simple to understand, fast to enter, visually engaging, accessible on phones, and deep enough to scale from early learners to SHS students.

## Core learning model

### Age bands
- `age_4_5`: roughly KG / early-years practice.
- `age_6_8`: roughly Basic 1-3.
- `age_9_11`: roughly Basic 4-6.
- `age_12_14`: roughly JHS 1-3.
- `age_15_18`: roughly SHS.

Age selection is a **content preference/recommendation**, not an authorization boundary. Class/standard remains the school-owned academic context. By default, a learner may choose the recommended age band or an easier band for revision. Schools may optionally allow one band above the learner's standard. A selected age must never expose another learner's records or official grades.

### Standard bands
- `kg`: KG 1-KG 2.
- `basic_1_3`: Basic 1-Basic 3.
- `basic_4_6`: Basic 4-Basic 6.
- `jhs`: JHS 1-JHS 3.
- `shs`: SHS 1-SHS 3/4.

### Difficulty
Difficulty is independent from age/standard. A learner can progress from difficulty 1 to 5 **inside the same suitable content band**. Strong performance should deepen reasoning, distractor quality, multi-step work and speed requirements without silently advancing a child into older curriculum content.

### Reusable game engines
Do not build 64 unrelated React applications. Build a small stable engine family and map game definitions onto it:
1. `choice_quiz` - single/multiple-choice rounds.
2. `rapid_fire` - optional timed high-frequency practice.
3. `match_pairs` - concept/answer, word/meaning, symbol/name pairs.
4. `sort_sequence` - arrange steps, timelines, sentences or numbers.
5. `classify_buckets` - drag/select items into categories.
6. `tile_builder` - build words, equations, sentences or sequences from tiles.
7. `memory_flip` - memory-card matching.
8. `grid_hunt` - word, number, coordinate or clue search.
9. `path_choice` - branching decision/puzzle path.
10. `map_label` - map/location identification.
11. `simulation` - simple money, health, science or entrepreneurship decisions.
12. `typed_response` - spelling, short numeric/text answers where exact or tolerant server marking is safe.

Every engine must support keyboard-only use, touch targets, screen-reader labels, reduced-motion preferences, save/resume, server-side marking, immutable completed awards and responsive layouts.

## Per-game settings contract
Every game definition should provide:
- stable `gameKey`, display name, short description and icon/symbol;
- subject and category;
- allowed age bands and standard bands;
- default/recommended age and standard band;
- engine type;
- difficulty range 1-5;
- allowed round lengths, default round length and optional marathon mode;
- timer policy: `none`, `optional`, or `challenge_only`;
- hint policy and explanation policy;
- retry policy;
- scoring formula and leaderboard metric;
- XP/stars/badge rules;
- curriculum/content tags;
- accessibility flags such as read-aloud suitability, colour-independent cues and reduced-motion support;
- whether the game is available offline/read-only when a round has already been generated;
- school enable/disable override and teacher-curated content-pack eligibility.

School-level settings should be able to enable/disable a game, restrict age/standard bands, choose default round length, enable optional timed challenges, set daily practice guidance, and attach approved school-authored content packs without changing global game code.

## 64-game launch catalogue

| # | Game | Category | Main skill | Suggested bands | Engine |
|---|---|---|---|---|---|
| 1 | Number Pop | Numeracy | number recognition/counting | 4-8 | choice_quiz |
| 2 | Count & Match | Numeracy | quantities and numerals | 4-8 | match_pairs |
| 3 | Addition Dash | Mathematics | addition fluency | 6-14 | rapid_fire |
| 4 | Subtraction Rescue | Mathematics | subtraction fluency | 6-14 | path_choice |
| 5 | Times Table Turbo | Mathematics | multiplication facts | 8-14 | rapid_fire |
| 6 | Division Quest | Mathematics | division facts | 8-14 | choice_quiz |
| 7 | Fraction Forge | Mathematics | fractions/equivalence | 9-18 | tile_builder |
| 8 | Decimal Defender | Mathematics | decimal place/value/operations | 9-18 | choice_quiz |
| 9 | Percentage Power | Mathematics | percentage reasoning | 12-18 | choice_quiz |
| 10 | Ratio Race | Mathematics | ratios/proportions | 12-18 | choice_quiz |
| 11 | Equation Escape | Mathematics | algebra/equations | 12-18 | path_choice |
| 12 | Geometry Builder | Mathematics | shapes/angles/properties | 6-18 | classify_buckets |
| 13 | Measurement Master | Mathematics | units/measurement | 6-18 | match_pairs |
| 14 | Money Math Market | Mathematics | money/change/practical arithmetic | 6-18 | simulation |
| 15 | Data Detective | Mathematics | tables/charts/statistics | 9-18 | choice_quiz |
| 16 | Mental Math Blitz | Mathematics | mixed mental calculation | 8-18 | rapid_fire |
| 17 | Letter Hunt | Literacy | letter recognition | 4-7 | grid_hunt |
| 18 | Sound Match | Literacy | phonics/sounds | 4-8 | match_pairs |
| 19 | Word Builder | Literacy | vocabulary/word construction | 6-18 | tile_builder |
| 20 | Spelling Sprint | Literacy | spelling | 6-18 | typed_response |
| 21 | Vocabulary Vault | Literacy | word meaning | 8-18 | choice_quiz |
| 22 | Synonym Switch | Literacy | synonyms | 8-18 | match_pairs |
| 23 | Antonym Arena | Literacy | antonyms | 8-18 | match_pairs |
| 24 | Grammar Fix | Literacy | grammar correction | 9-18 | choice_quiz |
| 25 | Sentence Scramble | Literacy | sentence structure | 6-18 | sort_sequence |
| 26 | Reading Detective | Literacy | inference/evidence | 9-18 | choice_quiz |
| 27 | Comprehension Quest | Literacy | reading comprehension | 8-18 | path_choice |
| 28 | Punctuation Patrol | Literacy | punctuation | 7-18 | tile_builder |
| 29 | Tense Trek | Literacy | verb tense/control | 8-18 | choice_quiz |
| 30 | Essay Planner Challenge | Literacy | paragraph/essay organisation | 12-18 | sort_sequence |
| 31 | Body Explorer | Science | human body/systems | 6-18 | match_pairs |
| 32 | Living or Non-Living? | Science | classification | 4-10 | classify_buckets |
| 33 | Food Chain Builder | Science | ecosystems/food chains | 8-16 | sort_sequence |
| 34 | Matter Sort | Science | states/properties of matter | 8-16 | classify_buckets |
| 35 | Force & Motion Lab | Science | forces/motion | 9-18 | simulation |
| 36 | Energy Quest | Science | forms/transfers of energy | 9-18 | choice_quiz |
| 37 | Circuit Logic | Science | basic electricity/circuits | 10-18 | path_choice |
| 38 | Earth & Weather | Science | earth/weather/climate basics | 6-16 | choice_quiz |
| 39 | Space Explorer | Science | solar system/space | 6-18 | map_label |
| 40 | Chemistry Symbol Match | Science | elements/symbols/formula basics | 12-18 | match_pairs |
| 41 | Ghana Map Master | Social/Geography | Ghana geography | 8-18 | map_label |
| 42 | Regions & Capitals | Social/Geography | Ghana regions/capitals | 8-18 | match_pairs |
| 43 | Africa Explorer | Geography | African countries/features | 9-18 | map_label |
| 44 | World Flags & Capitals | Geography | countries/flags/capitals | 8-18 | match_pairs |
| 45 | History Timeline | History | chronology/events | 10-18 | sort_sequence |
| 46 | Civic Duty Challenge | Civics | rights/responsibilities/governance | 10-18 | path_choice |
| 47 | Culture & Heritage Match | Social Studies | Ghanaian culture/heritage | 7-18 | match_pairs |
| 48 | Environment Guardian | Social/Science | sustainability/environment | 7-18 | simulation |
| 49 | Keyboard Ninja | ICT | keyboard familiarity/typing | 7-18 | typed_response |
| 50 | Hardware Match | ICT | device/components | 7-18 | match_pairs |
| 51 | File & Folder Quest | ICT | file management concepts | 8-18 | path_choice |
| 52 | Coding Sequence | Computing | algorithmic order | 9-18 | sort_sequence |
| 53 | Binary Basics | Computing | binary/representation | 12-18 | tile_builder |
| 54 | Cyber Safety Mission | Computing | safe online decisions | 8-18 | simulation |
| 55 | Pattern Pulse | Logic | patterns | 4-18 | choice_quiz |
| 56 | Memory Matrix | Memory | working memory | 4-18 | memory_flip |
| 57 | Odd One Out | Logic | classification/reasoning | 4-18 | choice_quiz |
| 58 | Sequence Lab | Logic | sequences | 6-18 | sort_sequence |
| 59 | Logic Grid Lite | Logic | elimination/deduction | 10-18 | grid_hunt |
| 60 | Puzzle Path | Logic | multi-step reasoning | 7-18 | path_choice |
| 61 | Budget Boss | Financial literacy | budgeting/saving | 10-18 | simulation |
| 62 | Healthy Choices | Life skills | healthy decision-making | 6-18 | path_choice |
| 63 | Road Safety Challenge | Life skills | road/pedestrian safety | 6-16 | simulation |
| 64 | Entrepreneurship Simulator | Business/life skills | cost/revenue/profit/choices | 12-18 | simulation |

The catalogue should remain data-driven so later additions (e.g. local-language literacy, music theory, agriculture, accounting or SHS elective-specific games) can be added as definitions/content packs rather than a new architecture.

## Engagement without unhealthy mechanics
- Fast entry: learner chooses child -> age/standard filter -> category/game -> play.
- Optional favourites and recently played games.
- XP, stars, levels, streaks and badges remain educational progress indicators rather than purchasable currency.
- Daily/weekly missions should reward breadth (for example, play one maths and one literacy game), not endless grinding.
- No loot boxes, random paid rewards, wagering, purchases or gambling-like mechanics.
- Timers are optional challenge modes, never required for accessibility or ordinary progress.
- Younger age bands default to no timer, larger controls, shorter rounds, audio/read-aloud-ready prompts and gentler feedback.
- Older bands may expose challenge modes, multi-step problems and longer rounds.

## Leaderboards and ranking
Each game gets its own leaderboard. The default leaderboard scopes are:
- class;
- standard band;
- age band;
- school;
- weekly, monthly and all-time views.

Do **not** rank a KG learner against an SHS learner. Do not expose a public cross-school leaderboard by default.

Leaderboard score should be server-computed from completed immutable rounds. Recommended ranking formula:
- correctness is dominant;
- difficulty contributes a controlled multiplier;
- speed contributes only when the specific game has an enabled timed challenge;
- a rolling best-N or capped weekly score prevents unlimited grinding from dominating rankings;
- tie breakers: accuracy, higher suitable difficulty, fewer attempts, then completion timestamp.

Privacy defaults:
- school-only leaderboard;
- first name + last initial or school-approved nickname rather than full public identity;
- guardian/school opt-out supported;
- no phone, admission number, guardian identity or other sensitive data on rankings.

Anti-cheat/integrity:
- server owns question generation/answer keys/scoring;
- completed rounds are immutable and retry-idempotent;
- round snapshots store game version, age band, standard band, difficulty and scoring version;
- duplicate/concurrent finish protection remains;
- leaderboard service ignores invalidated/admin-reset rounds;
- anomaly detection can flag impossible completion patterns for review rather than silently banning learners.

## Data/model expansion for Arcade
Prefer additive migrations and preserve deployed `ArcadeRound` history.

Recommended additions:
- extend `ArcadeRound` with `gameVersion`, `ageBand`, `standardBand`, `engine`, `questionCount`, `score`, `maxScore`, `durationMs`, `scoringVersion` and optional `contentPackId` snapshots;
- `ArcadeLearnerProfile`: student-scoped preferred age band, favourite games, accessibility preferences and leaderboard opt-out;
- `ArcadeSchoolGameSetting`: school/game enablement, allowed bands, timer policy, default round length and school content-pack policy;
- `ArcadeContentPack`: school/global curated question/content banks with subject, curriculum tags, version, publication status and provenance;
- optional `ArcadeRoundFlag`/review state for invalidated or suspicious rounds without deleting historical attempts.

Leaderboards should initially be calculated from indexed completed rounds rather than stored as a second source of truth. Add snapshots/materialized summaries only if measured performance requires them.

## Arcade implementation sequence
### A1 - Platform foundation
- Introduce the data-driven game catalogue and engine registry.
- Generalize current hard-coded 3-game API validation.
- Generalize round length beyond exactly five questions while preserving old rounds.
- Add age/standard selection, learner profile and per-school game settings.
- Add game-version/scoring snapshots to rounds.
- Add safe leaderboard query service and ranking UI.
- Preserve RLS, guardian-child scope, advisory locks, idempotency and audit logging.

### A2 - First 16 games / engine proving
Ship a representative cross-section first: Number Pop, Addition Dash, Times Table Turbo, Fraction Forge, Money Math Market, Letter Hunt, Word Builder, Spelling Sprint, Sentence Scramble, Body Explorer, Matter Sort, Ghana Map Master, Keyboard Ninja, Pattern Pulse, Memory Matrix and Budget Boss. This validates every major interaction engine before mass content expansion.

### A3 - Expand to 40 games
Add the remaining core maths/literacy/science/social/ICT catalogue, school settings UI, favourites, missions, badges and class/standard/school leaderboards.

### A4 - Complete 64 launch games
Finish life-skills/business games, richer difficulty packs, teacher-curated packs, accessibility QA and age/standard coverage review. No game is considered complete until it has meaningful content across every advertised band/difficulty.

## Deeper library + student resources
The existing library circulation service remains the base. Expand it rather than creating a new resource store.

### Physical library depth
- copy/accession records per physical item;
- barcode/QR, shelf/location, acquisition source, condition and availability;
- checkout, return, renewal, reservation/hold, lost/damaged workflows;
- circulation and borrower history with pagination;
- configurable loan periods by borrower type/resource type;
- overdue/exception queues, reminders and audit trail;
- optional school-configured fines/waivers only where the school uses them;
- stocktake/inventory reconciliation and missing-copy review.

### Digital/student resource hub
- resource types: PDF/document, safe external link, video reference, image/reference material and teacher-created notes;
- subject, class, standard, term, topic and curriculum tags;
- teacher-created reading/resource lists linked to lessons, homework and TeacherAcademicWork;
- student favourites, bookmarks, recently opened and completion/read markers;
- search/filter by subject, class, topic, format and availability;
- guardian visibility into recommended resources without exposing teacher-only materials;
- rights/visibility controls for school-only/licensed/external resources;
- teacher and leadership analytics for resource reach/engagement without pretending engagement equals mastery.

### Reading engagement
- age/standard reading recommendations;
- reading challenges and optional badges;
- book/resource reviews moderated by school policy;
- "continue reading" and reading history;
- recommended library resources alongside relevant Arcade/academic topics.

## Operations expansion

### Finance integrity + intelligence
- billed/collected/outstanding totals, collection rate, aging and trends;
- invoice/payment allocation, reversals, credits/adjustments, discounts/scholarships and approvals;
- receipt integrity and duplicate-payment protection;
- cashier/day reconciliation and exception queues;
- configurable fee plans/installments and defaulter follow-up views;
- budget/cashflow reporting where supported by real ledger data;
- role-specific finance dashboards with actionable exceptions rather than raw counts.

### Transport
- vehicles, drivers/assistants, routes, stops and student assignments;
- morning pickup / afternoon drop manifests;
- boarding/drop confirmation and guardian-safe status;
- route capacity, late/missed pickup and incident queues;
- vehicle documents, service/maintenance reminders and availability;
- optional GPS/provider integration later, without making GPS mandatory for the core workflow;
- transport fee mapping where required.

### Feeding/canteen
- meal plans/menu calendar;
- student meal entitlement/subscription;
- meal issue/check-in;
- basic stock/ingredient or prepared-meal inventory where practical;
- vendor/supplier and purchase records where the school manages them;
- daily served/not-served counts and exception reporting;
- dietary/meal notes only where genuinely needed and permission-protected.

### Unified communications
- staff-to-family and family-to-staff in-app communication;
- announcements, class/role/recipient groups and templates;
- SMS/WhatsApp/email provider routing through the existing Message lifecycle;
- delivery, failure, retry and read-state visibility;
- emergency broadcasts with explicit priority and audit trail;
- attachments governed by safe file rules;
- message search, conversation context and unread queues;
- school communication analytics focused on delivery/reach, not private-message content mining.

### Wider operations control
Bring existing HR/staff, admissions, attendance/devices, inventory/assets, visitors/security and maintenance signals into one Operations Control Center. Do not duplicate their underlying services; aggregate exceptions and shortcuts.

## Leadership intelligence
Create a role-aware Leadership Intelligence Center using verified tenant data and drill-through links.

### Executive overview
- attendance today vs baseline, unexplained absences/late arrivals;
- fee collection, aging and unusual reversal/adjustment activity;
- staff attendance/workforce exceptions;
- report-card/gradebook completion and approval bottlenecks;
- timetable coverage/gaps and substitute needs;
- admissions/enrolment pipeline;
- transport/feeding operational exceptions;
- library overdue/resource activity;
- communication delivery failures/unread critical notices;
- academic performance trends and released-result exceptions;
- school configuration/readiness health.

### Intelligence behavior
- every alert should show the evidence/count/source period;
- provide the next action and a direct drill-through route;
- separate facts from AI-generated interpretation;
- never invent trends when the data window is too small;
- support daily/weekly/monthly views and school timezone;
- role-specific views for Owner/Principal/Admin, Academics, Finance, HR, Admissions, Front Desk/Security and Transport;
- exception queues should be resolvable/acknowledgeable where the underlying workflow supports resolution;
- platform owner receives network-wide school health without leaking one school's data into another school's staff view.

## Whole-system production certification
The system is not "complete" merely because CI is green. Final certification needs both automated and browser/deployment evidence.

### Automated gates
- clean database bootstrap and all additive migrations under non-superuser/non-bypass-RLS role;
- Prisma generation/validation;
- TypeScript;
- design-token, pilot-readiness and navigation integrity guards;
- ESLint;
- unit/integration/security tests;
- optimized production build;
- exact-head verification after the final code change.

### Security certification
- cross-tenant IDOR tests on every student/staff/guardian/finance/resource/arcade route;
- guardian-child relationship tests for every learner-facing module;
- role/permission tests for school and platform operations;
- RLS/FORCE RLS and same-school FK coverage for new tenant models;
- CSRF/session/cookie assumptions reviewed for write routes;
- rate/abuse protection for authentication, messaging and high-frequency game APIs;
- file/link/attachment validation;
- audit coverage for accountable writes;
- idempotency/concurrency tests for payments, attendance, messaging, submissions, Arcade awards and other retry-prone workflows.

### Browser/mobile journey certification
At minimum certify real responsive journeys for:
- platform owner;
- school Owner/Admin/Principal;
- academics/HOD;
- teacher;
- finance/cashier;
- HR;
- admissions;
- front desk/security;
- transport;
- guardian with one child;
- guardian with multiple children.

Journeys include login/password change, dashboards, CRUD/write workflows, empty states, error states, offline/retry behavior where supported, print/download, child switching, mobile navigation and accessibility basics.

### Reliability/operations certification
- production environment variables/secrets validated;
- `RISK_SCAN_CRON_SECRET` configured and scheduled risk scan observed successful;
- migrations rehearsed against a production-like data copy or representative seeded dataset;
- backup/restore procedure documented and exercised;
- message providers and scheduled jobs tested with failure/retry scenarios;
- monitoring/health endpoints and actionable logs checked;
- remaining build warnings triaged and material warnings fixed;
- performance smoke tests for dashboards, large classes, leaderboards, library search and reports;
- release checklist records exact commit SHA, CI run, migration count, known limitations and rollback path.

## Master delivery order
1. Arcade A1 foundation: catalogue/settings/profile/round snapshots/leaderboards.
2. Arcade A2 first 16 games and all reusable interaction engines.
3. Arcade A3/A4 to 64 fully contented games with age/standard coverage.
4. Deeper Library + Student Resource Hub.
5. Finance/Transport/Feeding/Unified Communications and Operations Control Center.
6. Leadership Intelligence Center and exception workflows.
7. Whole-system security, browser/mobile, performance and deployment certification.

Parallel work is acceptable only when it does not create competing sources of truth. Preserve existing canonical engines (`ArcadeRound`, `TeacherAcademicWork`, Message lifecycle, finance/attendance services, library circulation, guardian relationship scope) and extend them additively.

## Definition of done
The expansion is complete only when the 64-game catalogue is genuinely playable at its advertised age/standard levels, leaderboards are privacy-safe and server-verified, library/resources and operations are connected to real school workflows, leadership intelligence is evidence-backed, and the final exact production head passes automated gates plus documented browser/mobile/deployment certification.