-- Nullable for existing work. Link lazily inside the tenant transaction without rewriting history.
ALTER TABLE "TeacherAcademicWork" ADD COLUMN "assessmentId" TEXT;
ALTER TABLE "TeacherAcademicWork" ADD CONSTRAINT "TeacherAcademicWork_assessment_tenant_fkey"
  FOREIGN KEY ("assessmentId", "schoolId") REFERENCES "Assessment"("id", "schoolId");
CREATE UNIQUE INDEX "TeacherAcademicWork_assessmentId_key" ON "TeacherAcademicWork"("assessmentId");
