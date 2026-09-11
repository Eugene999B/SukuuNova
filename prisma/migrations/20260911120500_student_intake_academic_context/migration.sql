-- Preserve when a learner actually joined the school without pretending historical
-- academic records existed in SukuuNova before the school began using the system.
CREATE TABLE "StudentAcademicIntake" (
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "admissionDate" TIMESTAMP(3),
  "entryType" TEXT NOT NULL DEFAULT 'New enrollment',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentAcademicIntake_pkey" PRIMARY KEY ("studentId", "schoolId"),
  CONSTRAINT "StudentAcademicIntake_entry_type_check" CHECK ("entryType" IN ('New enrollment','Transfer in','Re-enrollment','Returning learner'))
);

CREATE INDEX "StudentAcademicIntake_school_year_idx" ON "StudentAcademicIntake"("schoolId", "academicYearId");
CREATE INDEX "StudentAcademicIntake_school_admission_idx" ON "StudentAcademicIntake"("schoolId", "admissionDate");

ALTER TABLE "StudentAcademicIntake"
  ADD CONSTRAINT "StudentAcademicIntake_student_fkey"
  FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentAcademicIntake"
  ADD CONSTRAINT "StudentAcademicIntake_year_fkey"
  FOREIGN KEY ("academicYearId", "schoolId") REFERENCES "AcademicYear"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentAcademicIntake"
  ADD CONSTRAINT "StudentAcademicIntake_created_by_fkey"
  FOREIGN KEY ("createdBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentAcademicIntake" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentAcademicIntake" FORCE ROW LEVEL SECURITY;
CREATE POLICY "StudentAcademicIntake_tenant" ON "StudentAcademicIntake"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
