ALTER TABLE "Homework"
  ADD COLUMN IF NOT EXISTS "academicWorkId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Homework_school_academicWork_key"
  ON "Homework"("schoolId", "academicWorkId")
  WHERE "academicWorkId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Homework_academic_work_fkey'
  ) THEN
    ALTER TABLE "Homework"
      ADD CONSTRAINT "Homework_academic_work_fkey"
      FOREIGN KEY ("academicWorkId", "schoolId")
      REFERENCES "TeacherAcademicWork"("id", "schoolId")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;
