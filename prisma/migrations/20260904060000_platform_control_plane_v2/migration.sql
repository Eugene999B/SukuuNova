-- Platform Control Plane v2: separate subscription billing from communications resale,
-- add configurable school billing, and preserve lifecycle/investigation settings.

CREATE TABLE IF NOT EXISTS "PlatformConfiguration" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformConfiguration_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "PlatformSchoolBillingConfig" (
  "schoolId" TEXT NOT NULL,
  "billingMode" TEXT NOT NULL DEFAULT 'flat',
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "studentRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "flatRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "billingDay" INTEGER NOT NULL DEFAULT 1,
  "graceDays" INTEGER NOT NULL DEFAULT 0,
  "trialDays" INTEGER NOT NULL DEFAULT 0,
  "minimumCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "maximumCharge" DECIMAL(14,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSchoolBillingConfig_pkey" PRIMARY KEY ("schoolId"),
  CONSTRAINT "PlatformSchoolBillingConfig_mode_check" CHECK ("billingMode" IN ('flat','per_student')),
  CONSTRAINT "PlatformSchoolBillingConfig_day_check" CHECK ("billingDay" BETWEEN 1 AND 28),
  CONSTRAINT "PlatformSchoolBillingConfig_grace_check" CHECK ("graceDays" BETWEEN 0 AND 90),
  CONSTRAINT "PlatformSchoolBillingConfig_trial_check" CHECK ("trialDays" BETWEEN 0 AND 365),
  CONSTRAINT "PlatformSchoolBillingConfig_rates_check" CHECK ("studentRate" >= 0 AND "flatRate" >= 0 AND "minimumCharge" >= 0)
);
CREATE INDEX IF NOT EXISTS "PlatformSchoolBillingConfig_active_idx" ON "PlatformSchoolBillingConfig"("active");

CREATE TABLE IF NOT EXISTS "PlatformMessagingWallet" (
  "schoolId" TEXT NOT NULL,
  "smsBalance" INTEGER NOT NULL DEFAULT 0,
  "whatsappBalance" INTEGER NOT NULL DEFAULT 0,
  "smsSellRate" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "whatsappSellRate" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "smsCostRate" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "whatsappCostRate" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "lowBalanceThreshold" INTEGER NOT NULL DEFAULT 50,
  "status" TEXT NOT NULL DEFAULT 'active',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformMessagingWallet_pkey" PRIMARY KEY ("schoolId"),
  CONSTRAINT "PlatformMessagingWallet_balance_check" CHECK ("smsBalance" >= 0 AND "whatsappBalance" >= 0),
  CONSTRAINT "PlatformMessagingWallet_rate_check" CHECK ("smsSellRate" >= 0 AND "whatsappSellRate" >= 0 AND "smsCostRate" >= 0 AND "whatsappCostRate" >= 0)
);

CREATE TABLE IF NOT EXISTS "PlatformMessagingLedger" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "unitCost" DECIMAL(14,4),
  "unitPrice" DECIMAL(14,4),
  "reference" TEXT,
  "notes" TEXT,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformMessagingLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformMessagingLedger_channel_check" CHECK ("channel" IN ('sms','whatsapp')),
  CONSTRAINT "PlatformMessagingLedger_type_check" CHECK ("entryType" IN ('allocation','consumption','adjustment','refund')),
  CONSTRAINT "PlatformMessagingLedger_quantity_check" CHECK ("quantity" <> 0),
  CONSTRAINT "PlatformMessagingLedger_balance_check" CHECK ("balanceAfter" >= 0)
);
CREATE INDEX IF NOT EXISTS "PlatformMessagingLedger_school_created_idx" ON "PlatformMessagingLedger"("schoolId","createdAt");
CREATE INDEX IF NOT EXISTS "PlatformMessagingLedger_school_channel_idx" ON "PlatformMessagingLedger"("schoolId","channel");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformSchoolBillingConfig_school_fkey') THEN
    ALTER TABLE "PlatformSchoolBillingConfig" ADD CONSTRAINT "PlatformSchoolBillingConfig_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformMessagingWallet_school_fkey') THEN
    ALTER TABLE "PlatformMessagingWallet" ADD CONSTRAINT "PlatformMessagingWallet_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformMessagingLedger_school_fkey') THEN
    ALTER TABLE "PlatformMessagingLedger" ADD CONSTRAINT "PlatformMessagingLedger_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT unnest(ARRAY['PlatformSchoolBillingConfig','PlatformMessagingWallet','PlatformMessagingLedger']) AS table_name LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = r.table_name || '_tenant_isolation') THEN
      EXECUTE format('CREATE POLICY %I ON %I USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id())', r.table_name || '_tenant_isolation', r.table_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO "PlatformConfiguration" ("key","value") VALUES
  ('platform.defaults', '{"currency":"GHS","timezone":"Africa/Accra","locale":"en-GH","defaultBillingMode":"flat","defaultGraceDays":7}'::jsonb),
  ('platform.security', '{"requirePasswordChange":true,"sessionHours":12,"enableMfa":false,"allowImpersonation":true,"auditRetentionDays":730}'::jsonb),
  ('platform.lifecycle', '{"allowLock":true,"allowSuspend":true,"allowArchive":true,"allowDelete":false,"requireDeletePhrase":"DELETE SCHOOL"}'::jsonb),
  ('platform.messaging', '{"currency":"GHS","lowBalanceThreshold":50,"enableSms":true,"enableWhatsapp":true}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
