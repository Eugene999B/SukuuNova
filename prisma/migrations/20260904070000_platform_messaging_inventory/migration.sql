-- Platform-owned messaging inventory. School wallets represent allocated resale capacity;
-- this table represents capacity purchased/held by the platform before allocation.
CREATE TABLE IF NOT EXISTS "PlatformMessagingInventory" (
  "channel" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "totalPurchased" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformMessagingInventory_pkey" PRIMARY KEY ("channel"),
  CONSTRAINT "PlatformMessagingInventory_channel_check" CHECK ("channel" IN ('sms','whatsapp')),
  CONSTRAINT "PlatformMessagingInventory_balance_check" CHECK ("balance" >= 0),
  CONSTRAINT "PlatformMessagingInventory_purchased_check" CHECK ("totalPurchased" >= 0)
);

CREATE TABLE IF NOT EXISTS "PlatformMessagingInventoryLedger" (
  "id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "unitCost" DECIMAL(14,4),
  "unitPrice" DECIMAL(14,4),
  "schoolId" TEXT,
  "reference" TEXT,
  "notes" TEXT,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformMessagingInventoryLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformMessagingInventoryLedger_channel_check" CHECK ("channel" IN ('sms','whatsapp')),
  CONSTRAINT "PlatformMessagingInventoryLedger_type_check" CHECK ("entryType" IN ('purchase','allocation','refund','adjustment')),
  CONSTRAINT "PlatformMessagingInventoryLedger_quantity_check" CHECK ("quantity" <> 0),
  CONSTRAINT "PlatformMessagingInventoryLedger_balance_check" CHECK ("balanceAfter" >= 0)
);
CREATE INDEX IF NOT EXISTS "PlatformMessagingInventoryLedger_channel_created_idx" ON "PlatformMessagingInventoryLedger"("channel","createdAt");
CREATE INDEX IF NOT EXISTS "PlatformMessagingInventoryLedger_school_created_idx" ON "PlatformMessagingInventoryLedger"("schoolId","createdAt");

INSERT INTO "PlatformMessagingInventory" ("channel","balance","totalPurchased") VALUES ('sms',0,0),('whatsapp',0,0)
ON CONFLICT ("channel") DO NOTHING;

CREATE OR REPLACE FUNCTION sukuunova_enforce_messaging_inventory_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_balance INTEGER;
  next_balance INTEGER;
BEGIN
  IF NEW.entryType NOT IN ('allocation','refund') THEN RETURN NEW; END IF;
  IF NEW.schoolId IS NULL THEN RETURN NEW; END IF;
  SELECT "balance" INTO current_balance FROM "PlatformMessagingInventory" WHERE "channel" = NEW.channel FOR UPDATE;
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'MESSAGING_INVENTORY_CHANNEL_NOT_INITIALIZED:%', NEW.channel USING ERRCODE='P0001';
  END IF;
  IF NEW.entryType = 'allocation' THEN
    next_balance := current_balance - NEW.quantity;
    IF NEW.quantity <= 0 THEN
      RAISE EXCEPTION 'MESSAGING_ALLOCATION_MUST_BE_POSITIVE' USING ERRCODE='P0001';
    END IF;
  ELSE
    next_balance := current_balance + abs(NEW.quantity);
  END IF;
  IF next_balance < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_PLATFORM_MESSAGING_INVENTORY:%', NEW.channel USING ERRCODE='P0001';
  END IF;
  UPDATE "PlatformMessagingInventory" SET "balance" = next_balance, "updatedAt" = CURRENT_TIMESTAMP WHERE "channel" = NEW.channel;
  NEW.balanceAfter := next_balance;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sukuunova_enforce_messaging_inventory_allocation ON "PlatformMessagingLedger";
CREATE TRIGGER sukuunova_enforce_messaging_inventory_allocation
BEFORE INSERT ON "PlatformMessagingLedger"
FOR EACH ROW
EXECUTE FUNCTION sukuunova_enforce_messaging_inventory_allocation();
