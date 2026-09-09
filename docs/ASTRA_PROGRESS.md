# Astra progress

- Current main before this batch: c8c33b4fe5fc77e1be3c2f968f23b55f9b8c86d6; containing commit is the new checkpoint.
- Completed tranche: safe default synchronization, validated by full Build verification 34296172908 (144 tests, migrations, typecheck, lint, production build passed). Initial nested-write failure corrected in 97a081f.
- Current subsystem: onboarding and RBAC.
- This batch: Administrator and broad Principal defaults for newly created roles; existing role configurations preserved; readable permission catalogue; access UI shows role/direct/effective rights; temporary password replacement; account responses omit password hashes; clearing denials requires grant authority; shared role/override services protect Owner and prevent permission escalation; staff creation preserves existing role permissions and checks grant authority; onboarding uses canonical role keys.
- Tests added: default-rbac-sync, school-access-security, leadership-governance. API tests cover response fields, temporary passwords, denial clearing and rollback; governance tests cover Owner protections, escalation and preserved staff roles.
- CI: RBAC batch c8c33b4 passed full Build verification 34296582641. This onboarding batch awaits full verification.
- Migrations: none. No existing school permission sets are automatically broadened.
- Architecture: access route and staff action are production account paths; school-services also exposes reusable role mutations. Both onboarding services consume shared defaults. Main now reuses the earlier branch's permission catalogue, without its unsafe role synchronization.
- Onboarding batch: optional Principal/Administrator accounts, generated temporary credentials, shared API/service validation, one-time handoff, School 360 link and setup checklist; deduplicated default grants; duplicate login-code handling preserves existing directory records under RLS.
- Added tests: platform-onboarding.test.ts validates full provisioning, temporary passwords, audits without credentials, duplicate retries, timezone/rate/email validation and super-admin authorization.
- Known unresolved: safe explicit permission upgrades for existing schools; further account/governance concurrency review; remaining mission priorities not certified.
- Next 5: inspect onboarding CI; review role mutation concurrency and last-Owner protection; add explicit safe existing-role upgrade workflow; inspect assignment/academic connectivity; connect guardian multi-child workflows.
- Special care: authorization.ts, role-builder-service.ts, school-services.ts, API school/access, staff/actions.ts, onboarding services and historical migrations.
- Concurrency: main and affected blobs reread before batch; use fast-forward-only ref update. No local repository checkout or local test execution.
