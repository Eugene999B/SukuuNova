import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { getAcademicEngineConfig } from "./academic-engine";

export type TermReadinessItem = {
  key: string;
  label: string;
  ok: boolean;
  count: number;
  detail: string;
  href: string;
};

export async function getTermReadiness(tx: TenantDb, schoolId: string, termId: string): Promise<{
  term: { id: string; name: string; startDate: Date; endDate: Date };
  checks: TermReadinessItem[];
  ready: boolean;
}> {
  const term = await tx.term.findUnique({
    where: { id: termId },
    select: { id: true, name: true, startDate: true, endDate: true }
  });
  if (!term) throw new AppError("Term not found.", 404, "TERM_NOT_FOUND");

  const [students, classes, assignments, assessments, scores, reports, config] = await Promise.all([
    tx.student.findMany({ where: { status: "active" }, select: { id: true, classId: true } }),
    tx.class.findMany({ select: { id: true, name: true } }),
    tx.classSubjectTeacher.findMany({ select: { classId: true, subjectId: true, teacherId: true } }),
    tx.assessment.findMany({ where: { termId }, select: { id: true, classId: true, subjectId: true, name: true, maxScore: true } }),
    tx.score.findMany({ where: { assessment: { termId } }, select: { studentId: true, assessmentId: true } }),
    tx.reportCard.findMany({ where: { termId }, select: { studentId: true, status: true } }),
    getAcademicEngineConfig(tx)
  ]);

  const checks: TermReadinessItem[] = [];
  const activeStudents = students.filter((student) => Boolean(student.classId));
  const unplacedStudents = students.filter((student) => !student.classId);
  checks.push({ key: "students", label: "Student class placement", ok: unplacedStudents.length === 0, count: unplacedStudents.length, detail: unplacedStudents.length ? `${unplacedStudents.length} active student(s) still need a class.` : `${activeStudents.length} active students have class placement.`, href: "/school/students" });

  const classesWithoutTeachers = classes.filter((c) => !assignments.some((a) => a.classId === c.id));
  checks.push({ key: "assignments", label: "Teaching assignments", ok: classesWithoutTeachers.length === 0, count: classesWithoutTeachers.length, detail: classesWithoutTeachers.length ? `${classesWithoutTeachers.length} class(es) have no subject-teacher assignment.` : `${assignments.length} class-subject-teacher links are configured.`, href: "/school/subjects" });

  const scoredKeys = new Set(scores.map((score) => `${score.studentId}:${score.assessmentId}`));
  const expectedScoreSlots = activeStudents.reduce((sum, student) => sum + assessments.filter((assessment) => activeStudents.some((s) => s.id === student.id && s.classId === assessment.classId)).length, 0);
  const missingScoreSlots = Math.max(0, expectedScoreSlots - scores.length);
  checks.push({ key: "scores", label: "Assessment marks", ok: missingScoreSlots === 0 || assessments.length === 0, count: missingScoreSlots, detail: assessments.length === 0 ? "No assessments exist for this term yet." : missingScoreSlots ? `${missingScoreSlots} student-assessment mark slot(s) are still empty.` : "All expected assessment slots have marks.", href: "/school/gradebook/studio" });

  const weightTotal = (config.assessment.categories ?? []).reduce((sum, category) => sum + Number(category.weight), 0);
  checks.push({ key: "weights", label: "Assessment weighting", ok: Math.abs(weightTotal - 100) < 0.01, count: Number(weightTotal), detail: `Configured assessment categories total ${weightTotal}%.`, href: "/school/academics/setup" });

  const submittedStudents = new Set(reports.filter((report) => report.status === "approved" || report.status === "sent").map((report) => report.studentId));
  const pendingReports = activeStudents.filter((student) => !submittedStudents.has(student.id)).length;
  checks.push({ key: "reports", label: "Report-card completion", ok: pendingReports === 0 || assessments.length === 0, count: pendingReports, detail: assessments.length === 0 ? "Reports are not ready because the term has no assessments." : pendingReports ? `${pendingReports} active student(s) do not yet have an approved report card.` : "Every active student has an approved or released report.", href: "/school/report-cards" });

  return { term, checks, ready: checks.every((check) => check.ok) };
}
