ALTER TABLE "TeacherAcademicWork"
  ADD COLUMN IF NOT EXISTS "attemptLimit" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "attemptScorePolicy" TEXT NOT NULL DEFAULT 'highest';

ALTER TABLE "TeacherAcademicSubmission"
  ADD COLUMN IF NOT EXISTS "attemptNumber" INTEGER NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS "TeacherAcademicSubmission_work_student_key";
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicSubmission_work_student_attempt_key"
  ON "TeacherAcademicSubmission"("workId", "studentId", "attemptNumber");
CREATE INDEX IF NOT EXISTS "TeacherAcademicSubmission_student_work_attempt_idx"
  ON "TeacherAcademicSubmission"("schoolId", "studentId", "workId", "attemptNumber" DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherAcademicWork_attempt_limit_check') THEN
    ALTER TABLE "TeacherAcademicWork"
      ADD CONSTRAINT "TeacherAcademicWork_attempt_limit_check"
      CHECK ("attemptLimit" BETWEEN 1 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherAcademicWork_attempt_score_policy_check') THEN
    ALTER TABLE "TeacherAcademicWork"
      ADD CONSTRAINT "TeacherAcademicWork_attempt_score_policy_check"
      CHECK ("attemptScorePolicy" IN ('highest', 'latest'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherAcademicSubmission_attempt_number_check') THEN
    ALTER TABLE "TeacherAcademicSubmission"
      ADD CONSTRAINT "TeacherAcademicSubmission_attempt_number_check"
      CHECK ("attemptNumber" >= 1);
  END IF;
END $$;
