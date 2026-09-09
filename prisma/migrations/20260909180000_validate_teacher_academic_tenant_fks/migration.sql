-- Historical rows were intentionally left unscanned when the same-school foreign keys
-- were introduced. Validate them now without rewriting or deleting any academic data.
-- If a legacy cross-school relationship exists, deployment stops on the exact
-- constraint so the row can be investigated explicitly.

ALTER TABLE "TeacherAcademicWork"
  VALIDATE CONSTRAINT "TeacherAcademicWork_termId_tenant_fkey";
ALTER TABLE "TeacherAcademicWork"
  VALIDATE CONSTRAINT "TeacherAcademicWork_classId_tenant_fkey";
ALTER TABLE "TeacherAcademicWork"
  VALIDATE CONSTRAINT "TeacherAcademicWork_subjectId_tenant_fkey";
ALTER TABLE "TeacherAcademicWork"
  VALIDATE CONSTRAINT "TeacherAcademicWork_teacherId_tenant_fkey";

ALTER TABLE "TeacherAcademicQuestion"
  VALIDATE CONSTRAINT "TeacherAcademicQuestion_workId_tenant_fkey";

ALTER TABLE "TeacherAcademicSubmission"
  VALIDATE CONSTRAINT "TeacherAcademicSubmission_workId_tenant_fkey";
ALTER TABLE "TeacherAcademicSubmission"
  VALIDATE CONSTRAINT "TeacherAcademicSubmission_studentId_tenant_fkey";

ALTER TABLE "TeacherAcademicAnswer"
  VALIDATE CONSTRAINT "TeacherAcademicAnswer_submissionId_tenant_fkey";
ALTER TABLE "TeacherAcademicAnswer"
  VALIDATE CONSTRAINT "TeacherAcademicAnswer_questionId_tenant_fkey";

ALTER TABLE "TeacherAcademicNote"
  VALIDATE CONSTRAINT "TeacherAcademicNote_termId_tenant_fkey";
ALTER TABLE "TeacherAcademicNote"
  VALIDATE CONSTRAINT "TeacherAcademicNote_classId_tenant_fkey";
ALTER TABLE "TeacherAcademicNote"
  VALIDATE CONSTRAINT "TeacherAcademicNote_subjectId_tenant_fkey";
ALTER TABLE "TeacherAcademicNote"
  VALIDATE CONSTRAINT "TeacherAcademicNote_teacherId_tenant_fkey";
