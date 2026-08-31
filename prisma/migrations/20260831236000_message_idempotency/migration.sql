ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

UPDATE "Message"
SET "idempotencyKey" = 'legacy-' || "id"
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "Message" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Message_school_idempotency_key" ON "Message"("schoolId","idempotencyKey");
