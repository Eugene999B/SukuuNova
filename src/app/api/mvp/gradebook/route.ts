import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { createAssessment, enterScore } from "@/lib/gradebook-service";
import { visibleStudents } from "@/lib/sis-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assessment"), termId: z.string(), classId: z.string(), subjectId: z.string(), name: z.string().min(1), type: z.enum(["ca", "exam"]), weight: z.number().positive(), maxScore: z.number().positive() }),
  z.object({ action: z.literal("score"), studentId: z.string(), assessmentId: z.string(), value: z.number().nonnegative() })
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      const students = await visibleStudents(tx, session.userId);
      const studentIds = students.map((row) => row.id);
      const classIds = [...new Set(students.flatMap((row) => row.classId ? [row.classId] : []))];
      const assessments = await tx.assessment.findMany({
        where: { classId: { in: classIds } },
        include: { subject: true, class: true, term: true }
      });
      const scores = await tx.score.findMany({ where: { studentId: { in: studentIds } } });
      return { students, assessments, scores };
    });
    return NextResponse.json(result);
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant(session.schoolId, (tx) =>
      input.action === "assessment"
        ? createAssessment(tx, { schoolId: session.schoolId, actorId: session.userId, ...input })
        : enterScore(tx, { schoolId: session.schoolId, actorId: session.userId, ...input })
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
