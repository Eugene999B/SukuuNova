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

CREATE INDEX IF NOT EXISTS "SupportTicket_school_severity_status_idx"
  ON "SupportTicket"("schoolId","severity","status","createdAt" DESC);

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
