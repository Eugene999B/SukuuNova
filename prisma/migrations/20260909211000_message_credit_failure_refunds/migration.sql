-- Return school prepaid communication units exactly once when an external message permanently fails.
-- This is a school-wallet refund only; it does not add units back to platform unsold inventory.
CREATE TABLE IF NOT EXISTS "MessageCreditRefund" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageCreditRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageCreditRefund_message_fkey" FOREIGN KEY ("messageId","schoolId") REFERENCES "Message"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageCreditRefund_channel_check" CHECK ("channel" IN ('sms','whatsapp')),
  CONSTRAINT "MessageCreditRefund_quantity_check" CHECK ("quantity" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "MessageCreditRefund_message_key" ON "MessageCreditRefund"("schoolId","messageId");
CREATE INDEX IF NOT EXISTS "MessageCreditRefund_school_created_idx" ON "MessageCreditRefund"("schoolId","createdAt");

ALTER TABLE "MessageCreditRefund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageCreditRefund" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "MessageCreditRefund_tenant" ON "MessageCreditRefund";
CREATE POLICY "MessageCreditRefund_tenant" ON "MessageCreditRefund"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

CREATE OR REPLACE FUNCTION sukuunova_refund_failed_message_credit(target_school_id TEXT, target_message_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  message_channel TEXT;
  message_body TEXT;
  refund_units INTEGER;
  balance_after INTEGER;
  inserted_id TEXT;
  cost_rate NUMERIC;
  sell_rate NUMERIC;
BEGIN
  SELECT "channel","body" INTO message_channel,message_body
    FROM "Message"
   WHERE "schoolId"=target_school_id AND "id"=target_message_id AND "status"='failed'
   FOR UPDATE;

  IF message_channel IS NULL OR message_channel NOT IN ('sms','whatsapp') THEN RETURN 0; END IF;
  refund_units := CASE WHEN message_channel='sms' THEN sukuunova_sms_segment_count(message_body) ELSE 1 END;

  INSERT INTO "MessageCreditRefund" ("id","schoolId","messageId","channel","quantity")
  VALUES ('refund_' || md5(random()::text || clock_timestamp()::text || target_message_id),target_school_id,target_message_id,message_channel,refund_units)
  ON CONFLICT ("schoolId","messageId") DO NOTHING
  RETURNING "id" INTO inserted_id;

  IF inserted_id IS NULL THEN RETURN 0; END IF;

  IF message_channel='sms' THEN
    UPDATE "PlatformMessagingWallet"
       SET "smsBalance"="smsBalance"+refund_units,"updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=target_school_id
     RETURNING "smsBalance","smsCostRate","smsSellRate" INTO balance_after,cost_rate,sell_rate;
  ELSE
    UPDATE "PlatformMessagingWallet"
       SET "whatsappBalance"="whatsappBalance"+refund_units,"updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=target_school_id
     RETURNING "whatsappBalance","whatsappCostRate","whatsappSellRate" INTO balance_after,cost_rate,sell_rate;
  END IF;

  IF balance_after IS NULL THEN
    RAISE EXCEPTION 'MESSAGING_WALLET_NOT_FOUND:%', target_school_id USING ERRCODE='P0001';
  END IF;

  INSERT INTO "PlatformMessagingLedger" (
    "id","schoolId","channel","entryType","quantity","balanceAfter","unitCost","unitPrice","reference","notes","actorId"
  ) VALUES (
    'failrefund_' || md5(random()::text || clock_timestamp()::text || target_message_id),
    target_school_id,message_channel,'adjustment',refund_units,balance_after,cost_rate,sell_rate,
    'message-failure-refund:' || target_message_id,
    refund_units::text || ' reserved communication credit unit(s) returned after permanent delivery failure.',
    'system:message-failure-refund'
  );

  RETURN refund_units;
END;
$$;