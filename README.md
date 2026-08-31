# SukuuNova

SukuuNova is a school operations platform being built for real day-to-day school work, with a strong focus on Ghanaian schools. The idea is simple: instead of making a school jump between separate systems for students, staff, classes, attendance, academics, fees, communication, safety and administration, SukuuNova brings those jobs together in one place.

This README is the main handover document for the project. A developer, Claude, Codex, or another engineering agent should be able to read this file first and get a realistic picture of what the system is, what is already built, how the pieces fit together, what is still being refined, and what must not be broken.

**Repository:** `Eugene999B/SukuuNova`  
**Branch:** `main`  
**Product name:** **SukuuNova**  
**Framework:** Next.js App Router  
**Language:** TypeScript  
**Database:** PostgreSQL 16  
**ORM:** Prisma  
**UI:** React + Tailwind CSS + the project's shared CSS/design-token system

> **Important:** Work in this repository is for **SukuuNova only**. Do not apply changes from another product or another repository here by accident.

---

## Where the project stands

The original planned product was built in four main phases, and those phases are now integrated into the same application.

### Phase 0 — foundation

The foundation is in place: the application structure, authentication foundations, tenancy model, database, permissions, audit patterns and the basic school workspace.

### Phase 1 — core school operations

The first real school-management layer is complete. This is the part that makes SukuuNova useful as a normal school system: people, students, classes, subjects, academic setup, attendance, fees, messaging, reporting and related administrative workflows.

### Phase 2 — differentiating modules

Phase 2 added the larger operational features that make the system more than a basic school database. These include face recognition, payroll, transport, feeding, CBT, library, assets, recruitment and the associated access/feature controls.

### Phase 3 — day-to-day operations

Phase 3 expanded the operational side of the product: richer attendance and safety work, communication, reporting, staffing, timetables and substitutions, family workflows, and the supporting operational controls around those areas.

### Phase 4 — platform maturity and controlled AI

Phase 4 added the platform-management side of SukuuNova and the first carefully limited automation/AI features. This includes school management from the platform side, subscriptions and billing, school support, audited impersonation, school groups, risk signals, narrowly scoped WhatsApp assistance, human-reviewed AI drafts and emergency broadcast confirmation.

Phase 4 is considered the final **planned product phase**. The work after that is incremental product refinement, bug fixing, hardening, visual improvements, hardware/biometric integration and other practical work that continues to improve the product.

### Work added after the phase plan

The repository has continued to evolve after Phase 4. Recent work includes:

- hardware/biometric attendance support;
- device registration and device identity management;
- device attendance receipts with idempotency keys and nonces;
- improvements to the public SukuuNova homepage;
- stronger branding on white surfaces;
- user-selectable themes on the homepage and inside signed-in areas;
- consolidation of the theme picker so Settings and the global picker use the same theme presets;
- continued accessibility, visual and responsive refinements.

---

## What SukuuNova actually is

It helps to think of SukuuNova as two connected control planes with a family-facing side around the school tenant.

### 1. The SukuuNova platform

This is the operator/super-admin side. It exists above individual schools and is responsible for things such as:

- creating and managing schools;
- activating, suspending and reactivating schools;
- finding and investigating schools across the platform;
- assigning subscription plans and managing platform billing;
- reconciling manual platform payments;
- handling support tickets and support conversations;
- viewing platform health and audit information;
- managing platform-level notifications and operations;
- using audited impersonation when legitimate support work requires entering a school context;
- managing platform configuration and related controls.

### 2. The school workspace

A school is a tenant. Inside that tenant, authorized people run the actual school.

The school workspace covers:

- school profile and settings;
- academic years and terms;
- staff and role management;
- students and guardians;
- houses;
- classes and class teachers;
- subjects and teacher assignments;
- attendance;
- biometric/device attendance;
- assessments, scores and gradebook work;
- report cards and report-card templates;
- fees, invoices, payments and payment reversals;
- payroll and payslips;
- messaging and notifications;
- calendar/events;
- timetables and substitute-teacher assignments;
- admissions;
- visitor and pickup/safety workflows;
- face enrollment and face-match review;
- transport;
- feeding;
- CBT;
- library;
- assets/inventory;
- recruitment;
- reporting and exports;
- school settings and theme/appearance preferences.

### 3. Guardians and families

Guardians have their own school-facing access path. Their records are connected to the students they are responsible for, and the system is designed so family users only see information they are actually entitled to see.

There are also selected guardian communication workflows, including the restricted WhatsApp assistant described later in this document.

### Teachers

Teachers operate inside the school workspace but normally have a narrower set of permissions than school administrators. Their work includes teaching-related screens, attendance, grade entry, timetable information, students, homework/academic activity and the modules that their role allows.

---

## The security model matters as much as the UI

SukuuNova is deliberately multi-tenant. A school must never be able to see another school's records simply because someone guessed an ID or called an API directly.

The database and application code therefore treat tenant boundaries as a real security boundary rather than something enforced only by the frontend.

### Separate authentication worlds

Platform authentication and school authentication are separate JWT universes.

- Platform accounts are represented by `PlatformAdmin` and use `PLATFORM_AUTH_SECRET`.
- School accounts are represented by `User` records belonging to a specific `School` and use `SCHOOL_AUTH_SECRET`.
- Guardian access has its own school-facing login/reset flow.

A platform permission such as `schools:impersonate` is intentionally separate from ordinary school-management authority such as `schools:manage`.

### Passwords and reset links

Passwords are hashed with `bcryptjs`.

Password-reset tokens are stored as hashes and have an expiry/use lifecycle. Reset APIs are not supposed to hand the reset link back to the browser or render the raw token into client UI.

For local development only, `ALLOW_DEV_TOKEN_ECHO=true` can enable a server-side console warning containing a reset link. That setting is not honored in production.

Login throttling is persisted through the `LoginRateLimit` model rather than depending only on process memory.

### Tenant isolation

School-owned records carry `schoolId`, and relationships between school-owned records use same-school constraints where needed.

The application uses the existing tenant transaction/context helpers, including `withTenant()` and related authorization helpers, and the database design supports forced PostgreSQL RLS for tenant security.

When adding new school-owned functionality, future work must preserve this pattern. Do not trust a client-provided `schoolId` just because it looks valid. The authenticated tenant is the source of truth.

### Auditing

School-level and platform-level actions can be recorded through separate audit models. Important security-sensitive operations should leave an audit trail rather than silently modifying data.

---

## Platform impersonation is intentionally visible

Platform support sometimes needs to look at a school's workspace to investigate a problem. SukuuNova supports that through an explicit impersonation flow rather than a hidden administrator backdoor.

Impersonation is:

- permission-gated;
- limited to 30 minutes;
- tied to an explicit reason;
- recorded in the platform audit log;
- recorded in the school audit log;
- visible to the school through its own audit view.

The distinction is important: support access should be powerful enough to solve problems, but it must also be accountable.

---

## The data model at a glance

The Prisma schema lives in `prisma/schema.prisma`. It is the best place to inspect the exact fields and relationships, but the major groups are below.

### Platform and tenancy

- `PlatformAdmin`
- `AuditLogPlatform`
- `SubscriptionPlan`
- `SchoolLoginDirectory`
- `LoginRateLimit`
- `PlatformPasswordResetToken`
- `School`
- `SchoolSettings`

### School users and permissions

- `User`
- `Role`
- `Permission`
- `RolePermission`
- `UserRole`
- `UserPermissionOverride`
- `SchoolPasswordResetToken`
- `AuditLogSchool`

The role system supports both role-level permissions and individual user overrides.

### Academic calendar and school structure

- `AcademicYear`
- `CalendarEvent`
- `Term`
- `House`
- `Class`
- `Subject`
- `ClassSubjectTeacher`

### Students and families

- `Student`
- `Guardian`
- `StudentGuardian`

Students can belong to classes and houses and can be connected to one or more guardians. The model also connects students to attendance, scores, report cards, invoices, face enrollment, device identities and pickup/safety records.

### Attendance and biometric identity

- `AttendanceEvent`
- `FaceEnrollment`
- `FaceMatchReview`
- `Device`
- `DeviceIdentity`
- `DeviceAttendanceReceipt`

The newer hardware-attendance layer supports registered devices, external device identities, idempotent attendance receipts and nonce-based protection against accidental or repeated submissions.

Face data is treated as sensitive. Face enrollment can be tied to guardian consent, and face-match results can be routed through a human review state rather than automatically trusting every match.

### Assessments and academic records

- `Assessment`
- `Score`
- `ReportCard`
- `ReportCardTemplate`

Scores belong to students, assessments and subjects. Report cards retain calculation information and the workflow state for drafting, submission, approval and sending.

### Finance

- `FeeItem`
- `Invoice`
- `InvoiceLine`
- `Payment`
- `PaymentReversal`

The finance model is built around invoices and payments, with explicit reversal records rather than silently editing historical payment information.

### Communication

- `Message`

Messages record channel, recipient details, body/template information, delivery state, attempts and failure information. The notification layer is designed to keep school operations from failing just because an external provider is temporarily unavailable.

### Timetable and staffing operations

- `TimetableSlot`
- `SubstituteAssignment`
- `SalaryStructure`
- `PayrollRun`
- `Payslip`
- `VisitorLog`

### Safety and pickup

- `ApprovedPickup`
- `PickupApprovalRequest`
- `PickupEvent`

These models let schools distinguish pre-approved pickup relationships from one-off requests and actual pickup events.

---

## Main areas of the application

The route structure has grown over time, but these are the important areas to understand when navigating the code.

### Public website

The public side includes the main homepage plus feature, school-information, about and contact pages. The homepage is designed to introduce SukuuNova clearly without looking like an internal admin dashboard.

The main homepage entry point is:

`/`

The homepage also links users toward:

- `/features`
- `/for-schools`
- `/about`
- `/contact`
- `/login/platform`
- `/login/school`

The feature pages cover subjects such as students/families, academics, attendance/safety and fees/finance.

### Platform

The platform control surface is reached at:

`/platform`

The main Phase 4 platform API surface is:

`/api/platform/phase4`

This is where school creation/management, plans, platform billing, support operations, search and impersonation-related work is concentrated.

Ending an active impersonation session uses:

`POST /api/platform/impersonation`

### School

The school workspace is the largest part of the application. Major areas include:

- students;
- classes;
- attendance;
- fees/finance;
- academics and assessments;
- report cards;
- staff;
- timetable;
- settings;
- admissions;
- communications;
- safety/pickup/visitor functions;
- premium modules such as transport, feeding, CBT, library, assets, recruitment and payroll.

Examples of core routes include:

- `/school/students`
- `/school/classes`
- `/school/attendance`
- `/school/fees`
- `/school/settings`
- `/school/staff`
- `/school/timetable`

There are many more sub-routes under the school area. When changing a module, search the repository for its route and supporting dialogs/components rather than assuming everything lives in one `page.tsx`.

### Phase 4 school console

`/phase4`

The school Phase 4 area brings together support requests, risk flags, AI drafts, group reporting and emergency-confirmation operations.

The main Phase 4 school API is:

`GET/POST /api/phase4`

The WhatsApp assistant endpoint is:

`POST /api/phase4/whatsapp`

---

## Important Phase 4 functionality

Phase 4 is not one giant AI feature. It is a collection of controlled platform and school operations.

### School groups

A school owner can work with multiple branches under a School Group. Consolidated reporting is read-only and is intentionally limited to the owning Owner.

Branch records are not merged into one shared tenant. Underlying branch queries still run with independent tenant context, preserving school boundaries.

### Platform subscriptions and billing

The platform supports subscription plans, school-level platform billing records and manual payment reconciliation. Existing premium school modules can be enabled/disabled through feature flags associated with the subscription plan.

The guarded premium areas include:

- face recognition;
- payroll;
- transport;
- feeding;
- CBT;
- library;
- assets;
- recruitment.

The feature guard belongs at the route/authorization boundary, not just in the UI. Hiding a button is not enough.

### Support tickets

Schools can open support tickets, exchange threaded messages and see support status. Platform staff can manage the support side.

### Risk signals

SukuuNova can identify students who may be at risk based on signals such as:

- attendance patterns;
- score trends;
- fee arrears.

These signals are presented to authorized school staff. The system does **not** automatically notify parents just because a risk flag was produced.

### Emergency/lockdown broadcast

Emergency broadcast has an explicit two-step confirmation mechanism and reuses the existing SukuuNova messaging queue rather than creating a completely separate delivery system.

---

## The AI boundaries are deliberate

SukuuNova uses OpenAI's Responses API for two main AI-assisted drafting workflows:

1. lesson-note drafting;
2. report-card remark drafting.

The model configuration comes from:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_RESPONSES_URL`

The default model configured by the application is `gpt-5.6-luna` unless overridden by environment configuration.

### What gets sent to the model

The application does not simply dump the whole school database into a model request.

The server builds a narrow context for each request.

For report-card remarks, that context can contain things such as:

- the student's display name;
- aggregate score percentages;
- attendance counts;
- class name;
- term identifier.

For lesson-note drafting, the context is restricted to the supplied subject/topic/objectives/class information plus an optional target score identifier.

### Human approval is required

AI output is stored as an `AiDraft` in `suggested` status.

An AI-generated draft cannot directly change a student's actual records. An authorized human must explicitly accept it, optionally edit it, or discard it. Once accepted, the normal application write path and audit logging take over.

This is an important design rule for future work: **AI may suggest; it does not silently mutate school records.**

### WhatsApp is not a general AI agent

The WhatsApp parent assistant is intentionally much narrower than a chatbot.

The supported intents are predefined and map to real parent-scoped school queries such as:

- child arrival/attendance status;
- fee balance;
- next recorded calendar event.

Unsupported questions receive a safe fallback rather than a guessed answer.

Do not turn this into a general-purpose LLM-to-database agent without a deliberate security/product review.

---

## Notification and messaging behaviour

Messages are persisted through the `Message` model with delivery state and retry-related information.

The current serverless-compatible path attempts external SMS/WhatsApp delivery synchronously during the request. Provider failures are caught, logged and stored as failed delivery attempts rather than crashing the underlying school operation.

That approach is deliberately simple and works with the current deployment model. At larger scale, a serverless-native queue such as QStash or a platform with a persistent worker would be a better long-term architecture.

---

## Attendance and biometric work

Attendance is one of the important areas of the product and now supports both ordinary school-recording workflows and hardware-oriented flows.

The recent biometric/device work adds:

- registered attendance devices;
- device API-key hashes rather than storing device keys in plaintext;
- external identity mappings for students and staff;
- device attendance receipts;
- idempotency keys to stop duplicate processing;
- nonces for replay protection;
- device last-seen information;
- optional confidence scores on attendance records;
- face-match review records for cases that need staff confirmation.

The system continues to support normal staff-entered attendance alongside device-based attendance.

Offline synchronization remains intentionally limited. The existing Phase 3 rule is that only attendance and score records may be synchronized offline, using idempotent client-generated keys and live permission checks at synchronization time.

---

## Academics and report cards

Academic configuration starts at the school, academic year and term level.

Schools can define classes, subjects, teachers, assessments and scores. The report-card system keeps a calculation snapshot and a calculation version so that generated academic results can be traced back to the rules/data used to produce them.

Report cards move through a controlled workflow that can include drafting, submission, approval and sending.

The current school settings model supports configuration for items such as:

- grading scales;
- report-card templates;
- CA/exam weighting;
- whether partial report cards are allowed;
- report-card configuration and watermark information;
- attendance grace time;
- expected resumption time;
- timezone (defaulting to `Africa/Accra`);
- notification settings;
- WhatsApp template configuration;
- timetable and assessment configuration.

---

## Finance and payment history

Finance is built around fee items, invoices, invoice lines, payments and explicit payment reversals.

A payment should not simply be overwritten after the fact when a correction is needed. The system records a reversal with a reason and actor so financial history remains understandable.

This same principle should continue into future finance work: preserve the history and make corrections auditable.

---

## Staff, payroll and people management

The people model separates general `User` accounts from the specific operational relationships they have with classes, subjects, attendance, timetables and payroll.

Payroll includes:

- salary structures;
- payroll runs;
- payslips;
- gross/deduction/net information;
- PDF storage references/data where applicable.

Recruitment is part of the premium module set and is feature-guarded accordingly.

---

## Safety, pickup and visitors

SukuuNova has more than an attendance system. It also contains school-safety workflows for:

- approved guardians/pickup relationships;
- pickup approval requests;
- approved/unauthorized pickup tracking;
- actual pickup events;
- visitor logs and staff hosts.

These features are connected to student/guardian relationships so that the school can keep a history of who was authorized to collect a student and what actually happened.

---

## Themes and the public brand

The public homepage and signed-in school workspace share a global theme system.

The current user-selectable presets are:

### Paper

A light, clean and calm default look.

### Midnight

A deep navy dark theme with clear text and restrained contrast.

### Slate

A cooler dark workspace using a different accent treatment from Midnight.

### Warm

A soft cream-and-ink light theme for users who do not like a cold white interface.

The themes are meant to be comfortable to use for long periods. Bright, glowing combinations are intentionally avoided.

Theme preferences are stored in local storage under:

`sukuunova-theme-preferences`

The preference model supports:

- light/dark mode;
- accent colour;
- interface density.

### Important theme implementation detail

The global `ThemeProvider` mounts the `ThemeSwitcher`, so theme selection is available across the application instead of being hidden only in Settings.

Settings uses the same four presets so users do not have two competing appearance systems.

Current source files include:

- `src/components/ThemeProvider.tsx`
- `src/components/ThemeSwitcher.tsx`
- `src/app/school/settings/ThemePreferences.tsx`
- `src/app/theme-home.css`
- `src/app/home.css`
- `src/app/home-redesign.css`
- `src/app/home-premium.css`
- `src/app/design-tokens.css`

### Brand/logo detail

The full SukuuNova SVG lives at:

`public/brand/sukuunova-logo.svg`

The compact homepage header uses the high-contrast favicon mark together with the `SukuuNova` wordmark rather than relying on the full large logo asset. This was done specifically to keep the name crisp on white surfaces.

When working on the brand, do not reintroduce the old pale white/blue treatment that caused the wordmark to look faded on light backgrounds.

---

## File and component orientation

The project is a Next.js App Router application. Most functionality is organised under `src/app`, with reusable application components under `src/components` and shared design/utility code elsewhere in the repository.

Some useful places to start when investigating the UI are:

- `src/app/page.tsx` — public homepage;
- `src/app/school/` — school workspace;
- `src/app/school/settings/` — school settings and preferences;
- `src/components/ThemeProvider.tsx` — global appearance state;
- `src/components/ThemeSwitcher.tsx` — global theme picker;
- `prisma/schema.prisma` — database model and relationships;
- `prisma/seed.ts` — seed data;
- `src/app/design-tokens.css` — shared design tokens;
- `src/app/theme-home.css` — homepage theme overrides.

The repository also contains specialised dialogs, print views, feature-module components and API route handlers. Search by route, model name or feature name before creating duplicate implementations.

---

## API areas worth knowing about

The complete API surface is larger than this list, but these are the especially important Phase 4 routes and health/deployment endpoints.

| Method | Route | What it is for |
|---|---|---|
| GET/POST | `/api/platform/phase4` | Platform school, subscription, billing, support, search and related operations |
| POST | `/api/platform/impersonation` | End an active audited platform impersonation session |
| GET/POST | `/api/phase4` | School support, risk flags, AI drafts, school-group reporting and emergency confirmation |
| POST | `/api/phase4/whatsapp` | Restricted WhatsApp parent-assistant intents |
| GET | `/api/health` | Deployment/application health check |

The application also has the earlier Phase 0–3 APIs for students, classes, attendance, finance, academics, staff, messaging, timetable, safety and the other school modules.

---

## Environment variables

Provider configuration is environment-driven. Real secrets should never be committed to the repository.

The important variables currently documented by the application include:

### Core database/auth

- `DATABASE_URL`
- `TEST_DATABASE_URL`
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

### Face/biometric infrastructure

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `FACE_EMBEDDING_ENCRYPTION_KEY`

### WhatsApp/Twilio

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `WHATSAPP_WEBHOOK_SECRET`

### OpenAI

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_RESPONSES_URL`

### Risk scanning

- `RISK_SCAN_CRON_SECRET`
- `RISK_SCAN_INTERVAL_MS`

`RISK_SCAN_INTERVAL_MS` is now documentation/configuration for the desired scheduler cadence rather than a reason to start a long-running in-process timer.

---

## Deployment and hosting

### Current production workflow

The current production service used in the active development workflow is **Railway**.

There are two relevant services in the Railway project:

- `SukuuNova` — the application service;
- `Postgres` — the PostgreSQL service.

Recent production deployments have successfully passed the `/api/health` check, and the production build has been reaching the Next.js build successfully.

The live Railway project is used for the current iterative development/deployment workflow, so future agents should not assume that an older Vercel deployment description is the active production environment.

### Vercel compatibility

The codebase has also been kept compatible with Vercel's serverless deployment model.

The build command is:

```bash
prisma generate && next build
```

Do **not** casually replace that with `prisma migrate deploy`. Database migrations are a deliberate database operation and should not be triggered automatically by every application build.

The application has no requirement for a permanent worker process to serve normal requests. The risk scan is implemented as a protected one-shot HTTP endpoint:

`POST /api/cron/risk-scan`

It expects:

`Authorization: Bearer <RISK_SCAN_CRON_SECRET>`

The old long-running `worker:risk` and `worker:messages` approach is not the model to rely on for a serverless runtime.

The repository includes `.github/workflows/risk-scan.yml` for an external scheduled call every six hours. It uses:

- `SUKUUUNOVA_APP_URL`
- `RISK_SCAN_CRON_SECRET`

The same endpoint could later be called by another scheduler without changing the application logic.

### Database deployment discipline

For any separate managed PostgreSQL deployment, keep the tenant security model intact. The intended application database role should be `NOSUPERUSER` and `NOBYPASSRLS` and should receive only the privileges the application requires.

Do not use a provider's default superuser/admin connection as the application's normal runtime `DATABASE_URL`.

Before a first live use of a new production database, run:

```bash
prisma migrate deploy
```

as an explicit database operation and verify the tenant-isolation checks against the restricted application role.

---

## Storage

The current repository does not contain a complete object-storage integration such as S3, Cloudflare R2 or Supabase Storage.

Face/biometric work relies on the relevant AWS services and stores application references rather than trying to build a local persistent file system inside the app runtime.

There are database fields for things such as report-card/payslip PDF data or URLs, but future persistent file/photo functionality should use proper object storage rather than assuming a deployment filesystem is permanent.

---

## Development commands

The core scripts are defined in `package.json`.

```bash
npm run dev
npm run build
npm start
npm run lint
npm run test
npm run test:watch
npm run db:generate
npm run db:migrate
npm run db:seed
```

The current package configuration uses Node `>=20.19.0`.

The important package versions in the current application include Next.js 15, React 19, Prisma 6, TypeScript 5.9, Tailwind CSS 3.4 and Vitest 3.

---

## Verification and testing

The project has a test suite built around Vitest and includes the earlier product invariants together with Phase 4-specific checks.

The final Phase 4 verification was recorded as passing:

1. Prisma migrations;
2. all 35 tests;
3. typecheck diagnostics;
4. production build.

The Phase 4 test coverage includes the important security/product boundaries around:

- premium feature-flag enforcement;
- platform permission separation;
- multi-branch authorization;
- safe WhatsApp refusal behaviour;
- AI draft versus accepted-record boundaries;
- emergency broadcast confirmation.

The repository's broader Phase 0–3 invariant checks remain part of `npm run test`.

### Current non-blocking technical warnings

The deployment/build process can still surface warnings that are not application failures, including:

- npm audit vulnerabilities that need to be reviewed rather than blindly force-fixed;
- Prisma's deprecation warning around the old `package.json#prisma` configuration ahead of Prisma 7;
- package-manager detection guidance from Railway/Railpack.

These should be handled deliberately. Do not solve a warning by introducing unrelated breaking upgrades while working on an unrelated product feature.

---

## Seed data and the planned full test environment

A major upcoming task is to make the test environment feel like a real school instead of forcing a person to enter every record manually before testing.

The goal is to populate a coherent test environment across the relevant roles and modules, including:

- platform owner/super-admin records;
- platform administrators;
- one or more realistic schools;
- school owners and administrators;
- teachers and other staff;
- guardians/families;
- students;
- houses and classes;
- subjects and teacher assignments;
- academic years and terms;
- attendance history;
- biometric/device records where useful;
- assessments and scores;
- report cards;
- fee items;
- invoices, payments and balances;
- payroll and payslips;
- timetables and substitutions;
- transport/feeding/CBT/library/assets/recruitment test records where relevant;
- communication history and realistic notifications;
- support tickets and platform-side records;
- risk-signal examples;
- AI draft examples;
- safety/pickup/visitor examples.

The important part is consistency. A student's class, subjects, teacher, attendance, guardian relationship, invoices, academic records and report card should make sense together. The seed data should be useful for actually walking through workflows, filters, dashboards, approvals, reports and edge cases.

That test dataset should be created in the **test environment/database**, not mixed into genuine production school records.

---

## Things future agents should be careful about

A few rules should be treated as project-level guardrails.

### Do not weaken tenant security for convenience

Never bypass the existing tenant helpers, authorization checks or same-school relationship constraints just to make a feature easier to implement.

### Do not turn AI into a silent write engine

AI features are deliberately human-gated. Preserve the `suggested` → human decision → normal write path model.

### Do not hide security-sensitive platform activity

Impersonation, support access and other platform operations need to remain auditable.

### Do not build duplicate theme systems

There is one current global theme model. The homepage picker and Settings should stay aligned.

### Do not restore the old washed-out logo treatment

The light homepage must keep the SukuuNova wordmark clearly readable.

### Do not assume a frontend restriction is sufficient

If something is premium, tenant-restricted or role-restricted, enforce that in the server/API boundary as well as in the UI.

### Do not put real credentials into source control

Use environment configuration.

### Do not run production migrations accidentally from a build

Migrations are an explicit deployment/database step.

### Do not mix another product into this repository

This is the SukuuNova repository and should stay that way.

---

## A practical way to approach future work

Before changing a module, first understand three things:

1. the relevant route(s) under `src/app`;
2. the supporting components/API handlers;
3. the Prisma model relationships and permission/tenant rules involved.

Then make the smallest coherent change, run the relevant tests/build, inspect the deployment status, and keep the repository in a state where the next person can understand what changed.

For security-sensitive or multi-tenant work, test both the allowed case and the denied/cross-tenant case.

For UI work, check desktop and mobile layouts and make sure the current theme system continues to behave consistently.

---

## Current working checkpoint

At the latest project checkpoint, SukuuNova has:

- the integrated Phase 0–4 product;
- hardware/biometric attendance work on top of the phase plan;
- a working multi-tenant school/platform architecture;
- the current platform, school, teacher and guardian surfaces;
- the Phase 4 support, billing, school-group, risk, AI and emergency functionality;
- a refined public homepage;
- the current high-contrast SukuuNova brand treatment;
- four global visual themes: Paper, Midnight, Slate and Warm;
- a unified theme experience between the global picker and Settings;
- Railway production deployment with a separate PostgreSQL service;
- a successful recent production build/healthcheck path;
- a comprehensive seed/test-data task still planned for later so full system testing can be done without manually entering every record.

That is the state future development should start from.

---

## Final note for Claude, Codex and other agents

Please read this README before making changes to SukuuNova.

The safest assumption is that a feature which appears simple in the browser may have consequences for tenant isolation, permissions, audit history, financial records, notification delivery, academic calculations, device identity or another part of the system.

When the existing code already has a pattern for a job, follow that pattern instead of creating a second one.

When something is unclear, inspect the repository and schema first. Do not invent architecture that is already present in the application.

And most importantly: **keep SukuuNova coherent as one system.**