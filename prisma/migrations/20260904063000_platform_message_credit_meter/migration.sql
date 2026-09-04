CREATE OR REPLACE FUNCTION sukuunova_meter_message_credit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_balance INTEGER;
  next_balance INTEGER;
  cost_rate NUMERIC;
  sell_rate NUMERIC;
BEGIN
  IF NEW.channel NOT IN ('sms','whatsapp') THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "PlatformMessagingWallet" WHERE "schoolId" = NEW."schoolId") THEN
    RETURN NEW;
  END IF;

  IF NEW.channel = 'sms' THEN
    UPDATE "PlatformMessagingWallet"
       SET "smsBalance" = "smsBalance" - 1,
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "schoolId" = NEW."schoolId" AND "smsBalance" > 0
     RETURNING "smsBalance", "smsSellRate", "smsCostRate"
      INTO current_balance, sell_rate, cost_rate;
  ELSE
    UPDATE "PlatformMessagingWallet"
       SET "whatsappBalance" = "whatsappBalance" - 1,
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "schoolId" = NEW."schoolId" AND "whatsappBalance" > 0
     RETURNING "whatsappBalance", "whatsappSellRate", "whatsappCostRate"
      INTO current_balance, sell_rate, cost_rate;
  END IF;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_COMMUNICATION_CREDITS:%', NEW."channel" USING ERRCODE = 'P0001';
  END IF;

  next_balance := current_balance;
  INSERT INTO "PlatformMessagingLedger" (
    "id","schoolId","channel","entryType","quantity","balanceAfter","unitCost","unitPrice","reference","notes","actorId"
  ) VALUES (
    'msg_' || replace(gen_random_uuid()::text,'-',''),
    NEW."schoolId", NEW."channel", 'consumption', -1, next_balance, cost_rate, sell_rate,
    'message:' || NEW."id", 'One communication credit consumed when the message was queued.', 'system:message-meter'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sukuunova_message_credit_meter ON "Message";
CREATE TRIGGER sukuunova_message_credit_meter
BEFORE INSERT ON "Message"
FOR EACH ROW
EXECUTE FUNCTION sukuunova_meter_message_credit();
