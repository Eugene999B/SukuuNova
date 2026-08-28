# SukuuNova

SukuuNova is a secure, multi-tenant school operations platform designed for Ghanaian schools. **Phase 4 is the final scoped build phase and is complete on top of the integrated Phase 0-3 product.**

The product name is **SukuuNova** throughout the repository.

## Current status

- **Phase 0 — foundation:** complete and verified.
- **Phase 1 — MVP school operations:** complete and verified.
- **Phase 2 — differentiators:** complete and verified at commit `d80d1234826561017490999054f7ec9b72fdb8af`.
- **Phase 3 — operations:** implemented and merged into `main` at merge commit `29ac66f9cddfb168107e579e3dc23623540f69e2`.
- **Phase 4 — platform maturity & AI:** complete and merged into `main` at merge commit `5dfdd190b19e72603b5773b5f235bc25afa45bd2`; its final verified implementation head was `5667882f457df859f5c1e444f09d267516ab42c5`.
- **Phase 4 verification:** final CI passed migrations, all 35 tests, typecheck diagnostics, and the production build.
- **Vercel deployment:** code is Vercel-compatible and deployment is intentionally a separate dashboard step.
- **Phase 5:** not part of this project; Phase 4 is the final scoped product phase.

## Phase 4 functionality

Phase 4 adds exactly the platform/business and controlled-AI scope defined in the Phase 4 build brief:

- super-admin console for school creation, suspension/reactivation, cross-school investigation, support operations, subscription management, and audited impersonation;
- subscription plans, per-school platform invoices, and manual platform-payment reconciliation;
- feature-flag enforcement for existing premium Phase 2/3 modules: face recognition, payroll, transport, feeding, CBT, library, assets, and recruitment;
- multi-branch School Groups with read-only consolidated reporting for the owning school Owner; branch student/staff/finance data remains isolated;
- school support tickets with threaded messages and platform support status management;
- narrowly-scoped WhatsApp parent assistant intents for child arrival, fee balance, and the next recorded calendar event, with a safe fallback for everything else;
- scheduled at-risk student signals from attendance, score trends, and fee arrears, surfaced to authorized school staff without automatic parent notification;
- AI-assisted lesson-note and report-card remark drafts stored as `AiDraft` rows in `suggested` status until a human explicitly accepts or discards them;
- emergency/lockdown broadcast with a two-step confirmation token and reuse of the existing SukuuNova messaging queue.

## Phase 4 security model

Platform authentication remains a separate JWT universe from school authentication. Platform permissions are explicitly separated: `schools:impersonate` is distinct from `schools:manage`.

Every new tenant-scoped Phase 4 table carries `schoolId`, uses forced PostgreSQL RLS, and uses same-school relationships where a new row references a tenant-owned record. Tenant operations continue through the existing `withTenant()` transaction context.

Impersonation is time-bounded to 30 minutes, requires an explicit reason, creates platform and school audit entries, and exposes the event to the impersonated school through its own audit view. It is not a hidden backdoor.

Multi-branch reporting does not merge tenant records. Only the owning Owner may request the consolidated report, and the underlying branch queries still execute in independent tenant contexts.

Offline synchronization remains the Phase 3 restriction: only attendance and score records may be synchronized, using idempotent client-generated keys and live permission checks at synchronization time.

## Phase 4 routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET/POST | `/api/platform/phase4` | Platform school, plan, billing, support, search, and impersonation operations |
| POST | `/api/platform/impersonation` | End an active audited impersonation session |
| GET/POST | `/api/phase4` | School support, risk flags, AI drafts, group reporting, and emergency confirmation |
| POST | `/api/phase4/whatsapp` | Authenticated, predefined WhatsApp parent-assistant intents |
| GET | `/platform` | Super-admin console |
| GET | `/phase4` | School Phase 4 console |

Existing Phase 0-3 routes remain available, with the Phase 2/3 premium-module feature guard applied at the route boundary.

## AI provider and prompt/data boundaries

Phase 4 uses **OpenAI's Responses API** for lesson-note and report-card remark drafting. The model is configured through `OPENAI_MODEL`, defaulting to `gpt-5.6-luna`, with `OPENAI_RESPONSES_URL` configurable separately.

AI generation does not send the entire school database to the provider. The server constructs a narrow context for each draft. Report-card prompts contain aggregate score percentages, attendance counts, class name, term identifier, and the student's display name; lesson-note prompts contain only the supplied subject/topic/objectives/class context plus an optional target score identifier. The model is instructed to produce draft text only and never to perform or request real-record mutations.

Generated text is written to the tenant-scoped `AiDraft` table with status `suggested`. It cannot affect a report card or score until an authorized staff member explicitly accepts it, optionally after editing. Acceptance then uses the normal application write path and audit logging.

The WhatsApp parent assistant is **not** a general-purpose LLM-to-database agent. It uses a small fixed intent classifier mapped to real parent-scoped queries for arrival status, fee balance, and the next recorded calendar event. Unsupported questions receive a safe refusal instead of a guessed answer.

## Vercel free-tier deployment

SukuuNova is a Next.js application and its Vercel build command is already safe for serverless deployment: `prisma generate && next build`. **Do not** change this to `prisma migrate deploy`; database migrations are a separate, explicit operation against the production database.

Vercel has no persistent application worker process, so the old `worker:risk` and `worker:messages` processes are not part of the Vercel runtime. Risk scanning is now a single-pass protected HTTP endpoint:

`POST /api/cron/risk-scan`

It requires `Authorization: Bearer <RISK_SCAN_CRON_SECRET>`. Each invocation performs one risk scan and returns; it has no `setInterval` or other long-running process.

The repository includes `.github/workflows/risk-scan.yml`, which triggers the route every six hours using two GitHub Actions secrets:

- `SUKUUNOVA_APP_URL` — the deployed Vercel base URL, for example `https://app.example.com`;
- `RISK_SCAN_CRON_SECRET` — the same random secret configured in Vercel.

The scheduler is deliberately external because Vercel Hobby Cron is not the right mechanism for a several-times-per-day risk scan. The external workflow can be changed to another HTTP scheduler later without changing the application endpoint.

Notification delivery is also Vercel-compatible. SMS/WhatsApp notifications created through the existing notification service are persisted and then attempted synchronously in the request path. Provider failures are caught, logged, and recorded with `status = failed` rather than crashing the school operation request. The persistent message worker is therefore not required for the normal Vercel path.

This synchronous delivery is a deliberate free-tier simplification. At larger usage volumes, the preferred architecture is a serverless-native queue such as QStash or a platform that supports a dedicated persistent worker.

## Environment variables

All provider configuration is environment-driven; secrets are not hardcoded. `.env.example` contains the full application set, including:

- `DATABASE_URL`, `TEST_DATABASE_URL`
- `SCHOOL_AUTH_SECRET`, `PLATFORM_AUTH_SECRET`
- `SMS_PROVIDER_URL`, `SMS_PROVIDER_TOKEN`, `SMS_SENDER_ID`
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `FACE_EMBEDDING_ENCRYPTION_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_RESPONSES_URL`
- `WHATSAPP_WEBHOOK_SECRET`
- `RISK_SCAN_CRON_SECRET`
- `RISK_SCAN_INTERVAL_MS` — documentation for the desired external scheduler cadence; it is no longer used to drive an in-process timer.

Set production values in Vercel Environment Variables. Do not commit real credentials. Preview deployments should use a disposable database rather than production school data once real data exists.

## PostgreSQL and RLS deployment requirement

The production database must preserve the existing tenant-security model. Use a managed PostgreSQL provider such as Supabase or Neon, create a dedicated application role that is `NOSUPERUSER` and `NOBYPASSRLS`, and grant only the database privileges the application requires. Do not use the provider's default admin/superuser connection as the application's runtime `DATABASE_URL`.

Before first live use, run `prisma migrate deploy` once against the production database and verify the Phase 0-4 tenant-isolation tests against the restricted application role. Migrations are deliberately excluded from the Vercel build because preview builds must never automatically migrate production data.

## File and photo storage

The current repository does not contain an S3/Cloudflare/Supabase object-storage integration or a filesystem-upload implementation; encrypted face vectors are handled through AWS Rekognition and the existing application stores the relevant reference data without a local persistent file store. No new storage provider is required by the current deployment code. If persistent CV/report-card/ID-card uploads are added later, they must use object storage rather than the Vercel filesystem.

## Architecture

- Next.js 15 App Router, React 19, TypeScript, and Tailwind CSS
- PostgreSQL 16, Prisma, forced Row-Level Security, and composite tenant foreign keys
- bcrypt password hashing and separate school/platform JWT universes
- existing audited school RBAC and tenant transaction context
- existing financial append-only/invoice safeguards
- Vercel-compatible short-lived request handling; scheduled/background work is invoked over HTTP

## Verification

The final Phase 4 verification run passed:

1. Prisma migrations;
2. all 35 tests;
3. typecheck diagnostics;
4. production build.

The Phase 4 suite covers feature-flag enforcement, platform permission separation, multi-branch authorization, safe WhatsApp intent refusal, AI draft/accept boundaries, and emergency broadcast confirmation. The Phase 0-3 invariant suite remains part of `npm run test`.

## Manual Vercel setup checklist

1. Import `Eugene999B/SukuuNova` into a Vercel project using the Next.js framework preset.
2. Create a free managed PostgreSQL database and a dedicated `NOSUPERUSER NOBYPASSRLS` application role.
3. Configure all `.env.example` production variables in Vercel; do not point Preview at production data once real school data exists.
4. Run `prisma migrate deploy` once manually against the production database before the first real request.
5. Add the GitHub Actions secrets `SUKUUNOVA_APP_URL` and `RISK_SCAN_CRON_SECRET` for the six-hour scheduler.
6. After the first live deployment, repeat the critical Phase 0-4 tenant, approval, impersonation, AI-draft, and emergency-confirmation checks against the live URL.

Railway is no longer the deployment target for this phase; the application has been adapted for Vercel's serverless model. No Vercel deployment or live-domain change is performed by this repository change.
