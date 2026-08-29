import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { getAcademicEngineConfig } from "@/lib/academic-engine";

const query = z.object({ termId: z.string().min(1) });

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const { termId } = query.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const result = await withTenant(session.schoolId, async (tx) => {
      const [term, classes, students, assignments, assessments, scores, reports, config] = await Promise.all([
        tx.term.findUnique({ where: { id: termId }, select: { id: true, name: true, startDate: true, endDate: true } }),
        tx.class.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        tx.student.findMany({ where: { status: "active" }, select: { id: true, classId: true } }),
        tx.classSubjectTeacher.findMany({ select: { classId: true, subjectId: true, teacherId: true } }),
        tx.assessment.findMany({ where: { termId }, select: { id: true, classId: true, subjectId: true } }),
        tx.score.findMany({ where: { assessmentId: { in: (await tx.assessment.findMany({ where: { termId }, select: { id: true } })).map((a) => a.id) } }, select: { assessmentId: true, studentId: true } }),
        tx.reportCard.findMany({ where: { termId }, select: { studentId: true, status: true } }),
        getAcademicEngineConfig(tx)
      ]);
      if (!term) return null;
      const activeStudentIdsByClass = new Map<string, number>();
      for (const student of students) if (student.classId) activeStudentIdsByClass.set(student.classId, (activeStudentIdsByClass.get(student.classId) ?? 0) + 1);
      const assessmentsByClass = new Map<string, Set<string>>();
      for (const assessment of assessments) {
        const set = assessmentsByClass.get(assessment.classId) ?? new Set<string>();
        set.add(`${assessment.subjectId}:${assessment.id}`);
        assessmentsByClass.set(assessment.classId, set);
      }
      const scoreKeys = new Set(scores.map((s) => `${s.studentId}:${s.assessmentId}`));
      const missingScores: Array<{ classId: string; count: number }> = [];
      for (const cls of classes) {
        let missing = 0;
        const classAssessments = assessments.filter((a) => a.classId === cls.id);
        const classStudents = students.filter((s) => s.classId === cls.id);
        for (const student of classStudents) for (const assessment of classAssessments) if (!scoreKeys.has(`${student.id}:${assessment.id}`)) missing++;
        if (missing > 0) missingScores.push({ classId: cls.id, count: missing });
      }
      return {
        term,
        summary: {
          classes: classes.length,
          activeStudents: students.length,
          teachingAssignments: assignments.length,
          assessments: assessments.length,
          scoredEntries: scores.length,
          reportCards: reports.length,
          approvedReports: reports.filter((r) => r.status === "approved" || r.status === "sent").length,
          missingScoreEntries: missingScores.reduce((sum, row) => sum + row.count, 0)
        },
        blockers: {
          noSubjectTeacherAssignments: classes.filter((c) => !assignments.some((a) => a.classId === c.id)).map((c) => c.name),
          missingScores,
          unpublishedReports: reports.filter((r) => !["approved", "sent"].includes(r.status)).length,
          assessmentWeightTotal: config.assessment.categories.reduce((sum, category) => sum + Number(category.weight), 0)
        },
        classStudentCounts: Object.fromEntries(activeStudentIdsByClass)
      };
    });
    if (!result) return NextResponse.json({ error: "Term not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
