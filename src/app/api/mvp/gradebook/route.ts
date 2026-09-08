import { NextResponse } from "next/server";
import { ForbiddenError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { clearScore, createAssessment, enterScore } from "@/lib/gradebook-service";
import { visibleStudents } from "@/lib/sis-service";
import { getAcademicEngineConfig, getClassSubjectPerformance } from "@/lib/academic-engine";
import { z } from "zod";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assessment"), termId: z.string().min(1).max(100), classId: z.string().min(1).max(100), subjectId: z.string().min(1).max(100), name: z.string().trim().min(1).max(160), type: z.string().trim().min(1).max(40), weight: z.number().finite().positive().max(100), maxScore: z.number().finite().positive().max(1_000_000) }),
  z.object({ action: z.literal("score"), studentId: z.string().min(1).max(100), assessmentId: z.string().min(1).max(100), value: z.number().finite().nonnegative().max(1_000_000), status: z.enum(["present", "absent", "excused"]).optional() }),
  z.object({ action: z.literal("clearScore"), studentId: z.string().min(1).max(100), assessmentId: z.string().min(1).max(100) })
]);

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const classId = url.searchParams.get("classId");
    const subjectId = url.searchParams.get("subjectId");
    const termId = url.searchParams.get("termId");
    const result = await withTenant(session.schoolId, async (tx) => {
      const [canWriteAll, canWriteAssigned] = await Promise.all([
        hasPermission(tx, session.userId, "scores:write:all"),
        hasPermission(tx, session.userId, "scores:write:assigned")
      ]);
      if (!canWriteAll && !canWriteAssigned) throw new ForbiddenError("You do not have gradebook access.");

      const visible = await visibleStudents(tx, session.userId);
      const requestedClass = classId;
      const classTeacher = requestedClass ? await tx.class.findFirst({ where: { id: requestedClass, schoolId: session.schoolId, classTeacherId: session.userId }, select: { id: true } }) : null;
      if (!canWriteAll && !requestedClass) throw new ForbiddenError("Choose a class before viewing an assigned gradebook.");
      if (!canWriteAll && requestedClass) {
        const allowedClassIds = new Set(visible.filter((row) => row.classId).map((row) => row.classId as string));
        if (!allowedClassIds.has(requestedClass)) throw new ForbiddenError("You do not have gradebook access for this class.");
        if (!subjectId && !classTeacher) throw new ForbiddenError("Subject is required for assigned subject teachers.");
      }
      if (requestedClass && subjectId && !canWriteAll) {
        const assignment = await tx.classSubjectTeacher.findFirst({ where: { schoolId: session.schoolId, classId: requestedClass, subjectId, teacherId: session.userId }, select: { classId: true } });
        if (!assignment && !classTeacher) throw new ForbiddenError("You do not have gradebook access for this class and subject.");
      }
      const students = classId ? visible.filter((row) => row.classId === classId) : visible;
      const studentIds = students.map((row) => row.id);
      const classIds = [...new Set(students.flatMap((row) => row.classId ? [row.classId] : []))];
      if (!studentIds.length && classId) throw new ForbiddenError("No learners in the requested gradebook context are visible to this account.");
      const [config, assessments, scores, performance] = await Promise.all([
        getAcademicEngineConfig(tx),
        tx.assessment.findMany({ where: { schoolId: session.schoolId, classId: classId ? classId : { in: classIds }, ...(subjectId ? { subjectId } : {}), ...(termId ? { termId } : {}) }, include: { subject: true, class: true, term: true }, orderBy: [{ classId: "asc" }, { subjectId: "asc" }, { name: "asc" }] }),
        tx.score.findMany({ where: { schoolId: session.schoolId, studentId: { in: studentIds }, ...(subjectId ? { subjectId } : {}), ...(termId ? { assessment: { termId } } : {}) } }),
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
    const result = await withTenant<unknown>(session.schoolId, async (tx) => {
      const common = { schoolId: session.schoolId, actorId: session.userId };
      if (input.action === "assessment") return createAssessment(tx, { ...common, ...input });
      if (input.action === "clearScore") return clearScore(tx, { ...common, ...input });
      return enterScore(tx, { ...common, ...input });
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}