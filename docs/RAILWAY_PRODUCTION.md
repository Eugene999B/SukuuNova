# SukuuNova Railway Production Setup

## Canonical production URL

The official SukuuNova production application URL is:

`https://sukuunova-production.up.railway.app`

Use this Railway URL for production links, QR verification URLs, browser testing, operational documentation and the public application origin. Do not treat Vercel preview URLs as SukuuNova production URLs.

## Services

- `SukuuNova` application service: deploy from GitHub `Eugene999B/SukuuNova`, branch `main`.
- `Postgres` database service: Railway PostgreSQL.

## Required application variables

Set these on the **SukuuNova application service**.

- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (replace `Postgres` with the exact PostgreSQL service name if needed)
- `SCHOOL_AUTH_SECRET` — random secret, at least 32 characters
- `GUARDIAN_AUTH_SECRET` — a different random secret, at least 32 characters
- `QR_AUTH_SECRET` — a different random secret, at least 32 characters
- `PLATFORM_AUTH_SECRET` — a different random secret, at least 32 characters
- `NEXT_PUBLIC_APP_URL=https://sukuunova-production.up.railway.app`
- `NODE_ENV=production`

## Runtime database isolation

Railway migrations use the administrative `DATABASE_URL`. The deployed web process starts through `scripts/start-production.cjs`, which provisions/updates a restricted `sukuunova_app` login and then launches Next.js with that restricted connection. This keeps PostgreSQL `FORCE ROW LEVEL SECURITY` effective for tenant-owned runtime data while still allowing pre-deploy migrations to run with the administrative connection.

Do not override the Railway start command back to plain `next start` or `npm start` unless `npm start` itself is later changed to invoke the hardened launcher.

## Optional integration variables

Only configure these when the corresponding service is enabled:

- `SIGNATURE_BINDING_SECRET` (recommended dedicated 32+ character secret; falls back to `SCHOOL_AUTH_SECRET` if omitted)
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_RESPONSES_URL`
- `WHATSAPP_WEBHOOK_SECRET` (legacy shared-secret adapter, 32+ characters)
- `WHATSAPP_APP_SECRET` (Meta app secret for `X-Hub-Signature-256`, 32+ characters)
- `WHATSAPP_VERIFY_TOKEN` (Meta subscription challenge token, 16+ characters)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `ARKESEL_API_KEY`
- `ARKESEL_SMS_URL`
- `SAILUP_API_KEY`
- `SAILUP_SMS_URL`
- `HUBTEL_CLIENT_ID`
- `HUBTEL_CLIENT_SECRET`
- `HUBTEL_SMS_URL`
- `SMS_PROVIDER_URL`
- `SMS_PROVIDER_TOKEN`
- `SMS_SENDER_ID`
- `EMAIL_PROVIDER_URL`
- `EMAIL_PROVIDER_TOKEN`
- `EMAIL_FROM`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `FACE_EMBEDDING_ENCRYPTION_KEY` (exactly 32 random bytes encoded as base64)
- `RISK_SCAN_CRON_SECRET`
- `BACKUP_ENCRYPTION_KEY` (exactly 32 random bytes encoded as hex or base64; keep separate from backup storage)

## One-time initialization variables

Only use these for a deliberate initial seed. Never commit their values to Git.

- `SEED_SCHOOL_CODE`
- `SEED_SCHOOL_NAME`
- `SEED_OWNER_NAME`
- `SEED_OWNER_EMAIL`
- `SEED_OWNER_PASSWORD` (12+ characters)
- `SEED_PLATFORM_ADMIN_EMAIL`
- `SEED_PLATFORM_ADMIN_PASSWORD` (12+ characters)
- `SEED_PLATFORM_ADMIN_NAME` (optional)

After successful initialization, remove the seed variables from the production application environment unless they are intentionally needed again.

## Clean-trial reset variables

Do not leave destructive reset authorization configured permanently. Supply these only to the trusted maintenance command when intentionally clearing application records:

- `RESET_DATABASE_URL` — explicit maintenance/admin database URL; there is intentionally no `DATABASE_URL` fallback
- `RESET_MODE=preview` for the first pass; use `execute` only after reviewing the preview
- `ALLOW_APPLICATION_DATA_RESET=YES_DELETE_APPLICATION_DATA` only for the execute pass
- `RESET_CONFIRM_DATABASE_NAME` — must exactly equal the target database name

After reset, run `npm run data:verify-empty` using `RESET_DATABASE_URL`. The reset preserves `_prisma_migrations` and removes application records only.

## Deployment configuration

`railway.json` defines:

- Railpack as the builder
- `node scripts/start-production.cjs` as the start command
- `npm run db:migrate` as the pre-deploy command
- `/api/health` as the health check
- `ON_FAILURE` restart policy with 10 retries

Railway pre-deploy commands run separately before the new application deployment and have access to the service environment variables, including `DATABASE_URL`.

## Production verification

After the first successful deployment:

1. `GET https://sukuunova-production.up.railway.app/api/health` returns HTTP 200 and confirms PostgreSQL connectivity.
2. Prisma reports no pending migrations.
3. The production log reports that the `sukuunova_app` application role was provisioned/updated or was already safe.
4. School login works at `https://sukuunova-production.up.railway.app` after deliberate school/owner initialization.
5. Platform login works at the same Railway production origin after deliberate platform-admin initialization.
6. Protected routes reject unauthenticated requests.
7. ID-card QR verification and generated production links resolve against `https://sukuunova-production.up.railway.app`, not a preview host.
8. Remove one-time seed/reset authorization variables after successful initialization/reset.
