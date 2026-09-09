-- Expand the existing LessonPlan workflow without replacing legacy content.
-- Historical plans keep their current free-text fields; new structured fields are additive.

ALTER TABLE "LessonPlan"
  ADD COLUMN IF NOT EXISTS "topic" TEXT,
  ADD COLUMN IF NOT EXISTS "subTopic" TEXT,
  ADD COLUMN IF NOT EXISTS "curriculumObjective" TEXT,
  ADD COLUMN IF NOT EXISTS "learningOutcomes" TEXT,
  ADD COLUMN IF NOT EXISTS "priorKnowledge" TEXT,
  ADD COLUMN IF NOT EXISTS "materials" TEXT,
  ADD COLUMN IF NOT EXISTS "introduction" TEXT,
  ADD COLUMN IF NOT EXISTS "development" TEXT,
  ADD COLUMN IF NOT EXISTS "differentiatedActivities" TEXT,
  ADD COLUMN IF NOT EXISTS "assessment" TEXT,
  ADD COLUMN IF NOT EXISTS "conclusion" TEXT,
  ADD COLUMN IF NOT EXISTS "homework" TEXT,
  ADD COLUMN IF NOT EXISTS "reflection" TEXT,
  ADD COLUMN IF NOT EXISTS "resources" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "LessonPlan_id_schoolId_key"
  ON "LessonPlan"("id","schoolId");
CREATE INDEX IF NOT EXISTS "LessonPlan_school_submitted_idx"
  ON "LessonPlan"("schoolId","submittedAt");
CREATE INDEX IF NOT EXISTS "LessonPlan_school_completed_idx"
  ON "LessonPlan"("schoolId","completedAt");

-- Preserve valid legacy rows while extending the lifecycle with a final archive state.
ALTER TABLE "LessonPlan" DROP CONSTRAINT IF EXISTS "LessonPlan_status_check";
ALTER TABLE "LessonPlan"
  ADD CONSTRAINT "LessonPlan_status_check"
  CHECK ("status" IN ('draft','submitted','approved','changes_requested','completed','archived'));

CREATE TABLE IF NOT EXISTS "LessonPlanReview" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "lessonPlanId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reasonCode" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonPlanReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LessonPlanReview_decision_check" CHECK ("decision" IN ('approved','changes_requested')),
  CONSTRAINT "LessonPlanReview_reason_check" CHECK ("reasonCode" IS NULL OR "reasonCode" IN ('curriculum_alignment','learning_outcomes','assessment','differentiation','resources','clarity','timing','other'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "LessonPlanReview_id_schoolId_key"
  ON "LessonPlanReview"("id","schoolId");
CREATE INDEX IF NOT EXISTS "LessonPlanReview_school_plan_created_idx"
  ON "LessonPlanReview"("schoolId","lessonPlanId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "LessonPlanReview_school_reason_created_idx"
  ON "LessonPlanReview"("schoolId","reasonCode","createdAt" DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlanReview_school_fkey') THEN
    ALTER TABLE "LessonPlanReview"
      ADD CONSTRAINT "LessonPlanReview_school_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlanReview_plan_tenant_fkey') THEN
    ALTER TABLE "LessonPlanReview"
      ADD CONSTRAINT "LessonPlanReview_plan_tenant_fkey"
      FOREIGN KEY ("lessonPlanId","schoolId") REFERENCES "LessonPlan"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlanReview_reviewer_tenant_fkey') THEN
    ALTER TABLE "LessonPlanReview"
      ADD CONSTRAINT "LessonPlanReview_reviewer_tenant_fkey"
      FOREIGN KEY ("reviewerId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "LessonPlanReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LessonPlanReview" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "LessonPlanReview_tenant" ON "LessonPlanReview";
CREATE POLICY "LessonPlanReview_tenant" ON "LessonPlanReview"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
