-- Additive restore for learning workflows dropped by 20260831081000 on fresh databases.
-- Backward-compatible: IF NOT EXISTS everywhere, no data loss, no destructive drops.
-- Adds CHECK constraints for status fields and tenant RLS mirroring other school tables.

CREATE TABLE IF NOT EXISTS "Enrollment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "entryType" TEXT NOT NULL DEFAULT 'new',
  "enrollmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startDate" TIMESTAMP(3),
  "guardianVerified" BOOLEAN NOT NULL DEFAULT false,
  "documentsReady" BOOLEAN NOT NULL DEFAULT false,
  "feeReady" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Enrollment_id_schoolId_key" ON "Enrollment"("id","schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "Enrollment_schoolId_studentId_academicYearId_termId_key" ON "Enrollment"("schoolId","studentId","academicYearId","termId");
CREATE INDEX IF NOT EXISTS "Enrollment_schoolId_termId_status_idx" ON "Enrollment"("schoolId","termId","status");
CREATE INDEX IF NOT EXISTS "Enrollment_schoolId_classId_idx" ON "Enrollment"("schoolId","classId");

CREATE TABLE IF NOT EXISTS "LessonPlan" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "termId" TEXT,
  "title" TEXT NOT NULL,
  "objective" TEXT,
  "content" TEXT NOT NULL,
  "plannedDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "reviewerId" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LessonPlan_school_teacher_idx" ON "LessonPlan"("schoolId","teacherId");
CREATE INDEX IF NOT EXISTS "LessonPlan_school_status_idx" ON "LessonPlan"("schoolId","status");
CREATE INDEX IF NOT EXISTS "LessonPlan_school_class_subject_idx" ON "LessonPlan"("schoolId","classId","subjectId");
CREATE INDEX IF NOT EXISTS "LessonPlan_school_planned_idx" ON "LessonPlan"("schoolId","plannedDate");

CREATE TABLE IF NOT EXISTS "Homework" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "termId" TEXT,
  "title" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "points" DECIMAL(10,2),
  "assignmentStatus" TEXT NOT NULL DEFAULT 'draft',
  "reviewStatus" TEXT NOT NULL DEFAULT 'not_reviewed',
  "reviewerId" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Homework_school_teacher_idx" ON "Homework"("schoolId","teacherId");
CREATE INDEX IF NOT EXISTS "Homework_school_status_idx" ON "Homework"("schoolId","assignmentStatus","reviewStatus");
CREATE INDEX IF NOT EXISTS "Homework_school_class_subject_idx" ON "Homework"("schoolId","classId","subjectId");
CREATE INDEX IF NOT EXISTS "Homework_school_due_idx" ON "Homework"("schoolId","dueDate");

-- Foreign keys (only if missing)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Enrollment_school_fkey') THEN
    ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Enrollment_student_fkey') THEN
    ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Enrollment_year_fkey') THEN
    ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_year_fkey" FOREIGN KEY ("academicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Enrollment_term_fkey') THEN
    ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_term_fkey" FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Enrollment_class_fkey') THEN
    ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_class_fkey" FOREIGN KEY ("classId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlan_school_fkey') THEN
    ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlan_teacher_fkey') THEN
    ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_teacher_fkey" FOREIGN KEY ("teacherId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlan_class_fkey') THEN
    ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_class_fkey" FOREIGN KEY ("classId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlan_subject_fkey') THEN
    ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_subject_fkey" FOREIGN KEY ("subjectId","schoolId") REFERENCES "Subject"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Homework_school_fkey') THEN
    ALTER TABLE "Homework" ADD CONSTRAINT "Homework_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Homework_teacher_fkey') THEN
    ALTER TABLE "Homework" ADD CONSTRAINT "Homework_teacher_fkey" FOREIGN KEY ("teacherId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Homework_class_fkey') THEN
    ALTER TABLE "Homework" ADD CONSTRAINT "Homework_class_fkey" FOREIGN KEY ("classId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Homework_subject_fkey') THEN
    ALTER TABLE "Homework" ADD CONSTRAINT "Homework_subject_fkey" FOREIGN KEY ("subjectId","schoolId") REFERENCES "Subject"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Status CHECKs (only if missing)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlan_status_check') THEN
    ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_status_check" CHECK ("status" IN ('draft','submitted','approved','changes_requested','completed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Homework_assignment_check') THEN
    ALTER TABLE "Homework" ADD CONSTRAINT "Homework_assignment_check" CHECK ("assignmentStatus" IN ('draft','assigned','closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Homework_review_check') THEN
    ALTER TABLE "Homework" ADD CONSTRAINT "Homework_review_check" CHECK ("reviewStatus" IN ('not_reviewed','approved','changes_requested'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Enrollment_status_check') THEN
    ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_status_check" CHECK ("status" IN ('draft','ready','confirmed','withdrawn','cancelled'));
  END IF;
END $$;

-- Tenant RLS (mirror other school tables; fail closed when context unset)
ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enrollment_tenant" ON "Enrollment";
CREATE POLICY "Enrollment_tenant" ON "Enrollment" USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "LessonPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LessonPlan" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "LessonPlan_tenant" ON "LessonPlan";
CREATE POLICY "LessonPlan_tenant" ON "LessonPlan" USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "Homework" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Homework" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Homework_tenant" ON "Homework";
CREATE POLICY "Homework_tenant" ON "Homework" USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
