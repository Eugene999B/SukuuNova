-- Persist provider delivery receipts separately from the outbox submission state.
-- A successful provider API response means accepted/submitted, not handset delivery.
ALTER TABLE "SmsProviderDelivery"
  ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "SmsProviderDelivery_provider_message_idx"
  ON "SmsProviderDelivery"("providerKey", "providerMessageId");

-- Existing rows previously labelled `sent` only prove that the provider accepted
-- the request. Relabel them honestly until a provider delivery receipt arrives.
UPDATE "SmsProviderDelivery"
   SET "status" = 'SUBMITTED',
       "acceptedAt" = COALESCE("acceptedAt", "createdAt"),
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE lower("status") = 'sent';

CREATE TABLE IF NOT EXISTS "PlatformSmsDelivery" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "actorId" TEXT,
  "recipientPhone" TEXT NOT NULL,
  "messageBody" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "estimatedCredits" INTEGER NOT NULL DEFAULT 1,
  "providerCreditsUsed" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "lastError" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSmsDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformSmsDelivery_estimated_check" CHECK ("estimatedCredits" > 0),
  CONSTRAINT "PlatformSmsDelivery_actual_check" CHECK ("providerCreditsUsed" IS NULL OR "providerCreditsUsed" > 0)
);

CREATE INDEX IF NOT EXISTS "PlatformSmsDelivery_created_idx"
  ON "PlatformSmsDelivery"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PlatformSmsDelivery_batch_idx"
  ON "PlatformSmsDelivery"("batchId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformSmsDelivery_provider_message_key"
  ON "PlatformSmsDelivery"("providerKey", "providerMessageId")
  WHERE "providerMessageId" IS NOT NULL;
