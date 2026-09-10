# SukuuNova pilot launch readiness

Current engineering branch: `feat/novacore-transport-intelligence`.

This document separates **implemented**, **CI-certified**, and **live-environment certified** capabilities. A feature is not promised to a pilot school merely because code exists.

## Pilot positioning principle

SukuuNova should launch the pilot around a dependable connected-school core. Every feature demonstrated to a pilot school should satisfy:

1. the intended user workflow exists end to end;
2. permissions and tenant boundaries are enforced server-side;
3. automated regression/production build gates pass;
4. external providers, devices, backup recovery, or other environment-dependent behavior has been exercised on the actual deployment where applicable.

## Current launch-hardening status

### Implemented and CI-certified on the NovaCore branch

- School leadership/admin workspace, teacher workspace and Family Portal / linked-learner experience.
- Attendance, academic setup, timetable, lesson planning/review, homework, gradebook and report-card workflows.
- Fees/finance foundations, invoices/payments/reversals and payroll foundations.
- Digital/physical Library and protected Resource Hub.
- Learning Arcade, including deterministic NovaCore physics for the Force & Motion Lab.
- NovaCore algorithm registry, decision evidence, transport intelligence and timetable shadow optimization.
- Electronic handwritten signatures with vector evidence, PNG/vector SHA-256 integrity and report-card HMAC binding.
- **Pilot Data Import Center:** strict CSV parsing, deterministic column mapping, row validation, duplicate detection, tenant-RLS staging, downloadable validation report and transactional rollback-safe apply for classes, subjects, learners and guardians.
- **Go-Live Readiness / onboarding:** weighted live-data readiness score plus six-phase guided setup path.
- **Leadership Action Center:** deterministic cross-module exception queue with direct fix links.
- **Pilot Feedback & Support Center:** structured problem/suggestion, module, severity, diagnostic context, attachment link, tenant isolation, threaded replies and Platform Support provenance.
- **Encrypted backup/restore tooling:** PostgreSQL custom-format backup, AES-256-GCM encryption, SHA-256 manifest and isolated restore-verification command with production-target safeguards.

### Implemented but intentionally limited / staging-only

- Staff import can stage and validate, but bulk account creation is not enabled until role-assignment authorization and one-time credential handoff are certified.
- Opening fee balances can stage and validate, but posting is not enabled until a dedicated finance-ledger-safe writer is certified.
- XLSX import is not yet enabled; CSV is the certified parser path.
- Timetable NovaCore optimizer remains preview/shadow only; the existing safe timetable writer remains authoritative.
- ETA remains shadow/certification-driven and cannot auto-promote itself to production.

### Requires live-environment certification before broad promise

- Real SMS provider credentials/sender ID and delivery/failure cycle.
- WhatsApp sender/business approval, approved templates, webhook verification and real delivery statuses where WhatsApp is offered.
- Real FMC130 tracker/network installation and trip alert timing at the pilot school.
- Any biometric hardware model/gateway on the actual school network.
- Actual encrypted backup creation, off-host retention and successful restore drill using the deployment environment.
- Production cron/secrets and operational monitoring.

## Family Portal / learner experience

SukuuNova does **not** need a separate unrelated Student Portal for the pilot. The intended product model is the Family Portal with linked children plus the learner-facing experience/mode inside that family boundary. Pilot wording should therefore describe secure family/learner access rather than promise a second standalone student product that duplicates the same data.

The critical requirement is identity separation: learner-facing functions must not expose parent-only finance/private communication or another sibling's private data.

## Transport — controlled beta

Transport now has a significantly deeper implementation foundation:

- Teltonika Codec 8 Extended gateway and tracker provisioning;
- evidence-driven FMC130 certification state;
- raw GPS preservation plus separately normalized positions;
- GPS validation/smoothing;
- direction-specific route geometry;
- state-aware route matching and deviation detection;
- child-specific geofence progression and ETA;
- guardian pickup-point request/approval workflow;
- transport alert outbox through SukuuNova messaging;
- persistent incidents and trip replay evidence;
- ETA shadow prediction-versus-arrival scoring and human-only promotion gate.

Before broadly promising bus-approaching/arrival alerts, certify one real FMC130, SIM/network, route, pickup points, stale-location behavior and guardian notification timing in the pilot environment.

## Communications

In-app messaging and prepaid SMS architecture are implemented. Arkesel is the default SMS adapter with other provider abstractions available in the messaging layer. Production claims still depend on real provider credentials and a live delivery/failure/retry exercise.

WhatsApp remains conditional on the school's approved sender/template/provider configuration and real webhook/delivery certification.

## Backup and recovery

Application-side backup/recovery tooling now exists and is CI-certified:

- `npm run db:backup`
- `npm run db:restore:verify`
- `docs/BACKUP_RESTORE_RUNBOOK.md`

This does **not** mean production recovery is proven yet. Before pilot launch, an authorized operator must create a real encrypted backup, move it to durable off-host storage, restore it into a separate drill database, record the verification evidence and confirm the infrastructure retention/incident procedure.

## Data Import Center

The former bulk-migration blocker is substantially closed for the most important onboarding data:

- classes;
- subjects;
- learners;
- guardians.

Those four data families have staged validation plus atomic production apply with revalidation, idempotency and rollback tests. Staff, opening balances and XLSX remain deliberately limited as described above.

## Pilot Feedback & Support Center

The in-product pilot support workflow is implemented and CI-certified. It feeds the same tenant-scoped support records used by Platform Support. It captures kind, module, severity, approved diagnostic context, optional safe attachment URL, status and complete message history. Platform replies are distinguishable from school-user replies.

Direct binary screenshot upload is not yet part of this workflow; screenshots can use a certified HTTPS/same-site file URL once the deployment's file-storage path is available.

## Leadership Action Center

The School Analytics leadership view now prioritizes explainable exceptions instead of only dashboard totals. Current evidence includes attendance gaps/absence, report-card gaps, outstanding fees, communication failures, submitted lesson plans, guardian-link quality, library overdue items, timetable collision signals and other available operational exceptions.

## Remaining launch work

### P0 — final pilot blockers

1. **Production certification ledger + automated smoke journeys** for Platform Owner, School Leadership, Teacher and Family/learner flows.
2. **Live provider certification:** real SMS send/delivery/failure handling; WhatsApp only where configured/approved.
3. **Real backup/restore drill:** encrypted backup, off-host retention and isolated restore verification.
4. **Production secrets/jobs review:** provider secrets, cron/worker jobs and monitoring.
5. **Cross-tenant/IDOR/RLS production-schema smoke checks.**
6. **Pilot scope sign-off:** explicitly mark Transport/biometrics/WhatsApp as controlled until their school-specific hardware/provider tests pass.

### P1 — useful expansion after the core launch gate

7. XLSX adapter using the existing import staging contract.
8. Certified staff import with secure one-time credential handoff and role authorization.
9. Finance-safe opening-balance writer with explicit ledger semantics and audit/reconciliation.
10. Direct support screenshot upload through the deployment's certified file-storage service.
11. Deeper notification preference/receipt controls for guardians and leadership.

### P2 — commercial expansion after pilot stability

12. Online/MoMo fee payments with idempotent webhooks and reconciliation.
13. Deeper canteen/feeding inventory and meal entitlement.
14. Broader certified device catalogue and installation tooling.
15. Historical results/payroll/other legacy import families.
16. General PWA/offline experience only where a workflow genuinely requires it.
17. Advanced longitudinal/cross-school leadership trends while preserving tenant privacy.

## Recommended first-school rollout

- **Week 0:** Go-Live readiness, import people/classes/subjects, roles, branding, communication provider, baseline encrypted backup and restore drill.
- **Week 1:** attendance, staff/teacher access, guardian linking, fees visibility, in-app messaging/SMS and Support Center.
- **Week 2:** timetable, lesson planning, homework/academic work and gradebook.
- **Week 3:** report cards, Library/Resources and Learning Arcade.
- **Week 4+:** Transport/feeding/biometrics only if the school needs them and the relevant hardware/data source has passed certification.

## Definition of pilot-ready

SukuuNova should be called pilot-ready only when:

- Platform Owner, School Leadership, Teacher and Family/learner journeys are certified against the live deployment;
- one academic cycle is rehearsed from setup through assignment/grade/report release;
- one finance cycle is rehearsed through invoice/payment/reversal/guardian balance;
- one communication cycle is rehearsed through in-app + real SMS delivery/failure handling;
- cross-tenant/IDOR/RLS checks are repeated against the production schema;
- a real backup and isolated restore drill is proven;
- provider secrets and required workers/cron jobs are configured;
- the pilot team can raise/track incidents through the Support Center;
- controlled-beta capabilities can be disabled without disrupting the school core.

## Immediate engineering order

1. Build the production certification ledger and automated smoke-journey suite.
2. Certify report-card communications/provider readiness against the current messaging layer.
3. Add final provider/device/backup evidence into the certification gate.
4. Run whole-system production certification and update the pilot letter to exactly match the certified scope.
5. Only then expand staff/finance/XLSX import and post-pilot commercial modules.
