# Platform Control Center Redesign

## Product direction
The platform console is being rebuilt as an operational control plane rather than a collection of dashboard cards. Every page should answer four questions: what is happening, what needs attention, what can I safely do, and how is the action audited?

## Navigation model
1. Control Center — network health, attention queue, commercial exposure and recent control activity.
2. Schools — searchable directory, filters, health/attention state, and direct School 360 workflow.
3. Plans & Entitlements — real plans, feature flags, pricing, rollout state and assignment history.
4. Platform Billing — invoice/payment ledger, arrears, reconciliation, school commercial history.
5. Network Analytics — adoption, attendance, activity, retention/activation and anomaly detection.
6. Support — school cases, operator notes, evidence timeline, safe audited access.
7. Visitor Inbox — public leads and follow-up workflow.
8. Workers & Permissions — least-privilege platform roles and school scopes.
9. Audit Log — searchable immutable control-plane activity, with contextual filters.
10. System Health — database/API/application signals, latency, recent failures and incident workflow.
11. Platform Settings — network defaults, public presence, access/security and operational policies.

## Core workflow rules
- Prefer tables and searchable lists for records; cards are for summaries.
- Keep destructive actions behind explicit confirmation and show affected scope before execution.
- Every privileged mutation gets a platform audit record.
- Every school inspection resolves school scope before tenant-owned reads/writes.
- Support impersonation is always time-limited, reason-gated and visibly marked.
- Detail pages provide a consistent action rail: Inspect, Support, Billing, Access, Audit.
- Empty states explain what is missing and provide the next valid action.
- Loading, error and permission states must be first-class UI states, not blank pages.

## Explainable school attention algorithm
School attention is a bounded 0–100 score used for triage, not an access decision.

Signals currently used:
- Suspended/non-active school: +55.
- Unpaid invoice ratio: up to +30.
- Active students with zero user accounts: +14.
- Active students with zero classes: +12.
- Active students with zero attendance events for the current day: +18.

The score is deliberately explainable. Future iterations should replace static weights with a calibrated model backed by historical support outcomes while preserving reason codes for every score.

## New platform capabilities planned
- Saved school searches and operator views.
- School health timeline with change detection.
- Billing reconciliation and ageing buckets.
- Activation/readiness score for newly onboarded schools.
- Permission review and access-expiry workflow.
- Audit diff viewer for sensitive changes.
- Incident mode that groups affected schools/endpoints into an operational timeline.
- Network anomaly detection for sudden attendance, login, billing or usage changes.
- Exportable operational reports with permission-aware filtering.

## Implementation order
1. Control Center + shared navigation foundation.
2. Schools + School 360 data correctness and UX.
3. Search + support workflow.
4. Billing + plans/entitlements.
5. Workers/scopes + audit.
6. Analytics + anomaly detection.
7. Health + incident workflow.
8. Settings + duplicate/legacy route cleanup.

## Quality bar
Each page must pass typecheck, lint, production build, permission checks, tenant isolation checks and a browser smoke test before being marked complete.
