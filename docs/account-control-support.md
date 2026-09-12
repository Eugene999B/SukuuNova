# Account login and support controls

SukuuNova school codes identify a school; they are not a shared login quota. School and guardian credential lockouts are scoped to the individual email/phone identity and only failed authentication attempts consume the login counter.

Successful login clears that account's failed-login state. Successful school/guardian password reset clears both school and guardian login locks for the account and revokes existing sessions through the user session epoch.

Platform operators with `security.manage` can use **Platform → Schools → Account Control** to inspect a school account and perform audited support actions: suspend/reactivate, force sign-out, require a password change, clear a failed-login lock, and issue password recovery instructions. The workspace exposes roles, guardian/staff portal identity, recovery-contact readiness and temporary login-lock state.

Arbitrary database deletion is intentionally not exposed as a generic support control. Destructive data changes must remain module-scoped so fees, grades, attendance, linked guardians, audit history and other relational records cannot be orphaned by a support action.
