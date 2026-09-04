# SukuuNova Railway Production Setup

## Services

- `SukuuNova` application service: deploy from GitHub `Eugene999B/SukuuNova`, branch `main`.
- `Postgres` database service: Railway PostgreSQL.

## Required application variables

Set these on the **SukuuNova application service**.

- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (replace `Postgres` with the exact PostgreSQL service name if needed)
- `SCHOOL_AUTH_SECRET` — random secret, at least 32 characters
- `PLATFORM_AUTH_SECRET` — a different random secret, at least 32 characters
- `NEXT_PUBLIC_APP_URL` — the public HTTPS URL for the SukuuNova application

## Optional integration variables

Only configure these when the corresponding service is enabled:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_RESPONSES_URL`
- `WHATSAPP_WEBHOOK_SECRET` (legacy shared-secret adapter, 32+ characters)
- `WHATSAPP_APP_SECRET` (Meta app secret for `X-Hub-Signature-256`, 32+ characters)
- `WHATSAPP_VERIFY_TOKEN` (Meta subscription challenge token, 16+ characters)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `SMS_PROVIDER_URL`
- `SMS_PROVIDER_TOKEN`
- `SMS_SENDER_ID`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `FACE_EMBEDDING_ENCRYPTION_KEY`
- `RISK_SCAN_CRON_SECRET`

## One-time initialization variables

Only use these for the initial database seed. Never commit their values to Git.

- `SEED_SCHOOL_CODE`
- `SEED_SCHOOL_NAME`
- `SEED_OWNER_NAME`
- `SEED_OWNER_EMAIL`
- `SEED_OWNER_PASSWORD` (12+ characters)
- `SEED_PLATFORM_ADMIN_EMAIL`
- `SEED_PLATFORM_ADMIN_PASSWORD` (12+ characters)
- `SEED_PLATFORM_ADMIN_NAME` (optional)

After successful initialization, remove the seed variables from the production application environment unless they are intentionally needed again.

## Deployment configuration

`railway.json` defines:

- Railpack as the builder
- `npm start` as the start command
- `npx prisma migrate deploy` as the pre-deploy command
- `/api/health` as the health check
- `ON_FAILURE` restart policy with 10 retries

Railway pre-deploy commands run separately before the new application deployment and have access to the service environment variables, including `DATABASE_URL`.

## Production verification

After the first successful deployment:

1. `GET /api/health` returns HTTP 200 and confirms PostgreSQL connectivity.
2. Prisma reports no pending migrations.
3. School login works using the seeded school owner.
4. Platform login works using the seeded platform administrator.
5. Protected routes reject unauthenticated requests.
6. Remove one-time seed variables after successful initialization.
