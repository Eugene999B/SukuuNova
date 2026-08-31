ALTER TABLE "SchoolSettings"
  ADD COLUMN IF NOT EXISTS "showOverallPosition" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "positionScope" TEXT NOT NULL DEFAULT 'class',
  ADD COLUMN IF NOT EXISTS "remarkSource" TEXT NOT NULL DEFAULT 'grade_band',
  ADD COLUMN IF NOT EXISTS "positionBandLabels" JSONB,
  ADD COLUMN IF NOT EXISTS "behaviorRatingFields" JSONB,
  ADD COLUMN IF NOT EXISTS "promotionRule" TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE "SchoolSettings"
  DROP CONSTRAINT IF EXISTS "SchoolSettings_positionScope_check";
ALTER TABLE "SchoolSettings"
  ADD CONSTRAINT "SchoolSettings_positionScope_check"
  CHECK ("positionScope" IN ('class', 'year_group'));

ALTER TABLE "SchoolSettings"
  DROP CONSTRAINT IF EXISTS "SchoolSettings_remarkSource_check";
ALTER TABLE "SchoolSettings"
  ADD CONSTRAINT "SchoolSettings_remarkSource_check"
  CHECK ("remarkSource" IN ('grade_band', 'position_band'));

ALTER TABLE "SchoolSettings"
  DROP CONSTRAINT IF EXISTS "SchoolSettings_promotionRule_check";
ALTER TABLE "SchoolSettings"
  ADD CONSTRAINT "SchoolSettings_promotionRule_check"
  CHECK ("promotionRule" IN ('manual', 'pass_mark', 'overall_position'));
