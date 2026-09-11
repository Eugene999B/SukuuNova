import type { TenantDb } from "./db";
import { calculateSubjectResult, gradeForPercentage, rankTotals, type AssessmentRules } from "./assessment-engine";
import { resolveTermRoster } from "./student-term-context";

export type PerformanceRow = {
  studentId: string;
  studentName: string;
  admissionNo: string;
  total: number | null;
  grade: string | null;
  position: number | null;
  complete: boolean;
};

type RankingInput = {
  classId: string;
  subjectId: string;
  termId: string;
  rules: AssessmentRules;
  scope?: "class" | "year_group";
};

export async function getClassSubjectIntelligence(tx: TenantDb, input: RankingInput) {
  const anchorClass = await tx.class.findUnique({ where: { id: input.classId }, select: { id: true, schoolId: true, level: true } });
  if (!anchorClass) return emptyResult(input);

  const classIds = input.scope === "year_group" && anchorClass.level
    ? (await tx.class.findMany({ where: { schoolId: anchorClass.schoolId, level: anchorClass.level }, select: { id: true } })).map((row) => row.id)
    : [input.classId];

  const [roster, assessments] = await Promise.all([
    resolveTermRoster(tx, { schoolId: anchorClass.schoolId, termId: input.termId }),
    tx.assessment.findMany({
      where: { schoolId: anchorClass.schoolId, classId: { in: classIds }, subjectId: input.subjectId, termId: input.termId },
      select: { id: true, classId: true, name: true, type: true, maxScore: true, weight: true, scores: { select: { studentId: true, value: true, status: true } } },
      orderBy: [{ classId: "asc" }, { name: "asc" }]
    })
  ]);
  const students = roster.filter((student) => student.termClassId && classIds.includes(student.termClassId));

  const rows: PerformanceRow[] = students.map((student) => {
    const studentAssessments = assessments.filter((assessment) => assessment.classId === student.termClassId);
    const result = calculateSubjectResult(
      studentAssessments.map((assessment) => {
        const hit = assessment.scores.find((score) => score.studentId === student.id);
        return {
          id: assessment.id,
          name: assessment.name,
          type: assessment.type,
          maxScore: assessment.maxScore,
          weight: assessment.weight,
          score: hit?.value ?? null,
          status: hit?.status ?? null
        };
      }),
      input.rules
    );
    return {
      studentId: student.id,
      studentName: student.name,
      admissionNo: student.admissionNo,
      total: result.total,
      grade: gradeForPercentage(result.total, input.rules.gradingScale),
      position: null,
      complete: result.complete
    };
  });

  const positions = rankTotals(rows.filter((row) => row.total != null).map((row) => ({ id: row.studentId, name: row.studentName, total: row.total as number })));
  for (const row of rows) row.position = positions.get(row.studentId) ?? null;

  const values = rows.map((row) => row.total).filter((value): value is number => value != null);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const highest = values.length ? Math.max(...values) : null;
  const lowest = values.length ? Math.min(...values) : null;
  const complete = rows.filter((row) => row.complete).length;
  const needsAttention = rows.filter((row) => !row.complete || (row.total != null && row.total < 50));

  return {
    subjectId: input.subjectId,
    classId: input.classId,
    termId: input.termId,
    scope: input.scope ?? "class",
    rows,
    summary: {
      totalStudents: rows.length,
      completeStudents: complete,
      completionRate: rows.length ? Math.round(complete / rows.length * 100) : 100,
      average: average == null ? null : Number(average.toFixed(2)),
      highest,
      lowest,
      needsAttention: needsAttention.map((row) => ({ studentId: row.studentId, studentName: row.studentName, total: row.total, grade: row.grade, complete: row.complete }))
    },
    assessments: assessments.map((assessment) => ({ id: assessment.id, name: assessment.name, type: assessment.type, maxScore: Number(assessment.maxScore), weight: Number(assessment.weight) }))
  };
}

function emptyResult(input: RankingInput) {
  return {
    subjectId: input.subjectId,
    classId: input.classId,
    termId: input.termId,
    scope: input.scope ?? "class",
    rows: [] as PerformanceRow[],
    summary: { totalStudents: 0, completeStudents: 0, completionRate: 100, average: null, highest: null, lowest: null, needsAttention: [] },
    assessments: [] as Array<{ id: string; name: string; type: string; maxScore: number; weight: number }>
  };
}
