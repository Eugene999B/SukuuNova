ALTER TABLE "Term" ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Term_schoolId_isLocked_idx" ON "Term"("schoolId", "isLocked");
