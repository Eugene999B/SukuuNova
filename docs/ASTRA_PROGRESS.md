# Astra progress

## Verified current checkpoint
- Current `main` code checkpoint: `56778fb259be2d80845a21433a32206464491c1d`.
- PR #87 final verified head: `aed4b578d2b2c0cb1a7635654f75d34c7538fc4c`.
- Full Build verification: GitHub Actions run `34396226932` — SUCCESS.
- **83 migrations** applied under a `NOSUPERUSER NOBYPASSRLS` PostgreSQL test role; Prisma generation/validation, TypeScript, design-token/pilot/navigation lint, ESLint, all tests and optimized production build passed.
- Test result: **314 tests in 59 files passed**. Production build generated all 225 static pages successfully.
- Repository work in these tranches ran directly on GitHub with expected-head merges; no history rewrite.
- This documentation-only checkpoint records already verified code and does not require a redundant CI run.

## Learning Universe / Arcade — COMPLETE
- The SukuuNova Learning Universe now contains **64 unique, runtime-ready educational games**. This planned expansion is complete and merged into `main`.
- The catalogue spans Mathematics/Numeracy, English/Literacy, Science, Social Studies/Geography/Civics, ICT/Computing, Logic/Memory and practical/life-skills content.
- Existing historical game keys (`math`, `word`, `logic`) and all prior `ArcadeRound` history remain valid; the expansion was additive rather than a replacement scoring system.
- Every game carries age/standard suitability, category/subject metadata, engine identity, difficulty range, round-length policy, timer/challenge settings and school enable/disable authority.
- Learner academic boundaries are explicit: KG, Basic 1–3, Basic 4–6, JHS and SHS standards map to recommended age bands while adaptive difficulty deepens content inside the allowed standard instead of silently promoting a learner into an older curriculum.
- Difficulty adapts using accuracy percentages so variable 5/10/15/20-question rounds behave correctly.
- Server-generated content supports difficulty levels 1–5. Answer keys and explanations remain private until secure server grading completes.
- Game settings are snapshot into rounds so later catalogue/settings changes cannot rewrite historical round meaning.

### Reusable game engines
The 64 games reuse shared, tested engines rather than 64 isolated mini-apps:
- choice / rapid-fire
- match pairs
- sort sequence
- classification buckets
- path choice
- tile builder
- typed response
- schematic map label
- grid hunt
- memory flip
- simulation
- shared physics controls for press/rebound, dragging and ordering

### Physics and interaction quality
- Pointer/touch drag-and-snap ordering is implemented with movement thresholds and target highlighting.
- Tile/order controls settle with spring-style feedback while preserving keyboard arrow controls and explicit movement buttons.
- Choice/path interactions use consistent physical press/rebound feedback instead of plain form-button behavior.
- Grid hunts use compress/spring cell feedback.
- Map games use marker/label lock-on motion and explicitly identify their boards as learning schematics rather than survey-accurate maps.
- Memory games use actual reveal/re-hide/confirm behavior.
- Simulations use physical decision levers and responsive state meters; UI meters animate the selected decision state but do not fabricate scientific/economic outcomes before server grading.
- `prefers-reduced-motion` fallbacks preserve all controls without forced motion.
- Physics state is never scoring truth: the client serializes an answer and the server validates/grades it independently.

### Ranking, progression and privacy
- Leaderboards are derived from completed rounds rather than a duplicate scoring ledger.
- Ranking scopes support class, standard, age and whole-school contexts with weekly, monthly and all-time periods.
- Privacy-safe learner display names are used; admission numbers, guardian details and contact information are not leaderboard data.
- XP, stars, streaks, recent results, progression and badges remain connected to the existing round engine.
- Best/leaderboard scoring uses server-calculated completed-round results.
- School-level game disable rules remain authoritative even when a content pack is runtime-ready.

### Arcade safety and regression coverage
- `ArcadeRound` and `ArcadeGameSetting` retain FORCE RLS / tenant protection.
- Guardian-to-student relationship checks continue to gate learner Arcade access.
- Concurrent round starts preserve one resumable round where required.
- Saved drafts/resume never expose answer keys.
- Sort/build/world order answers reject forged, duplicate or missing tiles.
- Typed grading distinguishes forgiving spelling normalization from exact keyboard-copy tasks.
- Per-task `correct` feedback is server-authoritative and appears only after completion.
- Scene metadata exposed before completion is answer-safe; keys/explanations remain server-private.
- Regression suites prove all four content layers combine into exactly 64 unique runtime game keys and all 64 are live in the effective catalogue unless a school explicitly disables one.
- Final A5 verification: **314 tests / 59 files**, all 83 restricted-role migrations, TypeScript, lint and production build passed in run `34396226932`.
- PR #86 established the 40-game physics baseline and PR #87 completed the final 24 physical-world games.

## Guardian multi-child + messaging boundary — COMPLETE
- Centralized guardian family scope; guessed/unlinked learner IDs are denied rather than falling back to another child.
- Attendance, released Academics/Results, Assignments and Fees preserve selected-child context without mixing records.
- Released-score visibility is child-specific: one sibling's published report cannot expose another sibling's unreleased scores.
- `/guardian/academic` preserves initial selected-child context while still re-verifying the Guardian-to-Student relationship server-side.
- Guardian Messages page/API use the dedicated guardian session. Guardian rows are revalidated before inbox/send/read operations.
- Read state is metadata (`readAt`) and no longer corrupts delivery status or sender identity.
- Outgoing guardian message audits reference the real Message ID.
- Verified code SHA: `58ccba6c54d5a3d45cc3415079eb9af6d5010178`; run `34385055602` passed.

## Structured lesson planning + academic review — COMPLETE
- Structured LessonPlan fields cover curriculum, outcomes, prior knowledge, materials, lesson stages, differentiation, assessment, conclusion, homework/resources and reflection.
- Drafts may be incomplete; review submission requires the professional core sections.
- Review lifecycle is explicit: author draft/returned -> submit -> reviewer approve/request changes -> teacher resubmission -> approved -> reflection/completed -> archived.
- Reviewers cannot approve their own plan or approve a returned plan before teacher resubmission.
- Revision requests require a reason category and written note; every review is preserved in `LessonPlanReview` history.
- Completion requires a teacher reflection and completed evidence remains readable after archival.
- Term locking, teaching assignment checks, optimistic timestamps, advisory workflow locks, tenant scope and audit logging remain enforced.
- Migration: `20260909184000_structured_lesson_planning`.
- Verified code SHA: `e8d68072867c16aed5db7802368b3d4b40e1dc1a`; run `34381148702` passed.

## Connected academic work + retry policy — COMPLETE
- `TeacherAcademicWork` is the canonical learner assignment/submission engine; legacy Homework is bridged into it rather than owning a second response system.
- Objective work supports multiple choice, multiple select, true/false, short answer, fill blank, numeric and ordering plus teacher-reviewed written responses.
- Automatic grades write into the canonical gradebook while manual teacher corrections remain protected.
- Teacher work supports configurable attempt limits 1–10 with highest-attempt or latest-attempt gradebook policy.
- Every attempt and response remains historical; retries are explicit and concurrent retry clicks cannot create duplicate attempts.
- Guardian attempt history is read-only after completion and respects term locks/deadlines.
- Migrations: `20260909181000_link_homework_academic_delivery`, `20260909182000_teacher_academic_attempt_policies`, `20260909183000_teacher_academic_attempt_history`.
- Retry tranche verified code SHA: `ec1d375480aa000809245842c7ffa722741613f5`; run `34379271998` passed.

## Other verified foundations
- Library: connected catalogue/circulation service, borrower scoping, learner selection, loan duration, returns, availability, idempotent issue/return, locking, active-learner checks, URL safety and audit logging. Deeper copy/history/student-resource workflows remain.
- Recruitment: repaired metadata, candidate stage controls, stable public application receipts, idempotent retries and atomic staff conversion with authority checks.
- School access/RBAC: safe default-role synchronization, Owner continuity, Owner-reviewed default-role upgrades, effective-rights previews and forced-password onboarding.
- Attendance/biometrics: IN/OUT handling, QR/face/fingerprint/card paths, learner biometric readiness, portrait source controls, device/gateway integration and concurrency protection.
- Reporting/download reliability: bounded report loads, controlled retry, direct user-click print windows, attachment downloads and resource-ready printing.
- Role Intelligence Home: role-specific school leadership, academics, HR, admissions, front desk/security, transport, finance, teacher and guardian dashboards use real tenant data rather than fake KPI values.

## Important migrations / integrity
- `20260909120000_teacher_academic_tenant_safety`: FORCE RLS and same-school relationships for the academic submission engine.
- `20260909180000_validate_teacher_academic_tenant_fks`: validates historical teacher-academic tenant foreign keys.
- `20260909181000_link_homework_academic_delivery`: bridges Homework into TeacherAcademicWork.
- `20260909182000_teacher_academic_attempt_policies`: retry count/result policy.
- `20260909183000_teacher_academic_attempt_history`: historical multi-attempt identity.
- `20260909184000_structured_lesson_planning`: structured lessons and FORCE-RLS review history.
- `20260909185000_arcade_universe_foundation`: generalized Arcade game/settings/round foundation for the 64-game universe.
- Previously deployed migrations remain additive; do not rewrite them.

## Architecture / current subsystem
- Completed student-learning subsystem: 64-game Learning Universe with reusable physics-rich engines, standards/age controls, secure grading, progression, school settings and leaderboards.
- `ArcadeRound` remains the canonical Arcade attempt/history record. Do not introduce a second scoring ledger for future games.
- `TeacherAcademicWork` remains the canonical learner academic assignment/submission engine.
- `Homework` remains bridged into TeacherAcademicWork for learner delivery.
- `LessonPlan` remains a separate teacher preparation/leadership review artefact.
- Guardian child selection remains view context only; authorization must always be re-established from Guardian-to-Student relationships server-side.
- Sensitive areas remain authorization, Owner governance, school access, academic authoring/submission, gradebook canonical entry, guardian family scope, Arcade scoring/settings, reporting and tenant DB wrappers.

## Known unresolved / operational items
- Production browser/mobile journeys have not yet been fully certified across all latest academic, guardian and 64-game Arcade interactions. CI/build verification is complete; live UX/deployment certification is separate.
- The scheduled `SukuuNova risk scan` still requires the GitHub Actions secret `RISK_SCAN_CRON_SECRET`; the strict workflow check should not be weakened.
- Build/lint has warnings but no errors, including existing React hook/image warnings and `jose` Edge Runtime CompressionStream/DecompressionStream warnings. Address material warnings during whole-system certification.
- Draft PR #85 (`fix/dashboard-workforce-kpi`) remains unrelated and must not be merged blindly.
- Deeper library/student-resource workflows, finance/transport/feeding/communications operations, leadership intelligence and whole-system production journeys remain open.

## Remaining mission / next 4
1. **Deeper Library + Student Resource Hub:** physical copy/accession/barcode workflows, reservations/renewals/history/overdue/stocktake, teacher-curated digital resources, subject/topic mapping, bookmarks/favourites/recent resources and links from lessons/assignments/Arcade topics.
2. **Operations expansion:** deepen finance monetary intelligence/integrity, then transport, feeding/canteen and unified communications using existing services rather than replacements.
3. **Leadership Intelligence:** evidence-backed cross-module exception queues, trends and role-aware action paths across academics, attendance, finance, workforce, admissions, transport, feeding, library and communications.
4. **Final whole-system production certification:** browser/mobile/accessibility/performance journeys, cross-tenant/IDOR/audit checks, production migrations/backups/scheduled jobs, material warning cleanup, configure `RISK_SCAN_CRON_SECRET`, and certify school/teacher/guardian/platform operation end to end.

The **64-game Learning Universe is finished and CI-verified**. The full SukuuNova mission is not yet complete because Library/Student Resources, Operations, Leadership Intelligence and final production certification remain.

## Concurrency discipline
- Recheck `main` and every affected blob immediately before editing.
- Preserve concurrent commits; do not force-push or rewrite history.
- Keep meaningful changes in small coherent commits and verify exact heads in GitHub Actions before declaring a subsystem complete.
- If a write times out, refetch before retrying to avoid duplicate commits.
