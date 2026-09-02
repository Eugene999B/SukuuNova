# SukuuNova

SukuuNova is a multi-tenant school operations platform designed for real day-to-day school work, with a strong focus on Ghanaian schools and the realities of running a modern school.

The product goal is to become the operating system of a school: one connected environment for people, academics, attendance, finance, communication, safety, transport, staffing, family relationships, reporting and operational decisions.

> **Important:** This repository is for **SukuuNova only**. Do not import assumptions, code, styling or workflows from another product or repository unless deliberately adapted to SukuuNova.

## Product identity

- **Repository:** `Eugene999B/SukuuNova`
- **Primary branch:** `main`
- **Application:** Next.js App Router + TypeScript + React
- **UI:** Tailwind CSS plus shared SukuuNova CSS/design tokens
- **Database:** PostgreSQL 16
- **ORM:** Prisma
- **Production:** Railway
- **Authentication:** separate platform and school JWT security domains
- **AI:** server-side OpenAI Responses API integration

SukuuNova has three connected experiences:

1. **Platform** — the control plane above schools.
2. **School Workspace** — administration, teachers and operational staff.
3. **Family/Guardian Experience** — controlled access to linked children and released school information.

## Product principles

### One connected system

Students, guardians, staff, classes, subjects, attendance, academics, finance and communication should reinforce each other instead of behaving like unrelated databases.

### Human workflow first

Build around what people actually do.

A teacher should think:

> Select class → select today → mark the register.

A bursar should think:

> Find account → understand balance → record payment → issue receipt → reconcile.

A school administrator should think:

> Set up school → establish academic structure → operate school → review results → communicate with families.

### Safety over convenience

School data is sensitive. Prefer explicit permissions, tenant isolation, auditability, confirmation for destructive actions and human review for consequential automation.

### Real functionality over decorative completeness

A rendered page or button is not evidence that a workflow is complete. Never simulate persistence, success or integrations that do not actually work.

### Consistency is a product feature

Shared navigation, typography, spacing, forms, tables, cards, status indicators, responsive behaviour and semantic theme tokens should be reused across modules.

## System areas

### Platform management

School onboarding and lifecycle, plans/subscriptions, platform billing, support, platform audit, school investigation, controlled impersonation and operational controls.

### School administration

School profile, school code/login identity, academic years, terms, calendar, roles, permissions, staff, students, guardians, houses, classes, subjects, teacher assignments, settings and appearance.

### Admissions

Enquiries, applicants, application review, decisions, acceptance/rejection, enrolment and conversion into normal student/family records. Conversion must preserve guardian relationships and school data integrity.

### Student and family management

Student records connect class, house, guardians, attendance, scores, report cards, invoices, identity records, pickup/safety events and other operational information. Guardians may be linked to multiple children subject to school relationships and authorization.

### Academics

Academic years, terms, subjects, class/subject teacher assignments, assessments, grade entry, gradebook, score calculation, moderation, report cards, templates, approval/publication, lesson planning, homework, timetable and substitution.

Conceptual academic flow:

**Academic year → term → class → subject → teacher → assessment → score → moderation → report card → approval → publication**

### Attendance and safety

Attendance supports ordinary class registers as well as physical/device and biometric directions. Existing concepts include class attendance, staff attendance, attendance history, exception handling, device registration, device identity, attendance receipts, idempotency/nonce protections, face enrollment and face-match review.

Safety includes approved pickup relationships, pickup requests, pickup events and visitor logging.

### Finance and payroll

Fees, fee structures, invoices, invoice lines, balances, payments, receipts, arrears, reversals, salary structures, payroll runs and payslips.

Financial history must remain auditable. A reversal is a separate event, not a silent mutation of historical payment data.

### Communication

School messages, announcements, SMS/WhatsApp broadcasts, templates, queues/outbox, delivery status, retry behaviour and emergency broadcast workflows.

### Transport

Routes, stops, vehicles, drivers, student assignments and operational route information, with room for future live tracking/integration.

### Feeding

School meal operations, planning and daily service information.

### Library

Physical and digital catalogue, borrowing, returns, due dates and overdue tracking. Digital resources may include textbooks, eBooks, PDFs, worksheets, past papers, audio, video and other documents.

### Assets and inventory

Assets, stock/inventory, assignments, maintenance and retirement/disposal records.

### HR and recruitment

Staff records, salary structures, payroll runs, payslips, vacancies, applicants, interviews, offers and recruitment status.

### Examinations / CBT

Assessments, examination schedules, mark entry, moderation, results and computer-based testing.

### Reporting and analytics

Attendance, academics, finance/arrears, staff, operations, management dashboards and authorized school/group comparisons. Analytics must use real data rather than fake KPIs or local-only UI state.

## Roles and authorization

School users operate through roles, permissions, role-permission assignments and user-specific overrides. The current permission catalogue includes areas such as attendance, finance, payroll, reports, visitors, transport, feeding, exams, library, assets, recruitment, analytics, exports and custom roles.

Important default roles include:

- Owner
- Principal
- Vice Principal
- Academic Coordinator
- Department Head
- Accountant
- HR Officer
- Admissions Officer
- Class Teacher
- Subject Teacher
- Front Desk/Gate Security
- Transport Officer
- Parent
- Student

The school owner can assign custom roles and individual grants/denies.

**Frontend visibility is not authorization.** Sensitive actions must be checked on the server.

## Multi-tenancy and security

Every school is a tenant. School-owned records are scoped through `schoolId` and same-school relationships.

Rules:

1. Authenticate the user.
2. Establish the correct school/platform context.
3. Authorize the action.
4. Query through the tenant boundary.
5. Validate related records belong to the same school.
6. Perform the business operation.
7. Audit consequential actions where appropriate.

Never trust a client-provided `schoolId` or a client-provided target identity when the authenticated session already determines the actor.

The project uses tenant-aware database helpers such as `withTenant()` and PostgreSQL row-level protection. Application filtering and database protections should reinforce each other.

Platform and school authentication are separate security universes. Platform accounts use `PlatformAdmin`/`PLATFORM_AUTH_SECRET`; school users use `User`/`SCHOOL_AUTH_SECRET`; guardian access follows the school-facing family path.

Passwords use `bcryptjs`; password reset tokens are stored as hashes with expiry/use controls; login throttling is persisted rather than relying only on process memory.

School and platform audit trails are first-class security records. Important actions include permission changes, impersonation, payment reversals, approval/rejection, biometric operations, emergency communication and destructive administrative operations.

## Platform impersonation

Support impersonation is explicit rather than a hidden backdoor. It is permission-gated, time-limited, tied to a reason and audited in both platform and school contexts. The intended maximum session duration is 30 minutes.

Never add silent “god mode” access.

## Staff QR School Check-In

SukuuNova is being extended with a dedicated **Staff School Check-In** workflow for schools that do not want to rely on face/fingerprint hardware.

This feature builds on the existing QR attendance foundation but changes the security model from a teacher-specific QR token to a **short-lived, school-wide challenge**.

### Human workflow

**School display:**

1. An authorized school user opens the dedicated Attendance Display.
2. SukuuNova verifies the user has the dedicated `attendance:display` permission.
3. The display creates a fresh school check-in challenge.
4. A QR code is shown on the school's gate/office/reception display.
5. The QR automatically rotates frequently.

**Teacher:**

1. Teacher signs into the normal Teacher Portal.
2. Teacher opens **School Check-In**.
3. The phone camera scans the live school QR.
4. The server derives the teacher identity from the authenticated session.
5. SukuuNova verifies the challenge, school, user and attendance rules.
6. When the school's presence policy is satisfied, staff attendance is recorded using server time.

The QR **must never identify the teacher**. The authenticated teacher session is the source of truth for staff identity.

### Display access

The live QR display is not a public URL and must not be available to every teacher automatically.

The school can explicitly grant `attendance:display` to selected users such as:

- Principal / Head
- Attendance Officer
- Front Desk / Gate Security
- another explicitly authorized staff member

A person with display access should receive a focused display workflow, not additional administrative authority merely because they can operate the screen.

### Security properties

The intended implementation uses:

- school-scoped challenges;
- cryptographically random challenge IDs/nonces;
- signed JWTs;
- `jti` challenge identifiers;
- short expiration, currently targeted at roughly 45 seconds;
- persisted challenge issuance metadata;
- one-time/atomic consumption protection;
- same-school session verification;
- active staff verification;
- server-derived actor identity;
- replay detection;
- duplicate same-day attendance protection;
- failed-attempt/rate-limit protections where appropriate;
- server time for the attendance event;
- privacy-conscious verification metadata;
- auditable successful and consequential events.

Browser geolocation may be used as a school-presence signal. A school's policy can decide whether location is off, optional or required. Location is a verification signal, not an absolute proof of physical identity.

The implementation should avoid continuous location tracking and should not store unnecessary location history.

### Anti-cheating model

No single browser signal is treated as infallible. The strongest practical workflow combines:

**short-lived QR + one-time server challenge + authenticated teacher identity + same-school enforcement + optional/required location verification + optional network/device anomaly signals + audit trail.**

This means a teacher cannot simply take yesterday's screenshot and use it later. It also means a forwarded live code is much less useful because it expires quickly and the server still authenticates the person making the scan.

Schools that want stronger gate control can add approved network/Wi-Fi requirements or dedicated gate devices. Such mechanisms should be policy options, not hard-coded assumptions about every school's infrastructure.

### Existing QR compatibility

The repository already has an older `createAttendanceQr()` / `verifyAttendanceQr()` foundation and attendance methods including QR, face, fingerprint and card/device paths. The new staff self-check-in workflow must preserve those existing paths rather than replace them.

## Attendance rules

Normal student attendance is organized around:

**Class → date → roster → mark → resolve exceptions → save/submit**

Quick actions such as “All Present” are useful, with individual overrides.

Staff self-attendance is a separate workflow from recording another person's attendance.

Attendance must respect the school's configured timezone, expected resumption time and grace period. Calendar entries that disable attendance must be honored.

Where a staff self-check-in already exists for the day and direction, the system should reject a duplicate rather than silently create another record.

## Finance integrity

Finance must behave like a ledger.

A payment workflow should validate:

- school and account ownership;
- locked term rules;
- positive amount;
- supported payment method;
- required reference/transaction identifier when applicable;
- amount not exceeding the outstanding balance;
- duplicate reference/idempotent retry conditions;
- actor authorization.

Payment reversal is a new financial event with an audit trail. Never rewrite historical payment data merely to make a balance look correct.

Fee waivers, scholarships and consequential financial adjustments should use explicit approval rules.

## Guardian / family experience

Guardians should see only their authorized linked children and only information released to the family.

Important family information includes identity, released attendance/results, report cards, school messages, fee balances and relevant calendar information.

WhatsApp is an access channel, not a free-form AI-to-database backdoor. The assistant must verify guardian context, resolve authorized children, classify supported intents, query only needed data and refuse unsupported requests rather than guessing.

## Academic integrity

Scores must be checked against the correct school, class, subject and assessment. Locked/published academic records must not be casually modified. Report cards follow a deliberate lifecycle:

**Draft → Review → Approve → Publish → Family access → Archive**

The family should not see unapproved/unpublished academic results merely because the database contains them.

## AI inside SukuuNova

AI is an assistant, not the authority over school records.

AI-generated material is a draft. Official academic or operational records require the normal human approval workflow.

Safe rule:

> **AI suggests. A human decides. The normal application workflow records the decision.**

Only the minimum necessary school context should be sent to AI services.

## UI/UX and responsive design

SukuuNova is undergoing continuous visual and workflow consolidation.

Use semantic tokens for page backgrounds, surfaces, text, muted text, borders, accents, success/warning/danger and focus states. Do not scatter hard-coded cross-theme classes throughout specialised workspaces.

Mobile should preserve the same information architecture while adapting density and interactions for touch. Avoid horizontal overflow where possible, preserve readable touch targets and keep the primary action obvious.

A page must deliberately handle loading, empty, success, validation error, permission denied, not found, network/server error, saving/saved and destructive confirmation states.

The finance/installment area is a known UI-sensitive surface: mobile coloring must stay visually consistent with the correct desktop palette while retaining the mobile layout.

## Data model

The authoritative schema is `prisma/schema.prisma`.

Major model families include:

### Platform and tenancy

`PlatformAdmin`, `School`, `SchoolSettings`, `SchoolLoginDirectory`, `SubscriptionPlan`, `LoginRateLimit`, `PlatformPasswordResetToken`, `AuditLogPlatform`

### Users and authorization

`User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `UserPermissionOverride`, `SchoolPasswordResetToken`, `AuditLogSchool`

### Academic structure

`AcademicYear`, `Term`, `CalendarEvent`, `House`, `Class`, `Subject`, `ClassSubjectTeacher`

### Learners and families

`Student`, `Guardian`, `StudentGuardian`

### Attendance and identity

`AttendanceEvent`, `FaceEnrollment`, `FaceMatchReview`, `Device`, `DeviceIdentity`, `DeviceAttendanceReceipt`

### Academics

`Assessment`, `Score`, `ReportCard`, `ReportCardTemplate`, `AiDraft`

### Finance and payroll

`FeeItem`, `Invoice`, `InvoiceLine`, `Payment`, `PaymentReversal`, `SalaryStructure`, `PayrollRun`, `Payslip`

### Communication

`Message`

### Operations and safety

`TimetableSlot`, `SubstituteAssignment`, `VisitorLog`, `ApprovedPickup`, `PickupApprovalRequest`, `PickupEvent`

Specialized models may also exist. Always inspect the current schema before assuming a model or field exists.

## Major routes

Important school routes include:

- `/school/students`
- `/school/guardians`
- `/school/staff`
- `/school/classes`
- `/school/subjects`
- `/school/timetable`
- `/school/attendance`
- `/school/attendance/register`
- `/school/attendance/exceptions`
- `/school/attendance/check-in`
- `/school/attendance/display`
- `/school/gradebook`
- `/school/report-cards`
- `/school/fees`
- `/school/fees/invoices`
- `/school/fees/payments`
- `/school/fees/arrears`
- `/school/settings`
- `/school/communications/messages`
- `/school/communications/announcements`
- `/school/events`

The Teacher Portal is rooted at `/teacher` and includes attendance, gradebook, homework, timetable, messages and the staff school check-in entry point.

Some API paths retain historical internal names. Those are compatibility details only and do not represent product stages or roadmap terminology.

## Development rules

Before changing a workflow:

1. Find the route.
2. Inspect the page/component.
3. Inspect the API/server action.
4. Inspect reusable services/helpers.
5. Inspect the Prisma models and migrations.
6. Inspect authorization.
7. Inspect audit behaviour.
8. Inspect tests.
9. Check whether another route already performs the same business operation.
10. Consider production deployment impact.

Prefer existing shared primitives such as `withTenant()`, authorization/RBAC helpers, audit utilities, service layers, workspace shells and semantic design tokens.

Do not create a second business implementation merely because the existing one is inconvenient.

## Database and migration rules

Prisma migration directories are historical implementation records. Their old internal names must not be used to define product work.

The current schema is authoritative.

When changing the schema:

1. understand existing relationships;
2. preserve tenant isolation;
3. consider existing production data;
4. create a safe migration;
5. validate migration application against a production-style database;
6. update server logic;
7. update UI and validation;
8. consider rollback/recovery.

Never casually delete or rename production fields merely to simplify a screen.

## Testing standard

Tests must cover both the happy path and failure paths.

Important journeys include:

### Owner

Create school → establish academic year/term → create classes → add staff → assign teachers → enrol students → connect guardians → configure fees → record payments → configure timetable → enter marks → approve results → publish report cards → communicate with families.

### Teacher

Login → see only assigned work → take class attendance → check in to school where enabled → enter marks → manage homework → inspect timetable → communicate where permitted.

### Guardian

Login → see only linked children → see released attendance/results → inspect report card → view allowed fee information → receive communications.

### Bursar

Configure fees → invoice → full/partial payment → receipt → balance → reconciliation → reversal → audit.

### Gate/safety

Identify learner → verify approved pickup → process pickup or request approval → record final pickup event.

### Staff QR check-in

Authorized display user → live rotating QR → authenticated teacher scan → challenge verification → presence policy → single-use consumption → staff attendance → audit.

QR-specific failure cases must include:

- unauthorized display access;
- invalid signature;
- wrong school;
- wrong purpose;
- expired challenge;
- replayed challenge;
- concurrent submissions;
- inactive staff;
- teacher identity substitution attempt;
- duplicate same-day check-in;
- failed presence verification;
- rate limiting;
- manual/device/biometric attendance regressions.

## Deployment

Production is centred on Railway.

A change is not considered complete merely because a GitHub commit exists.

For production work, verify:

1. code is committed;
2. dependency/lockfile state is coherent;
3. CI/build checks pass;
4. migrations are safe and applied;
5. Railway deployment succeeds;
6. `/api/health` is healthy;
7. the affected browser workflow works;
8. relevant logs contain no unexpected runtime errors.

Do not perform production database changes casually.

## Environment configuration

Secrets belong in deployment/environment configuration and must never be committed or exposed to the browser.

Important categories include database access, school/platform auth secrets, AI configuration, messaging providers, WhatsApp configuration, deployment/runtime controls and development-only switches.

## Current engineering reality

SukuuNova has substantial foundations around multi-tenancy, authentication, permissions, audit logging, academics, finance, attendance, messaging, safety, platform management, subscriptions, support and AI drafts.

However, the route tree is larger than the amount of fully polished end-to-end workflow coverage. A route may be operational, partial, read-only, a safe fallback, visually complete but functionally incomplete, or awaiting integration.

Therefore:

> **Never infer feature completion from route existence, a polished card, a database model or a successful HTTP status alone.**

The working objective is system-wide coherence and correctness: finish real workflows, eliminate misleading prototype behaviour, strengthen tenant and role enforcement, improve responsive UX, improve loading/error/empty states, test real journeys and verify production.

## Current staff QR implementation status

The secure rotating staff QR work is being developed on the `feat/staff-qr-checkin` branch in draft PR #9. It is intentionally separate from `main` until dependency, build, security and browser validation pass.

The implementation includes a dedicated staff scanner, school display workflow, signed short-lived school challenges, authenticated teacher identity, presence verification and audit-based replay protection. It must not be described as production-complete until the complete validation chain passes.

The existing attendance code already supports QR plus other attendance methods, so the new staff self-check-in is an extension of the attendance system, not a replacement for existing attendance mechanisms.

## Future directions

SukuuNova is intended to grow into a deeper school operating platform, including:

- stronger hardware/device attendance infrastructure;
- secure biometric terminal integrations;
- offline-first attendance and gate workflows;
- Ghana-focused payment integrations and reconciliation;
- richer analytics and management intelligence;
- controlled AI school operations assistance;
- stronger academic support and intervention tooling;
- comprehensive family/mobile experiences;
- full communications campaigns and delivery analytics;
- digital admissions and enrolment;
- accounting/payment/document/calendar integrations;
- authorized group-level benchmarking without breaking tenant boundaries;
- partner APIs and webhooks.

Future integrations should live behind clear service boundaries and preserve the core tenant/security/audit model.

## Architectural red lines

Never:

- cross tenant boundaries;
- trust frontend-only authorization;
- expose secrets;
- silently mutate official academic/financial records with AI;
- fake successful persistence;
- destroy financial history casually;
- introduce competing design systems without reason;
- make destructive operations one-click by accident;
- assume a route means a feature is complete;
- replace an existing secure workflow without understanding its downstream dependencies.

## Definition of done

A SukuuNova feature is done when the intended user can complete the real workflow safely.

That means:

**Correct data + correct authorization + correct tenant scope + correct business rules + usable UI + complete states + auditability where needed + tests + successful production verification.**

The ultimate test is:

> **Could a real school use this operation confidently on a busy day without needing to understand how the database works?**

If not, keep working.

## AI coding-agent operating rule

For any task:

**Inspect deeply → understand the real workflow → trace UI → server → authorization → database → downstream effects → fix the underlying logic → enforce security → make the UI coherent → test the journey → verify production → move to the next problem.**

AI agents must:

- work only on SukuuNova;
- read this README before modifying the system;
- preserve tenant isolation and authorization;
- reuse existing services and primitives;
- avoid fake functionality;
- avoid unnecessary rewrites;
- avoid major dependency upgrades without a deliberate plan;
- treat migration names as historical technical identifiers;
- report uncertainty rather than inventing behaviour;
- never claim production success without actual deployment and health evidence.

SukuuNova is one evolving system. The goal is continuous improvement in reliability, usefulness, security and product coherence—not a sequence of product-stage gates.
