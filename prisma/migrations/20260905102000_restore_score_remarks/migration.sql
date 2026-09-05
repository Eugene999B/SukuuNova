-- Restore the Score remarks field removed by the biometric consolidation migration.
-- Additive and safe: existing score rows are preserved and the column remains nullable.
ALTER TABLE "Score" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
