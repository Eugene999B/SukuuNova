import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError, AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

const schema = z.object({
  classAssessmentWeight: z.number().min(0).max(100),
  examWeight: z.number().min(0).max(100),
  classAssessmentTypes: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  examTypes: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  rounding: z.enum(["nearest", "down", "up"]),
  missingScorePolicy: z.enum(["blank", "zero"]),
  showStudentPhoto: z.boolean(),
  showOverallPosition: z.boolean(),
  showSubjectPosition: z.boolean(),
  showAttendance: z.boolean(),
  showPromotion: z.boolean(),
  showClassTeacherRemark: z.boolean(),
  showHeadteacherRemark: z.boolean(),
  signatureSlots: z.array(z.object({ role: z.string().trim().min(1).max(80), name: z.string().trim().max(160), signatureDataUrl: z.string().max(250000).optional().or(z.literal("")) })).max(6),
}).superRefine((value, ctx) => {
  if (Math.abs(value.classAssessmentWeight + value.examWeight - 100) > 0.001) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Class assessment and examination weights must total 100%." });
  }
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const settings = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { gradeCaWeight: true, gradeExamWeight: true, reportCardConfig: true } });
      if (!settings) throw new AppError("School settings are not configured.", 404, "SETTINGS_NOT_FOUND");
      const raw = settings.reportCardConfig && typeof settings.reportCardConfig === "object" && !Array.isArray(settings.reportCardConfig) ? settings.reportCardConfig as Record<string, unknown> : {};
      return NextResponse.json({
        classAssessmentWeight: Number(raw.classAssessmentWeight ?? settings.gradeCaWeight ?? 30),
        examWeight: Number(raw.examWeight ?? settings.gradeExamWeight ?? 70),
        classAssessmentTypes: Array.isArray(raw.classAssessmentTypes) ? raw.classAssessmentTypes : ["Exercise", "Homework", "Participation", "Quiz", "Project", "Classwork"],
        examTypes: Array.isArray(raw.examTypes) ? raw.examTypes : ["Exam", "Examination"],
        rounding: raw.rounding === "down" || raw.rounding === "up" ? raw.rounding : "nearest",
        missingScorePolicy: raw.missingScorePolicy === "zero" ? "zero" : "blank",
        showStudentPhoto: raw.showStudentPhoto !== false,
        showOverallPosition: raw.showOverallPosition !== false,
        showSubjectPosition: raw.showSubjectPosition !== false,
        showAttendance: raw.showAttendance !== false,
        showPromotion: raw.showPromotion !== false,
        showClassTeacherRemark: raw.showClassTeacherRemark !== false,
        showHeadteacherRemark: raw.showHeadteacherRemark !== false,
        signatureSlots: Array.isArray(raw.signatureSlots) ? raw.signatureSlots : [],
      });
    });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const current = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { reportCardConfig: true } });
      if (!current) throw new AppError("School settings are not configured.", 404, "SETTINGS_NOT_FOUND");
      await tx.schoolSettings.update({ where: { schoolId: session.schoolId }, data: { reportCardConfig: input } });
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "settings.report_card_configuration_updated", entityType: "SchoolSettings", entityId: session.schoolId, before: { reportCardConfig: current.reportCardConfig }, after: { reportCardConfig: input } });
      return NextResponse.json({ ok: true, reportCardConfig: input });
    });
  } catch (error) { return routeError(error); }
}
