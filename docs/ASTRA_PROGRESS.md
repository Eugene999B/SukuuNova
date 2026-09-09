# Astra progress

## Verified current checkpoint
- Current verified code SHA before this documentation-only checkpoint: `58ccba6c54d5a3d45cc3415079eb9af6d5010178`.
- Full Build verification: GitHub Actions run `34385055602` — SUCCESS.
- 82 migrations applied under a `NOSUPERUSER NOBYPASSRLS` PostgreSQL test role; Prisma generation/validation, TypeScript, design-token/pilot/navigation lint, ESLint, all tests and optimized production build passed.
- Test result: **285 tests in 55 files passed**.
- Repository work in these tranches ran directly on GitHub; no local checkout and no history rewrite.
- This documentation-only checkpoint records already verified code and does not require a redundant CI run.

## Guardian multi-child + messaging boundary completion
- Centralized guardian family scope in `guardian-family-context.ts`; a guardian session resolves only learners linked through that guardian record, and guessed/unlinked learner IDs are denied rather than falling back to another child.
- Attendance, Academics/Results, Assignments and Fees now preserve an explicit selected-child context. Multi-child guardians can switch between All children and each linked learner without mixing records.
- Learner detail links carry the child context into Attendance, Results, Fees and the richer interactive academic workspace.
- Released-score visibility is now child-specific: a sibling's published report for a term cannot make another sibling's unreleased score visible.
- The interactive `/guardian/academic` workspace preserves the initial selected child when entered from a learner/result view. URL/referer context is only a same-origin UI hint; the academic service still independently verifies the guardian-child relationship before returning learner data.
- Guardian Messages page and API now use the dedicated guardian session rather than the school-session authenticator, and the Guardian row is revalidated against the session before inbox/send/read operations.
- Guardian direct messages remain staff-directed; family accounts cannot use the route to message other family accounts.
- Read state is stored in message metadata as `readAt` while the delivery lifecycle status remains intact. Marking an incoming school message read preserves its original sender identity and attachments.
- Tenant-transaction authorization errors are awaited inside the route try/catch so stale or unlinked guardian sessions return the intended HTTP authorization response.
- Outgoing guardian message audits reference the real created Message ID instead of a synthetic timestamp identifier.
- Regression coverage includes linked/unlinked child scope, guessed-ID denial, sibling release isolation, same-origin initial academic context, foreign-context rejection, guardian-only messaging, sender preservation, read-state semantics, real-ID auditing and stale Guardian linkage.
- No migration was required for this tranche.
- Verified code SHA: `58ccba6c54d5a3d45cc3415079eb9af6d5010178`.
- Full Build SUCCESS: run `34385055602` — 82 restricted-role migrations, TypeScript, lint, **285 tests in 55 files**, and optimized production build passed.

## Structured lesson planning + academic review
- Rebuilt the existing LessonPlan workflow additively instead of creating a duplicate planning system.
- Professional lesson structure now includes class, subject, term/date, topic, sub-topic, curriculum objective, learning outcomes, prior knowledge, teaching/learning materials, introduction, development/activity stages, differentiated activities, assessment/evidence, conclusion, homework/extension, lesson overview, resources/attachments and post-lesson reflection.
- Drafts may remain incomplete; submission for academic review requires topic, learning outcomes, development/learning activities and assessment.
- Resource links are validated and preserved with the lesson plan.
- Review lifecycle is explicit: draft/returned plan -> teacher submit -> reviewer approve or request changes -> teacher resubmission required after changes -> approved -> teacher reflection/completed -> archived.
- A reviewer cannot approve their own lesson plan, cannot approve a returned plan without teacher resubmission, and must give both a reason category and written note when requesting changes.
- Every academic decision is preserved in `LessonPlanReview`; the latest reviewer pointer remains on LessonPlan for convenient display without destroying historical decisions.
- Approved lesson content stays immutable. Completion requires a meaningful teacher reflection; completed evidence can then be archived and remains readable.
- Term locking, teaching-assignment checks, optimistic edit timestamps, workflow advisory locks, tenant scoping and school audit logging remain enforced.
- The school lesson workspace now exposes structured authoring, review queue, revision reasons, full review history, resources, reflection and archive states in the existing responsive design system.
- Regression coverage includes structured resubmission, incomplete-plan rejection, author/cross-school protection, locked terms, review reason/history, mandatory resubmission, reflection and archival.
- Migration: `20260909184000_structured_lesson_planning`.
- Verified code SHA: `e8d68072867c16aed5db7802368b3d4b40e1dc1a`.
- Full Build SUCCESS: run `34381148702` — 280 tests in 54 files; restricted-role migrations, TypeScript, lint and production build passed.

## Academic attempt-policy completion
- Teacher academic work supports a configurable attempt limit of 1–10; one attempt remains the safe default.
- Teachers choose whether the canonical gradebook/report score uses the highest graded attempt or the latest graded attempt.
- Every learner attempt, response and released result is retained. Starting another attempt is explicit rather than a side effect of opening completed work.
- Guardian academic UI exposes attempt history and only offers another attempt when the latest attempt is graded, the teacher policy permits it, the term is open and the deadline has not passed.
- Advisory locking plus a unique work/student/attempt key prevents concurrent retry clicks from creating duplicate attempts.
- Superseded attempts are read-only in teacher review. Manual gradebook corrections are preserved instead of being overwritten by a later retry.
- The strict first-attempt conflict contract remains: an already-entered teacher mark blocks automatic first-attempt finalization rather than silently replacing or ignoring it.
- Regression coverage includes highest/latest selection, history preservation, retry limits, concurrent retries and manual gradebook override protection.
- Migrations: `20260909182000_teacher_academic_attempt_policies`, `20260909183000_teacher_academic_attempt_history`.
- Verified code SHA: `ec1d375480aa000809245842c7ffa722741613f5`.
- Full Build SUCCESS: run `34379271998` — migrations, TypeScript, lint, tests and optimized production build passed.

## Connected academic engine status
- Stable TeacherAcademicWork-to-Assessment links replace title-only lookup; legacy assessment adoption occurs only when unambiguous.
- Legacy Homework is bridged into the existing TeacherAcademicWork delivery/submission engine instead of owning a second learner-answer system.
- Objective activities support multiple choice, multiple select, true/false, short answer, fill blank, numeric, ordering and teacher-reviewed written responses.
- Guardian assignments do not expose answer keys, teacher guides or provisional marks. Submitted attempts remain immutable and released results reopen read-only.
- Teacher review requires complete per-question judgement and writes through canonical gradebook rules.
- Manual mark entry uses explicit atomic saves, spreadsheet paste, Present/Absent/Excused status, optimistic score snapshots, term locks and finalized-report protection.
- Gradebook term selection is school-calendar aware and invalid/overlapping term states require explicit resolution rather than silent fallback.
- Guardian academic state is child-specific; child switching clears stale data and linked guardians share the same underlying learner work state.
- The broader guardian portal now uses the same relationship-scoped child model for learner context across attendance, released academics, fees and academic entry points.

## Other recently verified batches
- Learning Arcade: reusable round engine, Math Sprint/Word Builder/Logic Lab, persistent drafts, server marking, XP/stars/levels/badges, recent results, school timezone streaks, progression and guardian child switching. First implementation is verified, but the broader game/content mission is not complete.
- Library: connected catalogue/circulation service, borrower scoping, learner selection, loan duration, returns, availability, idempotent issue/return, common locking, active-learner checks, URL safety and audit logging. Deeper copy/history/student-resource workflows remain.
- Recruitment: repaired metadata, candidate stage controls, stable public application receipts, idempotent retry behavior and atomic staff conversion with authority checks.
- School access/RBAC: safe default-role synchronization, Owner continuity, Owner-reviewed default-role upgrades, effective-rights previews and forced-password onboarding controls.
- Attendance/biometrics: IN/OUT handling, QR/face/fingerprint/card paths, learner biometric readiness, portrait source controls, device/gateway integration and concurrency protections.
- Reporting/download reliability: bounded class report loads, controlled transient retry, direct user-click print windows, attachment downloads and resource-ready printing.

## Migrations / integrity
- `20260909120000_teacher_academic_tenant_safety`: FORCE RLS and same-school relationships for TeacherAcademicWork/Question/Submission/Answer/Note.
- `20260909180000_validate_teacher_academic_tenant_fks`: historical teacher-academic tenant foreign keys are now explicitly validated. The earlier note that these remain NOT VALID is obsolete.
- `20260909181000_link_homework_academic_delivery`: connects legacy Homework to the richer TeacherAcademicWork delivery engine.
- `20260909182000_teacher_academic_attempt_policies`: teacher-controlled retry count/result policy.
- `20260909183000_teacher_academic_attempt_history`: multi-attempt submission identity/history.
- `20260909184000_structured_lesson_planning`: structured LessonPlan fields, lifecycle timestamps and FORCE-RLS LessonPlanReview history.
- Prior repair migrations for Guardian contact alignment, assessment links, Learning Arcade, library metadata and recruitment metadata remain additive; do not modify already deployed migrations.
- Guardian multi-child/message completion required no migration; it tightened application-layer relationship scope, released-data filtering and authentication boundaries over the existing schema.

## Architecture / current subsystem
- Current verified subsystem: connected teacher/guardian academic delivery, gradebook synchronization, configurable learner attempts, structured lesson planning/human academic review, and relationship-scoped guardian family context across core family modules.
- `TeacherAcademicWork` remains the canonical learner assignment/submission engine. Extend it rather than creating another response/marking engine.
- `Homework` is intentionally bridged into TeacherAcademicWork for learner delivery.
- `LessonPlan` remains a separate planning/review artefact because it represents teacher preparation and leadership quality assurance, not a learner submission. Its structured lifecycle and review history are now first-class rather than a thin legacy form.
- Guardian portal child selection is a view/context concern only; authorization is always re-established from Guardian-to-Student relationships server-side.
- Guardian messaging uses the dedicated guardian authentication boundary and existing Message delivery model; read receipts are metadata, not a new delivery status.
- Sensitive areas remain authorization, owner governance, school access, academic authoring, guardian family scope, teacher academic submission, gradebook canonical entry, reporting and tenant DB wrappers. Preserve audit/RLS/lock patterns when extending them.

## Known unresolved / operational items
- Production browser/mobile journeys have not yet been certified for the latest academic retry, structured lesson-review and guardian multi-child tranches. CI/build verification is complete; live UX/deployment verification is separate.
- The scheduled `SukuuNova risk scan` currently stops because GitHub Actions secret `RISK_SCAN_CRON_SECRET` is missing/empty. This is a deployment/repository configuration blocker, not a reason to weaken the endpoint or workflow check.
- Build/lint currently contains warnings but no errors, including existing React hook/image warnings and `jose` Edge Runtime CompressionStream/DecompressionStream warnings. They are not failures but should be cleaned during the whole-system pass.
- Draft PR #85 (`fix/dashboard-workforce-kpi`) is unrelated to these academic/guardian tranches and must not be merged blindly.
- Transport, feeding/canteen, wider communications, leadership intelligence, deeper library workflows, expanded Arcade/student learning and whole-system production journeys still require investigation/completion.

## Remaining mission / next 5
1. Expand Learning Arcade/student learning content beyond the current three games, while preserving the existing round/progression engine, school/child isolation and guardian context model.
2. Deepen student learning/resource and library workflows: student-specific mapping, circulation/history pagination and copy/accession-level needs only where they materially improve the real school flow.
3. Continue operational modules in priority order: finance integrity/UX, transport, feeding/canteen and unified communications, reusing existing phase services instead of replacing them.
4. Complete leadership intelligence and exception workflows: role-aware analytics/queues, mobile behavior, cross-tenant/IDOR checks and audit coverage across the remaining school operations.
5. Run whole-system production/browser/deployment journeys across school, teacher, guardian and platform roles; clean remaining build warnings where material, configure the missing risk-scan secret, and certify scheduled/production operations.

The full mission is **not complete**. The academic retry, structured lesson-review and guardian multi-child/message-boundary tranches are complete and CI-verified, but production journey certification and the remaining operational/student-facing expansions are still open.

## Concurrency discipline
- Recheck `main` and every affected blob immediately before editing.
- Preserve concurrent commits; do not force-push or rewrite history.
- Keep meaningful changes in small coherent commits and verify exact heads in GitHub Actions before declaring a subsystem complete.
- If a write times out, refetch before retrying to avoid duplicate commits.
