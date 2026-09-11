# SukuuNova System Integrity Audit — 11 September 2026

## Purpose

This audit treats SukuuNova as one school information system rather than a set of independent pages. The standard is not only that a screen loads, but that the same school fact has one authoritative meaning everywhere.

Core invariants under review:

- learner identity → intake → term enrolment → current class
- class → subject → eligible teacher → timetable → lesson → assessment → score → report card
- learner ↔ guardian ↔ family session ↔ finance/transport/communications
- fee definition → obligation/adjustment/scholarship → invoice → payment/reversal → receipt → analytics
- staff identity → role/permission → payroll/properties/visitors/devices
- face portrait → consent → face enrollment → device identity → attendance
- current academic year/term → all academic and reporting workflows
- school-demo data must obey the same invariants as production data

Severity guide:

- **Critical** — can expose the wrong account/data, create financially/academically misleading records, or break a safety fallback.
- **High** — can create contradictory records across modules or authorize the wrong school identity.
- **Medium** — creates confusing or inaccurate operational behavior without immediate record corruption.
- **Low** — UX/governance weakness that should be standardized.

---

## Confirmed findings

### INT-001 — Historical academic context is not anchored to term enrolment
**Severity: Critical**

`Student.classId` is mutable and is still used by report cards, ranking, some gradebook paths and finance. SukuuNova also has an `Enrollment` table with academic year/term/class, but it is not the canonical resolver for those modules.

**Impact**
- A promoted learner can make an older report card resolve against the new class.
- Historical ranking/cohort/teacher/class labels can change after promotion.
- Historical fee generation can use the learner's new class fee structure for an old term.

**Required invariant**
For a term-bound record, class/cohort must come from the learner's confirmed enrolment for that term (or from a frozen legacy snapshot), never from mutable `Student.classId`.

### INT-002 — Report cards render/recalculate from the learner's current class
**Severity: Critical**

`report-card-service` resolves assessments, class teacher, ranking scope and displayed class from the learner's current `Student.classId`. Approval stores class fields in the snapshot, but the main calculator does not consistently consume those frozen identity fields.

**Impact**
Promotion can make an already-issued report appear to belong to the next class and can change historical calculations.

**Required repair**
Introduce a canonical report academic-context resolver and make issued reports entirely snapshot-driven for class/cohort identity and calculated presentation.

### INT-003 — Promotion mutates current class without creating future enrolment
**Severity: Critical**

Automatic approved-report promotion directly updates `Student.classId`. It does not create or schedule the learner's next-term/year enrolment.

**Impact**
The mutation that should represent future progression immediately changes the source used by historical academics and finance.

**Required repair**
Promotion must produce/schedule the next academic enrolment and only advance the current class when that enrolment becomes effective.

### INT-004 — Enrolment workflow changes live class too early
**Severity: Critical**

Creating an enrolment in `ready` state can update `Student.classId` before confirmation. Enquiry conversion creates an active learner/class immediately and then creates a `ready` enrolment even while document/fee readiness is incomplete.

**Impact**
Draft/readiness workflows can silently alter the operational learner roster before the school has confirmed enrolment.

**Required repair**
Only a confirmed/effective enrolment may change the operational current-class projection. Validate start date against the selected term and define withdrawal/cancellation effects explicitly.

### INT-005 — Student creation has multiple non-equivalent write paths
**Severity: High**

The modern Students workflow creates `StudentAcademicIntake` and uses live face capture. Legacy `sis-service.registerStudent`, exposed through `/api/mvp/setup`, creates Student/Guardian records without the same intake/enrolment/portrait rules. Admissions conversion is a third implementation.

**Impact**
Learners created through different screens can have materially different required records.

**Required repair**
One canonical learner-onboarding service; legacy APIs must delegate to it or be retired.

### INT-006 — Finance invoice class is current class, not term class
**Severity: Critical**

Invoice generation selects fee items using the learner's current `Student.classId`. Historical invoice filtering also displays current class.

**Impact**
After promotion, generating/reviewing an old-term invoice can apply or display the wrong class fee structure.

**Required repair**
Fee obligations/invoices must carry term-specific enrolment/class context and immutable line snapshots.

### INT-007 — Finance has two disconnected adjustment concepts and no canonical obligation ledger
**Severity: Critical**

The main finance model is `FeeItem → Invoice → Payment/Reversal`. A separate `P3FinanceAdjustment` workflow already models approved amount/percentage waivers/scholarships/sibling adjustments, but the main invoice ledger does not coherently consume it.

**Impact**
A dashboard can say there are pending/approved adjustments while the student's official invoice/balance ignores them. The current model cannot safely represent the requested class/group/individual obligations and scholarship funding rules.

**Required repair**
Consolidate into one canonical obligation model: fee definition → assignment → learner obligation → approved adjustment/scholarship → invoice snapshot → payment allocation/reversal.

### INT-008 — Leadership analytics ignores payment reversals
**Severity: Critical**

School Analytics calculates paid amount by summing payments and does not subtract payment reversals, while the finance ledger does.

**Impact**
Leadership can see a smaller debt than the official ledger after a reversed payment.

**Required repair**
All dashboards/reports must call one finance balance calculator or persisted ledger projection.

### INT-009 — Analytics chooses latest term, not unambiguous active term
**Severity: High**

Several analytics paths use newest `startDate` rather than the school's timezone-aware active academic context. Some attendance logic also hardcodes Ghana-date behavior instead of the configured school timezone.

**Impact**
Future/pre-created terms can become “current” in dashboards; modules can disagree about which term today belongs to.

### INT-010 — Academic years can overlap; terms can overlap on an inclusive boundary
**Severity: Critical**

Academic-year creation has no overlap guard. Term creation uses strict overlap comparison while term lifecycle treats start/end dates as inclusive, so one term may end on the same date another begins and both are active that day.

**Impact**
There may be more than one valid current term/year. Newer code refuses ambiguity; older code silently chooses one.

**Required repair**
Enforce non-overlapping academic years and non-overlapping inclusive term ranges at service and database level; add repair diagnostics for existing data.

### INT-011 — Subjects page can assign non-teaching accounts as teachers
**Severity: Critical**

The Subjects page lists all active Users as teachers and its local assignment action checks only active status. The canonical setup service correctly validates a teaching role.

**Impact**
A Parent/Guardian account can be written as a class-subject teacher; later timetable/teacher-workspace code rejects the same account, leaving contradictory setup.

**Required repair**
All teacher assignment writers and pickers must use one shared teaching-account validator.

### INT-012 — Payroll can attach salary structures to non-staff accounts
**Severity: Critical**

Payroll lists active Users and validates only active status before saving salary structure.

**Impact**
A Parent/Guardian portal account can be treated as payroll staff and receive a payslip.

**Required repair**
Payroll must use the shared school-staff account boundary for both reads and writes.

### INT-013 — Device Identity labels non-staff Users as staff
**Severity: Critical**

The device identity API exposes active/pending Users as staff without role-boundary filtering and accepts those IDs for staff device mappings.

**Impact**
A family portal account can be mapped as a staff fingerprint/card identity.

### INT-014 — Attendance device path does not centrally validate target active/staff state
**Severity: Critical**

Authenticated device attendance can trust an existing device mapping without rechecking that the mapped learner is still active or that the mapped User remains an eligible staff account.

**Impact**
Stale mappings can record attendance for withdrawn learners, inactive accounts or misclassified family accounts.

**Required repair**
One central attendance target validator must run for manual, face and authenticated-device events.

### INT-015 — FaceMatchReview constraint rejects legitimate “unknown face” review
**Severity: Critical / Safety**

Face matching intentionally creates manual-review records when confidence is low or no enrollment matches. Database hardening currently requires exactly one candidate Student/Staff ID.

**Impact**
The safest no-match fallback can fail at the database constraint instead of reaching human review.

**Required repair**
Constraint must mean **at most one candidate**, allowing both candidate IDs to be null for unknown-face review.

### INT-016 — Guardian session revalidation does not re-check Guardian↔User ownership
**Severity: Critical / Privacy**

Guardian login validates `guardianId ↔ userId`, but subsequent session validation primarily rechecks the User/auth version. Some pages call the safer family-context resolver; other services trust the session guardian ID directly.

**Impact**
After a guardian profile is relinked, an old valid session may retain access through modules that do not independently verify the relationship.

**Required repair**
The relationship check belongs in central `requireGuardianSession`, then module-level linked-child checks remain defense in depth.

### INT-017 — Guardian identity can be structurally ambiguous
**Severity: High**

`Guardian.userId` is not unique per school and StudentGuardian does not enforce one primary guardian per learner.

**Impact**
One login may map to multiple guardian profiles, and multiple links may simultaneously claim to be primary. Notifications, consent and family defaults can become non-deterministic.

**Required decision/repair**
Define whether one account may intentionally represent several guardian personas. If not, enforce school/user uniqueness. Independently, enforce at most one primary guardian per learner and provide an atomic “make primary” action.

### INT-018 — Eugene Academy timetable fixture violates the real timetable invariant
**Severity: High**

The demo seed writes every class/day/period directly and rotates teacher assignments without checking teacher occupancy. The real timetable generator is clash-safe.

**Impact**
The flagship demo can contain impossible schedules and leadership analytics then reports hundreds of conflicts, making a healthy feature appear broken.

**Required repair**
Seed/generate Eugene Academy through the same collision invariant as a production school, and fail fixture verification on any class/teacher/venue collision.

### INT-019 — Timetable collision protection is stronger in services than in the database
**Severity: High**

Database uniqueness protects class/day/period but not teacher/day/period or configured room/day/period. Canonical services check those collisions, but legacy/direct writers and fixtures can bypass them.

**Required repair**
Retire bypass writers where possible; add invariant verification and consider database exclusion/unique structures compatible with nullable/venue semantics.

### INT-020 — Properties custody can point to family accounts
**Severity: High**

School Properties lists all active Users as custodians and accepts `custodianUserId` without validating staff identity.

**Impact**
A Parent/Guardian account can become custodian of school-owned property.

### INT-021 — Visitor host validation checks User, not staff identity
**Severity: High**

Visitor service and page verify host account exists/active but do not enforce school-staff classification.

**Impact**
A family portal account may be selected as a visitor's “host staff.”

### INT-022 — Staff classification is reimplemented in multiple modules
**Severity: High**

There is now a shared `isSchoolStaffAccount`, but calendar notifications, payroll, properties, visitors, devices and some dashboards still use independent role lists or “all active users.”

**Impact**
Custom roles and family-only accounts are classified differently by module.

**Required repair**
Expose database-level helper functions for arbitrary target User staff/teaching eligibility and use them everywhere.

### INT-023 — Attendance has two storage models, but event→record derivation is intentional
**Severity: Medium / monitor**

`AttendanceEvent` is the authoritative event stream and a database trigger derives period-aware `AttendanceRecord`. This is not inherently split-brain. The risk is readers using inconsistent dedup/status rules.

**Required repair**
Document which source serves event audit vs daily/period register, centralize summary calculation, and add reconciliation tests.

### INT-024 — Pickup two-person control is good, but active/status and duplicate-day semantics need tightening
**Severity: Medium/High**

Unscheduled pickup correctly requires a different approver. However pickup creation primarily validates existence, not clearly active learner state, and no central one-pickup-per-school-day state is evident.

**Required repair**
Define whether repeated pickup events in one school day are legitimate. If not, enforce current custody/day state; always reject inactive/withdrawn learners.

### INT-025 — Store transaction core is strong; discount/returns governance is incomplete
**Severity: Medium**

Stock is server-authoritative, locked, snapshotted and restored on void. Remaining gaps include unrestricted cashier discounts (within subtotal), free-text payment method/reference and no partial return/exchange workflow.

### INT-026 — Legacy operational systems remain beside replacements
**Severity: Medium/High**

Examples include legacy `P3Asset` beside School Properties, legacy setup/student APIs beside modern onboarding, old timetable writer beside NovaCore, and phase-3 finance adjustments beside the main finance workspace.

**Impact**
Even if hidden in navigation, callable legacy paths can create records that do not satisfy current rules.

**Required repair**
Maintain a deprecation register. Each legacy writer must delegate to the canonical service, become read-only, or be removed after migration.

---

## Cross-cutting design rules to enforce

1. **Tenant ownership is necessary but not sufficient.** Every foreign identity must also be the correct kind of account (staff, teacher, guardian, learner).
2. **Period-bound facts never read mutable current state.** Term/year records resolve through term enrolment or frozen snapshots.
3. **One business action, one service.** UI routes/APIs do not reimplement student creation, teacher assignment, finance calculations, staff classification, etc.
4. **Dashboards consume domain calculations.** They do not reproduce ledger/attendance/report-card arithmetic independently.
5. **Historical records are immutable in meaning.** Promotion, transfer or staff changes cannot rewrite old report/fee/timetable meaning.
6. **Demo fixtures obey production invariants.** Eugene Academy verification must reject impossible data rather than merely count that rows exist.
7. **Account universe is explicit.** School staff, teacher, guardian, student and platform identities never become interchangeable because all happen to be rows in `User`.
8. **Human-review fallbacks must be representable.** Safety models must allow “unknown/unmatched” states when the workflow requires them.

---

## Repair plan

### Release A — Core identity/safety/calendar integrity
Target this branch/PR first because these fixes do not require redesigning historical academic/finance storage:

- central Guardian↔User session revalidation
- FaceMatchReview at-most-one candidate constraint
- shared arbitrary-target staff/teacher validators
- fix Subjects teacher picker/write path
- fix Payroll staff picker/write path
- fix DeviceIdentity staff boundary and attendance active-target validation
- fix Properties custodian and Visitor host staff boundary
- prevent overlapping academic years and inclusive term overlaps
- fix leadership finance reversal arithmetic/current-term selection
- make Eugene Academy timetable fixture collision-free and verify zero collisions
- add integrity regression tests

### Release B — Enrolment/history integrity

- canonical `resolveStudentAcademicContext(studentId, termId)`
- normalize Admissions/Students/legacy setup onto one onboarding service
- only confirmed/effective enrolment changes current class
- report cards use/freeze term enrolment class and teacher/cohort
- gradebook historical roster uses term enrolment
- promotion creates future progression enrolment instead of immediately rewriting history
- backfill/diagnose legacy students where enrolment is absent

### Release C — Finance obligation/scholarship ledger

- consolidate `P3FinanceAdjustment` into the official finance domain rather than creating a third system
- fee definitions and explicit assignment scopes (school/level/class/group/learner)
- learner obligations with class/term snapshot
- scholarship programs and awards: fully funded / percentage / flat amount / selected fee types
- approved individual adjustments/waivers
- invoice generation from obligation snapshots
- payment allocation and reversal against obligations
- one canonical balance calculator used by Finance, Guardian portal, Analytics, exports and receipts
- migration/reconciliation report before switching production calculations

### Release D — UX and legacy cleanup

- retire/delegate legacy write APIs
- systematic route/page dark/light/responsive audit
- empty/error/loading states
- preserve sidebar/navigation context
- Eugene Academy fixture updated for every active module
- end-to-end school journeys across leadership/teacher/guardian/finance/operations

---

## Audit completion criteria

The audit is not complete merely when CI is green. Completion requires automated invariant checks that can run against Eugene Academy and a clean fixture, including:

- exactly one unambiguous current academic year/term (when school is in session)
- no class/teacher/configured-room timetable collision
- no family-only User referenced by staff-only foreign keys/workflows
- every active device identity points to an active valid target
- every term-bound report/invoice can resolve its historical academic context
- report-card/finance/attendance calculations agree between detail page, dashboard and export
- no stale guardian session can access a Guardian profile no longer owned by its User
- finance ledger reconciles invoices/adjustments/payments/reversals
- no issued historical report changes meaning after learner promotion
- Eugene Academy fails verification if any of the above invariants are violated
