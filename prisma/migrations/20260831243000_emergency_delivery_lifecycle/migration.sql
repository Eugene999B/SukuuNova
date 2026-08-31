ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "sourceRecordId" TEXT,
  ADD COLUMN IF NOT EXISTS "eventType" TEXT,
  ADD COLUMN IF NOT EXISTS "templateVersion" TEXT;

CREATE INDEX IF NOT EXISTS "Message_school_source_record_idx"
  ON "Message"("schoolId","sourceRecordId");

CREATE INDEX IF NOT EXISTS "Message_school_event_recipient_idx"
  ON "Message"("schoolId","eventType","recipientId");

ALTER TABLE "EmergencyBroadcast"
  ADD COLUMN IF NOT EXISTS "recipientCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "queuedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sendingCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sentCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "failedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "optedOutCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

UPDATE "EmergencyBroadcast"
SET "recipientCount" = COALESCE(jsonb_array_length("recipientSnapshot"), 0)
WHERE "recipientCount" = 0;

ALTER TABLE "EmergencyBroadcast"
  DROP CONSTRAINT IF EXISTS "EmergencyBroadcast_status_check";

ALTER TABLE "EmergencyBroadcast"
  ADD CONSTRAINT "EmergencyBroadcast_status_check"
  CHECK ("status" IN ('DRAFT','PREVIEWED','CONFIRMED','QUEUED','SENDING','PARTIALLY_SENT','COMPLETED','FAILED','CANCELLED'));

CREATE INDEX IF NOT EXISTS "EmergencyBroadcast_school_status_idx"
  ON "EmergencyBroadcast"("schoolId","status","createdAt");
