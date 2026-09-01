ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_channel_check";
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_channel_check"
  CHECK ("channel" IN ('in_app', 'sms', 'whatsapp'));
