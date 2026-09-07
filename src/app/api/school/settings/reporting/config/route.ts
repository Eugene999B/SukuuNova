import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError, AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

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

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const settings = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { gradeCaWeight: true, gradeExamWeight: true, reportCardConfig: true, assessmentConfig: true } });
      if (!settings) throw new AppError("School settings are not configured.", 404, "SETTINGS_NOT_FOUND");
      const raw = settings.reportCardConfig && typeof settings.reportCardConfig === "object" && !Array.isArray(settings.reportCardConfig) ? settings.reportCardConfig as Record<string, unknown> : {};
      const assessmentRaw = settings.assessmentConfig && typeof settings.assessmentConfig === "object" && !Array.isArray(settings.assessmentConfig) ? settings.assessmentConfig as Record<string, unknown> : {};
      const categories = Array.isArray(assessmentRaw.categories) ? assessmentRaw.categories : [];
      const classTypes = Array.isArray(raw.classAssessmentTypes) ? raw.classAssessmentTypes : ["Exercise", "Homework", "Participation", "Quiz", "Project", "Classwork"];
      const examTypes = Array.isArray(raw.examTypes) ? raw.examTypes : ["Exam", "Examination"];
      const fallbackCa = Number(settings.gradeCaWeight ?? 30);
      const fallbackExam = Number(settings.gradeExamWeight ?? 70);
      const categoryWeight = (predicate: (name: string) => boolean) => categories.filter((c) => c && typeof c === "object" && !Array.isArray(c) && predicate(String((c as Record<string, unknown>).name ?? ""))).reduce((sum, c) => sum + Number((c as Record<string, unknown>).weight ?? 0), 0);
      const canonicalCa = categoryWeight((name) => !/exam|examination/i.test(name));
      const canonicalExam = categoryWeight((name) => /exam|examination/i.test(name));
      return new Response(JSON.stringify({
        classAssessmentWeight: Number(raw.classAssessmentWeight ?? (categories.length ? canonicalCa : fallbackCa)),
        examWeight: Number(raw.examWeight ?? (categories.length ? canonicalExam : fallbackExam)),
        classAssessmentTypes: classTypes,
        examTypes,
        rounding: raw.rounding === "down" || raw.rounding === "up" ? raw.rounding : typeof assessmentRaw.rounding === "string" ? assessmentRaw.rounding : "nearest",
        missingScorePolicy: raw.missingScorePolicy === "zero" || assessmentRaw.missingScorePolicy === "zero" ? "zero" : "blank",
        showStudentPhoto: raw.showStudentPhoto !== false, showOverallPosition: raw.showOverallPosition !== false, showSubjectPosition: raw.showSubjectPosition !== false, showAttendance: raw.showAttendance !== false, showPromotion: raw.showPromotion !== false, showClassTeacherRemark: raw.showClassTeacherRemark !== false, showHeadteacherRemark: raw.showHeadteacherRemark !== false,
        signatureSlots: Array.isArray(raw.signatureSlots) ? raw.signatureSlots : [],
      }), { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSchoolSession(); const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const current = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { reportCardConfig: true, assessmentConfig: true, gradeCaWeight: true, gradeExamWeight: true } });
      if (!current) throw new AppError("School settings are not configured.", 404, "SETTINGS_NOT_FOUND");
      const existingAssessment = current.assessmentConfig && typeof current.assessmentConfig === "object" && !Array.isArray(current.assessmentConfig) ? current.assessmentConfig as Record<string, unknown> : {};
      const assessmentConfig = {
        ...existingAssessment,
        categories: buildCategories(input),
        rounding: input.rounding,
        missingScorePolicy: input.missingScorePolicy,
      };
      await tx.schoolSettings.update({
        where: { schoolId: session.schoolId },
        data: {
          reportCardConfig: input,
          assessmentConfig,
          // Keep legacy columns synchronized for older screens/readers until
          // they are retired. Calculation paths prefer assessmentConfig.
          gradeCaWeight: new Prisma.Decimal(input.classAssessmentWeight),
          gradeExamWeight: new Prisma.Decimal(input.examWeight),
        },
      });
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "settings.report_card_configuration_updated", entityType: "SchoolSettings", entityId: session.schoolId, before: { reportCardConfig: current.reportCardConfig, assessmentConfig: current.assessmentConfig }, after: { reportCardConfig: input, assessmentConfig } });
      return NextResponse.json({ ok: true, reportCardConfig: input, assessmentConfig });
    });
  } catch (error) { return routeError(error); }
}