# SukuuNova

SukuuNova is a secure, multi-tenant school operations platform designed for Ghanaian schools. **Phase 3 is now merged into `main`** on top of the verified Phase 2 baseline.

The product name is **SukuuNova** throughout the repository.

## Current status

- **Phase 0 — foundation:** complete and verified.
- **Phase 1 — MVP school operations:** complete and verified.
- **Phase 2 — differentiators:** complete and verified at commit `d80d1234826561017490999054f7ec9b72fdb8af`.
- **Phase 3 — operations:** implemented and merged into `main` at merge commit `29ac66f9cddfb168107e579e3dc23623540f69e2`.
- **Railway deployment:** intentionally not performed yet.
- **Phase 4:** not started.

## Phase 3 functionality

Phase 3 includes:

- transport operations: vehicles, routes, stops, GPS pings, route ETA data, parent location sharing, boarding/alighting alerts, and vehicle compliance reminders;
- feeding: period budgets, menus, serving/cost logs, actual-vs-plan reporting, and optional invoice items that remain optional until separately handled by finance;
- timed objective CBT: server-created expiry timestamps, server-side timeout enforcement, persisted answers, and objective autograding;
- library: books, copies, borrowing, returns, and overdue tracking;
- asset inventory: asset tags, serials, locations, condition, status, assignment, and purchase cost;
- fee assistance: waiver, scholarship, and sibling-discount requests with pending/approved/rejected approval gates;
- recruitment: postings, applicants, and applicant-to-staff conversion through the existing **createSchoolUser** service;
- role-scoped operational analytics;
- offline queued synchronization only for attendance and scores, keyed by idempotent **clientGeneratedId** values and re-authorized at sync time.

## Security rules carried into Phase 3

Every new Phase 3 tenant table has **schoolId**, forced PostgreSQL RLS, and same-school composite foreign keys where records reference another tenant-owned row. The existing `withTenant` transaction establishes `app.current_school_id`; the Prisma guard remains in force for Prisma-backed models. Server routes require the current signed-in school session and re-check RBAC permissions in the transaction. Sensitive Phase 3 mutations append to the existing school audit log. Existing append-only and invoice deletion safeguards remain intact.

Offline sync is deliberately narrow: it can apply only attendance and score records. The server checks the live permission set when synchronization occurs; no permission from the time a device queued the item is trusted. The unique `(schoolId, clientGeneratedId)` constraint makes retries idempotent.

## Phase 3 routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET/POST | `/api/phase3/transport` | Fleet, routes, stops, GPS, parent location, boarding and compliance |
| GET/POST | `/api/phase3/feeding` | Budgets, menus, logs and optional invoice items |
| GET/POST | `/api/phase3/cbt` | Timed exams, questions, attempts, answers and autograding |
| GET/POST | `/api/phase3/library` | Books, loans, returns and overdue views |
| GET/POST | `/api/phase3/assets` | Asset inventory |
| GET/POST | `/api/phase3/finance` | Waiver, scholarship and sibling-discount approval queue |
| GET/POST | `/api/phase3/recruitment` | Postings, applicants and staff conversion |
| GET | `/api/phase3/analytics` | Role-scoped operations analytics |
| GET/POST | `/api/phase3/sync` | Offline attendance/score queue and synchronized writes |
| GET | `/phase3` | Phase 3 operations console |

Phase 0-2 routes remain available.

## Architecture

- Next.js 15 App Router, React 19, TypeScript, and Tailwind CSS
- PostgreSQL 16, Prisma, forced Row-Level Security, and composite tenant foreign keys
- bcrypt password hashing and separate school/platform JWT universes
- existing audited school RBAC and tenant transaction context
- existing financial append-only/invoice safeguards

## Verification

The Phase 3 invariant suite covers:

1. server-side CBT timeout enforcement;
2. pending waiver exclusion from invoice reductions;
3. applicant conversion through the existing staff-user creation path;
4. idempotent offline attendance synchronization;
5. rejection of offline synchronization after the actor's permissions are revoked.

The full repository test suite remains the CI gate.

The verification workflow currently runs automatically for pushes to the phase branches and can also be dispatched manually. `main` is now the current integrated product branch; this README update itself does not trigger the branch-scoped verification workflow.

## Environment and Railway preparation

Phase 3 does **not** deploy to Railway. The repository is prepared for the later controlled deployment phase.

When deployment is explicitly authorized, keep the same operating model:

- build: `npm run build`
- start: `npm run start`
- pre-deploy migration: `npm run db:migrate`
- notification worker: `npm run worker:messages`
- provide database/JWT/provider secrets through Railway variables only;
- keep the PostgreSQL runtime role **NOSUPERUSER** and **NOBYPASSRLS**;
- apply the Phase 3 migration before exercising the new routes;
- use a disposable, migrated non-superuser database for acceptance testing before any production cutover.

No Railway deployment or live-domain change is included in Phase 3.

## Explicit Phase 4 deferrals

This repository intentionally does not begin Phase 4. Deferred work includes platform billing/entitlements, public applicant/student/parent portals beyond the scoped Phase 3 transport location interaction, advanced AI features, sensor/digital-twin automation, emergency workflows, and any broader offline synchronization outside attendance and scores.

## Branches

- **phase-0-foundation** — verified security/data foundation
- **phase-1-mvp** — verified Phase 1 school operations
- **phase-2-differentiators** — verified Phase 2 implementation
- **phase-3-operations** — completed Phase 3 implementation branch
- **main** — current integrated SukuuNova product state

Railway deployment remains a separate, explicit action.