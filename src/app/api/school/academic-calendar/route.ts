import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import {
  createAcademicYearPlan,
  getAcademicCalendarState,
  getTermClosingReadiness,
  lockPlannedTerm,
  overrideSchoolCalendarDay,
  refreshAcademicCalendarDays,
  startTermClosing,
  validateTermClosing,
} from "@/lib/academic-calendar-service";
import { confirmClassTeacherPromotionDecision } from "@/lib/class-teacher-service";

const dateValue = z.union([z.string().min(8), z.date()]);
const sessionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sequence: z.number().int().positive(),
  startDate: dateValue,
  endDate: dateValue,
  teachingWeeks: z.number().int().min(1).max(30),
  isYearEnd: z.boolean().optional(),
  teacherMarksCloseAt: dateValue.nullable().optional(),
  classTeacherReviewCloseAt: dateValue.nullable().optional(),
  reportApprovalAt: dateValue.nullable().optional(),
  reportReleaseAt: dateValue.nullable().optional(),
  lockTargetAt: dateValue.nullable().optional(),
});
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createYearPlan"), name: z.string().trim().min(3).max(80), startDate: dateValue, endDate: dateValue, patternKey: z.enum(["three_terms","two_semesters","three_trimesters","four_quarters","custom"]), sessions: z.array(sessionSchema).min(1).max(12) }),
  z.object({ action: z.literal("refreshCalendar"), academicYearId: z.string().min(1) }),
  z.object({ action: z.literal("overrideDay"), academicYearId: z.string().min(1), calendarDate: dateValue, dayType: z.enum(["instructional","weekend","vacation","public_holiday","mid_term_break","staff_only","exam","closure","makeup","special"]), label: z.string().trim().max(120).nullable().optional(), note: z.string().trim().max(500).nullable().optional(), isInstructional: z.boolean().optional(), affectsAttendance: z.boolean().optional(), affectsTransport: z.boolean().optional() }),
  z.object({ action: z.literal("startClosing"), termId: z.string().min(1) }),
  z.object({ action: z.literal("validateClosing"), termId: z.string().min(1) }),
  z.object({ action: z.literal("lockTerm"), termId: z.string().min(1) }),
  z.object({ action: z.literal("confirmPromotion"), decisionId: z.string().min(1), targetAcademicYearId: z.string().min(1).nullable().optional() }),
]);

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const termId = url.searchParams.get("termId");
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "calendar:manage");
      const [state, reviewDrafts] = await Promise.all([
        getAcademicCalendarState(tx, session.schoolId),
        tx.$queryRawUnsafe<Array<{ id: string; studentId: string; outcome: string; reason: string | null; sourceAcademicYearId: string; studentName: string; admissionNo: string; targetGradeName: string | null; targetPathwayName: string | null }>>(
          `SELECT d."id",d."studentId",d."outcome",d."reason",d."sourceAcademicYearId",s."name" AS "studentName",s."admissionNo",g."name" AS "targetGradeName",p."name" AS "targetPathwayName"
             FROM "PromotionDecision" d
             JOIN "Student" s ON s."id"=d."studentId" AND s."schoolId"=d."schoolId"
             LEFT JOIN "GradeLevel" g ON g."id"=d."targetGradeLevelId" AND g."schoolId"=d."schoolId"
             LEFT JOIN "AcademicPathway" p ON p."id"=d."targetPathwayId" AND p."schoolId"=d."schoolId"
            WHERE d."schoolId"=$1 AND d."status"='draft' ORDER BY d."updatedAt",s."name"`, session.schoolId),
      ]);
      const readiness = termId ? await getTermClosingReadiness(tx, session.schoolId, termId) : null;
      return { ...state, readiness, reviewDrafts };
    });
    return NextResponse.json(result);
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "calendar:manage");
      if (input.action === "createYearPlan") {
        await requirePermission(tx, session.userId, "settings:manage_school");
        return createAcademicYearPlan(tx, {
          schoolId: session.schoolId,
          actorId: session.userId,
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
          patternKey: input.patternKey,
          sessions: input.sessions,
        });
      }
      if (input.action === "refreshCalendar") return refreshAcademicCalendarDays(tx, { schoolId: session.schoolId, academicYearId: input.academicYearId });
      if (input.action === "overrideDay") return overrideSchoolCalendarDay(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        academicYearId: input.academicYearId,
        calendarDate: input.calendarDate,
        dayType: input.dayType,
        label: input.label,
        note: input.note,
        isInstructional: input.isInstructional,
        affectsAttendance: input.affectsAttendance,
        affectsTransport: input.affectsTransport,
      });
      if (input.action === "startClosing") return startTermClosing(tx, { schoolId: session.schoolId, actorId: session.userId, termId: input.termId });
      if (input.action === "validateClosing") return validateTermClosing(tx, { schoolId: session.schoolId, actorId: session.userId, termId: input.termId });
      if (input.action === "lockTerm") return lockPlannedTerm(tx, { schoolId: session.schoolId, actorId: session.userId, termId: input.termId });
      return confirmClassTeacherPromotionDecision(tx, { schoolId: session.schoolId, actorId: session.userId, decisionId: input.decisionId, targetAcademicYearId: input.targetAcademicYearId });
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
