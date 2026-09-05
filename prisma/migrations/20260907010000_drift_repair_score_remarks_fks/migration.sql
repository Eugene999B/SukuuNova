-- Drift repair: columns/FKs present in schema or original migrations but missing
-- from the live migration history after the biometric-device consolidation.
-- All statements are IF NOT EXISTS guarded; safe on populated databases.

-- Score.remarks exists in schema + pre-drop migrations but was dropped by
-- 20260831081000_biometric_devices and never restored.
ALTER TABLE "Score" ADD COLUMN IF NOT EXISTS "remarks" TEXT;

-- Foreign keys from the original learning-workflow migrations that the
-- 20260906000000 restore migration omitted.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Enrollment_createdBy_fkey') THEN
    ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_createdBy_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlan_term_fkey') THEN
    ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_term_fkey" FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Homework_term_fkey') THEN
    ALTER TABLE "Homework" ADD CONSTRAINT "Homework_term_fkey" FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
