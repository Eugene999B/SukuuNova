# Astra progress

## Owner-reviewed default-role upgrades
- Added a selective Owner review in Roles & Permissions with readable permission labels, risk, assigned/active account counts and direct-denial impact.
- Additive upgrades preserve extra permissions, account overrides, role identity and custom roles; preview never provisions or broadens roles.
- Review revisions bind the baseline, existing rights, role identity, assignments and overrides. Stale or replayed approvals fail, and all selected roles apply atomically.
- Rechecks active Owner authority and role-control permission; canonical system keys are required. No role-name promotion.
- Shared school governance locking now covers default synchronization and custom-role mutation alongside upgrade approval.
- Eleven new integration regressions. Verified code SHA: 64e298606ee1eab2886ec54568d7162862dc7fed.
- Full Build SUCCESS: https://github.com/Eugene999B/SukuuNova/actions/runs/34322414559 — 234 tests in 46 files; Prisma/migrations, typecheck, lint and production build passed.
- Nine files committed together directly on GitHub. No migration. This documentation-only checkpoint skips redundant CI. Production browser verification remains outstanding.

## General gradebook batch
- Replaced per-cell autosaves with explicit atomic saves, up to 500 changed cells per class/subject/term.
- Added mark/status spreadsheet paste, keyboard navigation, dirty counts, discard, clear confirmation and navigation/unload protection.
- Snapshot reads preserve stored values separately from grading projections. Updates and clears detect concurrent changes; any failed cell rolls back the batch.
- Status-only edits are included; canonical entry rejects nonzero absent/excused marks. Locked terms are read-only in the sheet.
- Eight new regressions cover batch saves, stale/concurrent clears, rollback, authorization, finalized reports, context and snapshot reads.
- Verified code SHA: 4123823622fb0c0bd3cf53217bab760d4063193f.
- Full Build SUCCESS: https://github.com/Eugene999B/SukuuNova/actions/runs/34321319943 — 223 tests in 45 files; Prisma/migrations, typecheck, lint and production build passed.
- Ten files changed in this connected batch. CI identified a second shared-grid consumer; teacher context now supplies snapshots, term lock and sheet styling too.
- No migration. This documentation-only checkpoint skips redundant CI. Production browser verification remains outstanding.

## Recruitment completion batch
- Restored missing vacancy/application metadata with a new additive migration; added unique public submission keys.
- Unified legacy and school recruitment services; implemented candidate stage changes, conflict checks, application review and staff conversion controls.
- Public intake validates required/choice answers, contact details, CV URLs and vacancy availability in one locked transaction. Same-key retries return one receipt.
- Staff conversion now runs atomically with shared account creation, hiring prerequisite, role/Owner authorization, auditing and forced password change.
- Stable public links under concurrent requests; partial vacancy edits preserve deadlines.
- Public form retry protection, accessible inputs and responsive layout; pipeline includes legacy applied and converted candidates.
- Eight new regressions. Verified code SHA: 318128c2ba50af77ff86f5015df76cb3d7b68cbf.
- Full Build SUCCESS: https://github.com/Eugene999B/SukuuNova/actions/runs/34320079632 — 215 tests in 45 files; Prisma/migrations, typecheck, lint and production build passed.
- Eleven files committed together directly on GitHub. This documentation-only checkpoint skips redundant CI.
- This completes a connected recruitment batch, not the entire mission. Production browser/deployment verification remains outstanding.

## Library circulation batch
- Unified current and legacy library APIs under one permission-scoped service.
- Borrower-only accounts see linked children/assigned classes; managers retain school circulation.
- Book/learner selectors, working loan duration and returns, accurate zero availability.
- Idempotent issue/return retries, common book-lock order, active learner checks and circulation/catalogue audits.
- Resource URL validation suppresses unsafe stored links; nonexistent catalogue updates return 404.
- Fixed shared form lifetime and double-click handling in SchoolLifeStudio.
- Seven library regressions added. Verified code SHA: a63f6c2a0240c2f8b34fbab8369589e75338211c.
- Full Build SUCCESS: https://github.com/Eugene999B/SukuuNova/actions/runs/34318881498 — 207 tests in 44 files; Prisma/migrations, typecheck, lint and production build passed.
- CI exposed metadata lost by historical operations-table recreation. A new additive migration restores library fields/indexes; historical migrations and existing data remain intact.
- Nine files changed in this batch, including the repair migration. This documentation-only checkpoint skips redundant CI.
- Next investigation: recruitment metadata may have been lost by the same historical recreation; verify its current schema and API tests.
- Student-specific portal mapping, library history pagination, accession-level copies and production browser verification remain outstanding.

## Learning Arcade batch
- Three reusable practice engines: Math Sprint, Word Builder and Logic Lab; five-question rounds with explanatory feedback.
- Persistent child-specific drafts, server marking, idempotent completion, XP/stars/levels/badges, recent results and timezone-aware streak.
- Class-level starting difficulty, sustained-performance progression and easier new rounds.
- Guardian dashboard entry, child switcher, keyboard/touch UI, parent progress, saved rounds and readable result history.
- ArcadeRound Prisma model, tenant helper registration, same-school foreign keys, partial unique active-round index and FORCE RLS migration.
- Eight regression tests cover concurrent/retried rounds, isolation, RLS, invalid answers, progression, content and timezone dates.
- Verified code SHA: 671239a0c62c96d053583e70c5a663d3d491cab8.
- Full Build SUCCESS: https://github.com/Eugene999B/SukuuNova/actions/runs/34315592472 — 200 tests in 43 files; Prisma, restricted-role migrations, typecheck, lint and production build passed.
- Twelve files committed together directly on main. This documentation-only checkpoint skips redundant CI.
- Arcade is a first implementation, not all nine suggested games; school-specific content packs and production browser/mobile certification remain outstanding.

## Efficient mark-entry batch
- Spreadsheet paste supports mark/status columns, A/E shortcuts, blank-row preservation and all-or-nothing validation.
- Enter/arrow keyboard navigation, explicit Present/Absent/Excused states, recorded/dirty counts and save confirmation.
- Unsaved marks prompt before context changes and browser unload; duplicate actions are blocked while saving.
- Canonical enterScore checks optional last-seen score snapshots under the term lock; teacher sheet requires snapshots. A conflict rolls back all rows.
- Added eight paste, concurrent-write, status and batch-rollback regressions. No schema changes.
- Verified code SHA: 781fba175447138f763e67072a62888602784a35.
- Full Build SUCCESS: https://github.com/Eugene999B/SukuuNova/actions/runs/34302273822 — 192 tests in 42 files, Prisma/migrations, typecheck, lint and production build passed.
- Nine related files committed together directly on main. This documentation-only checkpoint skips redundant CI.
- Production browser/mobile verification remains outstanding; the general GradebookEntryGrid has since been upgraded in the batch above.

## Guardian learning batch
- Final answers save and submit atomically; a failed save cannot finalize stale answers.
- Activities bind to a specific child; stale overview responses are discarded and child switches clear old learning data.
- Submitted and graded work reopens read-only with released answer marks and teacher feedback.
- Progress counts use the selected child's returned activities; all-subject selection stays consistent.
- Subjects with published notes appear even without assignments; invalid child selection is explicitly denied.
- Native activity dialog provides keyboard focus containment; saves/submissions prevent duplicate clicks and show errors inside the dialog.
- Guardian academic responses use no-store. Added five transaction/isolation/filter/result regressions.
- Verified code SHA: 8dcd6e792c714ef1f776f4e6d1916f33653d69ba.
- Full Build SUCCESS: https://github.com/Eugene999B/SukuuNova/actions/runs/34301477352 — 184 tests in 41 files, migrations, Prisma checks, typecheck, lint and production build passed.
- Five files changed directly on GitHub. This documentation-only checkpoint skips redundant CI.
- Production browser/deployment verification and Learning Arcade remain outstanding.

## Current connected academic batch
- Stable work-to-assessment links replace title-only lookup; legacy links are adopted only when unambiguous.
- Manual marks use canonical gradebook permission, term, finalized-report, validation and audit rules.
- Publishing validates questions and creates the assessment; review no longer requires a placeholder mark.
- Teacher review requires every question exactly once, displays learner answers, and preserves unanswered questions with explicit zeroes.
- Studio preserves blank cells, reloads existing marks, links review queues and publishes saved notes; locked terms remain readable.
- Manual marking requires teacher release; objective auto marking remains available.
- Added question/date validation and a nullable same-school assessment-link migration.
- Verified code SHA: 9ded435b64c9aa2985eaf9cd94df7d8fef90c669.
- Full Build SUCCESS: https://github.com/Eugene999B/SukuuNova/actions/runs/34300866837. Prisma, migrations under a restricted PostgreSQL role, typecheck, lint, tests and production build passed.
- 179 tests in 41 files passed, including 7 new connected academic workflow regressions.
- Follow-up correction saves only changed, nonblank marks, preserves attendance status and prevents context switching during saves.
- 10 files changed in this batch. No local checkout; all code and verification ran in GitHub.
- This documentation-only checkpoint skips redundant CI. Production deployment/browser verification remains outstanding.

## Previous verified checkpoint
- Main/code SHA before this documentation-only checkpoint: f8952080022b8bdd8b8dda6af3299a54581f299c.
- Full Build verification: https://github.com/Eugene999B/SukuuNova/actions/runs/34298587865 — SUCCESS.
- 172 tests in 40 files passed. Prisma generation/validation, migrations under NOSUPERUSER/NOBYPASSRLS, design-token/pilot/navigation lint, ESLint, TypeScript and production build passed.
- 32 files changed in this mission pass. Repository reads, commits and tests ran directly on GitHub; no local checkout.
- This documentation-only commit skips a redundant CI run; the code and migration SHA above is the verified state.

## Completed batches
- Default-role synchronization preserves existing role identities, intentional permission restrictions and direct overrides. A custom Owner-named role is not promoted.
- Administrator and broad Principal defaults provision missing/new roles. Existing school policies are not automatically broadened.
- Readable permission catalogue, impact labels, and inherited/direct/effective-rights preview.
- Account endpoints omit password hashes; temporary credentials require replacement; denial removal requires grant authority.
- Staff creation preserves existing shared-role rights and prevents granting stronger authority. Shared account services protect Owner authority.
- Account governance serializes changes and preserves an active Owner, including simultaneous self-removal regression coverage.
- Optional Principal/Administrator onboarding accounts receive generated credentials, audited role assignments and forced password changes within provisioning. Shared validation covers timezone, rates and distinct account emails. Handoff links School 360 and a setup checklist.
- Duplicate school-code handling preserves login-directory records even when RLS hides a school. Default permission grants are deduplicated.
- Lesson drafts/returned plans can be edited and resubmitted; approved lessons can be completed by their author. Homework drafts can be edited/published. Edits check author, teaching assignment, term lock and optimistic timestamp.
- Guardian assignments hide answer keys/private guides/provisional marks, preserve original responses, freeze submitted answers, serialize attempts and separate linked children. Exact marking preserves mathematical signs.
- Teacher-reviewed marks use canonical enterScore protections for terms and finalized reports.
- Zod validation produces readable HTTP 400 responses without submitted credentials.

## Migrations
- 20260909120000_teacher_academic_tenant_safety: FORCE RLS on TeacherAcademicWork/Question/Submission/Answer/Note; composite same-school foreign keys.
- Foreign keys are NOT VALID for legacy rows, intentionally. New writes are checked; audit existing relationships before validating historical data.
- 20260909121000_guardian_contact_schema_alignment: align optional Guardian.phone with Prisma.
- 20260909130000_academic_work_assessment_link: nullable, unique assessment link with same-school foreign key; legacy rows linked only when unambiguous.
- 20260909150000_learning_arcade: ArcadeRound persistence, same-school relationships, one active round per child/game, constraints and FORCE RLS.
- 20260909160000_restore_library_metadata: restore missing rich catalogue fields and indexes with IF NOT EXISTS; no data replacement.
- 20260909170000_recruitment_intake_repair: restore vacancy/application metadata, stable public tokens and unique public submission keys.
- Never modify already deployed migrations.

## Architecture / current subsystem
- Current subsystem: selective Owner-reviewed default-role upgrades, verified in GitHub Actions. Next: remaining academic integration, operational modules and production journeys.
- TeacherAcademicWork/Question/Submission/Answer/Note already implement guardian assignments, objective marking and teacher review. Extend these rather than creating a duplicate submission engine.
- Homework/LessonPlan remain separate legacy planning workflows; their connection to the richer assignment engine needs review.
- Earlier feat/school-onboarding-rbac-v3 supplied the permission catalogue; its unsafe synchronization was not imported.
- Sensitive files: authorization.ts, owner-governance.ts, role-builder-service.ts, school-services.ts, school/access API, staff/actions.ts, onboarding services, academic-authoring-service.ts, teacher-academic-submission-service.ts.
- Tests added: default-rbac-sync, school-access-security, leadership-governance, platform-onboarding, owner-continuity, validation-response, academic-authoring, guardian-academic-security.

## Remaining mission / next 5
1. Recruitment metadata drift is repaired; audit legacy academic tenant relationships before validating old foreign keys.
2. Owner-reviewed default upgrades are implemented and CI-verified; exercise the role review and approval journey in production browser QA.
3. Connect teacher assignment navigation and legacy homework to the existing submission engine; expand question types and attempt policies.
4. Expand Arcade games/content and student learning/resource workflows; verify production guardian/mobile journeys.
5. Continue canonical grading/history verification, remaining operational modules and whole-system journeys.

The full mission is NOT complete. No production browser/mobile journey was certified in this pass. Finance, transport, feeding, communications, advanced library/arcade features and remaining requested expansions still require investigation and completion.

## Concurrency
Recheck main and affected blobs before editing. Preserve concurrent commits, use fast-forward-only updates, and validate meaningful code batches in GitHub Actions.
