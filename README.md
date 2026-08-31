# SukuuNova

> **System handover document / source-of-truth README**
>
> This README is intentionally comprehensive so a new developer, Claude, Codex, or another engineering agent can understand the SukuuNova application by reading the repository README before making changes.

SukuuNova is a secure, multi-tenant school operations platform designed for Ghanaian schools. It brings school administration, people, academics, attendance and safety, family communication, fees and finance, staff/payroll, reporting, platform administration, and selected controlled automation/AI workflows into one application.

**Product name:** SukuuNova

**Repository:** `Eugene999B/SukuuNova`

**Default branch:** `main`

**Application stack:** Next.js App Router + React + TypeScript + Prisma + PostgreSQL

**Primary production environment used in the current development workflow:** Railway, with a PostgreSQL service attached to the application.

The application has evolved through an integrated Phase 0 → Phase 4 build. The current codebase also contains later incremental work, including the hardware/biometric attendance implementation and the current visual/theme/brand refinement work.

---

## 1. Current status

### Completed product phases

- **Phase 0 — Foundation:** complete and integrated.
- **Phase 1 — MVP school operations:** complete and integrated.
- **Phase 2 — Differentiators:** complete and integrated. This introduced the premium/differentiating operational capabilities such as face recognition, payroll, transport, feeding, CBT, library, assets, recruitment, and related workflows/guards.
- **Phase 3 — Operations:** implemented and merged into `main`. This expanded the product around real school operations, communications, reporting, staffing, attendance, scheduling, safety, and operational tooling.
- **Phase 4 — Platform maturity & controlled AI:** implemented and merged. It adds platform administration, subscriptions/billing/support, school groups, audited impersonation, risk signals, narrowly-scoped WhatsApp assistance, human-gated AI drafting, and emergency broadcast confirmation.

### Current incremental work after Phase 4

The codebase has continued to receive incremental improvements on top of the completed phase scope. Current/recent work includes:

- hardware/biometric attendance support;
- device registration and device identity management;
- device attendance receipts with idempotency/nonces;
- refinement of the SukuuNova public homepage;
- high-contrast SukuuNova branding for white surfaces;
- restoration of user-selectable visual themes on the homepage and signed-in areas;
- consolidation of theme selection so Settings and the global picker use the same four presets;
- ongoing visual/accessibility/performance refinement.

### Current deployment state

The application is connected to Railway production under the project/service used for SukuuNova. The application service and PostgreSQL service are separate Railway services.

Recent deployments have successfully passed the production healthcheck at `/api/health`. The build pipeline currently reaches the Next.js production build successfully. The repository still has non-blocking lint/audit/deprecation warnings that are documented below and should be cleaned up deliberately rather than by making unrelated breaking upgrades.

### Important scope rule for future agents

**This repository/chat work is for SukuuNova only.** Do not modify unrelated systems or repositories when working on this application.

---

# 2. What SukuuNova is

SukuuNova is not just a student database. It is intended to operate as a full school-management workspace with separate platform-level and school-level control planes.

At a high level there are three major perspectives:

1. **Platform:** the SukuuNova operator/super-admin side that manages schools, plans, support, platform billing, audits, searches, and audited impersonation.
2. **School:** the school tenant side where school owners/administrators and staff run the school's day-to-day operations.
3. **Guardian/family:** the parent/guardian side for family-facing activity, including student-related status and selected communication/assistant interactions.

There are also dedicated teacher workflows inside the school environment.

The application is intentionally multi-tenant: school-owned records carry a `schoolId` boundary and school-to-school data must never leak across tenants.

---

# 3. Main user/authority model

## Platform administration

Platform administration is separate from school administration. Platform users authenticate through the platform authentication universe and use platform permissions.

The platform side covers:

- school creation and management;
- school suspension/reactivation;
- school lookup/search;
- plan/subscription management;
- per-school platform billing records;
- platform payment reconciliation;
- support/inbox operations;
- platform analytics/reports/health/audit views;
- platform notifications;
- worker/access controls;
- audited impersonation into a school context;
- platform-level configuration.

A critical security distinction exists between permissions such as:

- `schools:manage`
- `schools:impersonate`

These are intentionally separate privileges.

## School ownership and administration

Within a school tenant, the application supports roles, permissions, role assignments, and per-user permission overrides.

Core school-side responsibilities include:

- school profile/settings;
- academic setup;
- people/staff/students/guardians;
- classes/subjects/teachers;
- attendance;
- academics/assessments/scores/gradebook;
- report cards;
- fees/invoices/payments/arrears;
- payroll;
- communication and announcements;
- timetable and substitutions;
- admissions;
- events/calendar;
- library, inventory/assets, recruitment, feeding, transport and other premium modules;
- safety/pickup/visitor workflows;
- devices and biometric attendance;
- reporting/export/help/settings.

## Teachers

Teacher workflows are kept narrower than school administration and include dedicated teaching, attendance, gradebook, homework, students, timetable, and module views.

Teacher access continues to be governed by the school's role/permission system.

## Guardians/families

Guardian access is a separate authentication/workspace path. Guardian-facing workflows are tied to the student's school and guardian relationship and include family/student status and selected communication functionality.

The WhatsApp assistant is also guardian-oriented but is intentionally **not** a general-purpose AI agent.

---

# 4. Authentication and authorization

SukuuNova uses separate authentication universes for platform and school access.

### Platform auth

Platform accounts are represented by `PlatformAdmin` and use `PLATFORM_AUTH_SECRET`.

Platform password reset is separate from school password reset.

### School auth

School users are represented by `User` rows under a specific `School` and use `SCHOOL_AUTH_SECRET`.

School password reset tokens are stored as hashes and expire/mark as used.

### Guardian auth

Guardian login and password-reset routes are implemented separately from the school-user routes.

### Rate limiting

Login throttling state is stored through `LoginRateLimit` rather than relying only on process memory, allowing protection to survive normal request distribution.

### Password security

Passwords are stored as hashes using `bcryptjs`.

Password-reset tokens are stored as hashes rather than plaintext tokens.

Reset links are not returned by reset APIs and are not intentionally rendered back into client UI.

For local development only, `ALLOW_DEV_TOKEN_ECHO=true` can enable a server-side console warning containing a reset link. It is not honored when `NODE_ENV=production`.

---

# 5. Multi-tenant security model

Tenant isolation is a core product requirement, not a UI convention.

Every school-owned entity uses `schoolId` and school-scoped relationships where appropriate. New tenant-scoped work should preserve this pattern.

The application uses:

- PostgreSQL Row-Level Security where configured by the security/deployment model;
- a dedicated tenant transaction/context pattern (`withTenant()` and related authorization helpers);
- composite same-school relationships for many school-owned foreign keys;
- explicit school authorization checks;
- audited write operations where the feature requires it.

### Rules for future changes

Do not:

- trust a client-supplied `schoolId` without deriving/verifying tenant context;
- join a record from another school merely because its primary key matches;
- add a school-owned table without a clear tenant boundary;
- bypass the existing transaction/authorization helpers for convenience;
- expose platform impersonation as an invisible backdoor.

### Impersonation

Platform impersonation is explicitly auditable.

It is:

- permission-gated;
- time-bounded to 30 minutes;
- reason-required;
- logged at platform level;
- logged at school level;
- visible to the impersonated school's audit view.

The point is to support legitimate platform troubleshooting without hiding administrator activity.

---

# 6. Core data model

The main Prisma schema is in `prisma/schema.prisma`.

Important models currently include:

### Platform / tenancy

- `PlatformAdmin`
- `AuditLogPlatform`
- `SubscriptionPlan`
- `SchoolLoginDirectory`
- `LoginRateLimit`
- `PlatformPasswordResetToken`
- `School`
- `SchoolSettings`

### School identity / access

- `User`
- `Role`
- `Permission`
- `RolePermission`
- `UserRole`
- `UserPermissionOverride`
- `SchoolPasswordResetToken`
- `AuditLogSchool`

### Academic calendar

- `AcademicYear`
- `CalendarEvent`
- `Term`
- `House`

### People / class structure

- `Student`
- `Guardian`
- `StudentGuardian`
- `Class`
- `Subject`
- `ClassSubjectTeacher`

### Attendance / academic performance

- `AttendanceEvent`
- `Assessment`
- `Score`
- `ReportCard`
- `ReportCardTemplate`

### Finance

- `FeeItem`
- `Invoice`
- `InvoiceLine`
- `Payment`
- `PaymentReversal`

### Communication

- `Message`

### Timetable

- `TimetableSlot`
- `SubstituteAssignment`

### Biometric / safety

- `FaceEnrollment`
- `FaceMatchReview`
- `ApprovedPickup`
- `PickupApprovalRequest`
- `PickupEvent`
- `VisitorLog`

### Staff/payroll

- `SalaryStructure`
- `PayrollRun`
- `Payslip`

### Hardware attendance

- `Device`
- `DeviceIdentity`
- `DeviceAttendanceReceipt`

### Additional Phase 3/4 models

The complete schema contains additional operational/platform/Phase 4 entities beyond the core list above. **Read `prisma/schema.prisma` before extending any data flow; do not assume the README list is exhaustive at the model-field level.** The schema is the final authority for exact columns, indexes, relation names, uniqueness constraints, and deletion behavior.

---

# 7. School operations covered by the application

## Students

The student model is school-scoped and supports:

- admission number;
- name/date of birth;
- class placement;
- house placement;
- status;
- photo reference;
- guardian relationships;
- attendance;
- academic scores;
- report cards;
- invoices;
- biometric identity/enrollment;
- pickup/safety records.

## Guardians and families

Guardians can be linked to one or more students through `StudentGuardian`, including relationship type and primary-guardian designation.

Guardian records are also used by family-facing attendance/pickup/communication workflows.

## Houses

Schools can organize students into houses with name/code, optional color/description, and active status.

## Classes, subjects and teachers

Classes have class teachers and students. Subjects are linked to class/teacher assignments through `ClassSubjectTeacher`.

This structure feeds academics, attendance, timetable, and teaching workflows.

## Academic years and terms

A school has academic years, calendar events, and terms. Terms can be locked and are referenced by academic assessments, report cards, and fee items/invoices.

The calendar can also indicate whether an event affects attendance or transport.

---

# 8. Attendance and safety

Attendance is a first-class feature and is implemented for both students and staff.

Attendance events can carry:

- student or staff identity;
- event type;
- method;
- timestamp;
- attendance date;
- late flag;
- confidence score;
- device reference;
- recorder.

### Hardware/biometric attendance

The current codebase includes hardware attendance support through:

- registered `Device` records;
- `DeviceIdentity` mappings for external device identities;
- attendance receipts;
- idempotency keys;
- nonce protection;
- device/status/last-seen tracking;
- API ingestion via `/api/devices/attendance`.

### Face recognition

The Phase 2/3/4 feature set includes face enrollment and match review functionality. The application uses AWS Rekognition-related tooling for face vectors/recognition references.

Face-related settings include school-level match thresholds and guardian consent relationships where required.

Face matching should not silently become a record mutation path; reviewed/authorized workflows remain the source of truth.

### Pickup safety

Pickup functionality distinguishes between:

- pre-approved guardians;
- pickup requests needing approval;
- approved pickup records;
- actual pickup events;
- approving/requesting users.

### Visitor management

`VisitorLog` records visitor name, optional phone, purpose, host staff, time-in, and time-out.

### At-risk signals

Risk scanning combines attendance, score trends, and fee arrears to identify students who may require attention.

The signal is surfaced to authorized school staff. It does **not** automatically notify parents.

---

# 9. Academics

The academic system supports:

- assessments;
- assessment types and weights;
- max scores;
- term/class/subject grouping;
- individual student scores;
- gradebook workflows;
- academic performance views;
- term-readiness and completion tooling;
- exports;
- report-card generation;
- report-card approval/submission/sent states;
- printable report cards;
- configurable report-card templates.

The `ReportCard` record stores calculation snapshots/versioning so generated results can be traced to a specific calculation state.

### Assessment integrity

Scores are tenant-scoped and entered by a school user. Academic reporting should use the application's existing calculation services rather than reimplementing grading rules inside UI pages.

### AI-assisted report remarks

AI-generated report-card remarks are drafts only. They are stored in an `AiDraft` workflow (where implemented by the Phase 4 feature set) with a suggested state and require explicit human acceptance before becoming part of the real report-card write path.

---

# 10. Fees and finance

The finance area covers:

- fee definitions/items;
- term/class fee targeting;
- student invoices;
- invoice lines;
- payments;
- payment methods/references;
- payment reconciliation metadata;
- payment reversals;
- arrears/overviews/reports;
- printable finance evidence.

Important finance design principles:

- invoices remain linked to the student and term;
- invoice lines point to real fee items;
- payments are separate records;
- reversals are separate records rather than destructive payment edits;
- financial records are tenant-scoped;
- existing finance safeguards should be preserved when changing UI/API behavior.

---

# 11. Staff, HR and payroll

Staff users are normal school-scoped `User` records with role/permission control.

The application includes:

- staff directory/workspace;
- recruitment workflow;
- salary structures;
- payroll runs;
- payslips;
- payroll printing/PDF support;
- staff attendance;
- teacher/class/subject assignments;
- substitute teacher assignment.

Payroll is a controlled premium capability and participates in feature-flag enforcement.

---

# 12. Timetable and teaching

The timetable system supports:

- class/subject/teacher slots;
- day-of-week and period placement;
- teacher timetable views;
- class timetable views;
- substitute assignments;
- printable timetable studios;
- timetable configuration in school settings.

Teacher-facing tools include:

- teacher dashboard/workspace;
- attendance;
- gradebook;
- homework;
- students;
- timetable;
- teaching/module views.

---

# 13. Admissions and people operations

The school application includes admissions workflows for:

- enquiries;
- applications;
- enrolment.

It also includes people/staff/student/guardian management and supporting quick search/export views.

---

# 14. Communication

The application provides several communication mechanisms:

- messages;
- broadcasts;
- announcements;
- alerts;
- communication settings;
- notification persistence and delivery handling;
- SMS/WhatsApp-related provider integration;
- school communication workspace.

Messages are persisted as `Message` records with status/attempt information and optional template/media data.

### Notification delivery model

The existing application supports HTTP-based provider delivery for notifications. Provider failures are caught/logged and stored as failed delivery status rather than being allowed to crash the school operation request.

The current deployment strategy is compatible with short-lived/serverless requests; do not introduce a permanent in-process worker without considering the deployment model.

---

# 15. WhatsApp parent assistant

The Phase 4 WhatsApp assistant is deliberately narrow.

Supported intent areas are:

- child arrival/status;
- fee balance;
- next recorded calendar event.

It is **not** a free-form LLM agent connected directly to the database.

Unsupported or ambiguous queries receive a safe fallback rather than a fabricated answer.

The route is:

`POST /api/phase4/whatsapp`

Authentication/webhook protection uses the configured WhatsApp webhook secret where required by the deployment configuration.

---

# 16. Controlled AI architecture

Phase 4 AI functionality uses **OpenAI's Responses API** for narrowly-scoped draft generation.

Configuration:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_RESPONSES_URL`

The default configured model name in the current code path is `gpt-5.6-luna` unless overridden by environment configuration.

### AI data minimization

AI generation should receive only the context needed for the requested draft.

Examples:

**Report-card remark drafting:** aggregate score percentages, attendance counts, class/term context, student display name, and other deliberately limited reporting context.

**Lesson-note drafting:** subject/topic/objectives/class context and an optional target-score identifier/context.

The system should not send the entire school database to the model.

### AI safety boundary

AI output is draft content only.

It must:

1. create/store a suggested draft;
2. wait for an authorized human;
3. allow human review/editing;
4. require explicit accept/discard;
5. use the normal application write path and audit logging after acceptance.

The model is not permitted to directly mutate scores, report cards, invoices, attendance records, or other school records.

---

# 17. Emergency / lockdown broadcast

SukuuNova includes an emergency/lockdown broadcast workflow.

It requires a two-step confirmation token and then reuses the existing messaging infrastructure.

This is intentionally stricter than an ordinary announcement because it can affect safety-critical communication.

Emergency broadcasts should remain audited and permission-gated.

---

# 18. School groups / multi-branch reporting

Phase 4 introduced multi-branch School Groups.

The intent is:

- one owning school Owner can request consolidated reporting;
- branch records remain isolated by tenant;
- consolidated reporting is read-only;
- underlying branch queries still execute in independent tenant contexts.

The feature must never become a mechanism for casually merging tenant-owned student/staff/finance rows.

---

# 19. Platform subscriptions and billing

Platform administration supports:

- subscription plans;
- school-to-plan assignment;
- plan feature flags;
- platform invoices;
- manual payment reconciliation;
- billing views;
- feature availability enforcement.

Premium school modules are protected by feature flags at the route/service boundary rather than merely hidden in navigation.

Examples of premium/differentiator modules include:

- face recognition;
- payroll;
- transport;
- feeding;
- CBT;
- library;
- assets/inventory;
- recruitment.

Do not assume that hiding a menu item is sufficient protection.

---

# 20. Theme and visual system

The current visual system is shared across the public homepage and signed-in application areas.

### Global theme system

Implemented in:

- `src/components/ThemeProvider.tsx`
- `src/components/ThemeSwitcher.tsx`
- `src/app/theme-home.css`
- `src/app/home-redesign.css`
- `src/app/home-premium.css`
- `src/app/design-tokens.css`
- `src/app/school/settings/ThemePreferences.tsx`

Theme choices persist in local storage under:

`sukuunova-theme-preferences`

The system tracks:

- light/dark mode;
- accent;
- interface density.

### Current named presets

1. **Paper** — bright, clean and calm.
2. **Midnight** — deep navy with clear text.
3. **Slate** — cool dark workspace.
4. **Warm** — soft cream and ink.

These presets intentionally avoid extremely saturated/blinding surfaces.

The global theme picker is available across the public and signed-in areas through the shared provider/switcher.

Settings uses the same preset system rather than maintaining an independent Light/Dark + accent selector that can conflict with the global picker.

### Accessibility intent

Theme styling should prioritize:

- readable text/background contrast;
- clear borders;
- restrained accent colors;
- visible focus states;
- consistent surfaces in dark mode;
- no reliance on color alone for status meaning.

Do not add extremely bright gradients or fluorescent text that compromises readability.

---

# 21. SukuuNova branding

Official branding assets live under `public/brand/`.

The current full SVG is:

`public/brand/sukuunova-logo.svg`

The compact public homepage header uses the favicon mark plus a text wordmark so the brand remains crisp at small sizes.

The full SVG wordmark was corrected for white surfaces so it no longer depends on a pale/white gradient that becomes faded on light backgrounds.

### Current homepage brand treatment

The homepage header is deliberately high contrast. Do not reintroduce a pale wordmark for the white/bright theme.

When editing homepage CSS, remember that the project still contains several layered legacy/premium/theme stylesheets. Check rule order before assuming an earlier rule will win.

---

# 22. Homepage

The main public homepage is:

`src/app/page.tsx`

It currently includes:

- SukuuNova compact branding;
- primary navigation;
- platform login entry;
- school login entry;
- hero section;
- hero actions;
- product preview;
- school-leader/staff-family/trust cards;
- students/families, academics, attendance/safety, and fees/finance module cards;
- closing call-to-action;
- lead/contact interaction;
- footer.

The homepage imports multiple style layers:

- `home.css`
- `home-redesign.css`
- `home-premium.css`
- `theme-home.css`

When changing homepage visuals, inspect all four in cascade order.

---

# 23. Important routes

The current application contains a large App Router surface. The following are important route families.

## Public routes

- `/`
- `/about`
- `/contact`
- `/features`
- `/features/[slug]`
- `/features/students-families`
- `/features/academics`
- `/features/attendance-safety`
- `/features/fees-finance`
- `/for-schools`
- `/icon.svg`

## Login/auth routes

- `/login/platform`
- `/login/platform/password-reset`
- `/login/school`
- `/login/school/password-reset`
- `/login/guardian`
- `/login/guardian/password-reset`
- `/account/security`

## Platform routes

- `/platform`
- `/platform/admins`
- `/platform/admins/access`
- `/platform/analytics`
- `/platform/audit`
- `/platform/audit-log`
- `/platform/billing`
- `/platform/forgot-password`
- `/platform/health`
- `/platform/inbox`
- `/platform/notifications`
- `/platform/plans`
- `/platform/reports`
- `/platform/reset-password`
- `/platform/schools`
- `/platform/schools/[id]`
- `/platform/schools/new`
- `/platform/search`
- `/platform/settings`
- `/platform/support`

## School routes

- `/school/[...module]`
- `/school/academics/health`
- `/school/academics/performance`
- `/school/academics/setup`
- `/school/academics/term-completion`
- `/school/admissions/applications`
- `/school/admissions/enquiries`
- `/school/admissions/enrolment`
- `/school/attendance`
- `/school/attendance/exceptions`
- `/school/classes`
- `/school/communications/alerts`
- `/school/communications/announcements`
- `/school/communications/broadcasts`
- `/school/communications/messages`
- `/school/communications/settings`
- `/school/downloads`
- `/school/events`
- `/school/exams`
- `/school/feeding`
- `/school/fees`
- `/school/fees/arrears`
- `/school/fees/evidence`
- `/school/fees/invoices`
- `/school/fees/overview`
- `/school/fees/payments`
- `/school/fees/payroll`
- `/school/fees/payroll/payslips/[id]/print`
- `/school/fees/reports`
- `/school/gradebook`
- `/school/gradebook/studio`
- `/school/guardians`
- `/school/help`
- `/school/homework`
- `/school/hr/recruitment`
- `/school/inventory`
- `/school/lessons`
- `/school/library`
- `/school/people`
- `/school/report-cards`
- `/school/report-cards/[id]/print`
- `/school/reports`
- `/school/reports/analytics`
- `/school/settings`
- `/school/settings/access`
- `/school/settings/devices`
- `/school/settings/handout`
- `/school/settings/reporting`
- `/school/settings/roles`
- `/school/staff`
- `/school/students`
- `/school/students/[id]`
- `/school/students/create`
- `/school/subjects`
- `/school/terms`
- `/school/timetable`
- `/school/timetable/print`
- `/school/timetable/print-guide`
- `/school/transport`

## Teacher routes

- `/teacher`
- `/teacher/attendance`
- `/teacher/gradebook`
- `/teacher/homework`
- `/teacher/module`
- `/teacher/students`
- `/teacher/timetable`

## Guardian routes

- `/guardian`
- `/guardian/[...module]`

## Public job/presence routes

- `/jobs/[schoolId]/[token]`

---

# 24. API surface

The application contains a large set of API routes. Important route families include:

## Authentication

- `/api/auth/guardian/login`
- `/api/auth/guardian/logout`
- `/api/auth/platform/login`
- `/api/auth/platform/logout`
- `/api/auth/platform/password-reset/request`
- `/api/auth/platform/password-reset/confirm`
- `/api/auth/platform/reset`
- `/api/auth/school/login`
- `/api/auth/school/logout`
- `/api/auth/school/password-reset/request`
- `/api/auth/school/password-reset/confirm`

## Health/scheduling/device

- `/api/health`
- `/api/cron/risk-scan`
- `/api/devices/attendance`

## MVP APIs

- `/api/mvp/attendance`
- `/api/mvp/finance`
- `/api/mvp/gradebook`
- `/api/mvp/report-cards`
- `/api/mvp/report-cards/[id]/pdf`
- `/api/mvp/settings`
- `/api/mvp/setup`

## Phase 2 APIs

- `/api/phase2/context`
- `/api/phase2/face`
- `/api/phase2/payroll`
- `/api/phase2/payroll/payslips/[id]/pdf`
- `/api/phase2/pickups`
- `/api/phase2/roles`
- `/api/phase2/settings`
- `/api/phase2/staff-attendance`
- `/api/phase2/templates`
- `/api/phase2/timetable`
- `/api/phase2/visitors`

## Phase 3/operations APIs

- `/api/phase3/[module]`
- `/api/school/access`
- `/api/school/academic-engine`
- `/api/school/academics/performance`
- `/api/school/academics/performance/export`
- `/api/school/academics/term-readiness`
- `/api/school/announcements`
- `/api/school/communications`
- `/api/school/devices`
- `/api/school/devices/identities`
- `/api/school/exports/[dataset]`
- `/api/school/homework`
- `/api/school/lesson-plans`
- `/api/school/operations/library`
- `/api/school/operations/recruitment`
- `/api/school/quick-search`
- `/api/school/settings`
- `/api/school/settings/reporting`
- `/api/school/terms`
- `/api/school/terms/[id]`

## Phase 4 APIs

- `/api/phase4`
- `/api/phase4/whatsapp`
- `/api/platform/phase4`
- `/api/platform/impersonation`
- `/api/platform/admin`
- `/api/platform/worker-access`
- `/api/platform/inquiries/[id]`
- `/api/platform/schools`
- `/api/platform/public`

## Other public/protected APIs

- `/api/public/inquiries`
- `/api/public/jobs/[schoolId]/[token]`
- `/api/public/presence`
- `/api/public/site`
- `/api/protected/students-preview`

The exact request/response contract is defined by each route file. Read the implementation before changing client expectations.

---

# 25. Phase 4 platform API responsibilities

The Phase 4 platform endpoint is responsible for platform-side operations around:

- school management;
- subscription plan operations;
- platform billing;
- support/inbox;
- search;
- platform-level reporting/operations;
- audited impersonation initiation/control.

`/api/platform/impersonation` is used to end/transition an active audited impersonation session as implemented by the current application.

---

# 26. Offline synchronization rule

Offline synchronization is deliberately restricted.

The current policy allows synchronized records only for:

- attendance;
- score records.

Synchronization must use:

- idempotent client-generated keys;
- live permission validation at synchronization time;
- tenant-safe write paths.

Do not expand offline sync to financial or other high-risk records without explicitly revisiting the security model.

---

# 27. Storage and files

The current repository does not implement a generic persistent filesystem-upload architecture.

Do not assume the Vercel/Railway application filesystem is persistent storage for user files.

For future persistent uploads (student documents, ID cards, images, report artifacts, etc.), use a proper object-storage strategy and update the security/data-retention design accordingly.

Face recognition integration uses AWS Rekognition-related services/references rather than a simple local filesystem embedding store.

`ReportCard` and `Payslip` currently support PDF URL/data fields in the database model, which should be handled carefully because large database blobs have operational implications.

---

# 28. Environment variables

Provider configuration is environment-driven and secrets must never be hardcoded.

The intended environment set includes:

### Database

- `DATABASE_URL`
- `TEST_DATABASE_URL`

### Authentication

- `SCHOOL_AUTH_SECRET`
- `PLATFORM_AUTH_SECRET`

### SMS

- `SMS_PROVIDER_URL`
- `SMS_PROVIDER_TOKEN`
- `SMS_SENDER_ID`

### Email/password reset

- `EMAIL_PROVIDER_URL`
- `EMAIL_PROVIDER_TOKEN`
- `EMAIL_FROM`
- `ALLOW_DEV_TOKEN_ECHO`

### AWS/biometric

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `FACE_EMBEDDING_ENCRYPTION_KEY`

### Twilio/WhatsApp

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `WHATSAPP_WEBHOOK_SECRET`

### OpenAI

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_RESPONSES_URL`

### Risk scheduling

- `RISK_SCAN_CRON_SECRET`
- `RISK_SCAN_INTERVAL_MS`

`RISK_SCAN_INTERVAL_MS` is now documentation/configuration for the desired scheduler cadence rather than permission to create an in-process timer in the application.

Always consult `.env.example` for the current canonical environment-variable list. Never commit real credential values.

---

# 29. Risk scan / scheduler architecture

Risk scanning is implemented as a protected HTTP endpoint:

`POST /api/cron/risk-scan`

It requires:

`Authorization: Bearer <RISK_SCAN_CRON_SECRET>`

The route performs a single pass and returns. It does not keep an in-process timer alive.

The repository includes an external scheduler workflow intended to trigger the risk scan approximately every six hours. This design keeps the application compatible with short-lived/serverless execution environments as well as Railway.

The scheduler can be replaced by another HTTP scheduler later without changing the core risk-scan endpoint.

---

# 30. Database and migrations

Prisma is the application's ORM/schema tool.

Useful scripts from `package.json` include:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run db:generate
npm run db:migrate
npm run db:seed
```

`db:migrate` currently runs a biometric migration bootstrap script and then `prisma migrate deploy`.

### Migration rule

Do not casually run destructive resets against a real school database.

For production:

1. review migration contents;
2. use the intended production database role;
3. run migrations deliberately;
4. verify tenant isolation afterward.

---

# 31. Seed and test data strategy

The repository contains:

`prisma/seed.ts`

The long-term test strategy is to create coherent, internally-consistent test data rather than random filler.

The planned comprehensive test dataset should eventually cover, as appropriate for the intended test environment:

- platform administrator(s);
- subscription plans;
- multiple schools/tenants;
- school owners/admins;
- teachers/staff;
- guardians/families;
- students;
- classes/subjects/houses;
- academic years/terms/events;
- assessments and scores;
- attendance history;
- invoices/fees/payments/arrears;
- report cards;
- timetables/substitutions;
- announcements/messages;
- admissions records;
- pickup and visitor records;
- biometric/device records;
- payroll runs/payslips;
- operational/premium modules;
- support/audit/platform activity;
- AI drafts/risk signals where safely applicable.

**Important:** this comprehensive populated test environment has been identified as a future testing task. Do not represent it as already completed merely because `prisma/seed.ts` exists.

When creating test data, preserve relationships. Example: a student's class, class teacher, subject assignment, attendance, guardian, invoice, payment, assessment scores, and report card should all refer to the same coherent school/student context.

Do not seed fabricated sensitive-looking real-person information into production.

---

# 32. Verification and test expectations

The product has been built around automated verification, including:

- Prisma migration checks;
- Vitest test suite;
- type checking/diagnostics;
- production build;
- tenant-isolation/security invariants;
- Phase 4-specific permission and approval boundaries.

The historical Phase 4 verification run passed:

- migrations;
- all 35 tests;
- typecheck diagnostics;
- production build.

The current repository has since continued to change, so future agents should run the current `npm run test` and production `npm run build` before claiming that the historical verification status is still fully current.

---

# 33. Current build warnings and technical debt

The current Railway production build has been succeeding while reporting non-blocking warnings.

Examples currently observed include:

- unused variables/values in several routes/components;
- missing React Hook dependencies in a few components;
- `<img>` optimization warnings where `next/image` could be used;
- a memo dependency warning in timetable print code;
- Prisma warning that the `package.json#prisma` configuration property is deprecated and should eventually move to `prisma.config.ts`;
- npm audit reporting 5 vulnerabilities in the current dependency tree at build time (1 moderate, 4 high).

These are **not equivalent to a failed deployment**. They should be triaged and fixed deliberately.

Do not run `npm audit fix --force` or major dependency upgrades blindly in a production application. Review the dependency graph and test the application after each intentional upgrade.

Do not upgrade Prisma to a new major version merely to silence the deprecation warning without reviewing migration/configuration impact.

---

# 34. Runtime/deployment model

The current production application is deployed on Railway with:

- a `SukuuNova` application service;
- a PostgreSQL service.

The Next.js application currently uses a standard production start command equivalent to:

```bash
npx next start --port ${PORT:-3000} --hostname 0.0.0.0
```

The application exposes `/api/health` and Railway's healthcheck has successfully reached that endpoint in recent deployments.

### Deployment expectations

- source changes are pushed to `main`;
- Railway automatically builds/deploys the connected service;
- deployment state should be checked before making assumptions about production;
- migrations should not be bundled casually into frontend build logic;
- database state should be preserved between application deployments.

The current repository was previously evaluated for Vercel compatibility, and much of the application is still compatible with Next.js serverless-style execution. However, **the present working production target is Railway**. Do not change the deployment platform merely because older documentation mentions Vercel.

---

# 35. Vercel compatibility notes

A previous deployment design adapted the application for Vercel free-tier/serverless operation.

The code still contains serverless-safe patterns such as:

- one-shot `/api/cron/risk-scan` execution;
- no required long-running worker loop for normal request handling;
- provider calls handled within request paths.

The Vercel deployment notes remain useful as architectural guidance, but they are not the current production deployment source of truth.

If Vercel is reintroduced as a production target later:

- use a proper managed PostgreSQL database;
- use a dedicated `NOSUPERUSER`/`NOBYPASSRLS` application role where the chosen provider supports the tenant-RLS model;
- run migrations explicitly;
- never point preview environments at real production school data;
- use an external HTTP scheduler for risk scanning.

---

# 36. Source tree orientation

Important directories/files include:

```text
.
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── public/
│   └── brand/
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── platform/
│   │   ├── school/
│   │   ├── teacher/
│   │   ├── guardian/
│   │   ├── login/
│   │   └── page.tsx
│   ├── components/
│   └── lib/
├── scripts/
├── docs/
└── .github/
    └── workflows/
```

Notable implementation files include:

- `src/lib/db.ts` — database access helpers/context;
- `src/lib/auth.ts` — authentication/security helpers;
- `src/lib/errors.ts` — application error conventions;
- `src/lib/setup-service.ts` — setup-related service logic;
- `src/lib/phase4-service.ts` — Phase 4 service logic;
- `src/lib/term-readiness-service.ts` — academic readiness logic;
- `src/lib/rate-limit.ts` — rate-limit logic;
- `src/components/ThemeProvider.tsx` — global theme state;
- `src/components/ThemeSwitcher.tsx` — global theme UI;
- `src/app/school/settings/ThemePreferences.tsx` — Settings appearance controls;
- `src/app/page.tsx` — public homepage.

There are many additional feature-specific workspaces/components. Search by route/module before adding duplicates.

---

# 37. Design and coding principles for future agents

When extending SukuuNova:

### Preserve tenant boundaries

Every school-owned operation must remain school-scoped.

### Reuse existing services

Do not reimplement grading, authorization, finance, notification, or tenant logic inside individual pages when a service/helper already exists.

### Keep mutations explicit

Especially for:

- finance;
- report cards;
- attendance;
- AI-assisted records;
- emergency communications;
- impersonation.

### Maintain auditability

Administrative/high-impact actions should leave an understandable trail.

### Keep AI subordinate to humans

AI drafts are suggestions. They do not become truth until an authorized human accepts them through the application's normal mutation path.

### Protect accessibility

Themes, status indicators, buttons, forms, tables, and dashboards should remain readable in every preset.

### Avoid visual regressions

The homepage has multiple CSS layers. Verify cascade/order when changing the same selectors.

### Do not make random architecture changes

The project already contains a broad implementation. Before introducing a new pattern, inspect the existing equivalent feature and extend it consistently.

---

# 38. Things that are intentionally NOT yet claimed as complete

This README documents what exists in the repository and what is established by the current codebase. It does **not** claim the following as already finished unless the implementation is actually present:

- a fully populated realistic cross-role test database for every module;
- a final production-grade object-storage subsystem for all future uploads;
- complete removal of all lint warnings;
- complete removal of all npm audit vulnerabilities;
- Prisma 7 migration/config cleanup;
- exhaustive visual testing across every route and every theme;
- a final go-live security audit for a real external school deployment.

These are follow-on quality/operations tasks, not reasons to mislabel existing functionality.

---

# 39. Useful development commands

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Run tests:

```bash
npm run test
```

Run lint:

```bash
npm run lint
```

Generate Prisma client:

```bash
npm run db:generate
```

Apply migrations in an intentional environment:

```bash
npm run db:migrate
```

Seed the configured database:

```bash
npm run db:seed
```

Build production:

```bash
npm run build
```

Start production build:

```bash
npm run start
```

---

# 40. Final handover checklist for Claude / Codex / other agents

Before changing SukuuNova, read this README and then inspect the specific implementation involved.

At minimum:

1. confirm you are working in `Eugene999B/SukuuNova`;
2. confirm the current branch/commit on `main`;
3. read the relevant route/component/service;
4. read `prisma/schema.prisma` for any data-model work;
5. preserve school tenant boundaries;
6. preserve RBAC/permission checks;
7. preserve platform-vs-school auth separation;
8. preserve audit logging where required;
9. preserve AI human-approval boundaries;
10. run tests/build after meaningful changes;
11. check the live deployment state before declaring production ready;
12. keep all work scoped to SukuuNova.

For deployment/debugging, the authoritative operational state is the connected Railway project/service plus the repository's current `main` branch. For exact schema/API contracts, the code files are authoritative over prose documentation.

---

# 41. Current reference points

- **Repository:** `Eugene999B/SukuuNova`
- **Branch:** `main`
- **Product:** SukuuNova
- **Current production platform:** Railway
- **Application service:** SukuuNova
- **Database service:** PostgreSQL
- **Health endpoint:** `/api/health`
- **Homepage:** `/`
- **Platform login:** `/login/platform`
- **School login:** `/login/school`
- **Guardian login:** `/login/guardian`
- **Global theme component:** `src/components/ThemeSwitcher.tsx`
- **Theme state/provider:** `src/components/ThemeProvider.tsx`
- **School Settings themes:** `src/app/school/settings/ThemePreferences.tsx`
- **Primary Prisma schema:** `prisma/schema.prisma`
- **Seed script:** `prisma/seed.ts`

---

# 42. Documentation maintenance rule

**This README must be updated when major application architecture, routes, security rules, deployment model, data model, or product capabilities change.**

Do not let the README drift into a historical description that contradicts the current code.

When a future agent adds a significant module or changes a security boundary, update this document in the same change set or immediately afterward.

**The repository code is the final authority; this README is the handover map that tells a new engineer where to look and what invariants must not be broken.**
