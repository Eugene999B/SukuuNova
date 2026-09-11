# SukuuNova system-integrity repair status — 11 September 2026

This status file tracks implementation against `SYSTEM_INTEGRITY_AUDIT_2026-09-11.md`. The original audit is retained as the immutable finding record; this file records the repair outcome.

## Release A — merged

Identity, account-kind, safety and calendar boundaries are repaired and merged. Guardian session ownership, staff/teacher target validation, face-review unknown candidates, device attendance targets, payroll/property/visitor staff boundaries, academic-year/term overlap, leadership analytics arithmetic and Eugene Academy timetable collision fixtures are protected by services, database guards and regressions.

## Release B — merged

Term enrolment is the historical academic source of truth. Gradebook, report cards, ranking, performance intelligence, readiness, invoice class selection and admissions/enrolment transitions resolve historical class context instead of mutable current `Student.classId`. Intake does not become live placement until the enrolment lifecycle permits it.

## Release C — merged, production migration recovery merged

The official finance domain now owns `P3FinanceAdjustment` as canonical adjustment storage. Historical class fee obligation, approved scholarship/waiver/sibling discount, invoice projection, payment, reversal, receipt and arrears calculations share one net-payable model. Over-discounting is rejected and four-eyes adjustment approval is enforced.

Railway exposed an upgrade-only conflict between the old invoice immutability trigger and the Release C backfill. The repository now includes a guarded migration deployer plus a CI rehearsal that recreates the exact historical-invoice + approved-adjustment failure, resolves only the known failed migration, restores FORCE RLS and invoice protection, and proves idempotent deployment.

**Operational deployment note:** Railway service settings are the deployment source of truth for this project. The Railway service Pre-deploy Command must be `npm run db:migrate`; raw `prisma migrate deploy` cannot recover a database where `20260911153500_finance_obligation_ledger` is already recorded as failed.

## Release D — implementation complete, final combined gate pending

Implemented on `repair/system-integrity-release-d` / PR #114:

- one canonical learner onboarding service for modern Students and admissions conversion
- draft term placement during intake; no direct live-class mutation
- locked/out-of-term enrolment rejection
- legacy MVP learner writer retired
- guardian login/session ambiguity fails closed
- one primary guardian per learner at the database boundary
- new Guardian↔User persona ambiguity blocked
- teacher/day/period and normalized venue/day/period timetable collision guards
- active-learner pickup requirement and one completed pickup per school-local day, including direct-writer database enforcement
- attendance event→period-register reconciliation regression
- separate `store:discount` authority from `store:sell`
- canonical store payment-method allowlist and required non-cash payment reference
- legacy Phase 3 asset writes retired while historical rows remain readable
- legacy Phase 3 finance actions delegated to Release C canonical request/decision services
- Phase 3 mutation body changed from unbounded `request.json()` to bounded streaming JSON
- legacy-writer deprecation register added
- regressions for onboarding, guardian identity, timetable collisions, custody, attendance reconciliation, store governance and writer retirement

### Release D merge rule

PR #114 must not merge merely because its branch CI is green. Before merge:

1. read the latest `main` because parallel work is active;
2. ensure the PR merge ref includes every newer `main` commit (including the premium duplex ID-card merge);
3. run the full combined workflow: Railway recovery rehearsal, migrations, typecheck, lint, all tests, pilot journeys, Eugene Academy, clean reset rehearsal and production build;
4. review PR discussion and mergeability;
5. merge the exact certified head SHA with a normal merge.

## Product enhancements explicitly not represented as hidden state

The School Store supports governed sale completion and full void/restock. Partial line returns/exchanges are not represented as ad-hoc edits or negative stock movements; they remain a future explicit product workflow. Until such a workflow exists, staff must void the original sale under `store:void_sale` and record the corrected sale. This is deliberate so inventory and receipt history remain auditable.

## Games gate

Learning Arcade/game expansion remains blocked until Release D is merged on the latest combined `main` and the core integrity gate is green.
