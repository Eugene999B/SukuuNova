-- Pilot Feedback & Support Center: enrich the existing tenant-scoped support queue.
ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'problem',
  ADD COLUMN IF NOT EXISTS "module" TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS "context" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "SupportTicket" DROP CONSTRAINT IF EXISTS "SupportTicket_kind_check";
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_kind_check" CHECK ("kind" IN ('problem','suggestion'));
ALTER TABLE "SupportTicket" DROP CONSTRAINT IF EXISTS "SupportTicket_severity_check";
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_severity_check" CHECK ("severity" IN ('low','medium','high','critical'));

CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_id_schoolId_key" ON "SupportTicket"("id","schoolId");
CREATE INDEX IF NOT EXISTS "SupportTicket_school_severity_status_idx"
  ON "SupportTicket"("schoolId","severity","status","createdAt" DESC);

-- Support messages may come from a school account or a platform support admin.
-- The restored single-user FK is incompatible with platform replies, so provenance is explicit instead.
ALTER TABLE "SupportTicketMessage"
  ADD COLUMN IF NOT EXISTS "senderType" TEXT NOT NULL DEFAULT 'school_user';
ALTER TABLE "SupportTicketMessage" DROP CONSTRAINT IF EXISTS "SupportTicketMessage_sender_fkey";
ALTER TABLE "SupportTicketMessage" DROP CONSTRAINT IF EXISTS "SupportTicketMessage_sender_school_fkey";
ALTER TABLE "SupportTicketMessage" DROP CONSTRAINT IF EXISTS "SupportTicketMessage_senderType_check";
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_senderType_check" CHECK ("senderType" IN ('school_user','platform_admin','system'));

-- Existing platform support code writes a platform admin id into senderId without a sender type.
-- Infer that provenance at the database boundary so older/newer callers share the same truth.
CREATE OR REPLACE FUNCTION sukuunova_support_message_sender_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."senderType" = 'system' THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = NEW."senderId" AND u."schoolId" = NEW."schoolId"
  ) THEN
    NEW."senderType" := 'school_user';
  ELSE
    NEW."senderType" := 'platform_admin';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sukuunova_support_message_sender_type_trg ON "SupportTicketMessage";
CREATE TRIGGER sukuunova_support_message_sender_type_trg
BEFORE INSERT ON "SupportTicketMessage"
FOR EACH ROW EXECUTE FUNCTION sukuunova_support_message_sender_type();

-- Keep one authoritative same-school ticket relationship.
ALTER TABLE "SupportTicketMessage" DROP CONSTRAINT IF EXISTS "SupportTicketMessage_ticket_fkey";
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicketMessage_ticket_school_fkey') THEN
    ALTER TABLE "SupportTicketMessage"
      ADD CONSTRAINT "SupportTicketMessage_ticket_school_fkey"
      FOREIGN KEY ("ticketId","schoolId") REFERENCES "SupportTicket"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Preserve/repair tenant isolation even when this migration is applied to a partially restored database.
ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicketMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicketMessage" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'SupportTicket' AND policyname = 'SupportTicket_tenant_isolation') THEN
    CREATE POLICY "SupportTicket_tenant_isolation" ON "SupportTicket"
      USING ("schoolId" = sukuunova_current_school_id())
      WITH CHECK ("schoolId" = sukuunova_current_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'SupportTicketMessage' AND policyname = 'SupportTicketMessage_tenant_isolation') THEN
    CREATE POLICY "SupportTicketMessage_tenant_isolation" ON "SupportTicketMessage"
      USING ("schoolId" = sukuunova_current_school_id())
      WITH CHECK ("schoolId" = sukuunova_current_school_id());
  END IF;
END $$;
