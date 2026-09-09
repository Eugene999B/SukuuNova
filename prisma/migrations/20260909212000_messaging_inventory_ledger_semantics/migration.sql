-- Keep school-wallet and platform-inventory balances in their own ledgers.
-- The school ledger balanceAfter remains the school's balance. Every allocation/refund
-- also appends the corresponding movement to the platform inventory ledger.
CREATE OR REPLACE FUNCTION sukuunova_enforce_messaging_inventory_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_balance INTEGER;
  next_balance INTEGER;
  inventory_quantity INTEGER;
  inventory_entry_type TEXT;
BEGIN
  IF NEW."entryType" NOT IN ('allocation','refund') THEN RETURN NEW; END IF;
  IF NEW."schoolId" IS NULL THEN RETURN NEW; END IF;

  SELECT "balance" INTO current_balance
    FROM "PlatformMessagingInventory"
   WHERE "channel" = NEW."channel"
   FOR UPDATE;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'MESSAGING_INVENTORY_CHANNEL_NOT_INITIALIZED:%', NEW."channel" USING ERRCODE='P0001';
  END IF;

  IF NEW."entryType" = 'allocation' THEN
    IF NEW."quantity" <= 0 THEN
      RAISE EXCEPTION 'MESSAGING_ALLOCATION_MUST_BE_POSITIVE' USING ERRCODE='P0001';
    END IF;
    next_balance := current_balance - NEW."quantity";
    inventory_quantity := -NEW."quantity";
    inventory_entry_type := 'allocation';
  ELSE
    IF NEW."quantity" >= 0 THEN
      RAISE EXCEPTION 'MESSAGING_REFUND_MUST_BE_NEGATIVE' USING ERRCODE='P0001';
    END IF;
    next_balance := current_balance + abs(NEW."quantity");
    inventory_quantity := abs(NEW."quantity");
    inventory_entry_type := 'refund';
  END IF;

  IF next_balance < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_PLATFORM_MESSAGING_INVENTORY:%', NEW."channel" USING ERRCODE='P0001';
  END IF;

  UPDATE "PlatformMessagingInventory"
     SET "balance" = next_balance,
         "updatedAt" = CURRENT_TIMESTAMP
   WHERE "channel" = NEW."channel";

  INSERT INTO "PlatformMessagingInventoryLedger" (
    "id","channel","entryType","quantity","balanceAfter","unitCost","unitPrice","schoolId","reference","notes","actorId","providerKey"
  ) VALUES (
    'inv_move_' || md5(random()::text || clock_timestamp()::text || NEW."id"),
    NEW."channel",inventory_entry_type,inventory_quantity,next_balance,NEW."unitCost",NEW."unitPrice",NEW."schoolId",NEW."reference",NEW."notes",NEW."actorId",NULL
  );

  -- Deliberately do not overwrite NEW.balanceAfter: it is the school wallet balance
  -- computed by adjustMessagingBalance before this trigger runs.
  RETURN NEW;
END;
$$;