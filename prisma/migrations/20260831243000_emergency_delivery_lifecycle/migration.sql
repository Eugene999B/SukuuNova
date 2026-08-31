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

CREATE OR REPLACE FUNCTION sukuunova_refresh_emergency_broadcast_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  broadcast_id TEXT;
  recipient_total INTEGER;
  queued_count INTEGER;
  sending_count INTEGER;
  sent_count INTEGER;
  delivered_count INTEGER;
  failed_count INTEGER;
  terminal_count INTEGER;
  next_status TEXT;
BEGIN
  IF NEW."templateKey" IS DISTINCT FROM 'emergency_broadcast' OR NEW."idempotencyKey" IS NULL THEN
    RETURN NEW;
  END IF;

  broadcast_id := split_part(NEW."idempotencyKey", ':', 3);
  IF broadcast_id IS NULL OR broadcast_id = '' THEN
    RETURN NEW;
  END IF;

  SELECT "recipientCount" INTO recipient_total
  FROM "EmergencyBroadcast"
  WHERE "id" = broadcast_id AND "schoolId" = NEW."schoolId";

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE "status" = 'queued'),
    COUNT(*) FILTER (WHERE "status" = 'sending'),
    COUNT(*) FILTER (WHERE "status" = 'sent'),
    COUNT(*) FILTER (WHERE "status" = 'delivered'),
    COUNT(*) FILTER (WHERE "status" = 'failed')
  INTO queued_count, sending_count, sent_count, delivered_count, failed_count
  FROM "Message"
  WHERE "schoolId" = NEW."schoolId"
    AND "templateKey" = 'emergency_broadcast'
    AND "idempotencyKey" LIKE NEW."schoolId" || ':EMERGENCY_BROADCAST:' || broadcast_id || ':%';

  terminal_count := sent_count + delivered_count + failed_count;
  next_status := CASE
    WHEN recipient_total = 0 THEN 'COMPLETED'
    WHEN queued_count = 0 AND sending_count = 0 AND terminal_count >= recipient_total AND failed_count > 0 AND sent_count = 0 AND delivered_count = 0 THEN 'FAILED'
    WHEN terminal_count >= recipient_total AND failed_count = 0 THEN 'COMPLETED'
    WHEN terminal_count >= recipient_total AND failed_count > 0 THEN 'PARTIALLY_SENT'
    WHEN sending_count > 0 AND terminal_count > 0 THEN 'PARTIALLY_SENT'
    WHEN sending_count > 0 THEN 'SENDING'
    WHEN queued_count > 0 THEN 'QUEUED'
    ELSE 'CONFIRMED'
  END;

  UPDATE "EmergencyBroadcast"
  SET "queuedCount" = queued_count,
      "sendingCount" = sending_count,
      "sentCount" = sent_count,
      "deliveredCount" = delivered_count,
      "failedCount" = failed_count,
      "status" = CASE WHEN "status" IN ('CANCELLED','FAILED','COMPLETED') THEN "status" ELSE next_status END,
      "completedAt" = CASE WHEN next_status = 'COMPLETED' THEN COALESCE("completedAt", NOW()) ELSE "completedAt" END,
      "failedAt" = CASE WHEN next_status IN ('FAILED','PARTIALLY_SENT') AND failed_count > 0 THEN COALESCE("failedAt", NOW()) ELSE "failedAt" END,
      "updatedAt" = NOW()
  WHERE "id" = broadcast_id AND "schoolId" = NEW."schoolId";

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Message_emergency_broadcast_state" ON "Message";
CREATE TRIGGER "Message_emergency_broadcast_state"
AFTER INSERT OR UPDATE OF "status"
ON "Message"
FOR EACH ROW
EXECUTE FUNCTION sukuunova_refresh_emergency_broadcast_state();
