# SukuuNova

SukuuNova is a secure, multi-tenant school operations platform designed for Ghanaian schools. Phase 2 adds safety, staffing, payroll, messaging, and branded reporting differentiators to the verified Phase 0/1 foundation.

The product name is **SukuuNova** throughout the repository.

## Phase 2 status

Implemented on the **phase-2-differentiators** branch:

- minimal class timetable by weekday and period;
- substitute-teacher suggestions based on attendance and free periods, with explicit confirmation and no auto-assignment;
- student and staff face attendance using an AWS Rekognition adapter;
- linked-guardian consent enforcement before a student face can be enrolled;
- configurable face-match threshold and mandatory manual review below threshold;
- encrypted provider face references using AES-256-GCM;
- approved-guardian pickup lists, pending approval for unscheduled collectors, and maker-checker release;
- immutable pickup events created only after preapproval or an authorized second-person decision;
- a shared PostgreSQL SMS/WhatsApp outbox with atomic claims, exponential retries, and five-attempt failure handling;
- approved Twilio WhatsApp template messages for absences, staff lateness, invoices, payments, and report cards;
- three report-card presets with school logo, colours, and watermark;
- salary structures, fixed/percentage deductions, payroll runs, immutable PDF payslips, and staff self-service;
- Owner-only custom roles with a checkbox permission grid;
- visitor sign-in/sign-out log;
- filterable staff attendance dashboard;
- a signed-in Phase 2 console at **/phase2** and Owner-only role builder at **/phase2/roles**.

Still out of scope: bus tracking, feeding, CBT, library, fee waivers, recruitment, offline mode, platform billing/feature flags, emergency workflows, AI features, drag-and-drop report design, and a full constraint-solving timetable.

## Architecture

- Next.js 15 App Router, React 19, TypeScript, and Tailwind CSS
- PostgreSQL 16, Prisma, forced Row-Level Security, and composite tenant foreign keys
- bcrypt password hashing and separate school/platform JWT universes
- pdf-lib for report cards and payslips
- AWS SDK adapter for Rekognition
- Twilio Content API template delivery for WhatsApp
- PostgreSQL durable outbox; no Redis or parallel queue is introduced

Every tenant-owned model carries **schoolId**. **withTenant** establishes transaction-local tenant context, the Prisma extension injects tenant predicates, and PostgreSQL forces RLS. Cross-school foreign keys repeat **schoolId**.

Append-only database and application guards protect audit logs, financial ledgers, payslips, and pickup events. Report cards retain **draft → submitted → approved → sent** maker-checker transitions. Payroll retains **draft → processed → paid** transitions.

## Face-recognition privacy and safety

The browser captures a still frame only for the current request. SukuuNova validates it, sends it through the configured provider adapter, and does not save the raw image in PostgreSQL, object storage, logs, or audit metadata. AWS Rekognition collections store face vectors rather than face images. The returned FaceId is encrypted before storage with **FACE_EMBEDDING_ENCRYPTION_KEY**.

Student enrollment requires a guardian already linked to that student. A match below the school threshold creates a manual-review record and cannot record attendance until an authorized user confirms it. Schools remain responsible for notices, consent records, retention policy, access review, and applicable privacy law.

Vendor references:

- [AWS Rekognition collections](https://docs.aws.amazon.com/rekognition/latest/dg/collections.html)
- [AWS Rekognition data encryption](https://docs.aws.amazon.com/rekognition/latest/dg/security-data-encryption.html)
- [AWS Rekognition pricing](https://aws.amazon.com/rekognition/pricing/)
- [AWS Rekognition FAQ](https://aws.amazon.com/rekognition/faqs/)

Rekognition is usage-priced for image operations and stored face vectors, with no application-side fixed queue infrastructure. Verify current AWS regional pricing before production.

## WhatsApp choice and cost

WhatsApp uses Twilio approved Content templates. Each school configures a **ContentSid** for the five SukuuNova template keys. Business notifications outside WhatsApp’s customer-service window must use approved templates. Twilio charges its per-message fee in addition to applicable Meta template fees; verify current country/category pricing before launch.

- [Twilio approved WhatsApp templates](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates)
- [Twilio WhatsApp pricing](https://www.twilio.com/en-us/whatsapp/pricing)

SMS and WhatsApp share the existing **Message** outbox. Web requests enqueue messages only; the worker performs external provider calls.

## Phase 2 routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET/POST | /api/phase2/face | Enrollment, match, and manual review |
| GET/POST | /api/phase2/pickups | Approved collectors, attempts, and review |
| GET/POST | /api/phase2/timetable | Slots, suggestions, and confirmation |
| GET/POST | /api/phase2/payroll | Salary structures, runs, and visible payslips |
| GET | /api/phase2/payroll/payslips/:id/pdf | Authorized PDF delivery |
| GET/POST | /api/phase2/roles | Owner-only custom roles |
| GET/POST | /api/phase2/visitors | Visitor log |
| GET/POST | /api/phase2/templates | Report preset and branding |
| GET | /api/phase2/staff-attendance | Date/staff-filtered dashboard |
| GET/POST | /api/phase2/settings | Thresholds and notification configuration |
| GET | /phase2 | Phase 2 school operations console |
| GET | /phase2/roles | Owner-only role builder |

All Phase 0/1 routes remain available.

## Environment

Copy **.env.example** and configure the core database and independent authentication secrets. The runtime PostgreSQL identity must be **NOSUPERUSER** and **NOBYPASSRLS**.

~~~bash
DATABASE_URL=
TEST_DATABASE_URL=
SCHOOL_AUTH_SECRET=
PLATFORM_AUTH_SECRET=
NEXT_PUBLIC_APP_URL=https://your-domain.example

SMS_PROVIDER_URL=
SMS_PROVIDER_TOKEN=
SMS_SENDER_ID=
SMS_WORKER_POLL_MS=2000

AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
FACE_EMBEDDING_ENCRYPTION_KEY=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
~~~

Generate the face-reference key as 32 random bytes encoded in base64. Keep all provider credentials and keys in the deployment secret store, never Git.

## Setup and verification

~~~bash
npm install
npm run db:migrate
npm run db:seed
npm run test
npm run build
npm run dev
~~~

The integration database must be disposable, migrated, and accessed through a non-superuser, non-RLS-bypass identity.

The Phase 2 suite explicitly proves:

1. student face enrollment fails without linked guardian consent and provider references are encrypted;
2. an unapproved pickup creates no pickup event until a different authorized user approves;
3. staff lists and retrieves only their own payslips;
4. custom role IDs cannot cross tenant boundaries;
5. substitute suggestions write nothing until explicit confirmation.

The Phase 0/1 authentication, RBAC, audit, RLS, attendance, gradebook, finance, report workflow, parent scoping, and asynchronous messaging tests continue to run.

GitHub Actions remains limited to one verification workflow on pushes to **phase-1-mvp** or **phase-2-differentiators**, plus explicit manual dispatch. It installs dependencies, applies migrations, runs the full suite, type-checks/builds, and uses PostgreSQL 16.

## Worker and Railway preparation

Run the application and notification worker as separate processes:

~~~bash
npm run start
npm run worker:messages
~~~

No Railway deployment is performed in Phase 2. When deployment is explicitly authorized:

- Web build: **npm run build**
- Web start: **npm run start**
- Pre-deploy: **npm run db:migrate**
- Worker start: **npm run worker:messages**
- Provide every secret through Railway variables
- Use a non-superuser, non-BYPASSRLS PostgreSQL runtime role
- Review AWS/Twilio regional availability, pricing, consent, and retention before enabling providers

## Manual acceptance path

1. Sign in as a school Owner and open **/phase2**.
2. Configure attendance timing, face threshold, notification channels, and ContentSids.
3. Use the camera flow to verify student enrollment requires a linked guardian.
4. Scan below threshold and verify only a manual-review item appears.
5. Attempt an unscheduled pickup and verify a different authorized user must approve release.
6. Create timetable slots, request suggestions, and explicitly confirm a substitute.
7. Configure salary structures, process a run, mark it paid, and open a staff member’s own payslip.
8. Apply each of the three report presets with school branding and generate a report.
9. Create a custom role as Owner; verify Principal cannot access the builder.
10. Sign in/out a visitor and inspect staff attendance totals/trends.
11. Start **worker:messages** with test providers and verify SMS/WhatsApp outbox delivery.

## Repository branches

- **phase-0-foundation** — verified security/data foundation
- **phase-1-mvp** — verified Phase 1 school operations
- **phase-2-differentiators** — Phase 2 implementation and verification

Merging to the default branch and Railway deployment remain separate, explicit actions.
