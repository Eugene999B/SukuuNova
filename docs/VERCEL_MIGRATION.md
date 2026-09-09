# SukuuNova Vercel migration checkpoint

This file records the hosting migration boundary. The existing Railway application and PostgreSQL database remain the rollback environment until the Vercel deployment is fully verified.

## Application source

Production application source is the `main` branch. Do not use feature-branch previews as the production source of truth.

## Vercel architecture

- Next.js application deployed on Vercel.
- Existing PostgreSQL database remains the application database; no replacement database is created by this migration.
- Vercel builds run `prisma generate && next build` through the repository build script.
- Prisma migrations are not run automatically by Vercel builds.
- The production database role must be `NOSUPERUSER NOBYPASSRLS` because tenant isolation depends on PostgreSQL RLS.
- Persistent worker scripts are not part of the Vercel runtime.
- Risk scanning remains an externally scheduled authenticated request to `/api/cron/risk-scan`.

## Safety boundary

Do not retire, disconnect, reset, migrate, or delete the existing Railway application or PostgreSQL database until Vercel production has passed application, database, authentication, authorization, integration, and rollback verification.
