import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { parseJson } from "@/lib/http";
import { readGradeScale } from "@/lib/report-card-intelligence";
import { REPORT_CARD_THEMES, reportCardThemeById } from "@/lib/report-card-themes";
import { mergeReportWorkflowConfig, readReportWorkflowConfig } from "@/lib/report-card-workflow-config";

const gradeBand = z.object({
  min: z.number().min(0).max(100),
  max: z.number().min(0).max(100),
  grade: z.string().trim().min(1).max(12),
  label: z.string().trim().max(80).optional().default(""),
  remark: z.string().trim().max(160).optional().default(""),
});

const schema = z.object({
  classAssessmentWeight: z.number().min(0).max(100),
  examWeight: z.number().min(0).max(100),
  classAssessmentTypes: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  examTypes: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  rounding: z.enum(["nearest", "down", "up"]),
  missingScorePolicy: z.enum(["blank", "zero"]),
  gradingScale: z.array(gradeBand).min(1).max(20),
  themeId: z.string().min(1).max(100),
  showStudentPhoto: z.boolean(),
  showOverallPosition: z.boolean(),
  showSubjectPosition: z.boolean(),
  showAttendance: z.boolean(),
  showPromotion: z.boolean(),
  showClassTeacherRemark: z.boolean(),
  showHeadteacherRemark: z.boolean(),
  signatureSlots: z.array(z.object({ userId: z.string().min(1).max(120), role: z.string().trim().min(1).max(80) })).max(4),
  finalTermNumber: z.number().int().min(1).max(6),
  autoApplyPromotion: z.boolean(),
  classProgression: z.record(z.string().min(1).max(120), z.string().min(1).max(120)),
}).superRefine((value, ctx) => {
  if (Math.abs(value.classAssessmentWeight + value.examWeight - 100) > 0.001) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Class assessment and examination weights must total 100%." });
  }
  const sorted = [...value.gradingScale].sort((a, b) => a.min - b.min);
  if (sorted[0]?.min !== 0 || sorted[sorted.length - 1]?.max !== 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The grading scale must cover the full 0–100 range." });
  }
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current.max < current.min) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Grade ${current.grade} has an invalid range.` });
    const next = sorted[index + 1];
    if (!next) continue;
    if (next.min <= current.max) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Grade ranges ${current.grade} and ${next.grade} overlap.` });
    if (next.min - current.max > 1.01) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `There is a gap between grades ${current.grade} and ${next.grade}.` });
  }
});

function buildCategories(input: z.infer<typeof schema>) {
  const classWeight = input.classAssessmentWeight / input.classAssessmentTypes.length;
  const examWeight = input.examWeight / input.examTypes.length;
  return [
    ...input.classAssessmentTypes.map((name) => ({ name, weight: classWeight })),
    ...input.examTypes.map((name) => ({ name, weight: examWeight })),
  ];
}

type JsonObject = Record<string, Prisma.JsonValue>;
function asObject(value: Prisma.JsonValue | null | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const [settings, staff, classes] = await Promise.all([
        tx.schoolSettings.findUnique({
          where: { schoolId: session.schoolId },
          select: { gradeCaWeight: true, gradeExamWeight: true, gradingScale: true, reportCardTemplateId: true, reportCardConfig: true, assessmentConfig: true },
        }),
        tx.user.findMany({
          where: { schoolId: session.schoolId, status: "active" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, userRoles: { select: { role: { select: { name: true, key: true } } } } },
        }),
        tx.class.findMany({
          where: { schoolId: session.schoolId },
          orderBy: [{ level: "asc" }, { name: "asc" }],
          select: { id: true, name: true, level: true },
        }),
      ]);
      if (!settings) throw new AppError("School settings are not configured.", 404, "SETTINGS_NOT_FOUND");
      const raw = asObject(settings.reportCardConfig);
      const workflow = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
      const assessmentRaw = asObject(settings.assessmentConfig);
      const classTypes = Array.isArray(raw.classAssessmentTypes) ? raw.classAssessmentTypes : ["Exercise", "Homework", "Participation", "Quiz", "Project", "Classwork"];
      const examTypes = Array.isArray(raw.examTypes) ? raw.examTypes : ["Exam", "Examination"];
      const fallbackCa = Number(settings.gradeCaWeight ?? 30);
      const fallbackExam = Number(settings.gradeExamWeight ?? 70);
      const assessmentRounding = assessmentRaw.rounding;
      return NextResponse.json({
        classAssessmentWeight: Number(raw.classAssessmentWeight ?? fallbackCa),
        examWeight: Number(raw.examWeight ?? fallbackExam),
        classAssessmentTypes: classTypes,
        examTypes,
        rounding: raw.rounding === "down" || raw.rounding === "up" ? raw.rounding : assessmentRounding === "nearest" || assessmentRounding === "down" || assessmentRounding === "up" ? assessmentRounding : "nearest",
        missingScorePolicy: raw.missingScorePolicy === "zero" || assessmentRaw.missingScorePolicy === "zero" ? "zero" : "blank",
        gradingScale: readGradeScale(settings.gradingScale),
        ...workflow,
        signatureProfiles: undefined,
        themes: REPORT_CARD_THEMES,
        staff: staff.map((user) => ({ id: user.id, name: user.name, roles: user.userRoles.map((item) => item.role.name), hasSignature: Boolean(workflow.signatureProfiles[user.id]) })),
        classes,
        currentUserId: session.userId,
      }, { headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`report-card-settings:${session.schoolId}`}))`;
      const current = await tx.schoolSettings.findUnique({
        where: { schoolId: session.schoolId },
        select: { reportCardConfig: true, assessmentConfig: true, gradingScale: true, reportCardTemplateId: true },
      });
      if (!current) throw new AppError("School settings are not configured.", 404, "SETTINGS_NOT_FOUND");
      const theme = reportCardThemeById(input.themeId);
      if (theme.id !== input.themeId) throw new AppError("Choose a valid SukuuNova report-card theme.", 400, "INVALID_REPORT_THEME");

      const staffIds = [...new Set(input.signatureSlots.map((slot) => slot.userId))];
      if (staffIds.length) {
        const validUsers = await tx.user.count({ where: { schoolId: session.schoolId, status: "active", id: { in: staffIds } } });
        if (validUsers !== staffIds.length) throw new AppError("One or more selected report signers are not active members of this school.", 400, "INVALID_SIGNER");
      }
      const progressionIds = [...new Set([...Object.keys(input.classProgression), ...Object.values(input.classProgression)])];
      if (progressionIds.some((id) => input.classProgression[id] === id)) throw new AppError("A class cannot promote learners into itself.", 400, "INVALID_CLASS_PROGRESSION");
      if (progressionIds.length) {
        const validClasses = await tx.class.count({ where: { schoolId: session.schoolId, id: { in: progressionIds } } });
        if (validClasses !== progressionIds.length) throw new AppError("Class progression contains a class that does not belong to this school.", 400, "INVALID_CLASS_PROGRESSION");
      }

      const existingAssessment = asObject(current.assessmentConfig);
      const assessmentConfig = { ...existingAssessment, categories: buildCategories(input), rounding: input.rounding, missingScorePolicy: input.missingScorePolicy };
      const workflowCurrent = readReportWorkflowConfig(current.reportCardConfig, current.reportCardTemplateId);
      const workflowNext = {
        ...workflowCurrent,
        themeId: input.themeId,
        showStudentPhoto: input.showStudentPhoto,
        showOverallPosition: input.showOverallPosition,
        showSubjectPosition: input.showSubjectPosition,
        showAttendance: input.showAttendance,
        showPromotion: input.showPromotion,
        showClassTeacherRemark: input.showClassTeacherRemark,
        showHeadteacherRemark: input.showHeadteacherRemark,
        signatureSlots: input.signatureSlots,
        finalTermNumber: input.finalTermNumber,
        autoApplyPromotion: input.autoApplyPromotion,
        classProgression: input.classProgression,
      };
      const existingReport = asObject(current.reportCardConfig);
      const reportCardConfig = mergeReportWorkflowConfig({
        ...existingReport,
        classAssessmentWeight: input.classAssessmentWeight,
        examWeight: input.examWeight,
        classAssessmentTypes: input.classAssessmentTypes,
        examTypes: input.examTypes,
        rounding: input.rounding,
        missingScorePolicy: input.missingScorePolicy,
      }, workflowNext);
      const gradingScale = input.gradingScale.map((band) => ({
        min: band.min,
        max: band.max,
        grade: band.grade,
        ...(band.label ? { label: band.label } : {}),
        ...(band.remark ? { remark: band.remark } : {}),
      }));

      await tx.schoolSettings.update({
        where: { schoolId: session.schoolId },
        data: {
          reportCardTemplateId: input.themeId,
          reportCardConfig,
          assessmentConfig,
          gradingScale,
          gradeCaWeight: new Prisma.Decimal(input.classAssessmentWeight),
          gradeExamWeight: new Prisma.Decimal(input.examWeight),
          showOverallPosition: input.showOverallPosition,
          showSubjectPosition: input.showSubjectPosition,
        },
      });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "settings.report_card_configuration_updated",
        entityType: "SchoolSettings",
        entityId: session.schoolId,
        before: { reportCardTemplateId: current.reportCardTemplateId, reportCardConfig: current.reportCardConfig, assessmentConfig: current.assessmentConfig, gradingScale: current.gradingScale },
        after: { reportCardTemplateId: input.themeId, reportCardConfig, assessmentConfig, gradingScale },
      });
      return NextResponse.json({ ok: true, reportCardTemplateId: input.themeId, reportCardConfig, assessmentConfig, gradingScale });
    });
  } catch (error) { return routeError(error); }
}
