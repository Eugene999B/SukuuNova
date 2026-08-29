import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { createAssessment, enterScore } from "@/lib/gradebook-service";
import { visibleStudents } from "@/lib/sis-service";
import { getAcademicEngineConfig, getClassSubjectPerformance } from "@/lib/academic-engine";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assessment"), termId: z.string().min(1), classId: z.string().min(1), subjectId: z.string().min(1), name: z.string().trim().min(1), type: z.string().trim().min(1), weight: z.number().positive().max(100), maxScore: z.number().positive() }),
  z.object({ action: z.literal("score"), studentId: z.string().min(1), assessmentId: z.string().min(1), value: z.number().nonnegative() })
]);

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const classId = url.searchParams.get("classId");
    const subjectId = url.searchParams.get("subjectId");
    const termId = url.searchParams.get("termId");
    const result = await withTenant(session.schoolId, async (tx) => {
      const students = await visibleStudents(tx, session.userId);
      const studentIds = students.map((row) => row.id);
      const classIds = [...new Set(students.flatMap((row) => row.classId ? [row.classId] : []))];
      const [config, assessments, scores, performance] = await Promise.all([
        getAcademicEngineConfig(tx),
        tx.assessment.findMany({ where: { classId: classId ? classId : { in: classIds }, ...(subjectId ? { subjectId } : {}), ...(termId ? { termId } : {}) }, include: { subject: true, class: true, term: true }, orderBy: [{ classId: "asc" }, { subjectId: "asc" }, { name: "asc" }] }),
        tx.score.findMany({ where: { studentId: { in: studentIds }, ...(subjectId ? { subjectId } : {}), ...(termId ? { assessment: { termId } } : {}) } }),
        classId && subjectId && termId ? getClassSubjectPerformance(tx, classId, subjectId, termId) : null
      ]);
      return { students, assessments, scores, performance, assessmentRules: config.assessment };
    });
    return NextResponse.json(result);
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant<unknown>(session.schoolId, async (tx) =>
      input.action === "assessment"
        ? await createAssessment(tx, { schoolId: session.schoolId, actorId: session.userId, ...input })
        : await enterScore(tx, { schoolId: session.schoolId, actorId: session.userId, ...input })
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
