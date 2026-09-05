-- Timetable venues + report-card promotion cutoff, subject-position toggle, head remark.
-- Additive only: IF NOT EXISTS guards, no drops, safe on populated databases.

ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "showSubjectPosition" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "positionPromotionCutoffPercent" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "headRemark" TEXT;
ALTER TABLE "TimetableSlot" ADD COLUMN IF NOT EXISTS "venue" TEXT;
CREATE INDEX IF NOT EXISTS "TimetableSlot_school_venue_day_period_idx" ON "TimetableSlot"("schoolId", "venue", "dayOfWeek", "period");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SchoolSettings_cutoff_check') THEN
    ALTER TABLE "SchoolSettings" ADD CONSTRAINT "SchoolSettings_cutoff_check" CHECK ("positionPromotionCutoffPercent" >= 1 AND "positionPromotionCutoffPercent" <= 100);
  END IF;
END $$;
