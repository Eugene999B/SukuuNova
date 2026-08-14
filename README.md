# SukuuNova

SukuuNova is a secure multi-tenant school management platform for Ghanaian schools. Phase 1 delivers the first usable school-operations MVP on top of the verified Phase 0 authentication, RBAC, audit, tenant-scoping, and PostgreSQL Row-Level Security foundation.

The product name is **SukuuNova** throughout the codebase.

## Phase 1 status

Implemented:

- academic years, terms, and attendance-aware calendar events;
- student registration, class assignment, guardians, and optional Parent login creation;
- classes, subjects, class teachers, and subject-teacher assignments;
- manual and signed short-lived QR attendance for students and staff;
- school-configured resumption time, grace period, and timezone—no hardcoded attendance cutoff;
- holiday/vacation/closure suppression of attendance and absence alerts;
- configurable CA/exam weighting and assignment-scoped score entry;
- fee items, immutable invoices, manual MoMo/cash/card reconciliation, and append-only reversals;
- asynchronous SMS outbox for absence, staff-lateness, invoice, payment, and report-card alerts;
- one PDF report-card template with attendance and remarks;
- missing-score blocking unless the school explicitly enables partial reports;
- maker-checker report flow: class teacher submits, Principal/Owner approves, then the report is sent;
- Parent access restricted to linked children and sent report cards;
- Platform Admin school-onboarding UI;
- a signed-in Phase 1 operations console at **/mvp**.

Explicitly deferred from this phase: face recognition, WhatsApp, payroll, bus tracking, custom role-builder UI, multiple report templates, online payment capture, and deployment.

## Technology

- Next.js 15 App Router, React 19, TypeScript, and Tailwind CSS
- PostgreSQL and Prisma
- bcrypt password hashing and separate school/platform JWT sessions
- pdf-lib for server-side report-card PDF generation
- PostgreSQL outbox worker for asynchronous SMS delivery
- Vitest integration tests against a real non-superuser PostgreSQL role

The SMS queue uses the existing PostgreSQL service as a durable outbox. This avoids adding Redis cost and operations during the MVP while keeping provider calls outside web request transactions. The adapter boundary can be replaced with a dedicated queue later without changing the domain services.

## Security model

Every tenant-owned Phase 1 model includes **schoolId** and is protected twice:

1. **withTenant(schoolId, work)** sets a validated transaction-local tenant context and the Prisma extension injects or checks **schoolId** for every read and write.
2. PostgreSQL enables and forces RLS with a tenant policy on every tenant table.

Composite foreign keys repeat **schoolId**, preventing a class, student, guardian, assessment, score, payment, or message from referencing another school. School and Platform Admin authentication remain separate by table, route, cookie, secret, JWT issuer, and JWT audience.

Financial protections are also enforced in both layers:

- Invoice lines, payments, and payment reversals are append-only.
- Invoices cannot be deleted, and their identity and total cannot be changed.
- Corrections are represented as new **PaymentReversal** rows.
- Database triggers reject direct SQL mutations that bypass application services.

Report-card transitions are likewise guarded by both service authorization and a database trigger. Only **draft → submitted → approved → sent** is accepted, and submitter and approver must differ.

## Default Phase 1 access

| Role | Phase 1 scope |
| --- | --- |
| Owner | Full school access |
| Principal | Full school access, including report approval |
| Vice Principal | Academic setup, attendance, gradebook, and report workflow |
| Class Teacher | Assigned class students, attendance, scores, report generation/submission |
| Subject Teacher | Assigned class/subject students and scores |
| Accountant | Fee items, invoices, reconciliation, reversals, and finance reports |
| HR Officer | Staff attendance and lateness alerts |
| Front Desk/Gate Security | Student/staff attendance recording |
| Parent | Linked children and their sent report cards only |

Permissions are database-driven and may be overridden per user. Record-level scoping still applies after a permission grant.

## Main routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET/POST | /api/mvp/setup | Calendar, terms, classes, subjects, assignments, students |
| GET/POST | /api/mvp/attendance | Manual/QR attendance, summaries, absence finalization |
| GET/POST | /api/mvp/gradebook | Assigned assessments and score entry |
| GET/POST | /api/mvp/finance | Fee items, invoices, payments, reversals |
| GET/POST | /api/mvp/report-cards | Generate and advance report-card workflow |
| GET | /api/mvp/report-cards/:id/pdf | Authorized PDF delivery |
| GET/PATCH | /api/mvp/settings | Attendance, grading, report, and SMS settings |
| GET/POST | /api/platform/schools | Platform Admin onboarding |
| GET | /mvp | Signed-in school operations console |
| GET | /platform/schools/new | Platform Admin onboarding screen |

All Phase 0 authentication and password-reset routes remain available.

## Environment

Copy **.env.example** and configure:

~~~bash
DATABASE_URL=
TEST_DATABASE_URL=
SCHOOL_AUTH_SECRET=
PLATFORM_AUTH_SECRET=
NEXT_PUBLIC_APP_URL=
~~~

Use independent random authentication secrets of at least 32 characters. The application database role must be **NOSUPERUSER** and **NOBYPASSRLS**.

For SMS delivery:

~~~bash
SMS_PROVIDER_URL=
SMS_PROVIDER_TOKEN=
SMS_SENDER_ID=
SMS_WORKER_POLL_MS=2000
~~~

If the provider variables are absent, messages stay in or return to the durable outbox; web requests do not call the provider.

Seed/onboarding credentials are documented in **.env.example** and intentionally have no defaults.

## Setup and verification

~~~bash
npm install
npm run db:migrate
npm run db:seed
npm run test
npm run build
npm run dev
~~~

The test database must be disposable, migrated, and owned by a PostgreSQL identity without superuser or RLS-bypass privileges.

The complete suite covers the Phase 0 tenant/RBAC/audit foundation plus:

- late arrival after the configured grace period;
- attendance and absences suppressed by an attendance-affecting holiday;
- HTTP-403 semantics for a teacher outside their assigned subject;
- class-teacher submission and distinct Principal/Owner approval;
- Parent child-only visibility;
- SMS enqueue without an in-request provider call;
- RLS isolation for new SIS records.

GitHub Actions is intentionally limited to one verification workflow on pushes to **phase-1-mvp** (or an explicit manual dispatch). It performs dependency installation, migrations, the full test suite, and a production build against PostgreSQL 16.

## SMS worker

Run the web application and SMS worker as separate processes:

~~~bash
npm run start
npm run worker:sms
~~~

The worker claims queued messages, uses exponential retry delays, records the last provider error, and stops retrying after five attempts. Deploying the worker as a separate Railway service keeps SMS latency out of web requests.

## Railway deployment preparation

No Railway deployment is performed in Phase 1. When deployment is authorized:

- Web service build command: **npm run build**
- Web service start command: **npm run start**
- Pre-deploy command: **npm run db:migrate**
- Worker service start command: **npm run worker:sms**
- Provide all required environment variables in Railway, never in Git
- Use a non-superuser, non-BYPASSRLS PostgreSQL runtime identity
- Run seed only as an explicit one-time administrative operation
- Use Platform Admin onboarding for later schools

## Manual acceptance path

1. Sign in as a Platform Admin and create a school at **/platform/schools/new**.
2. Sign in as its Owner and open **/mvp**.
3. Configure resumption time, grace period, timezone, and CA/exam weights.
4. Create an academic year, term, class, subject, teacher assignment, and student/guardian.
5. Record an on-time and late arrival; add a holiday and verify attendance is blocked.
6. Create assessments and verify an unassigned Subject Teacher receives 403.
7. Create fee items and an invoice, reconcile a MoMo payment by reference, then reverse it.
8. Generate a report with complete scores, submit as the class teacher, approve as Principal/Owner, and send.
9. Sign in as the Parent and verify only the linked child and sent PDF are visible.
10. Run the SMS worker with a test provider and verify queued alerts are delivered.

## Repository branches

- **phase-0-foundation** — verified security/data foundation
- **phase-1-mvp** — Phase 1 implementation and verification branch

Railway hosting and any merge into the default branch are intentionally left for explicit authorization.
