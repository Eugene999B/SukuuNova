ALTER TABLE "PlatformAdminMeta"
  ADD COLUMN IF NOT EXISTS "preferences" JSONB NOT NULL DEFAULT '{}'::jsonb;
