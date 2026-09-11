import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { resolveTermRoster } from "@/lib/student-term-context";

const query = z.object({ termId: z.string().min(1) });

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const { termId } = query.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const result = await withTenant(session.schoolId, async (tx) => {
      const [term, classes, students, assignments, assessments, reports, config] = await Promise.all([
        tx.term.findFirst({ where: { id: termId, schoolId: session.schoolId }, select: { id: true, name: true, startDate: true, endDate: true } }),
        tx.class.findMany({ where: { schoolId: session.schoolId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        resolveTermRoster(tx, { schoolId: session.schoolId, termId }),
        tx.classSubjectTeacher.findMany({ where: { schoolId: session.schoolId }, select: { classId: true, subjectId: true, teacherId: true } }),
        tx.assessment.findMany({ where: { schoolId: session.schoolId, termId }, select: { id: true, classId: true, subjectId: true } }),
        tx.reportCard.findMany({ where: { schoolId: session.schoolId, termId }, select: { studentId: true, status: true } }),
        getAcademicEngineConfig(tx, session.schoolId),
      ]);
      if (!term) return null;

      const assessmentIds = assessments.map((assessment) => assessment.id);
      const scores = assessmentIds.length
        ? await tx.score.findMany({ where: { schoolId: session.schoolId, assessmentId: { in: assessmentIds }, status: { not: "excused" } }, select: { assessmentId: true, studentId: true } })
        : [];

      const activeStudentIdsByClass = new Map<string, number>();
      for (const student of students) {
        if (student.termClassId) activeStudentIdsByClass.set(student.termClassId, (activeStudentIdsByClass.get(student.termClassId) ?? 0) + 1);
      }

      const scoreKeys = new Set(scores.map((score) => `${score.studentId}:${score.assessmentId}`));
      const missingScores: Array<{ classId: string; count: number }> = [];
      for (const schoolClass of classes) {
        let missing = 0;
        const classAssessments = assessments.filter((assessment) => assessment.classId === schoolClass.id);
        const classStudents = students.filter((student) => student.termClassId === schoolClass.id);
        for (const student of classStudents) {
          for (const assessment of classAssessments) {
            if (!scoreKeys.has(`${student.id}:${assessment.id}`)) missing += 1;
          }
        }
        if (missing > 0) missingScores.push({ classId: schoolClass.id, count: missing });
      }

      const rosterStudents = students.filter((student) => Boolean(student.termClassId));
      const unplacedStudents = students.filter((student) => !student.termClassId).length;
      const approvedStudentIds = new Set(reports.filter((report) => report.status === "approved" || report.status === "sent").map((report) => report.studentId));
      const unpublishedReports = rosterStudents.filter((student) => !approvedStudentIds.has(student.id)).length;

      return {
        term,
        summary: {
          classes: classes.length,
          activeStudents: rosterStudents.length,
          unplacedStudents,
          teachingAssignments: assignments.length,
          assessments: assessments.length,
          scoredEntries: scores.length,
          reportCards: reports.length,
          approvedReports: approvedStudentIds.size,
          missingScoreEntries: missingScores.reduce((sum, row) => sum + row.count, 0),
        },
        blockers: {
          noSubjectTeacherAssignments: classes.filter((schoolClass) => !assignments.some((assignment) => assignment.classId === schoolClass.id)).map((schoolClass) => schoolClass.name),
          missingScores,
          unplacedStudents,
          unpublishedReports,
          assessmentWeightTotal: config.assessment.categories.reduce((sum, category) => sum + Number(category.weight), 0),
        },
        classStudentCounts: Object.fromEntries(activeStudentIdsByClass),
      };
    });
    if (!result) return NextResponse.json({ error: "Term not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
