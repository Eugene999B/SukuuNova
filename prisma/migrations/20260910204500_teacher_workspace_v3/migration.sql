-- Teacher Workspace V3: explicit activity windows and structured lesson documents.
-- Both additions are nullable/backwards compatible so existing academic records retain
-- their current meaning and can be upgraded progressively.

ALTER TABLE "TeacherAcademicWork"
  ADD COLUMN IF NOT EXISTS "opensAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "TeacherAcademicWork_window_idx"
  ON "TeacherAcademicWork"("schoolId","status","opensAt","dueAt");

ALTER TABLE "LessonPlan"
  ADD COLUMN IF NOT EXISTS "documentContent" JSONB;

COMMENT ON COLUMN "TeacherAcademicWork"."opensAt" IS
  'Optional earliest time at which a learner may start or continue the activity.';
COMMENT ON COLUMN "LessonPlan"."documentContent" IS
  'Structured block document used by the advanced lesson-note editor. Legacy text fields remain authoritative fallbacks.';
