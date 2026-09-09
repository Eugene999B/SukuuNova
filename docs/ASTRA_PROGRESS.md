# Astra progress

## Current connected academic batch
- Stable work-to-assessment links replace title-only lookup; legacy links are adopted only when unambiguous.
- Manual marks use canonical gradebook permission, term, finalized-report, validation and audit rules.
- Publishing validates questions and creates the assessment; review no longer requires a placeholder mark.
- Teacher review requires every question exactly once, displays learner answers, and preserves unanswered questions with explicit zeroes.
- Studio preserves blank cells, reloads existing marks, links review queues and publishes saved notes; locked terms remain readable.
- Manual marking requires teacher release; objective auto marking remains available.
- Added question/date validation and a nullable same-school assessment-link migration.
- GitHub Actions verification pending for this batch; previous verified checkpoint follows.

## Verified checkpoint
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
- Never modify already deployed migrations.

## Architecture / current subsystem
- Current subsystem: guardian assignments and academic data protection; connected teacher workflow batch awaiting CI.
- TeacherAcademicWork/Question/Submission/Answer/Note already implement guardian assignments, objective marking and teacher review. Extend these rather than creating a duplicate submission engine.
- Homework/LessonPlan remain separate legacy planning workflows; their connection to the richer assignment engine needs review.
- Earlier feat/school-onboarding-rbac-v3 supplied the permission catalogue; its unsafe synchronization was not imported.
- Sensitive files: authorization.ts, owner-governance.ts, role-builder-service.ts, school-services.ts, school/access API, staff/actions.ts, onboarding services, academic-authoring-service.ts, teacher-academic-submission-service.ts.
- Tests added: default-rbac-sync, school-access-security, leadership-governance, platform-onboarding, owner-continuity, validation-response, academic-authoring, guardian-academic-security.

## Remaining mission / next 5
1. Audit legacy academic tenant relationships and add a safe validation migration.
2. Provide an explicit Owner-reviewed upgrade workflow for existing role defaults.
3. Connect teacher assignment navigation and legacy homework to the existing submission engine; expand question types and attempt policies.
4. Complete guardian multi-child learning progress and Learning Arcade.
5. Continue canonical grading/history verification, remaining operational modules and whole-system journeys.

The full mission is NOT complete. No production browser/mobile journey was certified in this pass. Finance, library, transport, feeding, communications, arcade and remaining requested expansions still require incremental investigation.

## Concurrency
Recheck main and affected blobs before editing. Preserve concurrent commits, use fast-forward-only updates, and validate meaningful code batches in GitHub Actions.
