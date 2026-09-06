-- Deduplicate keyed payment reversals within a school (double-click / retry safety).
-- PostgreSQL unique constraints allow multiple NULL values, so reversals
-- without an idempotency key remain valid while keyed reversals are unique.
ALTER TABLE "PaymentReversal" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentReversal_schoolId_idempotencyKey_key"
  ON "PaymentReversal" ("schoolId", "idempotencyKey");
