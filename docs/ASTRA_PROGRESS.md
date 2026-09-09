# Astra progress

- Current main SHA before this checkpoint: dcbe99662246339fd3298cc4861f97ed69d376f1. The containing commit is the new checkpoint.
- Completed systems: none certified end to end in this session.
- Current subsystem: onboarding/RBAC, starting with safe default-role synchronization.
- Change: preserve existing role identity and rights; create baseline grants only with a missing role. Prevent custom Owner-name promotion and restoration of intentionally removed permissions.
- Architecture: role-builder reads and mutations call syncDefaultRbac; authorization recognizes owner keys. School provisioning has legacy and platform-atomic services. Administrator exists in authorization keys but is absent from main defaults.
- Branch inspection: feat/school-onboarding-rbac-v3 includes leadership defaults and a permission catalogue; its role sync retains the same unsafe promotion behavior, so do not merge blindly.
- Tests added: tests/default-rbac-sync.test.ts covers custom Owner collision, retained system-role restrictions/direct denials, and repeatable missing-role creation.
- CI: baseline Build verification 34293783078 passed. This checkpoint requires its own full Build verification; not yet validated.
- Database migrations added: none.
- Unresolved: complete onboarding, safe explicit upgrades for existing roles, owner-account mutation protection review, permission UX, remaining mission systems.
- Next 5 actions: inspect checkpoint CI; finish Owner governance across account mutations; add Administrator/leadership provisioning; integrate permission catalogue and effective-rights UI; complete optional leadership accounts and onboarding checklist.
- Special care: src/lib/authorization.ts, src/lib/role-builder-service.ts, both onboarding services, existing migrations.
- Concurrency: main and affected file blobs rechecked before commit; no local checkout, force push or historical migration edits.
