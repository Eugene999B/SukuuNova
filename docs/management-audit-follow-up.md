# School management audit follow-up — 30 September 2026

This records implementation and verification separately. It is not an unrestricted launch certificate.

## Implemented
- Offline marks retain the original server version and use school/user/assessment storage keys. The active weekly markbook presents recovered conflicts for an explicit choice. Server writes require the expected version.
- Selected-term rosters now drive the inspected gradebook, academic performance and fee publication paths. Published fees can explicitly include newly enrolled learners without rewriting existing charges.
- Reporting-policy saves reject overlapping boundaries and uncovered hundredths. Setup explains pooled CA/examination points instead of displaying misleading individual weights.
- Report attendance includes calendar-day overrides, closures and make-up days. Frozen attendance is reused where present; legacy records use the approval date rather than today's date when a fallback is necessary.
- Report previews label drafts, use two decimal places, and scale the A4 preview to mobile width. Approved and sent reports retain official status.
- Report generation no longer embeds PDF fonts within the database write transaction.
- Partial class print packs show failures and require an explicit print action for available reports.
- Font bytes and approved PDF output are cached with bounded memory. PDF output keys include the complete document and signatures; authorization still runs before rendering or cache lookup.
- Finance history has server-side pagination and database date filtering. Dashboard expense totals are aggregated independently of the display limit.
- Period exports show payments, payment reversals, recorded expenses and expense reversals on their own dates. Recorded expenses are explicitly distinguished from confirmed cash payments.
- Expense and payment-reversal requests use operation IDs, database serialization and payload checks. Retrying one intent does not create another entry; a separate legitimate intent can use the same amount and reason.
- Viewing identity cards is read-only. First issuance is explicit, revoked cards are not silently replaced, and validity changes apply to new cards. Staff eligibility is checked for issuance/reissue/verification.
- Staff-only queries exclude family-only accounts while supporting older staff roles without role keys and people with both staff and family roles.
- Downloads show permitted datasets and allow explicit student-class filtering.
- Platform active-school counts use the actual active status. Readiness checks include active staff and complete teaching coverage.
- Platform inspection concurrency and storage-estimate caching are bounded. Idle notification polling and crash restart use backoff.
- Health requests have a three-second response bound and share a pending database probe to avoid piling up probes.
- CI adds an encrypted backup/restore drill into a separate test database, compares core record counts and masks generated secrets.

## Verification
Each main commit passes the existing GitHub release gate before Railway can release it. The gate includes type checking, linting, unit/integration tests, pilot journeys, an isolated Eugene fixture, repeated academic demonstration completion, a clean-state rehearsal, production build and browser smoke.
Consult the exact commit's Actions result; a pending run is not a pass.

## Still open — engineering
- Unify the two report renderers' full visual layout and supported image formats; retain permission checks and safe asset loading.
- Share class-wide result/ranking calculations across bulk report preparation and implement durable resumable document jobs.
- Persist versioned approved artifacts if long-lived storage is required; the current cache is bounded and process-local.
- Review older frozen reports missing attendance denominators. They still need an explicit audited backfill policy; do not silently rewrite approved records.
- Add server-side ID-card pagination and purpose-specific finance loading; large ID print packs currently merge PDFs in the browser.
- Remove remaining legacy navigation/terminology and curate Eugene's parallel class structures and mismatched demonstration assessments without deleting historical results.
- Inventory advertised plan quotas and implement the exact agreed numerical limits. Feature gates alone do not establish storage/student/staff quotas.
- Verify effective-dated payroll changes, proration, arrears and current Ghana statutory calculations with authoritative rules and representative fixtures.
- Review configurable teaching weeks, school timezone and mid-term enrolment treatment consistently across attendance views.

## Still open — operational evidence
- Production backup schedules, retention and an isolated restore of an actual production backup. CI recovery tests do not certify Railway backup configuration.
- Separate live teacher, guardian, bursar and restricted-platform sessions for cross-role and cross-school end-to-end checks.
- Isolated concurrency/load tests, post-release memory measurements and Ghana-to-region latency.
- Bulk messaging throughput, delivery reconciliation and provider-outage recovery. One earlier authorized SMS was received; no additional messages were sent during this fix pass.
- A connected biometric device and real printed ID-card duplex/alignment checks.
- Staging configuration and notification-worker liveness monitoring.

The Railway browser session was signed out during this pass. Connector deployment access remains available, but the exposed tools do not provide production backup management or remote SQL execution. No local repository checkout was used.
