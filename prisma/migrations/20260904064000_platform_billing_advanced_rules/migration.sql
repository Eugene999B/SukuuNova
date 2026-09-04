ALTER TABLE "PlatformSchoolBillingConfig"
  ADD COLUMN IF NOT EXISTS "autoGenerateInvoices" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "invoiceDueDays" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS "taxPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
  ADD COLUMN IF NOT EXISTS "sendBillingNotifications" BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformSchoolBillingConfig_due_days_check') THEN
    ALTER TABLE "PlatformSchoolBillingConfig" ADD CONSTRAINT "PlatformSchoolBillingConfig_due_days_check" CHECK ("invoiceDueDays" BETWEEN 0 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformSchoolBillingConfig_tax_check') THEN
    ALTER TABLE "PlatformSchoolBillingConfig" ADD CONSTRAINT "PlatformSchoolBillingConfig_tax_check" CHECK ("taxPercent" BETWEEN 0 AND 100 AND "discountPercent" BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformSchoolBillingConfig_prefix_check') THEN
    ALTER TABLE "PlatformSchoolBillingConfig" ADD CONSTRAINT "PlatformSchoolBillingConfig_prefix_check" CHECK (length(trim("invoicePrefix")) BETWEEN 1 AND 20);
  END IF;
END $$;
