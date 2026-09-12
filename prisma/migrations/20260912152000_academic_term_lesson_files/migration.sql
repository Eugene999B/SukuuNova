-- Academic term workflow cleanup: term teaching weeks + file-first lesson-plan evidence.
-- Current-term operations derive their period server-side; this migration only extends the existing source of truth.

ALTER TABLE "Term"
  ADD COLUMN IF NOT EXISTS "teachingWeeks" INTEGER NOT NULL DEFAULT 13;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Term_teachingWeeks_check') THEN
    ALTER TABLE "Term"
      ADD CONSTRAINT "Term_teachingWeeks_check" CHECK ("teachingWeeks" BETWEEN 1 AND 30);
  END IF;
END $$;

ALTER TABLE "LessonPlan"
  ADD COLUMN IF NOT EXISTS "weekNumber" INTEGER;

UPDATE "LessonPlan"
SET "weekNumber" = CASE
  WHEN ("documentContent"->>'weekNumber') ~ '^[0-9]+$'
    THEN LEAST(30, GREATEST(1, ("documentContent"->>'weekNumber')::INTEGER))
  ELSE 1
END
WHERE "weekNumber" IS NULL;

ALTER TABLE "LessonPlan"
  ALTER COLUMN "weekNumber" SET DEFAULT 1,
  ALTER COLUMN "weekNumber" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlan_weekNumber_check') THEN
    ALTER TABLE "LessonPlan"
      ADD CONSTRAINT "LessonPlan_weekNumber_check" CHECK ("weekNumber" BETWEEN 1 AND 30);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LessonPlan_school_term_class_subject_week_idx"
  ON "LessonPlan"("schoolId","termId","classId","subjectId","weekNumber");

CREATE TABLE IF NOT EXISTS "LessonPlanAttachment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "lessonPlanId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonPlanAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LessonPlanAttachment_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760),
  CONSTRAINT "LessonPlanAttachment_content_size_check" CHECK (octet_length("content") = "sizeBytes")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LessonPlanAttachment_id_schoolId_key"
  ON "LessonPlanAttachment"("id","schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "LessonPlanAttachment_school_plan_key"
  ON "LessonPlanAttachment"("schoolId","lessonPlanId");
CREATE INDEX IF NOT EXISTS "LessonPlanAttachment_school_created_idx"
  ON "LessonPlanAttachment"("schoolId","createdAt" DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlanAttachment_school_fkey') THEN
    ALTER TABLE "LessonPlanAttachment"
      ADD CONSTRAINT "LessonPlanAttachment_school_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlanAttachment_plan_tenant_fkey') THEN
    ALTER TABLE "LessonPlanAttachment"
      ADD CONSTRAINT "LessonPlanAttachment_plan_tenant_fkey"
      FOREIGN KEY ("lessonPlanId","schoolId") REFERENCES "LessonPlan"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "LessonPlanAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LessonPlanAttachment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "LessonPlanAttachment_tenant" ON "LessonPlanAttachment";
CREATE POLICY "LessonPlanAttachment_tenant" ON "LessonPlanAttachment"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());
