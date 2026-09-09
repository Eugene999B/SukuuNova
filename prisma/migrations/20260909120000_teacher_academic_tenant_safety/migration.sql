-- Protect the raw-SQL academic workspace with the same tenant boundary as school records.
ALTER TABLE "TeacherAcademicWork" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherAcademicWork" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teacher_academic_tenant" ON "TeacherAcademicWork"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "TeacherAcademicQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherAcademicQuestion" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teacher_academic_tenant" ON "TeacherAcademicQuestion"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "TeacherAcademicSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherAcademicSubmission" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teacher_academic_tenant" ON "TeacherAcademicSubmission"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "TeacherAcademicAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherAcademicAnswer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teacher_academic_tenant" ON "TeacherAcademicAnswer"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "TeacherAcademicNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherAcademicNote" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teacher_academic_tenant" ON "TeacherAcademicNote"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

-- Enforce same-school relationships for new writes without deleting or rewriting legacy rows.
ALTER TABLE "TeacherAcademicWork" ADD CONSTRAINT "TeacherAcademicWork_termId_tenant_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "Term"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicWork" ADD CONSTRAINT "TeacherAcademicWork_classId_tenant_fkey" FOREIGN KEY ("classId", "schoolId") REFERENCES "Class"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicWork" ADD CONSTRAINT "TeacherAcademicWork_subjectId_tenant_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicWork" ADD CONSTRAINT "TeacherAcademicWork_teacherId_tenant_fkey" FOREIGN KEY ("teacherId", "schoolId") REFERENCES "User"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicQuestion" ADD CONSTRAINT "TeacherAcademicQuestion_workId_tenant_fkey" FOREIGN KEY ("workId", "schoolId") REFERENCES "TeacherAcademicWork"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicSubmission" ADD CONSTRAINT "TeacherAcademicSubmission_workId_tenant_fkey" FOREIGN KEY ("workId", "schoolId") REFERENCES "TeacherAcademicWork"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicSubmission" ADD CONSTRAINT "TeacherAcademicSubmission_studentId_tenant_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicAnswer" ADD CONSTRAINT "TeacherAcademicAnswer_submissionId_tenant_fkey" FOREIGN KEY ("submissionId", "schoolId") REFERENCES "TeacherAcademicSubmission"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicAnswer" ADD CONSTRAINT "TeacherAcademicAnswer_questionId_tenant_fkey" FOREIGN KEY ("questionId", "schoolId") REFERENCES "TeacherAcademicQuestion"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicNote" ADD CONSTRAINT "TeacherAcademicNote_termId_tenant_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "Term"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicNote" ADD CONSTRAINT "TeacherAcademicNote_classId_tenant_fkey" FOREIGN KEY ("classId", "schoolId") REFERENCES "Class"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicNote" ADD CONSTRAINT "TeacherAcademicNote_subjectId_tenant_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") NOT VALID;
ALTER TABLE "TeacherAcademicNote" ADD CONSTRAINT "TeacherAcademicNote_teacherId_tenant_fkey" FOREIGN KEY ("teacherId", "schoolId") REFERENCES "User"("id", "schoolId") NOT VALID;
