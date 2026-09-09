# SukuuNova pilot launch readiness

Current production branch checkpoint reviewed: `5536f33aca60c67880f925a286c84fcd7c746f7f`.

The purpose of this document is to separate features that are technically present from features that are safe to promise and demonstrate during a real-school pilot.

## Pilot positioning principle

SukuuNova should launch the pilot around a dependable connected-school core, not around the largest possible feature list. Every feature shown to a pilot school must satisfy three conditions:

1. the workflow exists end to end for the intended user,
2. permissions/tenant boundaries are enforced server-side,
3. the production journey has been exercised on the deployment environment.

A feature may remain in the product but be hidden from the pilot if it has not passed those conditions.

## Tier A — pilot-safe core to certify and actively demonstrate

These areas have strong implementation foundations and regression coverage. They should form the pilot's primary value proposition after live-browser certification:

- School leadership/admin workspace, role-based access and school isolation.
- Teacher workspace and assignment-scoped academic workflows.
- Guardian multi-child portal with child-specific attendance, released results, fees, messages, academic work and learning context.
- Student/staff attendance, attendance exceptions and QR/device-ready attendance paths.
- Timetable setup/generation and teacher timetable visibility.
- Structured lesson planning, submission, review, revision, approval, completion and archive history.
- Teacher academic work, homework bridge, learner submissions, objective auto-grading, written review and attempt policies.
- Gradebook and report-card workflow, report themes, publication and protected guardian access.
- Fees/finance records, invoices, payments, receipts, arrears, reversals and payroll foundations.
- Digital/physical Library and Student Resource Hub with protected in-app reading, school-controlled download permission, favourites, bookmarks, progress, recommendations, reservations and copy/accession controls.
- Learning Universe / Arcade: 64 runtime-ready educational games across age/standard bands, difficulty 1–5, school controls, XP/stars/streaks and scoped leaderboards.
- In-app messaging plus prepaid SMS commercial control. Arkesel is the default adapter; Sailup, Hubtel and a generic gateway are switchable. Platform SMS inventory is allocated/sold to school wallets and usage is metered by billable segment.
- Recruitment, approved pickup, visitors, assets/inventory and identity-card foundations where the school needs them.
- Role-aware dashboards and audit history.

## Tier B — controlled beta during pilot

These modules have meaningful foundations but should be enabled only for a school that needs them and after a school-specific live journey is certified:

### Transport

Existing foundations include vehicles, routes, stops, route assignments, latest vehicle locations, boarding events, parent location context and compliance reminders. Before broadly promising "bus approaching / arrival alerts", certify the real GPS/location source, route progression logic, guardian notification timing and stale-location handling in production.

### Feeding / canteen

Existing foundations include feeding budgets, menus, service logs, invoice items and planned-versus-actual cost reporting. A full canteen operating product should still add meal entitlement/attendance, stock consumption, supplier purchasing, daily portions, exceptions/allergies where appropriate, and optionally POS/cashless meal accounting.

### WhatsApp

Webhook and provider foundations exist, including Meta/Twilio-related environment support, but production credentials, templates, sender/business approval, webhook verification and real delivery status must be configured and exercised before promising automated WhatsApp delivery as universally available.

### Biometrics / devices

QR, face/fingerprint/card pathways and device models exist, but every physical device model/gateway used in a pilot must be certified on the actual school network before being included in the pilot commitment.

## Tier C — do not promise as finished yet

### Dedicated Student Portal

SukuuNova currently defines a `student` role key, but the current school authorization resolver exposes only `school` and `teacher` workspaces. Learner experiences are presently strongest through guardian-linked learner flows. Before the pilot letter promises a true Student Portal, either build a dedicated student authentication/workspace or change the pilot wording to "student learning access through the configured learner/guardian experience".

### Online fee collection / Mobile Money

The finance system records school payments and balances, but a production-grade online payment gateway / MoMo self-payment journey is not currently part of the verified core. This should be treated as a future commercial add-on unless completed and reconciled before pilot.

### General-purpose PWA / installable offline app

SukuuNova has selected offline synchronization workflows, but there is no verified general installable PWA/service-worker experience for the entire application. Do not market the whole system as fully offline-capable.

### Bulk migration/import center

A pilot school needs a fast way to onboard existing student, guardian, staff, class, subject, opening-balance and possibly historical-result data. A dedicated CSV/Excel import, validation, preview, error-report and rollback workflow should be built before scaling beyond a very small manually configured pilot.

### Backup/restore and disaster-recovery operator workflow

Production deployment documentation exists, but the pilot launch needs a tested backup schedule, restore drill, retention policy and recovery runbook. This is an operational requirement even if it is not a school-facing feature.

### Pilot feedback/support center

The pilot letter promises support and asks schools to report difficulties. Add an in-product feedback/support workflow that captures school, user, module, severity, screenshot/attachment, status, owner and resolution history. This should feed the platform-owner support desk.

## Built features that are under-described in the current pilot letter

The pilot letter should be revised before distribution because several major differentiators are compressed into one or two lines:

- **Learning Arcade:** explicitly state 64 educational games, subject categories, age/standard bands, adaptive difficulty, progress/rewards and school-scoped rankings.
- **Digital Library:** explain protected in-app Reading Mode and that each school decides whether a resource can be downloaded.
- **SMS:** explain prepaid school SMS wallets and controlled school messaging rather than simply saying SMS exists.
- **Lesson review:** describe teacher submission, leadership comments, return-for-correction and resubmission history.
- **Guardian multi-child:** note that one guardian can securely switch between linked children without mixing records.
- **Academic attempts:** retry limits/highest/latest grading policy can be a useful teacher/assessment differentiator.
- **Audit/RBAC/data isolation:** this is important for school management confidence and should appear as a trust/safety line.

The current Arcade sentence in the letter should not remain merely "Learning Arcade gives level-based practice games" because that materially understates the implemented product.

## Pilot letter claims that require wording care

- "Student Portal" — currently the most important claim to fix or build before launch.
- "WhatsApp delivery" — phrase as available when the school's WhatsApp channel is configured and approved until production credentials/templates are certified.
- "Bus approaching/arrival alerts" — keep as a controlled transport pilot capability until real GPS/notification timing is certified.
- Digital Library "read or download" — revise to say learners read in SukuuNova and downloads are available only when the school has enabled download for that resource.

## Recommended missing additions before first pilot school

### P0 — launch blockers / high leverage

1. Dedicated Student Portal and student login/learner identity boundary.
2. Pilot Data Import Center with CSV/XLSX templates, preview, validation, duplicate detection and rollback-safe import.
3. Production certification checklist and automated smoke journeys for Owner, Teacher, Guardian and Student.
4. Configure production providers/secrets: Arkesel credentials/sender ID, WhatsApp if offered, protected library storage hosts, and `RISK_SCAN_CRON_SECRET`.
5. Backup/restore drill plus pilot data-retention and incident-response runbook.
6. In-product Pilot Feedback / Support Center.

### P1 — make the pilot feel premium

7. Leadership Action Center: one cross-module exception queue for attendance, fees, academics, staff, library, communications and transport with evidence and direct fix links.
8. School onboarding wizard: school profile -> academic year/term -> classes/subjects -> staff -> students/guardians -> fee structures -> communication settings -> go-live readiness score.
9. Notification center with delivery receipts, failed-message retry visibility and low SMS-balance alerts for school leadership.
10. Parent/guardian preference controls for communication channels and important-notification categories.
11. School-branded public/guardian touchpoints: logo, colors, contact details and report/receipt consistency.
12. Data-quality dashboard: missing guardian links, invalid phone numbers, duplicate admissions, incomplete class assignment, missing subject teachers and unresolved setup blockers.

### P2 — commercial expansion after pilot stability

13. Online/MoMo fee payments with idempotent webhooks and reconciliation.
14. Deeper canteen/feeding inventory and meal-entitlement workflows.
15. Production GPS integration and route ETA/guardian alerts for Transport.
16. Full import/export center for historical results, payroll and other legacy datasets.
17. General PWA/offline experience only after deciding which workflows genuinely need offline support.
18. Advanced leadership trends/benchmarking across terms and schools while preserving tenant privacy.

## Pilot scope recommendation

For the first school, do not enable every module on day one. Recommended rollout:

- Week 0 setup: import people/classes/subjects/fees, roles, branding, communication provider, backup baseline.
- Week 1: attendance, staff/teacher access, guardian linking, fees visibility, in-app messaging/SMS.
- Week 2: timetable, lesson planning, homework/academic work, gradebook.
- Week 3: report cards, Library/Resources and Learning Arcade.
- Week 4+: enable transport/feeding/biometrics only if the school has the operational need and hardware/data sources.

This reduces training load and gives the pilot team a clean way to measure adoption and defects by workflow.

## Definition of pilot-ready

SukuuNova should be called pilot-ready only when:

- the four core user journeys (Platform Owner, School Leadership, Teacher, Guardian/Student) are certified in the live deployment;
- one complete academic cycle has been rehearsed from class setup through assignment/grade/report release;
- one complete finance cycle has been rehearsed from fee/invoice through payment/reversal/guardian balance;
- one complete communication cycle has been rehearsed through in-app + real SMS provider delivery and failure handling;
- cross-tenant/IDOR/RLS checks are repeated against the production schema;
- backup and restore are proven;
- provider secrets and cron jobs are configured;
- the pilot team has an incident/support workflow and knows how to disable a problematic feature without affecting the rest of the school.

## Immediate engineering order

1. Build the dedicated Student Portal.
2. Build the Pilot Data Import + Onboarding/Readiness Center.
3. Build Pilot Feedback/Support and leadership data-quality/exception surfaces.
4. Deepen operations where the first pilot school actually needs them: Finance -> Transport -> Feeding.
5. Finish Leadership Intelligence.
6. Run whole-system production certification and update the pilot letter to exactly match the certified scope.
