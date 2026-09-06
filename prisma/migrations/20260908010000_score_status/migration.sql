-- Score attendance status: present (default, existing rows), absent (unexcused,
-- counts as zero), excused (approved absence, excluded from averages).
-- Backward compatible: existing rows default to present; no data rewritten.
ALTER TABLE "Score" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'present';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Score_status_check') THEN
    ALTER TABLE "Score" ADD CONSTRAINT "Score_status_check" CHECK ("status" IN ('present', 'absent', 'excused'));
  END IF;
END $$;
