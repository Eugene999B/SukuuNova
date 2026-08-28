# Vercel free-tier deployment notes

SukuuNova is a Next.js application adapted for Vercel's short-lived serverless request model.

- Build: `prisma generate && next build`; migrations are never run automatically during a Vercel build.
- Risk scanning: `POST /api/cron/risk-scan`, protected by `Authorization: Bearer <RISK_SCAN_CRON_SECRET>`, with one scan per invocation.
- External scheduling: `.github/workflows/risk-scan.yml` calls the endpoint every six hours using `SUKUUNOVA_APP_URL` and `RISK_SCAN_CRON_SECRET` GitHub Actions secrets.
- Notifications: SMS/WhatsApp delivery is attempted synchronously from the request path. Provider errors are caught and recorded as failed notifications rather than being re-thrown into the parent operation.
- Persistent worker scripts are not part of the Vercel runtime.
- Production PostgreSQL must use a dedicated `NOSUPERUSER NOBYPASSRLS` role with the existing RLS model. Run `prisma migrate deploy` manually before first live use.

This is a deployment architecture adaptation only; Phase 0-4 product behavior and security boundaries remain unchanged.