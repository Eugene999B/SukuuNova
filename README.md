# SukuuNova

SukuuNova is a secure, multi-tenant school operations platform built for real day-to-day school work, with particular attention to the needs of Ghanaian schools. The long-term product goal is to operate as the connected digital operating system of a school: people, academics, attendance, finance, communication, safety, transport, staffing, family relationships, identity, reporting and management decisions in one environment.

> **Repository rule:** this repository is for **SukuuNova only**. Do not copy assumptions, code, styles or workflows from another product unless they are deliberately adapted to SukuuNova's data model, security rules and school workflows.

## Product identity

| Area | Current choice |
| --- | --- |
| Repository | `Eugene999B/SukuuNova` |
| Primary branch | `main` |
| Application | Next.js App Router + TypeScript + React |
| UI | Tailwind CSS + shared SukuuNova CSS/design tokens |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Production hosting | **Railway** |
| Production database | Railway PostgreSQL |
| Authentication | Separate platform, school and guardian security domains |
| AI | Server-side OpenAI Responses API integration where enabled |

**Railway is the production deployment platform for SukuuNova.** GitHub may show checks or previews from other providers, but those are not production deployment evidence and are not the release gate. Production verification means Railway deployment, database migration status, `/api/health`, runtime logs and the real browser workflow.

SukuuNova has three connected user experiences:

1. **Platform** — the control plane above schools.
2. **School Workspace** — school owners, administrators, teachers and operational staff.
3. **Family / Guardian Experience** — controlled access to linked children and school-released information.

---

# Releases and recent updates

This section records product-level releases and important recent changes. Git history and pull requests remain the implementation record.

## 2026-09-11 — ID-card access and authorization repair

Merged to `main` through PR #109.

- Added the missing `identity_cards:manage` production permission backfill for canonical system roles whose SukuuNova baseline includes ID-card management.
- Prevented `/school/id-cards` from falling into the generic global error screen when the signed-in account lacks the ID-card permission.
- Added a proper permission message and links to Roles & Permissions, Staff & Teachers and Students.
- Restored visible ID-card access from Staff & Teachers for authorized users.
- Preserved explicit custom-role and user-level permission decisions instead of granting ID-card management indiscriminately.

## 2026-09-11 — Premium duplex school ID cards release candidate

Implemented in PR #111 on `feat/premium-duplex-school-id-cards`.

- Rebuilt student and staff ID cards as professional **front-and-back CR80 credentials**.
- Standard physical card size: **85.60 mm × 53.98 mm**.
- Added school logo, school branding, portrait, full name, Student ID / Staff ID, class or role, credential number, issue date, expiry and status.
- Moved the signed QR verification code to the back of the card.
- Added useful back-side information, school code, verification wording, return-if-found text and signature space.
- Student cards use the learner's admission/student number as the visible Student ID.
- Staff cards expose a stable SukuuNova Staff ID instead of only showing an internal credential serial.
- Individual downloads produce a two-page exact-CR80 PDF: front then back.
- Bulk downloads produce paired A4 front/back sheets with mirrored backs for duplex alignment.
- Added clear printing guidance: **100% / Actual Size — never Fit to Page**.
- Added direct **Print ID** action for a single current card.
- Added school-wide validity selection from 1 to 10 years, defaulting to **5 years**.
- Validity changes update active-card expiry and signed verification credentials.
- Reworked filtering so person type, class, status and search operate together.
- Added working actions for Print filtered, All students, All staff, Selected class, Selected cards and Whole school.
- Current, revoked and expired records are separated correctly; only current credentials are printable/selectable.
- Student and staff ID surfaces use the shared two-sided preview design.

### ID-card printing modes

**PVC / dedicated card printer**

- Use the single-person **Print ID** action.
- PDF page size is CR80: `85.60 × 53.98 mm`.
- Print at `100% / Actual Size`.
- Disable Fit, Shrink, Scale to page or automatic page resizing.

**A4 office printer / print shop**

- Use the bulk print actions.
- Fronts are arranged on A4 sheets.
- Corresponding backs are mirrored for duplex long-edge printing.
- Print at `100% / Actual Size`, duplex, long-edge flip.
- Cut on the printed card borders after printing/lamination as appropriate.

## September 2026 cumulative system improvements

The current codebase also documents and contains substantial work across access governance, academics, library circulation, recruitment, family academic work, learning tools, support operations and production hardening. Important themes include:

- safer role/permission synchronization without overwriting intentional restrictions;
- owner-account protection and readable effective-permission review;
- atomic gradebook saves and concurrency protection;
- stronger academic term selection, locked-record protection and report lifecycle controls;
- shared circulation logic for school library operations;
- recruitment workflow from vacancy/application review through staff conversion;
- guardian-linked academic work with server-side answer protection;
- Learning Arcade practice separated from official academic grades;
- stronger tenant isolation, RLS verification and production database-role safety;
- support-center and operational workflow improvements;
- Railway production hardening and explicit health verification.

---

# Product principles

## One connected system

Students, guardians, staff, classes, subjects, attendance, academics, finance, identity, safety and communication should reinforce each other instead of behaving like unrelated databases.

## Human workflow first

Build around what the user is actually trying to do.

- Teacher: class → date → roster → mark attendance.
- Bursar: account → balance → payment → receipt → reconciliation.
- Administrator: school setup → academic structure → staffing → learners → operations → review → communication.
- ID-card manager: filter people → verify portrait/data → print the right cards → distribute → verify by QR when needed.

## Safety over convenience

School data is sensitive. Prefer explicit permissions, tenant isolation, auditability, server-side authorization, confirmation for destructive actions and human review for consequential automation.

## Real functionality over decorative completeness

A page, button or beautiful component is not proof that a workflow works. SukuuNova must never simulate persistence, fake success or imply an integration is complete when the server-side operation is missing.

## Consistency is a product feature

Reuse navigation, typography, spacing, forms, tables, cards, status indicators, responsive behavior and semantic design tokens across the platform.

---

# Complete functional map

The following is the current product-level function inventory. Individual implementation details live in the route tree, services, schema and tests.

## Platform management

- School provisioning and lifecycle management.
- School status and operational investigation.
- Subscription plans and platform billing configuration.
- Platform support center.
- Platform audit trail.
- Controlled school impersonation for support.
- Platform administrator authentication and password recovery.
- School 360 / onboarding visibility.
- First-setup handoff and leadership-account provisioning.

School provisioning may create separate Owner/Principal/Administrator accounts where the workflow permits it. Temporary passwords are no-store handoff values and leadership accounts must replace temporary credentials at first login.

## School administration

- School profile and branding.
- School login code / identity.
- Academic years and terms.
- School calendar and events.
- Classes and levels.
- Houses.
- Subjects.
- Class teachers and subject-teacher assignments.
- School settings and appearance.
- User accounts and status management.
- Role and permission administration.
- Default-role review and selective permission upgrades.
- Audit history for consequential changes.

## Roles and permissions

- System roles.
- Custom roles.
- Role-permission assignment.
- User-specific permission grants and denials.
- Effective-permission preview.
- High-impact permission warnings.
- Owner protection.
- At-least-one-active-owner governance.
- Default-role synchronization without silently overwriting intentional restrictions.

Important default roles include Owner, Principal, Administrator, Vice Principal, Academic Coordinator, Department Head, Accountant, HR Officer, Admissions Officer, Class Teacher, Subject Teacher, Front Desk/Gate Security, Transport Officer, Parent and Student.

**Frontend visibility is never authorization.** Sensitive operations must be checked on the server.

## Admissions and enrolment

- Enquiries.
- Applicants.
- Application review.
- Screening information.
- Admission decisions.
- Acceptance / rejection workflow.
- Enrolment.
- Conversion into normal Student and Guardian records.
- Guardian relationship preservation.
- Conflict-safe applicant stage changes.

## Students

- Student creation and profile management.
- Admission/student number.
- Status.
- Class assignment.
- House assignment.
- Portrait/photo.
- Guardian relationships.
- Attendance history.
- Scores and report cards.
- Fees/invoices/payment relationship.
- Documents.
- Identity-card access.
- Pickup/safety relationship.

## Guardians and family relationships

- Guardian creation and management.
- Multiple-child relationships.
- Primary guardian relationship.
- Guardian contact details.
- Controlled access to linked children.
- Released attendance/results/report cards.
- Fee information where authorized.
- School messages and calendar information.
- Guardian academic work.
- Learning Arcade.

## Staff and teachers

- Staff account creation.
- Staff status.
- Roles.
- Contact information.
- Official portrait.
- Class leadership.
- Subject/class teaching assignments.
- Staff profile.
- Staff ID card.
- Staff attendance/check-in.
- Salary/payroll relationship.
- Temporary password/change-on-first-login controls.

Teachers are staff accounts with teaching assignments; the ID-card subsystem therefore prints teacher IDs through the staff credential path rather than maintaining a separate incompatible teacher-card model.

## School identity cards

Main workspace: `/school/id-cards`

Functions:

- Automatic reconciliation of current student/staff credentials.
- Student IDs and staff IDs.
- School logo and brand colors.
- Official portrait support with initials fallback.
- Front-and-back CR80 design.
- Exact CR80 single-card PDF.
- A4 bulk duplex print packs.
- QR verification.
- Signed verification URL.
- Card serial/credential number.
- Issue date.
- Configurable expiry/validity period.
- Current / revoked / expired status.
- Reissue.
- Revoke.
- All-student printing.
- All-staff printing.
- Class printing.
- Selected-card printing.
- Whole-school printing.
- Filtered-result printing.
- Name/ID/card/class/role search.
- Person-type filter.
- Class filter.
- Status filter.
- Profile links.
- Direct single-person **Print ID** action.
- Public verification page that reports live credential state without exposing unnecessary private contact information.

Printing standard:

- CR80: `85.60 × 53.98 mm`.
- Single card: exact CR80 PDF, front + back.
- Bulk: A4 paired front/back sheets.
- Print at `100% / Actual Size`.
- Duplex bulk printing: long-edge flip.

## Academics

- Academic-year and term configuration.
- Subjects.
- Class/subject teacher assignment.
- Assessments.
- Score entry.
- Gradebook.
- Spreadsheet mark/status paste.
- Keyboard mark-entry workflow.
- Atomic multi-cell saves.
- Concurrency snapshots/conflict rejection.
- Score status such as Present/Absent/Excused where supported.
- Moderation.
- Report cards.
- Report-card templates.
- Review/approval/publication lifecycle.
- Lesson planning.
- Lesson draft/revision/resubmission.
- Homework drafting/editing/assignment.
- Teacher Academic Studio.
- Submitted-answer review.
- Manual/objective assessment handling.
- Timetable.
- Substitute assignments.

Conceptual academic flow:

`Academic year → term → class → subject → teacher → assessment → score → moderation → report card → approval → publication`

Official academic history must not be silently rewritten after lock/publication.

## Report cards

- Draft report creation.
- Template-based presentation.
- Grade-scale integration.
- Review.
- Approval.
- Publication.
- Family visibility only after release.
- Archived/historical protection.

Lifecycle:

`Draft → Review → Approve → Publish → Family access → Archive`

## Attendance

- Student class register.
- Date/class roster workflow.
- Quick marking such as All Present with individual override.
- Attendance history.
- Attendance exceptions.
- Staff attendance.
- Staff self-check-in.
- QR attendance foundations.
- Device attendance.
- Face enrollment and face-match review.
- Device identity and attendance receipts.
- Replay/idempotency protections.
- School-timezone rules.
- Expected resumption time and grace period.
- Calendar-based attendance disabling.

## Staff QR School Check-In

Designed as a separate staff self-attendance workflow:

- Authorized attendance-display access.
- Short-lived school-wide QR challenge.
- Signed challenge/JWT design.
- Authenticated staff identity derived from the signed-in session.
- Same-school enforcement.
- Expiry/replay protection.
- Duplicate same-day protection.
- Optional/required school-presence signal depending on school policy.
- Audit trail.

The QR challenge must never be the source of the staff identity; the authenticated staff session is the source of truth.

## Finance

- Fee items/fee structures.
- Student invoices.
- Invoice lines.
- Outstanding balances.
- Full payments.
- Partial payments.
- Receipts.
- Arrears.
- Payment references.
- Reconciliation-oriented records.
- Payment reversals.
- Audit trail.
- Locked-period protections where configured.

Finance behaves like a ledger. Historical payments are not silently edited to manufacture a desired balance; a reversal is a new auditable event.

## Payroll

- Salary structures.
- Payroll runs.
- Payslips.
- Staff/payroll relationship.
- Permission-controlled payroll operations.

## Communication

- School messages.
- Announcements.
- SMS workflows.
- WhatsApp workflows where configured.
- Templates.
- Queues/outbox.
- Delivery status.
- Retry behavior.
- Emergency broadcast workflows.
- Family-facing school communication.

Provider integrations are optional and environment-driven.

## Safety, pickup and visitors

- Approved pickup relationships.
- Pickup approval requests.
- Pickup events.
- Gate/safety workflow.
- Visitor log.
- Consequential-event auditability.

## Transport

- Routes.
- Stops.
- Vehicles.
- Drivers.
- Student transport assignment.
- Operational route information.
- Infrastructure for deeper tracking/integration work.

## Feeding

- School meal operations.
- Meal planning.
- Daily service information.

## Library

- Physical catalogue.
- Digital resources.
- Borrowing/issue.
- Returns.
- Due dates.
- Server-calculated overdue state.
- Loan-duration configuration.
- Learner/material selection.
- Circulation history.
- Copy-count integrity on issue/return retries.
- Audited catalogue/circulation changes.
- Suppression of unsafe legacy links.

Digital resources may include textbooks, eBooks, PDFs, worksheets, past papers, audio, video and other school documents.

## Assets and inventory

- School assets.
- Stock/inventory concepts.
- Assignment.
- Maintenance.
- Retirement/disposal records.

## HR and recruitment

- Staff records.
- Vacancies.
- Public applicant intake.
- Screening questions.
- Application review.
- Candidate stages.
- Interviews/offers/status flow.
- Idempotent submission key.
- Deadline checks.
- Conversion of a hired candidate into a staff account using normal role-authority and temporary-password rules.

## Examinations / CBT

- Assessments.
- Examination schedules.
- Mark entry.
- Moderation.
- Results.
- Computer-based testing surfaces where implemented.

## Reporting and analytics

- Attendance reporting.
- Academic reporting.
- Finance/arrears reporting.
- Staff reporting.
- Operational dashboards.
- Management analytics.
- Authorized school/group comparison concepts.

Analytics must use real persisted data. Decorative/fake KPIs are not acceptable.

## Learning Arcade

Family-linked learning practice includes:

- Math Sprint.
- Word Builder.
- Logic Lab.
- Five-question rounds.
- Saved answers.
- Post-round teaching feedback.
- Child-specific history.
- XP/stars/levels/achievements.
- School-timezone streak.
- Difficulty adjustment.

Learning Arcade is practice only and does **not** write official school grades.

## AI assistance

AI is an assistant, never the authority over official records.

Safe rule:

> **AI suggests. A human decides. The normal SukuuNova workflow records the decision.**

Only the minimum necessary school context should be sent to an AI service. AI drafts must not bypass authorization, academic approvals, financial controls or audit requirements.

## Downloads, documents and exports

The application contains school download/export surfaces for authorized data. Export actions remain permission-controlled and tenant-scoped. Generated school documents must use real persisted data and should preserve the same access rules as their source records.

---

# Important routes

## School workspace

- `/school/students`
- `/school/guardians`
- `/school/staff`
- `/school/id-cards`
- `/school/classes`
- `/school/subjects`
- `/school/timetable`
- `/school/academics`
- `/school/gradebook`
- `/school/report-cards`
- `/school/attendance`
- `/school/attendance/register`
- `/school/attendance/exceptions`
- `/school/attendance/check-in`
- `/school/attendance/display`
- `/school/fees`
- `/school/fees/invoices`
- `/school/fees/payments`
- `/school/fees/arrears`
- `/school/communications/messages`
- `/school/communications/announcements`
- `/school/events`
- `/school/calendar`
- `/school/admissions`
- `/school/exams`
- `/school/feeding`
- `/school/devices`
- `/school/settings`

## Identity-card routes

- `/school/id-cards`
- `/school/students/[id]/id-card`
- `/api/school/identity-cards`
- `/api/school/identity-cards/student/[id]`
- `/api/school/identity-cards/staff/[id]`
- `/verify/id-card/[schoolCode]/[serial]`

## Teacher experience

The Teacher Portal is rooted at `/teacher` and includes the teacher's assigned academic/attendance/timetable/homework/messaging work plus the staff check-in entry point where enabled.

Some API paths retain historical internal names. Those are compatibility details and do not define the current product structure.

---

# Security and multi-tenancy

Every school is a tenant. School-owned records are scoped through `schoolId`, tenant-aware database access and PostgreSQL row-level security.

The required sequence for consequential operations is:

1. Authenticate the user.
2. Establish school/platform context.
3. Authorize the action.
4. Query through the tenant boundary.
5. Validate related records belong to the same school.
6. Apply business rules.
7. Perform the operation.
8. Audit consequential changes.

Never trust a client-provided `schoolId` or target identity when the authenticated session already determines the actor/context.

The application uses tenant-aware helpers such as `withTenant()` and production PostgreSQL row-level security. Production startup verifies the runtime database role does not have `SUPERUSER` or `BYPASSRLS` capabilities that would defeat tenant isolation.

Authentication domains are deliberately separated:

- Platform administrators: platform auth domain / `PLATFORM_AUTH_SECRET`.
- School users: school auth domain / `SCHOOL_AUTH_SECRET`.
- Guardians: guardian/family auth domain / `GUARDIAN_AUTH_SECRET`.

Passwords use `bcryptjs`; reset tokens are hashed and time/use constrained. Login throttling and security-sensitive state should be persisted rather than relying only on process memory.

School and platform audit trails are first-class records. Examples include permission changes, impersonation, payment reversals, approval/rejection, biometric operations, emergency communication, identity-card changes and destructive administration.

## Platform impersonation

Support impersonation is explicit, permission-gated, time-limited, reason-bound and audited. Never add hidden “god mode” access.

---

# Data model

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

`AttendanceEvent`, `FaceEnrollment`, `FaceMatchReview`, `Device`, `DeviceIdentity`, `DeviceAttendanceReceipt`, `IdentityCard`

### Academics

`Assessment`, `Score`, `ReportCard`, `ReportCardTemplate`, `AiDraft`

### Finance and payroll

`FeeItem`, `Invoice`, `InvoiceLine`, `Payment`, `PaymentReversal`, `SalaryStructure`, `PayrollRun`, `Payslip`

### Communication

`Message`

### Operations and safety

`TimetableSlot`, `SubstituteAssignment`, `VisitorLog`, `ApprovedPickup`, `PickupApprovalRequest`, `PickupEvent`

Additional specialized models exist. Always inspect the current schema before assuming a field or relationship exists.

---

# Railway production

Production is deployed on **Railway**, not Vercel.

The detailed runbook is in [`docs/RAILWAY_PRODUCTION.md`](docs/RAILWAY_PRODUCTION.md).

## Railway services

- `SukuuNova` application service from GitHub `Eugene999B/SukuuNova`, branch `main`.
- Railway PostgreSQL service.

## Deployment configuration

`railway.json` defines the production deployment behavior:

- Railpack builder.
- `node scripts/start-production.cjs` start command.
- `npm run db:migrate` pre-deploy command.
- `/api/health` health check.
- `ON_FAILURE` restart policy with retries.

The hardened production launcher creates/updates a restricted `sukuunova_app` PostgreSQL login for the web runtime so `FORCE ROW LEVEL SECURITY` remains effective. Railway migrations use the administrative `DATABASE_URL` before the runtime starts.

**Do not change production back to plain `next start`/`npm start` unless the hardened runtime behavior is intentionally preserved.**

## Core production environment variables

- `DATABASE_URL`
- `SCHOOL_AUTH_SECRET`
- `GUARDIAN_AUTH_SECRET`
- `QR_AUTH_SECRET`
- `PLATFORM_AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NODE_ENV=production`

Optional providers such as OpenAI, WhatsApp, SMS, email, AWS Rekognition and backup encryption are configured only when their corresponding integrations are enabled. See the Railway runbook for the complete environment-variable list.

## Railway release checklist

A production change is complete only after:

1. Code is reviewed and merged to `main`.
2. Dependencies/lockfile are coherent.
3. Required tests/build checks pass.
4. Railway runs the pre-deploy migration step successfully.
5. Railway deploys the new application revision successfully.
6. `/api/health` returns HTTP 200.
7. Runtime logs contain no unexpected startup/database errors.
8. The affected real browser workflow is tested against Railway production.

A GitHub commit, PR merge or third-party preview by itself is **not** production verification.

---

# Development workflow

Before changing a workflow:

1. Find the route.
2. Inspect the page/component.
3. Inspect the API/server action.
4. Inspect reusable services/helpers.
5. Inspect Prisma models/migrations.
6. Inspect authorization.
7. Inspect audit behavior.
8. Inspect tests.
9. Check whether another route already performs the same business operation.
10. Consider Railway production impact.

Prefer shared primitives such as `withTenant()`, RBAC helpers, audit utilities, service layers, workspace shells and semantic design tokens.

Do not create a second business implementation merely because the existing service is inconvenient.

## Database and migration rules

The current Prisma schema is authoritative; migration directories are historical implementation records.

When changing the schema:

1. Understand existing relationships.
2. Preserve tenant isolation.
3. Consider existing production data.
4. Create a safe migration.
5. Validate migration application against a production-style database.
6. Update server logic.
7. Update UI and validation.
8. Consider rollback/recovery.

Never casually delete or rename production fields simply to simplify a screen.

## Testing standard

Tests should cover both happy paths and failure paths, especially authorization, tenant isolation, locked/official data, retries, concurrency and destructive operations.

Important end-to-end journeys include:

- Owner: school setup → academic structure → staffing → learners/guardians → finance → timetable → marks → reports → communication.
- Teacher: login → assigned work → attendance → check-in where enabled → marks → homework → timetable → messaging.
- Guardian: login → linked children only → released attendance/results → report card → allowed fees → messages/learning practice.
- Bursar: fees → invoice → full/partial payment → receipt → balance → reconciliation → reversal → audit.
- Gate/safety: learner identification → approved pickup → approval if needed → final pickup event.
- ID-card manager: filter → verify data/photo → select scope → print exact CR80/A4 duplex → scan QR → confirm live credential status.

ID-card regression coverage should include:

- one current card per eligible active person;
- tenant-safe selection;
- student/class filtering;
- staff portrait data;
- exact CR80 single-card size;
- front/back page count;
- A4 bulk front/back sheets;
- signed QR tamper rejection;
- revoked/ineligible staff behavior;
- validity changes and expiry alignment.

---

# UI/UX rules

SukuuNova should use semantic tokens for backgrounds, surfaces, text, muted text, borders, accents, success/warning/danger and focus states.

Mobile should preserve the same information architecture while adapting density and interaction for touch. Avoid unnecessary horizontal overflow, keep readable tap targets and preserve a clear primary action.

Every important page should deliberately handle:

- loading;
- empty state;
- success;
- validation error;
- permission denied;
- not found;
- server/network error;
- saving/saved;
- destructive confirmation.

The visual quality of a screen must match the quality of its underlying workflow. A polished UI with fake/non-working actions is not accepted.

---

# AI coding-agent operating rule

For any task:

**Inspect deeply → understand the real workflow → trace UI → server → authorization → database → downstream effects → fix underlying logic → enforce security → make the UI coherent → test the journey → verify Railway production → move to the next problem.**

Agents working on SukuuNova must:

- work only on SukuuNova unless explicitly asked to inspect another repository for reference;
- deliberately adapt any external/reference implementation rather than copy it blindly;
- preserve tenant isolation and authorization;
- reuse existing services and primitives;
- avoid fake functionality;
- avoid unnecessary rewrites;
- avoid major dependency upgrades without a deliberate plan;
- treat migration names as historical technical identifiers;
- report uncertainty rather than invent behavior;
- never claim production success without actual Railway deployment and health evidence.

---

# Architectural red lines

Never:

- cross tenant boundaries;
- trust frontend-only authorization;
- expose secrets;
- silently mutate official academic/financial records with AI;
- fake successful persistence;
- destroy financial history casually;
- introduce a competing design system without reason;
- make destructive operations accidental/one-click;
- assume route existence means feature completion;
- replace an existing secure workflow without understanding downstream dependencies;
- call a non-Railway preview a production deployment.

---

# Definition of done

A SukuuNova feature is done when the intended user can complete the real workflow safely and confidently.

That means:

**Correct data + correct authorization + correct tenant scope + correct business rules + usable UI + complete states + auditability where needed + tests + successful Railway production verification.**

The final product question is:

> **Could a real school use this operation confidently on a busy day without needing to understand how the database works?**

If not, keep working.
