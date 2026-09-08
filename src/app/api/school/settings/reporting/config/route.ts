import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { parseJson } from "@/lib/http";

const schema = z.object({
  classAssessmentWeight: z.number().min(0).max(100), examWeight: z.number().min(0).max(100),
  classAssessmentTypes: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  examTypes: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  rounding: z.enum(["nearest", "down", "up"]), missingScorePolicy: z.enum(["blank", "zero"]),
  showStudentPhoto: z.boolean(), showOverallPosition: z.boolean(), showSubjectPosition: z.boolean(), showAttendance: z.boolean(), showPromotion: z.boolean(), showClassTeacherRemark: z.boolean(), showHeadteacherRemark: z.boolean(),
  signatureSlots: z.array(z.object({ role: z.string().trim().min(1).max(80), name: z.string().trim().max(160), signatureDataUrl: z.string().max(250000).optional().or(z.literal("")) })).max(6),
}).superRefine((value, ctx) => { if (Math.abs(value.classAssessmentWeight + value.examWeight - 100) > 0.001) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Class assessment and examination weights must total 100%." }); });

function buildCategories(input: z.infer<typeof schema>) {
  const classWeight = input.classAssessmentWeight / input.classAssessmentTypes.length;
  const examWeight = input.examWeight / input.examTypes.length;
  return [
    ...input.classAssessmentTypes.map((name) => ({ name, weight: classWeight })),
    ...input.examTypes.map((name) => ({ name, weight: examWeight })),
  ];
}

type JsonObject = Record<string, Prisma.JsonValue>;
function asObject(value: Prisma.JsonValue | null | undefined): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const settings = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { gradeCaWeight: true, gradeExamWeight: true, reportCardConfig: true, assessmentConfig: true } });
      if (!settings) throw new AppError("School settings are not configured.", 404, "SETTINGS_NOT_FOUND");
      const raw = asObject(settings.reportCardConfig);
      const assessmentRaw = asObject(settings.assessmentConfig);
      const classTypes = Array.isArray(raw.classAssessmentTypes) ? raw.classAssessmentTypes : ["Exercise", "Homework", "Participation", "Quiz", "Project", "Classwork"];
      const examTypes = Array.isArray(raw.examTypes) ? raw.examTypes : ["Exam", "Examination"];
      // Older rows may not contain the aggregate values in reportCardConfig.
      // Preserve explicit legacy weights rather than guessing from arbitrary
      // display labels such as "Final" or "Summative".
      const fallbackCa = Number(settings.gradeCaWeight ?? 30);
      const fallbackExam = Number(settings.gradeExamWeight ?? 70);
      const assessmentRounding = assessmentRaw.rounding;
      return new Response(JSON.stringify({
        classAssessmentWeight: Number(raw.classAssessmentWeight ?? fallbackCa),
        examWeight: Number(raw.examWeight ?? fallbackExam),
        classAssessmentTypes: classTypes,
        examTypes,
        rounding: raw.rounding === "down" || raw.rounding === "up" ? raw.rounding : assessmentRounding === "nearest" || assessmentRounding === "down" || assessmentRounding === "up" ? assessmentRounding : "nearest",
        missingScorePolicy: raw.missingScorePolicy === "zero" || assessmentRaw.missingScorePolicy === "zero" ? "zero" : "blank",
        showStudentPhoto: raw.showStudentPhoto !== false, showOverallPosition: raw.showOverallPosition !== false, showSubjectPosition: raw.showSubjectPosition !== false, showAttendance: raw.showAttendance !== false, showPromotion: raw.showPromotion !== false, showClassTeacherRemark: raw.showClassTeacherRemark !== false, showHeadteacherRemark: raw.showHeadteacherRemark !== false,
        signatureSlots: Array.isArray(raw.signatureSlots) ? raw.signatureSlots : [],
      }), { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const current = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { reportCardConfig: true, assessmentConfig: true } });
      if (!current) throw new AppError("School settings are not configured.", 404, "SETTINGS_NOT_FOUND");
      const existingAssessment = asObject(current.assessmentConfig);
      const assessmentConfig = { ...existingAssessment, categories: buildCategories(input), rounding: input.rounding, missingScorePolicy: input.missingScorePolicy };
      await tx.schoolSettings.update({ where: { schoolId: session.schoolId }, data: { reportCardConfig: input, assessmentConfig, gradeCaWeight: new Prisma.Decimal(input.classAssessmentWeight), gradeExamWeight: new Prisma.Decimal(input.examWeight) } });
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "settings.report_card_configuration_updated", entityType: "SchoolSettings", entityId: session.schoolId, before: { reportCardConfig: current.reportCardConfig, assessmentConfig: current.assessmentConfig }, after: { reportCardConfig: input, assessmentConfig } });
      return NextResponse.json({ ok: true, reportCardConfig: input, assessmentConfig });
    });
  } catch (error) { return routeError(error); }
}