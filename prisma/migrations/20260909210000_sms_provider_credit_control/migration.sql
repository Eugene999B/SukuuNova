-- SMS provider traceability and exact prepaid segment metering.
ALTER TABLE "PlatformMessagingInventoryLedger"
  ADD COLUMN IF NOT EXISTS "providerKey" TEXT;

CREATE TABLE IF NOT EXISTS "SmsProviderDelivery" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "estimatedCredits" INTEGER NOT NULL DEFAULT 1,
  "providerCreditsUsed" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsProviderDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SmsProviderDelivery_message_fkey" FOREIGN KEY ("messageId","schoolId") REFERENCES "Message"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SmsProviderDelivery_estimated_check" CHECK ("estimatedCredits" > 0),
  CONSTRAINT "SmsProviderDelivery_actual_check" CHECK ("providerCreditsUsed" IS NULL OR "providerCreditsUsed" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "SmsProviderDelivery_message_key" ON "SmsProviderDelivery"("schoolId","messageId");
CREATE INDEX IF NOT EXISTS "SmsProviderDelivery_provider_created_idx" ON "SmsProviderDelivery"("providerKey","createdAt");

ALTER TABLE "SmsProviderDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SmsProviderDelivery" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SmsProviderDelivery_tenant" ON "SmsProviderDelivery";
CREATE POLICY "SmsProviderDelivery_tenant" ON "SmsProviderDelivery"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

-- Returns the billable segment count used by the prepaid school wallet.
-- GSM-7 extension characters consume two septets. Other characters fall back to Unicode.
CREATE OR REPLACE FUNCTION sukuunova_sms_segment_count(message_text TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  ch TEXT;
  septets INTEGER := 0;
  unicode_units INTEGER := 0;
  i INTEGER;
  cp INTEGER;
BEGIN
  IF message_text IS NULL OR message_text = '' THEN RETURN 1; END IF;
  FOR ch IN SELECT regexp_split_to_table(message_text, '') LOOP
    IF position(ch in '@£$¥èéùìòÇ' || E'\n' || 'Øø' || E'\r' || 'ÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&''()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà') > 0 THEN
      septets := septets + 1;
    ELSIF position(ch in '^{}\[~]|€' || chr(12)) > 0 THEN
      septets := septets + 2;
    ELSE
      septets := -1;
      EXIT;
    END IF;
  END LOOP;
  IF septets >= 0 THEN
    IF septets <= 160 THEN RETURN 1; END IF;
    RETURN CEIL(septets / 153.0)::INTEGER;
  END IF;

  -- Count UTF-16 code units so non-BMP characters consume two units.
  FOR i IN 1..char_length(message_text) LOOP
    ch := substr(message_text, i, 1);
    cp := ascii(ch);
    unicode_units := unicode_units + CASE WHEN cp > 65535 THEN 2 ELSE 1 END;
  END LOOP;
  IF unicode_units <= 70 THEN RETURN 1; END IF;
  RETURN CEIL(unicode_units / 67.0)::INTEGER;
END;
$$;

CREATE OR REPLACE FUNCTION sukuunova_meter_message_credit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_balance INTEGER;
  cost_rate NUMERIC;
  sell_rate NUMERIC;
  required_units INTEGER;
BEGIN
  IF NEW.channel IS NULL OR NEW.channel NOT IN ('sms','whatsapp') THEN RETURN NEW; END IF;
  required_units := CASE WHEN NEW.channel = 'sms' THEN sukuunova_sms_segment_count(NEW.body) ELSE 1 END;

  IF NEW.channel = 'sms' THEN
    UPDATE "PlatformMessagingWallet"
      SET "smsBalance" = "smsBalance" - required_units, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "schoolId" = NEW."schoolId" AND "status" = 'active' AND "smsBalance" >= required_units
      RETURNING "smsBalance", "smsSellRate", "smsCostRate" INTO current_balance, sell_rate, cost_rate;
  ELSE
    UPDATE "PlatformMessagingWallet"
      SET "whatsappBalance" = "whatsappBalance" - 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "schoolId" = NEW."schoolId" AND "status" = 'active' AND "whatsappBalance" >= 1
      RETURNING "whatsappBalance", "whatsappSellRate", "whatsappCostRate" INTO current_balance, sell_rate, cost_rate;
  END IF;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_COMMUNICATION_CREDITS:%', NEW.channel USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO "PlatformMessagingLedger" (
    "id","schoolId","channel","entryType","quantity","balanceAfter","unitCost","unitPrice","reference","notes","actorId"
  ) VALUES (
    'msg_' || md5(random()::text || clock_timestamp()::text || NEW."id"),
    NEW."schoolId", NEW.channel, 'consumption', -required_units, current_balance, cost_rate, sell_rate,
    'message:' || NEW."id", required_units::text || ' communication credit unit(s) consumed when the message was queued.', 'system:message-meter'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sukuunova_message_credit_meter ON "Message";
CREATE TRIGGER sukuunova_message_credit_meter
BEFORE INSERT ON "Message"
FOR EACH ROW
EXECUTE FUNCTION sukuunova_meter_message_credit();