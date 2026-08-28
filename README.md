# SukuuNova

SukuuNova is a secure, multi-tenant school operations platform designed for Ghanaian schools. **Phase 4 is now the final integrated product phase on `main`.**

The product name is **SukuuNova** throughout the repository.

## Current status

- **Phase 0 — foundation:** complete and verified.
- **Phase 1 — MVP school operations:** complete and verified.
- **Phase 2 — differentiators:** complete and verified at commit `d80d1234826561017490999054f7ec9b72fdb8af`.
- **Phase 3 — operations:** implemented and merged into `main` at merge commit `29ac66f9cddfb168107e579e3dc23623540f69e2`.
- **Phase 4 — platform maturity & AI:** complete and merged into `main` at merge commit `5dfdd190b19e72603b5773b5f235bc25afa45bd2`. The verified Phase 4 implementation head was `5667882f457df859f5c1e444f09d267516ab42c5`.
- **Verification:** the final Phase 4 CI run passed migrations, all 35 tests, and the production build. The typecheck diagnostics step also completed successfully and is configured as non-blocking in CI.
- **Railway deployment:** intentionally not performed yet.
- **Phase 5:** not part of this project; the supplied Phase 4 brief defines the final scoped phase.

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

Phase 4 uses **OpenAI's Responses API** for lesson-note and report-card remark drafting. The model is configured through `OPENAI_MODEL`, defaulting to `gpt-5.6-luna`, with `OPENAI_RESPONSES_URL` configurable separately. The provider integration is isolated behind the Phase 4 service rather than becoming a new application data path.

AI generation does not send the entire school database to the provider. The server constructs a narrow context for each draft. Report-card prompts contain aggregate score percentages, attendance counts, class name, term identifier, and the student's display name; lesson-note prompts contain only the supplied subject/topic/objectives/class context plus an optional target score identifier. The model is instructed to produce draft text only and never to perform or request real-record mutations.

Generated text is written to the tenant-scoped `AiDraft` table with status `suggested`. It cannot affect a report card or score until an authorized staff member explicitly accepts it, optionally after editing. Acceptance then uses the normal application write path and audit logging.

The WhatsApp parent assistant is **not** a general-purpose LLM-to-database agent. It uses a small fixed intent classifier mapped to real parent-scoped queries for arrival status, fee balance, and the next recorded calendar event. Unsupported questions receive a safe refusal instead of a guessed answer.

The provider endpoint, model, and webhook secret are environment variables so production credentials never enter source control. Provider/model details should be rechecked against current OpenAI documentation before a production rollout.

## Subscription feature flags

A school's `SubscriptionPlan.featureFlags` controls access to premium Phase 2/3 modules. A request to a gated route without the required flag receives a clear `403 FEATURE_NOT_INCLUDED` response. The guard wraps the existing module routes; it does not rebuild them.

The Phase 4 migration preserves existing Foundation installations by populating the previously empty Foundation feature list with the Phase 2/3 premium flags and adds Growth and Enterprise presets for controlled platform assignment.

## Multi-branch model

`SchoolGroup` and `SchoolGroupMembership` are an ownership/reporting layer rather than a shared tenant. A group Owner can see a consolidated branch summary, but students, staff, invoices, scores, attendance, and other branch records remain inside their own school tenant and RLS context. Ordinary staff do not gain cross-branch access.

## At-risk analytics

The risk scanner runs as a scheduled worker (`npm run worker:risk`) with a configurable interval. It evaluates recent attendance, recent-vs-prior score averages, and unpaid invoice balances, then writes informational `StudentRiskFlag` rows. Risk flags never automatically message guardians or modify grades.

## Emergency broadcast

Emergency broadcast uses the existing SukuuNova notification/message queue. The first request only prepares a short-lived confirmation token and displays the recipient count. No message is queued during preparation. Only a second confirmed request with an unexpired token and `broadcast:emergency_send` permission queues the guardian/staff alert and writes a school audit entry.

## Verification

Phase 4 tests cover:

1. feature-flag enforcement blocking a school without a required premium flag;
2. separation of `schools:impersonate` from broader school management permission;
3. Owner-only cross-branch aggregation policy;
4. WhatsApp refusal outside the predefined intent set;
5. `AiDraft` remaining ineffective until explicit acceptance;
6. emergency broadcast requiring the explicit confirmation step.

The existing Phase 0-3 invariant suite remains part of the same `npm run test` command. The final Phase 4 verification run passed migrations, all 35 tests, and the production build.

## Environment and Railway preparation

Phase 4 does **not** deploy to Railway. Railway remains a separate, explicitly authorized step after the final cross-phase acceptance review.

Phase 4 environment variables are documented in `.env.example`:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_RESPONSES_URL`
- `WHATSAPP_WEBHOOK_SECRET`
- `RISK_SCAN_INTERVAL_MS`

Continue using Railway variables/secrets only for production credentials. Keep the PostgreSQL runtime role `NOSUPERUSER` and `NOBYPASSRLS`, apply migrations before exercising new routes, and perform acceptance testing against a disposable migrated non-superuser database before any production cutover.

## Scope boundary

Phase 4 deliberately does **not** include automated subscription dunning/retry logic, cross-branch data merging, autonomous AI writes/approvals/messages, an open-ended database chatbot, new hardware integrations, new payment gateways, or modules outside the Phase 0-4 scope.

## Branches

- **phase-0-foundation** — verified security/data foundation
- **phase-1-mvp** — verified Phase 1 school operations
- **phase-2-differentiators** — verified Phase 2 implementation
- **phase-3-operations** — completed Phase 3 implementation branch
- **main** — current integrated product state through Phase 4
- **phase-4-platform-ai** — original Phase 4 working branch
- **phase-4-final-ready** — completed Phase 4 verification branch

Railway deployment remains a separate, explicit action.
