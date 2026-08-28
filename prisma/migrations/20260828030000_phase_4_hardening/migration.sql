-- Phase 4 hardening: preserve tenant integrity for ticket messages and add the existing-score remark destination used only after human AI acceptance.
ALTER TABLE "Score" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "SupportTicketMessage" DROP CONSTRAINT IF EXISTS "SupportTicketMessage_sender_fkey";
ALTER TABLE "SupportTicketMessage" DROP CONSTRAINT IF EXISTS "SupportTicketMessage_ticket_fkey";
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_id_schoolId_key" ON "SupportTicket"("id","schoolId");
ALTER TABLE "SupportTicketMessage"
  ADD CONSTRAINT "SupportTicketMessage_ticket_school_fkey"
  FOREIGN KEY ("ticketId","schoolId") REFERENCES "SupportTicket"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
