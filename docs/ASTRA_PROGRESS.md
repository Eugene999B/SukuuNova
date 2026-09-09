# Astra progress

- Current main before this batch: 04579a9fc5facc7dc1b4c7d00f6a99f1f68e3186; containing commit is the new checkpoint.
- Completed tranche: safe default synchronization, validated by full Build verification 34296172908 (144 tests, migrations, typecheck, lint, production build passed). Initial nested-write failure corrected in 97a081f.
- Current subsystem: onboarding and RBAC.
- This batch: Administrator and broad Principal defaults for newly created roles; existing role configurations preserved; readable permission catalogue; access UI shows role/direct/effective rights; temporary password replacement; account responses omit password hashes; clearing denials requires grant authority; shared role/override services protect Owner and prevent permission escalation; staff creation preserves existing role permissions and checks grant authority; onboarding uses canonical role keys.
- Tests added: default-rbac-sync, school-access-security, leadership-governance. API tests cover response fields, temporary passwords, denial clearing and rollback; governance tests cover Owner protections, escalation and preserved staff roles.
- CI: RBAC c8c33b4 passed 34296582641; onboarding e6c6696 passed full Build verification 34296903391. Governance 04579a9 passed full Build verification 34297209740. Academic authoring batch awaits verification.
- Migrations: none. No existing school permission sets are automatically broadened.
- Architecture: access route and staff action are production account paths; school-services also exposes reusable role mutations. Both onboarding services consume shared defaults. Main now reuses the earlier branch's permission catalogue, without its unsafe role synchronization.
- Onboarding batch: optional Principal/Administrator accounts, generated temporary credentials, shared API/service validation, one-time handoff, School 360 link and setup checklist; deduplicated default grants; duplicate login-code handling preserves existing directory records under RLS.
- Added tests: platform-onboarding.test.ts validates full provisioning, temporary passwords, audits without credentials, duplicate retries, timezone/rate/email validation and super-admin authorization.
- Governance batch: lock school access changes before authorization checks; prevent removal/suspension of the last active Owner in account API and shared services; test simultaneous owner removals. Shared Zod failures now return actionable HTTP 400 responses without submitted credentials.
- Tests added: owner-continuity.test.ts and validation-response.test.ts.
- Academic batch: edit/resubmit lesson drafts and returned plans; complete own approved lessons; edit/publish homework drafts; validate author, current teaching assignment, term lock and optimistic timestamp; preserve reviewed/published content; cancelled review prompts no longer submit changes. Blank optional terms are omitted by the form.
- Tests added: academic-authoring.test.ts (revision resubmission, stale edits, author/tenant boundaries, locked terms, approved content, completion, homework publication).
- Known unresolved: full assignment question/submission/auto-marking engine;  safe explicit permission upgrades for existing schools; other mutation paths require continued security review; remaining mission priorities not certified.
- Next 5: inspect academic CI; add explicit safe existing-role upgrade workflow; build connected assignment submissions and objective marking; connect guardian multi-child workflows; review academic calculation/history consistency.
- Special care: authorization.ts, role-builder-service.ts, school-services.ts, API school/access, staff/actions.ts, onboarding services and historical migrations.
- Concurrency: main and affected blobs reread before batch; use fast-forward-only ref update. No local repository checkout or local test execution.
