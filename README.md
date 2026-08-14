# SukuuNova

SukuuNova is a multi-tenant school management platform for Ghanaian schools. This repository currently contains **Phase 0 only**: the security and data foundation that later product modules will depend on.

There is deliberately no student information system, attendance, finance, payroll, report-card, bus-tracking, calendar, or messaging feature in this phase.

## Phase 0 contents

- Next.js App Router, React, TypeScript, and Tailwind
- PostgreSQL data model and Prisma migration
- Two independent authentication universes:
  - Platform Admin accounts in **PlatformAdmin**
  - School User accounts in **User**
- bcrypt password hashing and database-backed login throttling
- Token-based password-reset storage with only SHA-256 token hashes persisted
- Database-driven roles, permissions, role mappings, and per-user overrides
- Prisma client extension that injects the verified tenant into every tenant query
- forced PostgreSQL Row-Level Security on every tenant table
- append-only school and platform audit logs at both application and database layers
- integration tests for tenant isolation, RLS, RBAC, overrides, and audit immutability
- minimal school/platform login screens and identity proof dashboard

## Security architecture

Every authenticated school operation must run through **withTenant(schoolId, work)** in **src/lib/db.ts**.

That helper performs three linked steps:

1. Rejects an empty tenant identifier. There is no fallback school ID.
2. opens a database transaction and sets **app.current_school_id** with PostgreSQL **set_config(..., true)**, making the value transaction-local;
3. executes through a Prisma query extension that scopes reads, creates, updates, upserts, and deletes.

The migration separately enables and forces RLS. If a route bypasses the Prisma extension and executes raw SQL, PostgreSQL still hides or rejects rows whose **schoolId** differs from the transaction setting. The **School** root uses its **id** as the tenant key.

**SchoolLoginDirectory** is a deliberately minimal platform-level lookup containing only school ID, public login code, and status. It resolves a tenant before a school user can be queried through RLS. It contains no user or credential data.

### Tenant-scoped tables

- School
- SchoolSettings
- User
- Role
- RolePermission
- UserRole
- UserPermissionOverride
- SchoolPasswordResetToken
- AuditLogSchool

Join tables repeat **schoolId** and use composite foreign keys, so a relationship cannot point at a user or role from another school.

### Authentication separation

School and platform sessions use all of the following independently:

- different database tables;
- different login routes;
- different cookie names;
- different environment secrets;
- different JWT issuers and audiences;
- an explicit **kind** claim checked during verification.

A token issued for a School User cannot pass Platform Admin verification, and a successful login clears any cookie from the other universe.

### Password resets

The request endpoints create a cryptographically random token, store only its hash, set a 30-minute expiry, and write an audit entry. Confirmation consumes the token once, changes the bcrypt hash, and writes another audit entry.

Actual email/SMS/WhatsApp delivery is explicitly outside Phase 0. **src/lib/reset-delivery.ts** is therefore a safe adapter boundary: it never logs or returns the raw token. Connect a secure delivery provider there in an authorized later phase before enabling reset requests in production.

### Audit immutability

The Prisma extension rejects update, upsert, and delete operations for either audit model. PostgreSQL triggers independently reject **UPDATE** and **DELETE**, including raw SQL. Accountable service functions write before/after records in the same transaction as the mutation.

## Prerequisites

- Node.js 20.19 or newer
- PostgreSQL
- a database role that is not **SUPERUSER** and does not have **BYPASSRLS**

A superuser always bypasses PostgreSQL RLS, even when a table uses **FORCE ROW LEVEL SECURITY**; do not use one as the application or RLS-test identity.

## Clean setup

~~~bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
~~~

Open http://localhost:3000.

The seed command intentionally has no credential defaults. Set these values before running it:

- SEED_SCHOOL_CODE
- SEED_SCHOOL_NAME
- SEED_OWNER_NAME
- SEED_OWNER_EMAIL
- SEED_OWNER_PASSWORD with at least 12 characters

To seed a Platform Admin, also set **SEED_PLATFORM_ADMIN_EMAIL** and **SEED_PLATFORM_ADMIN_PASSWORD**; both are required together. No password or secret is committed to the repository.

## Migrations and seed

Production/clean database:

~~~bash
npm run db:migrate
npm run db:seed
~~~

**db:migrate** uses **prisma migrate deploy**, so it applies the checked-in SQL without generating a new migration. The initial migration creates all constraints, RLS policies, and append-only triggers.

The seed is idempotent for the configured school. It creates:

- the Foundation subscription plan;
- the baseline Permission rows;
- Owner, Principal, Vice Principal, Accountant, HR Officer, Admissions Officer, Class Teacher, Subject Teacher, Front Desk/Gate Security, Transport Officer, Parent, and Student roles inside the school;
- sensible role-permission mappings;
- one environment-configured Owner user;
- an optional environment-configured Platform Admin.

Each school receives its own Role records. Shared nullable roles are avoided so RLS and custom-role evolution stay unambiguous.

## Adding a permission

1. Add the **resource:action** key to **DEFAULT_PERMISSIONS** in **src/lib/default-rbac.ts**.
2. Add it to the appropriate role lists in **DEFAULT_ROLE_PERMISSIONS**.
3. Run **npm run db:seed** for existing configured schools, or use the same provisioning logic when new schools are created.
4. Protect the action with **requirePermission(tx, userId, "resource:action")**.
5. Add denial, grant, and override tests.

Never replace the permission check with a hardcoded role-name condition. Class-, subject-, or child-level record scoping belongs to a later feature phase; the Phase 0 key structure anticipates it without pretending that scoping already exists.

## Auth and proof routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | /api/auth/school/login | School code + email/phone + password |
| POST | /api/auth/school/logout | Clear only the school session |
| POST | /api/auth/school/password-reset/request | Create audited school reset token |
| POST | /api/auth/school/password-reset/confirm | Consume school reset token |
| POST | /api/auth/platform/login | Platform Admin email + password |
| POST | /api/auth/platform/logout | Clear only the platform session |
| POST | /api/auth/platform/password-reset/request | Create audited platform reset token |
| POST | /api/auth/platform/password-reset/confirm | Consume platform reset token |
| GET | /api/protected/students-preview | Proves students:read; always returns an empty list |

The preview route is not a student module. It exists only to prove that an authenticated user without **students:read** receives HTTP 403.

## Test suite

Use a disposable PostgreSQL database and migrate it first:

~~~bash
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
npm run test
~~~

The suite refuses to run its RLS assertions when the database identity is a superuser or has **BYPASSRLS**.

Coverage includes:

- no tenant context fails closed;
- School A cannot read, create, update, or delete School B rows through guessed IDs for every tenant table;
- raw SQL without the Prisma extension is still blocked by RLS;
- a missing permission produces 403 semantics;
- a granting override can add access and a denying override takes precedence over a role grant;
- user creation, role-permission changes, and school-setting changes create audit rows;
- audit rows cannot be updated or deleted through Prisma or raw SQL.

## Manual Phase 0 verification

After starting the app with two test schools:

1. log in as a School A user;
2. request a known School B ID through a tenant-scoped query and confirm 403/404 or no row;
3. remove **students:read** from the user, call **/api/protected/students-preview**, and confirm HTTP 403;
4. restore the permission and confirm the route returns an empty proof payload;
5. change school settings or role permissions and inspect the matching before/after audit entry;
6. attempt audit **UPDATE** and **DELETE** through both Prisma and SQL and confirm rejection;
7. search the repository for password/secret literals and confirm only environment-variable reads and generated test values exist.

Do not begin Phase 1 until the automated suite and all manual checks pass in the deployment environment.

## Railway preparation

No deployment is performed in Phase 0. For the later Railway setup:

- provide DATABASE_URL, SCHOOL_AUTH_SECRET, and PLATFORM_AUTH_SECRET as Railway variables;
- use **npm run build** for the build command and **npm run start** for the service command;
- run **npm run db:migrate** as the pre-deploy migration command;
- run the credential-requiring seed once as an explicit administrative operation, not on every deployment;
- keep the runtime database role non-superuser and without BYPASSRLS.

## Repository automation

No GitHub Actions workflow is included. This keeps GitHub Actions usage at zero for the Phase 0 commit. Run the documented tests against a disposable PostgreSQL database before review and before deployment.
