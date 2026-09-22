# Arcade vNext persistence ownership

Arcade vNext deliberately uses **migration-managed PostgreSQL tables with raw SQL runtime access**. These tables are not Prisma Client models and must not be inferred from or regenerated from `prisma/schema.prisma`.

This is an explicit persistence boundary for the authoritative game runtime, not an accidental schema omission.

## Owned tables

The Arcade vNext runtime owns these tables:

- `ArcadeGameSession`
- `ArcadeGameEvent`
- `ArcadeGameSnapshot`
- `ArcadeGameArtifact`
- `ArcadeGameAssessment`

Their initial source of truth is:

`prisma/migrations/20260912190000_arcade_vnext_sessions/migration.sql`

The legacy `ArcadeRound` Prisma model remains the live production Arcade path until individual games are intentionally migrated.

## Runtime access rule

Application code must access these tables only through the Arcade vNext persistence/service boundary using `$queryRaw` / `$executeRaw` inside SukuuNova's verified `withTenant(...)` transaction context.

Do not add ad-hoc raw queries for these tables to unrelated routes or features. Do not expose `privateMission` or other server-private state through browser contracts.

## Tenant-security rule

Every owned table must retain:

- a non-null `schoolId`
- tenant-safe foreign keys
- PostgreSQL `ENABLE ROW LEVEL SECURITY`
- PostgreSQL `FORCE ROW LEVEL SECURITY`
- a policy scoped to `app.current_school_id`

A migration that disables RLS, removes FORCE RLS, drops an owned table, or renames one of these tables is a platform-contract change and must update the ownership guard in the same reviewed change.

## Prisma ownership rule

These five tables intentionally do **not** appear as models in `prisma/schema.prisma` while the runtime is raw-SQL-owned.

If SukuuNova later decides to move them into Prisma Client ownership, that must be a dedicated migration/architecture change that:

1. adds the full models and tenant relations to `schema.prisma`;
2. updates the tenant-extension/tenant-isolation coverage for the new models;
3. preserves all existing RLS and composite tenant foreign keys;
4. removes or rewrites the raw-SQL ownership guard deliberately;
5. proves the same idempotency, sequence, resume, secrecy and immutable-completion behavior before any learner game is enabled.

Do not partially model only some of the five tables.

## Migration discipline

The initial Arcade vNext migration must never be edited after it has been applied to a shared environment. Future changes use new additive migrations.

The repository test `tests/arcade-vnext-persistence-ownership.test.ts` protects this contract by verifying that the owned tables remain intentionally outside the Prisma datamodel, that the creation migration establishes FORCE RLS, and that later migrations do not silently drop/rename the tables or weaken their RLS boundary.

## Game enablement

Persistence ownership does not enable any game. The production adapter registry remains fail-closed until the greybox game tracks prove their individual runtime contracts and are intentionally registered.