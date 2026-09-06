CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicWork_context_week_work_key"
  ON "TeacherAcademicWork"("schoolId","termId","classId","subjectId","weekNumber","workNumber");

CREATE INDEX IF NOT EXISTS "TeacherAcademicSubmission_student_status_idx"
  ON "TeacherAcademicSubmission"("schoolId","studentId","status","updatedAt");

CREATE INDEX IF NOT EXISTS "TeacherAcademicAnswer_question_idx"
  ON "TeacherAcademicAnswer"("schoolId","questionId");

CREATE INDEX IF NOT EXISTS "TeacherAcademicNote_week_idx"
  ON "TeacherAcademicNote"("schoolId","classId","subjectId","termId","weekNumber","status");
