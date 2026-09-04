CREATE OR REPLACE FUNCTION sukuunova_meter_message_credit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_balance INTEGER;
  cost_rate NUMERIC;
  sell_rate NUMERIC;
BEGIN
  IF NEW.channel IS NULL OR NEW.channel NOT IN ('sms','whatsapp') THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "PlatformMessagingWallet" WHERE "schoolId" = NEW."schoolId") THEN
    RETURN NEW;
  END IF;
  IF NEW.channel = 'sms' THEN
    UPDATE "PlatformMessagingWallet" SET "smsBalance" = "smsBalance" - 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "schoolId" = NEW."schoolId" AND "smsBalance" > 0
    RETURNING "smsBalance", "smsSellRate", "smsCostRate" INTO current_balance, sell_rate, cost_rate;
  ELSE
    UPDATE "PlatformMessagingWallet" SET "whatsappBalance" = "whatsappBalance" - 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "schoolId" = NEW."schoolId" AND "whatsappBalance" > 0
    RETURNING "whatsappBalance", "whatsappSellRate", "whatsappCostRate" INTO current_balance, sell_rate, cost_rate;
  END IF;
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_COMMUNICATION_CREDITS:%', NEW."channel" USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO "PlatformMessagingLedger" (
    "id","schoolId","channel","entryType","quantity","balanceAfter","unitCost","unitPrice","reference","notes","actorId"
  ) VALUES (
    'msg_' || md5(random()::text || clock_timestamp()::text || NEW."id"),
    NEW."schoolId", NEW."channel", 'consumption', -1, current_balance, cost_rate, sell_rate,
    'message:' || NEW."id", 'One communication credit consumed when the message was queued.', 'system:message-meter'
  );
  RETURN NEW;
END;
$$;
