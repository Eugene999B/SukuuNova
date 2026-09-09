CREATE TABLE IF NOT EXISTS "TeacherAcademicAttemptHistory" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "workId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "startedAt" TIMESTAMPTZ,
  "submittedAt" TIMESTAMPTZ,
  "status" TEXT NOT NULL,
  "totalAwarded" DECIMAL(12,2),
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMPTZ,
  "reviewNotes" TEXT,
  "answers" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TeacherAcademicAttemptHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicAttemptHistory_id_schoolId_key"
  ON "TeacherAcademicAttemptHistory"("id", "schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicAttemptHistory_work_student_attempt_key"
  ON "TeacherAcademicAttemptHistory"("workId", "studentId", "attemptNumber");
CREATE INDEX IF NOT EXISTS "TeacherAcademicAttemptHistory_student_work_idx"
  ON "TeacherAcademicAttemptHistory"("schoolId", "studentId", "workId", "attemptNumber" DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherAcademicAttemptHistory_school_fkey') THEN
    ALTER TABLE "TeacherAcademicAttemptHistory"
      ADD CONSTRAINT "TeacherAcademicAttemptHistory_school_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherAcademicAttemptHistory_work_tenant_fkey') THEN
    ALTER TABLE "TeacherAcademicAttemptHistory"
      ADD CONSTRAINT "TeacherAcademicAttemptHistory_work_tenant_fkey"
      FOREIGN KEY ("workId", "schoolId") REFERENCES "TeacherAcademicWork"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherAcademicAttemptHistory_student_tenant_fkey') THEN
    ALTER TABLE "TeacherAcademicAttemptHistory"
      ADD CONSTRAINT "TeacherAcademicAttemptHistory_student_tenant_fkey"
      FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherAcademicAttemptHistory_reviewer_tenant_fkey') THEN
    ALTER TABLE "TeacherAcademicAttemptHistory"
      ADD CONSTRAINT "TeacherAcademicAttemptHistory_reviewer_tenant_fkey"
      FOREIGN KEY ("reviewedBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherAcademicAttemptHistory_attempt_number_check') THEN
    ALTER TABLE "TeacherAcademicAttemptHistory"
      ADD CONSTRAINT "TeacherAcademicAttemptHistory_attempt_number_check" CHECK ("attemptNumber" >= 1);
  END IF;
END $$;

ALTER TABLE "TeacherAcademicAttemptHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherAcademicAttemptHistory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "TeacherAcademicAttemptHistory_tenant" ON "TeacherAcademicAttemptHistory";
CREATE POLICY "TeacherAcademicAttemptHistory_tenant" ON "TeacherAcademicAttemptHistory"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
