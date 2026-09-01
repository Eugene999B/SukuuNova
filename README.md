# SukuuNova

SukuuNova is a multi-tenant school operations platform designed for real day-to-day school work, with a strong focus on Ghanaian schools and the realities of running a modern school.

The product goal is not to be another collection of disconnected school-management screens. SukuuNova is intended to become the operating system of a school: the place where a school manages people, academics, attendance, money, communication, safety, transport, staffing, family relationships, reporting and operational decisions from one connected environment.

This README is the **primary engineering handover document** for the repository. A developer or AI coding agent should read it before changing the system. It explains what SukuuNova is, who uses it, how the major systems connect, what the security model requires, which functionality exists, what is still being refined, how the code is organized, and the direction of future development.

> **Important:** This repository is for **SukuuNova only**. Do not import assumptions, code, styling, terminology or workflows from another product or repository unless they have been deliberately adapted to SukuuNova.

---

## 1. Product identity

- **Product:** SukuuNova
- **Repository:** `Eugene999B/SukuuNova`
- **Primary branch:** `main`
- **Framework:** Next.js App Router
- **Language:** TypeScript
- **UI:** React, Tailwind CSS and shared SukuuNova CSS/design tokens
- **Database:** PostgreSQL 16
- **ORM:** Prisma
- **Deployment:** Railway for the production application/database environment
- **Authentication:** Separate platform and school JWT security domains
- **AI:** OpenAI Responses API through server-side application code

SukuuNova is a **multi-school SaaS platform**. Every school is a tenant. The platform operator can manage many schools, while each school's staff, teachers and guardians operate within their own authorized school context.

The system must always be understood as three connected experiences:

1. **SukuuNova Platform** — the operator control plane above schools.
2. **School Workspace** — the operational system used by school staff and teachers.
3. **Family/Guardian Experience** — the controlled family-facing view of a child's school life.

The product also has a public marketing/entry website and supporting integrations such as messaging, WhatsApp, biometric devices and AI-assisted workflows.

---

## 2. Product philosophy

SukuuNova is being built around a few principles.

### One connected school system

Students, guardians, staff, classes, subjects, attendance, academics, finance and communication should reinforce each other instead of behaving like separate databases.

For example:

- a student belongs to a class;
- the class determines teaching context;
- teaching context determines subjects and assessments;
- assessments produce scores;
- scores contribute to report cards;
- attendance contributes to academic and pastoral context;
- invoices and payments describe the family's financial relationship with the school;
- guardians see only the information they are entitled to see;
- communications can be targeted using real school relationships.

### Human workflow before database structure

A screen is not considered good merely because it can display database records. It should make the real job easy.

A teacher thinks:

> Select my class → select today → mark the register.

A teacher should not have to create 40 individual attendance records through a database-shaped interface.

A bursar thinks:

> Find account → understand balance → record payment → issue receipt → reconcile.

A school administrator thinks:

> Set up the academic year → create classes → assign people → run school operations → review results.

Future UI work must start from these human workflows and then map them to the underlying data model.

### Safety over convenience

School data is sensitive. The system must prefer explicit permissions, tenant isolation, auditability, confirmation for destructive actions and human review for consequential automation.

### Real functionality over decorative completeness

A polished button must not pretend to perform an operation that is not implemented.

If a workflow is unavailable, the interface should say so clearly rather than presenting a fake success state or prototype control as though it were production functionality.

### Consistency is a product feature

All workspaces should feel like one product. Shared navigation, typography, spacing, forms, buttons, tables, cards, status indicators, responsive behaviour and theme tokens should be reused rather than recreated module by module.

---

## 3. The complete system at a glance

SukuuNova can be understood as a set of connected operational domains.

### Platform management

The platform operator manages the SaaS itself:

- create schools;
- activate, suspend and reactivate schools;
- search and investigate schools;
- manage subscription plans;
- manage school-level platform billing;
- reconcile manual platform payments;
- manage support tickets;
- inspect platform health and audits;
- manage school groups/branches;
- use controlled, audited impersonation when support work requires entering a school context;
- manage platform-level operational controls.

### School administration

The school manages its identity and operating structure:

- school profile;
- school code/login identity;
- academic years;
- terms;
- calendar/events;
- roles and permissions;
- staff;
- students;
- guardians;
- houses;
- classes;
- class teachers;
- subjects;
- teacher assignments;
- school settings;
- appearance/theme preferences.

### Admissions

Admissions is intended to cover the complete journey from interest to enrolled learner:

- enquiries;
- applicant records;
- application review;
- document/decision workflow;
- acceptance/rejection;
- enrolment;
- conversion into the normal student/family records.

### Student and family management

Student records form the centre of the school tenant.

A student can be associated with:

- class;
- house;
- guardians;
- attendance;
- assessments and scores;
- report cards;
- invoices;
- face enrollment;
- device identity;
- pickup and safety events;
- other operational records.

Guardians can be linked to one or more students, subject to the school's relationships and authorization rules.

### Academic management

Academic operations include:

- academic years;
- terms;
- subjects;
- class/subject teacher assignments;
- assessments;
- grade entry;
- gradebook;
- score calculation;
- moderation;
- report-card generation;
- report-card templates;
- approval/review workflows;
- publication to families;
- lesson planning;
- homework/exercises;
- timetable management;
- substitute-teacher assignments.

### Attendance

Attendance supports ordinary school attendance as well as the newer device/biometric direction.

The system covers:

- class registers;
- daily attendance;
- present/absent/late/excused states where supported;
- attendance history;
- exception handling;
- staff attendance;
- device registration;
- device identities;
- attendance receipts;
- idempotency protection;
- nonce-based request protection;
- face enrollment and face-match review.

Attendance should eventually feel like a fast operational register, not a CRUD database.

### Finance

Finance covers:

- fee items;
- fee structures;
- invoices;
- invoice lines;
- balances;
- payments;
- receipts;
- arrears;
- payment reversals;
- payroll and payslips.

Financial history must remain auditable. A payment reversal is a financial event; it should not be implemented by silently rewriting historical payment data.

### Communication

Communication includes:

- school messages;
- announcements;
- SMS/WhatsApp broadcast workflows;
- notification templates;
- queued delivery;
- delivery status;
- failure tracking;
- retry-oriented behaviour;
- emergency broadcast confirmation.

Messaging should never expose recipients from another tenant and should clearly distinguish draft, queued, sent and failed states.

### Safety and gate operations

Safety workflows include:

- approved pickup relationships;
- pickup approval requests;
- pickup events;
- visitor logging;
- device identity management;
- face enrollment/matching review.

The important distinction is between **authorization to pick up**, **a request to pick up**, and **the actual pickup event**. Those should not be collapsed into one field or one generic action.

### Transport

Transport is intended to manage:

- routes;
- stops;
- vehicles;
- drivers;
- student assignments;
- operational route information.

### Feeding

Feeding covers the school's meal operation, including planning and daily service information.

### Library

Library covers:

- catalogue;
- borrowing;
- returns;
- due dates;
- overdue items;
- learner/library relationships.

### Assets and inventory

The operational asset area is intended for:

- assets;
- stock/inventory;
- assignments;
- maintenance;
- retirement/disposal records.

### Human resources and recruitment

HR-related functionality includes:

- staff records;
- salary structures;
- payroll runs;
- payslips;
- vacancies;
- applicants;
- interviews;
- offers;
- recruitment status.

### CBT and examinations

The broader academic/examination direction includes:

- assessments;
- examination schedules;
- mark entry;
- moderation;
- results;
- computer-based testing (CBT).

### Reporting and analytics

Reporting should eventually give different roles the information they need without forcing them to understand the database.

Examples include:

- attendance reports;
- academic performance;
- finance/arrears;
- staff information;
- operational summaries;
- management dashboards;
- school/group-level comparisons where authorized.

Analytics must use real data. Placeholder KPIs, fake trend charts or buttons that only change local UI state must not be represented as completed functionality.

---

## 4. User roles and experiences

### Platform administrator

The platform administrator operates SukuuNova itself.

Typical responsibilities:

- school onboarding;
- subscription management;
- billing administration;
- support;
- platform search;
- school investigation;
- controlled impersonation;
- platform audit and operational oversight.

Platform authority must never be treated as automatic permission to perform every school action. Platform and school security domains are deliberately separated.

### School owner/administrator

This is the main school management role.

The owner/administrator can manage the school's people, academic structure, finance, communication, operational modules, settings and reporting according to assigned permissions.

### Teacher

Teachers should see a focused workspace based on their assigned responsibilities.

Typical teacher work includes:

- assigned classes;
- assigned subjects;
- attendance;
- gradebook/score entry;
- assessments;
- homework;
- lesson planning;
- timetable;
- student context;
- permitted communication.

A teacher must not be able to discover or modify another teacher's restricted data simply by changing a URL or submitting a different record ID.

### Guardian

Guardians should see only their linked children and only information released to the family.

Important family information includes:

- child identity;
- attendance where published/allowed;
- academic results that have been released;
- report cards;
- school messages;
- fees and balances where applicable;
- relevant calendar information;
- approved family workflows.

A guardian dashboard must use semantically correct data. For example, a label such as “today's attendance” must actually mean today's attendance rather than a count of all historical events.

---

## 5. Multi-tenancy and security

Tenant isolation is a core architectural requirement, not a UI convention.

### School tenant

Every school has its own tenant identity. School-owned records are scoped to that school, normally through `schoolId` and related same-school relationships.

The authenticated school context is the source of truth.

**Never trust a client-provided `schoolId`.**

When writing a new route or API:

1. authenticate the user;
2. establish the correct school/platform context;
3. authorize the requested action;
4. query through the correct tenant boundary;
5. validate related records belong to the same tenant;
6. perform the operation;
7. audit consequential actions where appropriate.

### PostgreSQL and tenant protection

The project uses tenant-aware transaction helpers such as `withTenant()` and the database design supports PostgreSQL row-level security protections.

Application-level filtering and database-level protection should reinforce each other.

### Separate authentication domains

Platform authentication and school authentication are separate JWT security universes.

- Platform accounts use `PlatformAdmin` and `PLATFORM_AUTH_SECRET`.
- School users use `User` records associated with a school and `SCHOOL_AUTH_SECRET`.
- Guardian access follows the school-facing family authentication path.

Do not merge these authentication systems for convenience.

### Passwords and resets

Passwords are hashed using `bcryptjs`.

Password-reset tokens are stored as hashes and have expiry/use lifecycle controls.

The raw reset token should not be exposed to client UI.

For local development only, `ALLOW_DEV_TOKEN_ECHO=true` may allow a server-side console warning containing a reset link. It must not become a production behaviour.

Login throttling is persisted through `LoginRateLimit` rather than relying only on process memory.

### Permissions

The authorization model supports:

- roles;
- permissions;
- role-permission assignments;
- user-role assignments;
- user-specific permission overrides.

Permission checks must happen at the server boundary for sensitive actions. Hiding a button is not authorization.

### Auditability

The system has separate school and platform audit models.

Security-sensitive and consequential actions should leave an audit trail, particularly:

- impersonation;
- permission changes;
- payment reversals;
- sensitive record changes;
- approval/rejection operations;
- emergency communication;
- biometric/identity operations;
- destructive administrative operations.

---

## 6. Platform impersonation

Platform support sometimes needs to inspect a school's actual workspace.

SukuuNova therefore has an explicit impersonation mechanism rather than a hidden backdoor.

Impersonation is designed to be:

- permission-gated;
- time-limited;
- tied to a reason;
- recorded in the platform audit trail;
- recorded in the school audit trail;
- visible to the school through its audit surface.

The current intended maximum session duration is 30 minutes.

Ending an impersonation session uses:

`POST /api/platform/impersonation`

Never add silent “god mode” access that bypasses the existing accountability model.

---

## 7. Data model

The authoritative schema is `prisma/schema.prisma`.

The main model families are:

### Platform and tenancy

- `PlatformAdmin`
- `School`
- `SchoolSettings`
- `SchoolLoginDirectory`
- `SubscriptionPlan`
- `LoginRateLimit`
- `PlatformPasswordResetToken`
- `AuditLogPlatform`

### Users and authorization

- `User`
- `Role`
- `Permission`
- `RolePermission`
- `UserRole`
- `UserPermissionOverride`
- `SchoolPasswordResetToken`
- `AuditLogSchool`

### Academic structure

- `AcademicYear`
- `Term`
- `CalendarEvent`
- `House`
- `Class`
- `Subject`
- `ClassSubjectTeacher`

### Learners and families

- `Student`
- `Guardian`
- `StudentGuardian`

### Attendance and identity

- `AttendanceEvent`
- `FaceEnrollment`
- `FaceMatchReview`
- `Device`
- `DeviceIdentity`
- `DeviceAttendanceReceipt`

### Academics

- `Assessment`
- `Score`
- `ReportCard`
- `ReportCardTemplate`
- `AiDraft`

### Finance and payroll

- `FeeItem`
- `Invoice`
- `InvoiceLine`
- `Payment`
- `PaymentReversal`
- `SalaryStructure`
- `PayrollRun`
- `Payslip`

### Communication

- `Message`

### Operations and safety

- `TimetableSlot`
- `SubstituteAssignment`
- `VisitorLog`
- `ApprovedPickup`
- `PickupApprovalRequest`
- `PickupEvent`

Additional models may exist in the schema for specialized functionality. Always inspect the current schema before assuming a model or field exists.

---

## 8. Major application areas and routes

The exact route tree changes as the product evolves, so agents should search the repository before modifying a route. The following are the major entry points.

### Public website

- `/`
- `/features`
- `/for-schools`
- `/about`
- `/contact`

The public site should communicate SukuuNova as a serious school platform rather than looking like an internal admin dashboard.

### Authentication

The application has separate entry paths for platform and school users, including:

- `/login/platform`
- `/login/school`

Reset/password recovery routes and server handlers live alongside their respective authentication systems.

### School workspace

Important examples include:

- `/school/students`
- `/school/guardians`
- `/school/staff`
- `/school/classes`
- `/school/subjects`
- `/school/timetable`
- `/school/attendance`
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

Specialized school areas include admissions, safety/pickup, transport, feeding, CBT, library, assets, recruitment and payroll.

### Platform workspace

The platform control surface is rooted at:

- `/platform`

Platform APIs include school management, subscriptions, billing, support, search and controlled operational functions.

Some API paths retain historical naming from earlier internal organization. **Those names are compatibility details, not product stages or roadmap terminology.** Do not use old naming to decide what should be built next.

### Family/guardian workspace

The guardian experience has its own route space and server-side authorization. Guardian child records must always be resolved through the authenticated guardian-to-student relationship rather than by trusting a URL parameter alone.

---

## 9. Academic system

The academic system is one of the most important parts of SukuuNova.

The expected conceptual flow is:

**Academic year → term → class → subject → teacher → assessment → score → moderation → report card → approval → publication**

### Academic setup

Administrators configure:

- academic years;
- terms;
- classes;
- houses;
- subjects;
- teacher assignments;
- assessment structures;
- grade bands and calculation rules where supported.

### Gradebook

The gradebook should be organized around a teacher's or administrator's actual working context:

**Term → Class → Subject → Assessment → Learners → Scores**

It should not force the user to navigate an enormous database-shaped collection of unrelated assignment cards.

### Score integrity

Score entry must validate:

- student belongs to the relevant school/class context;
- assessment belongs to the correct academic context;
- score is within allowed range;
- duplicate score conditions are handled safely;
- locked/published academic records cannot be casually modified;
- consequential changes are auditable.

### Report cards

Report cards are the controlled output of academic records.

The desired workflow is:

**Draft → Review → Approve → Publish → Family access → Archive**

Publishing must be deliberate. A guardian should not see an unapproved or unpublished result merely because a database record exists.

### Timetable

Timetable functionality should consider:

- class conflicts;
- teacher conflicts;
- room conflicts where applicable;
- period ranges;
- substitution;
- replacement of existing schedules.

Destructive rebuild operations should show the user what will be replaced before applying it.

---

## 10. Attendance and biometric architecture

Attendance is both a normal school workflow and an integration point for future physical devices.

### Normal attendance

The ideal human workflow is:

**Select class → select date → load roster → mark everyone → resolve exceptions → save/submit**

Quick actions such as “All Present” can make large registers practical, with individual overrides for absent, late or excused learners.

### Staff attendance

Staff attendance follows a similar operational model but uses staff records and the appropriate permissions.

### Device attendance

The device layer provides a path for registered physical attendance devices to submit attendance events securely.

Important concepts include:

- registered device;
- external device identity;
- signed/authenticated request context;
- idempotency key;
- nonce;
- attendance receipt;
- duplicate protection;
- reconciliation.

A device retry must not create duplicate attendance events.

### Face recognition

Face recognition is treated as sensitive identity technology, not as an automatic truth engine.

The system has concepts for:

- face enrollment;
- consent/authorization context;
- face matching;
- match review.

Where a match needs human confirmation, the workflow should allow a staff member to review it instead of automatically converting an uncertain match into a school record.

---

## 11. Finance architecture

Finance should be treated as an operational ledger, not merely a list of numbers.

### Fees

Fee items describe what the school charges.

### Invoices

Invoices describe what a particular student/account is expected to pay, with invoice lines showing the underlying fee items.

### Payments

Payments record money received against financial obligations.

### Reversals

A reversal is a separate financial event that explains why a prior payment is no longer treated as valid.

### Required UX direction

A bursar should be able to understand, at a glance:

- what was billed;
- what was paid;
- what remains;
- what is overdue;
- what is reversed;
- what action should happen next.

Payment entry should clearly show the amount, account, method, reference where relevant, resulting balance and receipt outcome before final confirmation.

The current supported payment-method set includes common methods such as Cash, MoMo and Card. Future payment integrations should be added behind explicit provider abstractions and reconciliation rules.

---

## 12. Communication and notification architecture

The `Message` model is the durable record for school communication.

A communication should have a lifecycle such as:

**Draft → audience selected → review → queued → sending → sent/failed → retry/reconcile**

Provider failure should not corrupt the underlying school operation.

The message/outbox layer is designed to persist delivery information, attempts and failure details.

The current serverless-compatible implementation can attempt external delivery during the request. At greater scale, a durable queue/worker architecture should be introduced so sending can be retried independently of the web request.

### Emergency communication

Emergency broadcast is intentionally more guarded than ordinary messaging. It should require explicit confirmation and use the established delivery/audit machinery.

Never create an emergency action that can be triggered accidentally by a normal button click.

---

## 13. Guardian and family communication

SukuuNova has a restricted WhatsApp assistant concept for guardians.

The important architectural rule is that WhatsApp is **not** a free-form AI-to-database interface.

The assistant should:

1. identify the authenticated/verified guardian context;
2. resolve only that guardian's permitted children;
3. classify supported intents;
4. query only the necessary school data;
5. return a concise answer;
6. refuse or safely redirect unsupported questions.

Current supported-style use cases include information such as:

- child attendance/arrival status;
- fee balance;
- next relevant calendar event.

Unsupported requests must not be answered by guessing.

The endpoint currently used for the WhatsApp assistant is:

`POST /api/phase4/whatsapp`

The path name is a legacy compatibility name. It does not represent a product stage.

---

## 14. AI architecture

AI is an assistant inside SukuuNova, not the authority over school records.

### Current AI-assisted workflows

The current application has controlled AI drafting for areas such as:

- lesson-note drafting;
- report-card remark drafting.

The server-side AI integration is configured through environment variables such as:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_RESPONSES_URL`

The configured model is environment-controlled. Do not hard-code a model assumption into product logic.

### Narrow context

AI requests should contain only the context needed for the task.

For example, a report-card remark request may use:

- learner display name;
- aggregate scores;
- attendance information;
- class;
- term.

A lesson-note request may use:

- class;
- subject;
- topic;
- learning objectives;
- other explicitly supplied lesson context.

Do not send the whole school database to a model merely because the model could technically process it.

### Human approval

AI-generated content should be represented as a draft.

The `AiDraft` concept uses a controlled lifecycle such as `suggested`, followed by human acceptance, editing or rejection.

AI must not silently mutate official academic or operational records.

The safe rule is:

> **AI suggests. A human decides. The normal application workflow records the decision.**

---

## 15. Subscription and feature controls

SukuuNova is intended to support different school subscription levels.

The platform can associate a school with a subscription plan and use feature flags to control premium functionality.

Premium areas include functionality such as:

- face recognition;
- payroll;
- transport;
- feeding;
- CBT;
- library;
- assets;
- recruitment.

Feature protection must exist at the server/authorization boundary. A UI-only check is not sufficient.

When a feature is unavailable, the product should explain why and provide the appropriate upgrade/admin path rather than failing with a mysterious error.

---

## 16. School groups and branches

SukuuNova is designed to support organizations that operate multiple school branches.

A school group can contain separate branch tenants while allowing authorized owners to see consolidated information where appropriate.

Important rule:

> **Consolidation does not erase tenant boundaries.**

A group report may aggregate authorized branch data, but each branch remains independently scoped in the underlying queries and security model.

---

## 17. UI/UX architecture

The application is undergoing continuous visual and workflow consolidation. This is a product-level concern, not cosmetic cleanup.

### One design language

All workspaces should converge on shared semantic tokens for:

- page background;
- surface/card background;
- elevated surface;
- primary text;
- muted text;
- border;
- accent;
- success;
- warning;
- danger;
- focus states.

Components should consume semantic variables rather than scattering literal `bg-white`, `text-white`, `bg-slate-*` and similar values throughout unrelated modules.

### Theme support

SukuuNova supports user-selectable theme presets and needs consistent light/dark behaviour across:

- public website;
- platform workspace;
- school workspace;
- settings;
- specialized modules.

A page must not become unreadable because a component contains hard-coded text or surface colours from another theme.

### Responsive behaviour

Mobile and desktop should use the same information architecture while adapting layout density and interaction patterns.

The target is not “desktop squeezed onto a phone.”

Mobile should:

- preserve the most important action;
- keep navigation understandable;
- avoid horizontal overflow where possible;
- use drawers/sheets or responsive tables where appropriate;
- maintain readable touch targets;
- preserve form usability.

Desktop should use the available space for operational efficiency rather than simply making every card wider.

### Accessibility

Important controls need:

- semantic labels;
- keyboard access;
- visible focus states;
- sensible contrast;
- appropriate disabled/loading states;
- meaningful error messages;
- screen-reader-friendly structure where practical.

### Operational states

Every real workflow should deliberately handle:

- loading;
- empty;
- success;
- validation error;
- permission denied;
- not found;
- network/server failure;
- saving;
- saved;
- unsaved changes;
- destructive confirmation.

---

## 18. Generic pages versus real workflows

The repository contains some generic module infrastructure that is useful for scaffolding and fallback behaviour.

That infrastructure must not be mistaken for completed product functionality.

A generic page may show:

- module title;
- tabs;
- description;
- empty state;
- links to other areas.

That is useful as a safe fallback, but it is not a substitute for a real operational workflow.

Examples:

- attendance needs a roster/register workflow;
- gradebook needs class/subject/assessment context;
- finance needs account/billing/payment context;
- timetable needs conflict-aware scheduling;
- library needs catalogue/loan operations;
- visitor management needs gate workflow;
- recruitment needs candidate pipeline actions.

When implementing a module, first ask:

> “What is the human trying to accomplish?”

Then build the smallest complete workflow that actually accomplishes it.

---

## 19. Route and API development rules

Before changing a route:

1. search for the route;
2. inspect its parent layout/shell;
3. inspect related components;
4. inspect its server actions/API handlers;
5. inspect the Prisma models used by the workflow;
6. inspect authorization checks;
7. inspect audit behaviour;
8. inspect existing tests;
9. verify whether another route already implements the same job.

Avoid creating duplicate representations of the same business operation unless there is a clear role-specific reason.

### Server-side rule

Business logic should live on the server or in reusable server-side services rather than relying on client-only state.

### Validation rule

Validate both:

- shape/type of input;
- authorization/business invariants.

### Tenant rule

Every school-owned query must be tenant-scoped.

### Audit rule

Important mutations should record who performed them, what changed and why where appropriate.

---

## 20. Database and migration rules

Prisma migrations are historical implementation records. Their directory names may contain old internal naming conventions from when the system was organized differently.

**Those names are not the product roadmap and must not be used to define current development work.**

The authoritative current schema is:

`prisma/schema.prisma`

When changing the schema:

1. understand existing relationships;
2. preserve tenant isolation;
3. consider existing production data;
4. create a safe Prisma migration;
5. test migration application against the production-style database;
6. update affected server code;
7. update UI and validation;
8. consider rollback/recovery implications.

Never casually delete or rename production data fields merely to simplify a screen.

---

## 21. Testing philosophy

Unit tests and builds are necessary but are not enough for SukuuNova.

The system needs human-style acceptance testing around complete journeys.

### Owner journey

Create school → establish academic year/term → create classes → add staff → assign teachers → enrol students → connect guardians → configure fees → record payments → configure timetable → enter marks → approve results → publish report cards → communicate with families.

### Teacher journey

Login → see only assigned work → open class → take attendance → enter marks → create/assign academic work → inspect timetable → communicate where permitted.

### Guardian journey

Login → see only linked children → see released attendance/results → inspect report card → see appropriate fee information → receive school communications.

### Bursar journey

Configure fees → generate invoice → record full/partial payment → issue receipt → inspect balance → reconcile → reverse a payment where necessary → verify audit history.

### Gate/safety journey

Find learner → identify authorized pickup person → process approved pickup → handle unapproved person → create approval request → obtain required authorization → record final pickup event.

### Platform journey

Create school → assign plan → inspect school → suspend/reactivate → handle support → enter controlled impersonation with reason → inspect school → exit impersonation → verify audit records.

### Failure testing

Every important journey should also test:

- invalid input;
- duplicate submission;
- unauthorized user;
- wrong tenant;
- direct URL access;
- stale browser state;
- refresh during workflow;
- network failure;
- empty database state;
- cancelled operation;
- destructive confirmation;
- concurrent/duplicate requests where relevant.

---

## 22. Deployment and infrastructure

Production deployment is currently centred on Railway.

The application and PostgreSQL database are represented as Railway services in the production environment.

GitHub Actions is used for repository automation and checks, including build/type/lint/test-oriented workflows and specialized operational workflows.

Important deployment documentation also exists under `docs/`, including Railway production guidance.

### Deployment discipline

Do not judge production health solely from GitHub commit success.

A change should be considered complete only after:

1. code is committed;
2. CI/build checks pass;
3. Railway deployment completes successfully;
4. application health is verified;
5. the relevant user workflow is tested;
6. logs are checked when something behaves unexpectedly.

Avoid producing many tiny competing deployments while a major stabilization task is in progress. Prefer coherent, reviewable changes.

---

## 23. Environment configuration

The exact production values must remain in the deployment secret store and must never be committed.

The repository includes `.env.example` as the reference for expected configuration.

Important categories include:

- database connection;
- school authentication secret;
- platform authentication secret;
- AI provider configuration;
- messaging provider credentials;
- WhatsApp integration settings;
- deployment/runtime settings;
- development-only controls.

Never expose secrets in UI, logs, client bundles, README files or error responses.

---

## 24. Current engineering reality

SukuuNova has substantial underlying architecture, but the product is still being refined toward a fully coherent production experience.

The important distinction is:

### Strong foundations

There is meaningful existing work around:

- multi-tenancy;
- authentication;
- permissions;
- audit logging;
- academic calculations;
- finance data structures;
- attendance;
- pickup approval;
- messaging/outbox behaviour;
- platform management;
- subscription controls;
- support;
- AI drafts;
- biometric/device attendance foundations.

### Areas requiring continued product work

Some screens and modules have historically been more complete in backend/data structure than in human-facing workflow.

Therefore an agent must never assume:

> “The route exists, so the feature is finished.”

A route may be:

- fully operational;
- partially operational;
- read-only;
- a safe fallback/scaffold;
- visually complete but functionally incomplete;
- awaiting integration.

The correct approach is to inspect the actual server actions/API/data path before claiming a feature is complete.

### Current product priority

The immediate objective is **system-wide coherence and correctness**:

- eliminate broken routes;
- eliminate misleading prototype behaviour;
- finish real workflows;
- unify the design system;
- fix cross-module data inconsistencies;
- strengthen role/tenant enforcement;
- improve responsive behaviour;
- improve loading/error/empty states;
- test complete human journeys;
- verify production after deployment.

New functionality should not be used as an excuse to leave existing core workflows half-finished.

---

## 25. Large future capabilities

SukuuNova is intended to grow significantly beyond the current school-management foundation. These are future directions, not claims that every item is already implemented.

### Hardware-first attendance ecosystem

The device work can evolve into a complete school attendance infrastructure:

- biometric terminals;
- fingerprint/face devices;
- secure device provisioning;
- device health monitoring;
- offline event buffering;
- automatic synchronization;
- duplicate-event reconciliation;
- device fleet management;
- attendance dashboards;
- gate-level alerts.

The goal is for a physical attendance event to become a trusted event in SukuuNova without requiring staff to re-enter it manually.

### Mobile applications and progressive web experience

The platform can evolve into dedicated mobile experiences for:

- teachers;
- school administrators;
- guardians;
- gate/security staff;
- drivers/transport staff.

The mobile direction should prioritize the jobs people actually perform away from a desk rather than simply reproducing every desktop screen.

### Offline-first school operations

Schools may have unreliable connectivity. Future work can introduce offline-capable workflows for high-frequency operations such as:

- attendance;
- gate/pickup;
- selected classroom workflows;
- device synchronization.

Offline events must have safe reconciliation and idempotency rather than naïvely overwriting server state.

### Ghana-focused payments and reconciliation

The finance system can become much more deeply integrated with local payment infrastructure, including automated payment confirmation, reference reconciliation, receipts and finance dashboards.

Potential integrations may include mobile-money and bank payment providers appropriate to the Ghanaian market.

Any provider integration must preserve the invoice/payment/reversal/audit model.

### Advanced school analytics

Future analytics can connect:

- attendance;
- academic performance;
- fees/arrears;
- enrolment;
- staffing;
- operations;
- retention;
- family engagement.

The objective is not to produce decorative charts. It is to answer questions such as:

> Which learners need attention?
> Which classes have attendance problems?
> Which fee accounts require follow-up?
> Which subjects are underperforming?
> Where are operational bottlenecks?

### AI school operations assistant

AI can eventually become a controlled operational assistant capable of helping authorized staff with tasks such as:

- summarizing school activity;
- drafting communications;
- preparing lesson materials;
- identifying unusual trends;
- explaining reports;
- suggesting follow-up actions;
- preparing administrative drafts.

The existing principle remains: **AI should be permission-aware, tenant-scoped, auditable and human-controlled for consequential actions.**

### Intelligent academic support

Future academic features may include:

- deeper curriculum planning;
- personalized learner insights;
- automated assessment analysis;
- question generation;
- teacher resource generation;
- intervention recommendations;
- richer moderation tools.

Official academic records should still require the appropriate human authority.

### Parent/family super-app direction

The family experience can eventually become a comprehensive school-family channel covering:

- attendance;
- fees;
- report cards;
- announcements;
- events;
- transport status;
- meal information;
- permission/consent workflows;
- pickup authorization;
- direct school communication.

WhatsApp can remain an important access channel while the dedicated family experience grows.

### School communications platform

The messaging system can evolve toward a full communication centre with:

- audience segmentation;
- reusable templates;
- scheduled campaigns;
- multilingual content;
- delivery analytics;
- provider fallback;
- message preferences;
- family notification controls;
- automated but policy-controlled reminders.

### Digital admissions and enrolment

The admissions system can become an end-to-end digital pipeline with:

- enquiry capture;
- online applications;
- document collection;
- interview scheduling;
- admission decisions;
- offer letters;
- digital acceptance;
- deposit/payment;
- automatic learner onboarding.

### Broader school ecosystem integrations

Longer-term integrations can include:

- accounting systems;
- payment providers;
- biometric hardware vendors;
- SMS providers;
- WhatsApp providers;
- email;
- calendars;
- document storage;
- educational content systems;
- identity providers;
- government/education reporting systems where officially supported.

Integrations should be isolated behind service boundaries rather than leaking provider-specific logic throughout the application.

### Multi-school intelligence

For authorized school groups and platform operators, SukuuNova can eventually provide stronger benchmarking and operational intelligence across branches without compromising tenant isolation.

### Developer and integration platform

A mature SukuuNova can eventually expose carefully permissioned APIs/webhooks so schools and approved partners can integrate external systems without accessing the database directly.

---

## 26. What must never happen

The following are architectural red lines.

### Never cross tenant boundaries

A user from School A must never receive School B data.

### Never trust the frontend for authorization

A hidden button is not security.

### Never expose secrets

No API keys, reset tokens, database credentials or private integration credentials in client code, logs or documentation.

### Never silently mutate official records with AI

AI-generated suggestions require the appropriate human workflow.

### Never fake completion

A disabled or unavailable feature should be clearly represented as unavailable. Do not simulate successful persistence with local React state.

### Never destroy financial history casually

Use reversals/adjustments and audit records where the business model requires them.

### Never introduce another competing design system without a strong reason

SukuuNova should become visually and behaviourally more unified over time, not less.

### Never make a destructive operation one-click by accident

Show impact, request confirmation and preserve auditability.

### Never assume route existence means feature completion

Verify the complete path from UI → server → authorization → database → response.

---

## 27. How an AI coding agent should work on SukuuNova

When an agent receives a task, it should follow this sequence.

### Step 1 — Identify the product area

Determine whether the task concerns:

- platform;
- school administration;
- academics;
- attendance;
- finance;
- communication;
- safety;
- family;
- a premium module;
- public website;
- infrastructure.

### Step 2 — Trace the complete implementation

Find:

- route;
- page/component;
- server action/API;
- service/helper;
- Prisma model;
- authorization;
- audit;
- tests;
- deployment impact.

### Step 3 — Understand the human workflow

Before writing UI, decide what the user is actually trying to accomplish.

### Step 4 — Preserve security

Verify tenant scope, permission scope and related-record ownership.

### Step 5 — Reuse existing systems

Prefer existing:

- `AppShell`/workspace shell;
- design tokens;
- auth helpers;
- tenant helpers;
- RBAC utilities;
- audit utilities;
- service layers;
- shared UI components.

Do not create a second implementation of an existing platform primitive.

### Step 6 — Handle all states

Do not ship only the happy path.

### Step 7 — Test

Run the relevant type/lint/test/build checks and, where possible, exercise the actual browser workflow.

### Step 8 — Verify production

After deployment, inspect the real service and relevant logs before calling the task complete.

---

## 28. Repository orientation

Useful top-level locations include:

- `src/app/` — Next.js routes and application pages/API routes
- `src/components/` — reusable UI components
- `src/lib/` — authentication, authorization, database, services and shared server logic
- `prisma/schema.prisma` — authoritative data model
- `prisma/migrations/` — database migration history
- `docs/` — focused operational/deployment documentation
- `.github/workflows/` — CI and operational automation
- `.env.example` — expected environment configuration
- `package.json` — scripts and dependencies

The exact structure evolves. Search before assuming a file location.

---

## 29. Useful implementation concepts

Some important concepts recur throughout the codebase.

### `withTenant()`

Use the existing tenant-aware database pattern for school-scoped work. Do not replace it with unscoped database calls for convenience.

### Authorization helpers

Use the existing authorization/RBAC mechanisms rather than duplicating permission logic inside individual components.

### School services

Reusable school operations should live in server-side services/helpers when they are used by multiple routes.

### Message outbox

Messaging should use the durable message/outbox architecture instead of directly coupling every school operation to an external provider.

### Audit utilities

Use the existing school/platform audit mechanisms for consequential operations.

### Shared shell and design system

Use the existing workspace shell and shared semantic styling. If a component needs a new token, consider whether it belongs in the shared system rather than in a one-off stylesheet.

---

## 30. Definition of “done” for SukuuNova

A feature is not done merely because:

- a page renders;
- a button exists;
- a database model exists;
- an API returns 200;
- a card looks polished.

A feature is done when the intended user can complete the real workflow safely.

That means:

**Correct data + correct authorization + correct tenant scope + correct business rules + usable UI + complete states + auditability where needed + tests + successful production verification.**

The ultimate standard is simple:

> **Could a real school use this operation confidently on a busy day without needing to understand how the database works?**

If the answer is no, the feature still needs work.

---

## 31. Final direction

SukuuNova is not being built as a collection of screens that happen to share a database.

It is being built as a connected school operating platform.

The work ahead is therefore not about endlessly adding isolated pages. It is about making every existing part trustworthy, coherent and useful, then extending the platform into deeper automation, hardware, payments, mobile experiences, analytics, family communication and intelligent school operations.

The current development mindset is:

**inspect deeply → understand the real workflow → fix the underlying logic → enforce security → make the UI coherent → test the whole journey → verify production → move to the next problem.**

There is no product-stage numbering to follow. The repository should be treated as one evolving system whose quality improves continuously.

When in doubt, preserve the three things SukuuNova cannot compromise:

1. **the school user's ability to get real work done;**
2. **the privacy and integrity of school data;**
3. **the consistency and trustworthiness of the product.**
