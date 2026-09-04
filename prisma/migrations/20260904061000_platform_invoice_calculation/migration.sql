ALTER TABLE "PlatformInvoice"
  ADD COLUMN IF NOT EXISTS "calculation" JSONB;
