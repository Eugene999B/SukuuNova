import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError, ForbiddenError } from "@/lib/errors";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { calculateSubjectResult, gradeForPercentage } from "@/lib/assessment-engine";
import { overallTotalsForScope, passMarkForScale, promotionForRule, rankTotals, remarkForLine, rulesFor } from "@/lib/report-card-ranking";
import { getClassSubjectIntelligence } from "@/lib/performance-intelligence";
import { approveAndQueuePublicReportCard, readHeadRemark, sendApprovedReportCardPublic } from "@/lib/report-card-release-service";

type SubjectResult = { subject: string; ca: number | null; exam: number | null; total: number | null };
type TemplateConfig = { style: string; primary: string; accent: string; watermark: string };
function object(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> { return value && !Array.isArray(value) && typeof value === "object" ? value as Record<string, Prisma.JsonValue> : {}; }
function text(value: Prisma.JsonValue | undefined, fallback: string) { return typeof value === "string" ? value : fallback; }
function hex(value: string) { const match = /^#?([0-9a-f]{6})$/i.exec(value); if (!match) return var(--color-bg); return var(--color-bg), 16) / 255, parseInt(match[1].slice(2, 4), 16) / 255, parseInt(match[1].slice(4, 6), 16) / 255); }
function appOrigin() { return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/g, ""); }

async function reportData(tx: TenantDb, studentId: string, termId: string) {
  const school = await tx.school.findFirst({ select: { id: true, name: true, logoUrl: true, brandColors: true } });
  if (!school) throw new AppError("Report-card context is incomplete.", 404, "NOT_FOUND");
  const [student, term, settings] = await Promise.all([
    tx.student.findUnique({ where: { id: studentId }, include: { class: true } }),
    tx.term.findUnique({ where: { id: termId } }),
    tx.schoolSettings.findUnique({ where: { schoolId: school.id } })
  ]);
  if (!student || !term || !settings) throw new AppError("Report-card context is incomplete.", 404, "NOT_FOUND");
  if (!student.classId) throw new AppError("Student has no class assignment.", 409, "NO_CLASS");
  const template = await tx.reportCardTemplate.findUnique({ where: { id: settings.reportCardTemplateId ?? "preset-classic-blue" } });
  if (!template) throw new AppError("Select a valid report-card template.", 409, "TEMPLATE_REQUIRED");
  const assessments = await tx.assessment.findMany({ where: { termId, classId: student.classId }, include: { subject: true, scores: { where: { studentId } } }, orderBy: [{ subject: { name: "asc" } }, { type: "asc" }] });
  if (!assessments.length) throw new AppError("No assessments exist for this report card.", 409, "NO_ASSESSMENTS");
  const missing = assessments.filter((assessment) => assessment.scores.length === 0);
  if (missing.length > 0 && !settings.allowPartialReportCards) throw new AppError("Missing scores block report-card generation. Enable partial reports to override.", 409, "MISSING_SCORES");
  const grouped = new Map<string, typeof assessments>();
  for (const assessment of assessments) grouped.set(assessment.subject.name, [...(grouped.get(assessment.subject.name) ?? []), assessment]);
  const caWeight = Number(settings.gradeCaWeight); const examWeight = Number(settings.gradeExamWeight);
  if (!Number.isFinite(caWeight) || caWeight < 0 || !Number.isFinite(examWeight) || examWeight < 0 || caWeight + examWeight <= 0) throw new AppError("The school's grading weights are invalid.", 409, "INVALID_GRADING_CONFIGURATION");
  const results: SubjectResult[] = [];
  // Same engine + rules as the print path: custom assessment categories win,
  // otherwise the school's CA/exam split applies.
  const rules = rulesFor(settings);
  for (const [subject, rows] of grouped) {
    const result = calculateSubjectResult(
      rows.map((row) => ({ id: row.id, name: row.name, type: row.type, maxScore: row.maxScore, weight: row.weight, score: row.scores[0]?.value ?? null, status: (row.scores[0] as { status?: string } | undefined)?.status ?? null })),
      rules
    );
    const bucketAvg = (normalized: string): number | null => {
      const parts = result.details.filter((d) => d.type === normalized && d.percentage != null).map((d) => d.percentage as number);
      if (!parts.length) return null;
      return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10;
    };
    results.push({ subject, ca: bucketAvg("classwork"), exam: bucketAvg("exam"), total: result.total });
  }
  const attendance = await tx.attendanceEvent.findMany({ where: { studentId, type: "in", attendanceDate: { gte: term.startDate, lte: term.endDate } }, select: { attendanceDate: true, isLate: true } });
  return { student, term, settings, school, template, results, attendance, caWeight, examWeight };
}

async function makePdf(data: Awaited<ReturnType<typeof reportData>>, remarks?: string) {
  if (data.results.length > 20) throw new AppError("This report renderer supports at most 20 subjects. Use the Report Card Print Studio for a full multi-page report.", 409, "PDF_LIMIT");
  const raw = object(data.template.layoutConfig); const brand = object(data.school.brandColors);
  const config: TemplateConfig = { style: text(raw.style, "classic"), primary: text(brand.primary, text(raw.primary, "var(--color-info)")), accent: text(brand.accent, text(raw.accent, "var(--color-border)")), watermark: data.settings.reportCardWatermark || text(raw.watermark, "SUKUUNOVA") };
  const pdf = await PDFDocument.create(); const page = pdf.addPage([595, 842]); const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold); const primary = hex(config.primary); const accent = hex(config.accent);
  if (config.style === "modern") page.drawRectangle({ x: 0, y: 750, width: 595, height: 92, color: primary }); else if (config.style === "formal") page.drawRectangle({ x: 35, y: 35, width: 525, height: 772, borderColor: primary, borderWidth: 2 }); else page.drawRectangle({ x: 0, y: 770, width: 595, height: 72, color: accent });
  if (data.school.logoUrl?.startsWith("data:image/")) { try { const separator = data.school.logoUrl.indexOf(","); if (separator < 1) throw new Error("Malformed school logo data URL."); const header = data.school.logoUrl.slice(0, separator); const bytes = Buffer.from(data.school.logoUrl.slice(separator + 1), "base64"); const logo = header.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes); const scale = Math.min(60 / logo.width, 48 / logo.height); page.drawImage(logo, { x: 475, y: 772, width: logo.width * scale, height: logo.height * scale }); } catch {} }
  if (config.watermark) page.drawText(config.watermark.slice(0, 36), { x: 145, y: 390, size: 42, font: bold, color: accent, opacity: 0.18, rotate: degrees(35) });
  const headerColor = config.style === "modern" ? var(--color-bg) : primary;
  page.drawText(data.school.name, { x: 50, y: 798, size: 20, font: bold, color: headerColor }); page.drawText("SukuuNova Report Card · " + data.template.name, { x: 50, y: 774, size: 10, font: regular, color: headerColor }); page.drawText("Student: " + data.student.name, { x: 50, y: 730, size: 11, font: bold }); page.drawText("Class: " + (data.student.class?.name ?? "Unassigned"), { x: 320, y: 730, size: 11, font: regular }); page.drawText("Term: " + data.term.name, { x: 50, y: 710, size: 11, font: regular }); page.drawRectangle({ x: 45, y: 664, width: 500, height: 24, color: accent }); page.drawText("Subject", { x: 50, y: 675, size: 10, font: bold, color: primary }); page.drawText("CA", { x: 310, y: 675, size: 10, font: bold, color: primary }); page.drawText("Exam", { x: 380, y: 675, size: 10, font: bold, color: primary }); page.drawText("Total", { x: 465, y: 675, size: 10, font: bold, color: primary });
  let y = 653; for (const row of data.results) { page.drawText(row.subject.slice(0, 36), { x: 50, y, size: 9, font: regular }); page.drawText(row.ca === null ? "-" : row.ca.toFixed(1), { x: 310, y, size: 9, font: regular }); page.drawText(row.exam === null ? "-" : row.exam.toFixed(1), { x: 380, y, size: 9, font: regular }); page.drawText(row.total === null ? "-" : row.total.toFixed(1), { x: 465, y, size: 9, font: bold }); y -= 21; }
  const presentDays = new Set(data.attendance.map((row) => row.attendanceDate.toISOString().slice(0, 10))).size; const lateDays = data.attendance.filter((row) => row.isLate).length; page.drawText("Attendance: " + presentDays + " days present; " + lateDays + " late.", { x: 50, y: 190, size: 10, font: regular }); page.drawText("Remarks: " + (remarks?.trim() || "—"), { x: 50, y: 165, size: 10, font: regular }); page.drawText("Generated securely by SukuuNova", { x: 50, y: 60, size: 8, font: regular, color: var(--color-bg) }); return Buffer.from(await pdf.save());
}

export async function generateReportCard(tx: TenantDb, input: { schoolId: string; actorId: string; studentId: string; termId: string; remarks?: string }) {
  await requirePermission(tx, input.actorId, "reports:generate");
  const existing = await tx.reportCard.findUnique({ where: { studentId_termId: { studentId: input.studentId, termId: input.termId } } });
  if (existing && existing.status !== "draft") throw new AppError("A submitted report card cannot be regenerated.", 409, "REPORT_LOCKED");
  const data = await reportData(tx, input.studentId, input.termId); const pdfData = await makePdf(data, input.remarks);
  const presentDays = new Set(data.attendance.map((row) => row.attendanceDate.toISOString().slice(0, 10))).size;
  const lateDays = data.attendance.filter((row) => row.isLate).length;
  const completeTotals = data.results.map((row) => row.total).filter((t): t is number => t != null);
  const average = completeTotals.length ? completeTotals.reduce((a, b) => a + b, 0) / completeTotals.length : null;
  const rules = rulesFor(data.settings);
  const scale = rules.gradingScale?.length ? rules.gradingScale : undefined;
  // Single snapshot version (v4): everything the print path renders is frozen
  // here; positions + promotion are filled in by freezeReportCardRanking at
  // approval and never recomputed afterwards.
  const calculationSnapshot = {
    calculationVersion: 4, calculatedAt: new Date().toISOString(),
    gradingWeights: { ca: data.caWeight, exam: data.examWeight },
    assessmentCategories: rules.categories, rounding: rules.rounding, missingScorePolicy: rules.missingScorePolicy,
    partialReportsAllowed: data.settings.allowPartialReportCards,
    assessments: data.results.map((row) => ({ subject: row.subject, ca: row.ca, exam: row.exam, total: row.total, grade: gradeForPercentage(row.total, scale) })),
    average, attendance: { presentDays, lateDays },
    positionScope: null as string | null, overallPosition: null as number | null, classSize: null as number | null, rankedCount: null as number | null,
    subjectPositions: [] as Array<{ subject: string; position: number | null; total: number | null; grade: string | null; remark: string | null }>,
    promotionRule: null as string | null, promotionDecision: "decision_required" as const,
  };
  const report = await tx.reportCard.upsert({ where: { studentId_termId: { studentId: input.studentId, termId: input.termId } }, update: { pdfData, remarks: input.remarks, templateId: data.template.id, calculationSnapshot, calculationVersion: 4 }, create: { schoolId: input.schoolId, studentId: input.studentId, termId: input.termId, templateId: data.template.id, pdfData, remarks: input.remarks, calculationSnapshot, calculationVersion: 4, generatedPdfUrl: "/api/mvp/report-cards/pending/pdf" } });
  const generatedPdfUrl = "/api/mvp/report-cards/" + report.id + "/pdf"; await tx.reportCard.update({ where: { id: report.id }, data: { generatedPdfUrl } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.generated", entityType: "ReportCard", entityId: report.id, after: { studentId: input.studentId, termId: input.termId, templateId: data.template.id, calculationVersion: 4 } });
  return { ...report, generatedPdfUrl };
}

export async function submitReportCard(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string }) {
  await requirePermission(tx, input.actorId, "report_cards:submit");
  const report = await tx.reportCard.findUnique({ where: { id: input.reportCardId }, include: { student: { include: { class: true } } } });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND"); if (report.status !== "draft") throw new AppError("Only draft reports can be submitted.", 409, "INVALID_STATE"); if (report.student.class?.classTeacherId !== input.actorId) throw new ForbiddenError("Only the student's class teacher may submit this report.");
  const updated = await tx.reportCard.update({ where: { id: report.id }, data: { status: "submitted", submittedBy: input.actorId, submittedAt: new Date() } }); await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.submitted", entityType: "ReportCard", entityId: report.id, before: { status: report.status }, after: { status: updated.status } }); return updated;
}

export async function approveReportCard(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string; headRemark?: string }) {
  const approved = await approveAndQueuePublicReportCard(tx, { ...input, origin: appOrigin() });
  return approved;
}

export async function sendReportCard(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string }) {
  return sendApprovedReportCardPublic(tx, { ...input, origin: appOrigin() });
}

export async function getVisibleReportPdf(tx: TenantDb, input: { actorId: string; reportCardId: string }) {
  const report = await tx.reportCard.findUnique({ where: { id: input.reportCardId }, include: { student: { include: { guardians: { include: { guardian: true } } } } } });
  const pdfData = report?.pdfData; if (!report || !pdfData) throw new AppError("Report PDF not found.", 404, "NOT_FOUND");
  if (await hasPermission(tx, input.actorId, "report_cards:view")) {
    const isParent = await hasPermission(tx, input.actorId, "parents:read_linked");
    if (!isParent) return { ...report, pdfData };
    const linked = report.student.guardians.some((link) => link.guardian.userId === input.actorId);
    if (linked && ["approved", "sent"].includes(report.status)) return { ...report, pdfData };
  }
  throw new ForbiddenError("This report card is not visible to this account.");
}

export type ReportSubjectLine = { subject: string; subjectId: string | null; ca: number | null; exam: number | null; total: number | null; grade: string | null; position: number | null; remark: string | null };
export type ReportPolicy = { showOverallPosition: boolean; showSubjectPosition: boolean; positionScope: "class" | "year_group"; remarkSource: "grade_band" | "position_band"; positionBandLabels: unknown; behaviorRatingFields: unknown; promotionRule: "manual" | "pass_mark" | "overall_position"; positionPromotionCutoffPercent: number };

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

// Single home for remark/promotion rules (re-exported for existing callers).
export { remarkForPosition, promotionForRule, type PromotionDecision } from "@/lib/report-card-ranking";

/**
 * Single consolidated report-card calculation.
 * Replaces the three former variants (reportData bucket math, print-page manual
 * ca/exam weighting + sum-based overall ranking, PrintStudioV2 client totals).
 * Live values are merged with the frozen calculationSnapshot exactly as before:
 * once a card is issued, frozen totals/positions/remarks/promotion win.
 */
export async function calculateReportCard(tx: TenantDb, input: { schoolId: string; reportId: string }) {
  const report = await tx.reportCard.findFirst({
    where: { id: input.reportId, schoolId: input.schoolId },
    include: {
      student: { include: { class: { include: { classTeacher: { select: { id: true, name: true } } } } } },
      term: { include: { academicYear: true } },
    },
  });
  if (!report || !report.student.class) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  const [settings, school] = await Promise.all([
    tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId } }),
    tx.school.findUnique({ where: { id: input.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } }),
  ]);
  if (!settings || !school) throw new AppError("Report-card context is incomplete.", 404, "NOT_FOUND");
  const policyRow = await tx.$queryRawUnsafe<Array<{ showOverallPosition: boolean; showSubjectPosition: boolean | null; positionScope: string; remarkSource: string; positionBandLabels: unknown; behaviorRatingFields: unknown; promotionRule: string; positionPromotionCutoffPercent: number | null }>>(
    `SELECT "showOverallPosition", "positionScope", "remarkSource", "positionBandLabels", "behaviorRatingFields", "promotionRule",
      CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SchoolSettings' AND column_name='showSubjectPosition') THEN "showSubjectPosition" ELSE true END AS "showSubjectPosition",
      CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SchoolSettings' AND column_name='positionPromotionCutoffPercent') THEN "positionPromotionCutoffPercent" ELSE 50 END AS "positionPromotionCutoffPercent"
     FROM "SchoolSettings" WHERE "schoolId"=$1`, input.schoolId);
  const row = policyRow[0];
  const policy: ReportPolicy = {
    showOverallPosition: row?.showOverallPosition ?? true,
    showSubjectPosition: row?.showSubjectPosition ?? true,
    positionScope: row?.positionScope === "year_group" ? "year_group" : "class",
    remarkSource: row?.remarkSource === "position_band" ? "position_band" : "grade_band",
    positionBandLabels: row?.positionBandLabels ?? null,
    behaviorRatingFields: row?.behaviorRatingFields ?? null,
    promotionRule: row?.promotionRule === "pass_mark" || row?.promotionRule === "overall_position" ? row.promotionRule : "manual",
    positionPromotionCutoffPercent: row?.positionPromotionCutoffPercent != null && Number.isFinite(Number(row.positionPromotionCutoffPercent)) ? Math.min(100, Math.max(1, Math.round(Number(row.positionPromotionCutoffPercent)))) : 50,
  };
  const rules = rulesFor(settings);
  const scale = (rules.gradingScale?.length ? rules.gradingScale : []) as Array<{ min: number; max: number; grade: string; remark?: string; label?: string }>;
  const assessments = await tx.assessment.findMany({ where: { schoolId: input.schoolId, termId: report.termId, classId: report.student.class.id }, include: { subject: true, scores: { where: { studentId: report.studentId } } }, orderBy: [{ subject: { name: "asc" } }, { type: "asc" }] });
  const grouped = new Map<string, typeof assessments>();
  for (const a of assessments) grouped.set(a.subject.name, [...(grouped.get(a.subject.name) ?? []), a]);
  const liveLines: ReportSubjectLine[] = [];
  for (const [subject, rows] of grouped) {
    const result = calculateSubjectResult(rows.map((r) => ({ id: r.id, name: r.name, type: r.type, maxScore: r.maxScore, weight: r.weight, score: r.scores[0]?.value ?? null, status: (r.scores[0] as { status?: string } | undefined)?.status ?? null })), rules);
    const bucketAvg = (normalized: string): number | null => {
      const parts = result.details.filter((d) => d.type === normalized && d.percentage != null).map((d) => d.percentage as number);
      if (!parts.length) return null;
      return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10;
    };
    liveLines.push({ subject, subjectId: rows[0].subjectId, ca: bucketAvg("classwork"), exam: bucketAvg("exam"), total: result.total, grade: gradeForPercentage(result.total, scale.length ? scale : undefined), position: null, remark: null });
  }
  const scopeClassIds = policy.positionScope === "year_group" && report.student.class.level
    ? (await tx.class.findMany({ where: { schoolId: input.schoolId, level: report.student.class.level }, select: { id: true } })).map((r) => r.id)
    : [report.student.class.id];
  const scopeStudents = await tx.student.findMany({ where: { schoolId: input.schoolId, classId: { in: scopeClassIds }, status: "active" }, select: { id: true, name: true } });
  const { totals, names } = await overallTotalsForScope(tx, { schoolId: input.schoolId, termId: report.termId, classIds: scopeClassIds, rules });
  const ranked = rankTotals([...totals.entries()].map(([id, total]) => ({ id, name: names.get(id) ?? "", total })));
  const overallPosition = ranked.get(report.studentId) ?? null;
  const rankedCount = totals.size;
  for (const line of liveLines) {
    if (!line.subjectId) continue;
    const intelligence = await getClassSubjectIntelligence(tx, { classId: report.student.class.id, subjectId: line.subjectId, termId: report.termId, rules, scope: policy.positionScope });
    line.position = intelligence.rows.find((r) => r.studentId === report.studentId)?.position ?? null;
    line.remark = remarkForLine(line.total, scale, line.position, rankedCount, policy);
  }
  const completeTotals = liveLines.map((l) => l.total).filter((t): t is number => t != null);
  const average = completeTotals.length ? completeTotals.reduce((a, b) => a + b, 0) / completeTotals.length : null;
  const passMark = passMarkForScale(scale);
  const promotionDecision = promotionForRule(policy.promotionRule, { overallPosition, rankedCount, cutoffPercent: policy.positionPromotionCutoffPercent, lines: liveLines, passMark });
  // Frozen merge: issued cards keep their snapshot (v2/v4 tolerant). Every
  // rendered number — ca/exam/total/grade/position/remark, average, attendance,
  // weights — comes from the snapshot once one exists; live values only fill
  // gaps for cards generated before a field existed.
  const frozen = asRecord(report.calculationSnapshot);
  const frozenAssessments = Array.isArray(frozen.assessments) ? frozen.assessments as Array<Record<string, unknown>> : [];
  const frozenSubjects = Array.isArray(frozen.subjectPositions) ? frozen.subjectPositions as Array<Record<string, unknown>> : [];
  const frozenMap = new Map<string, Record<string, unknown>>();
  for (const r of [...frozenSubjects, ...frozenAssessments]) {
    const key = String(r.subject);
    if (!frozenMap.has(key)) frozenMap.set(key, r);
    else Object.assign(frozenMap.get(key)!, r);
  }
  const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const results: ReportSubjectLine[] = liveLines.map((line) => {
    const f = frozenMap.get(line.subject);
    return {
      ...line,
      ca: numOrNull(f?.ca) ?? line.ca,
      exam: numOrNull(f?.exam) ?? line.exam,
      position: typeof f?.position === "number" ? f.position : line.position,
      total: numOrNull(f?.total) ?? line.total,
      grade: strOrNull(f?.grade) ?? line.grade,
      remark: strOrNull(f?.remark) ?? line.remark,
    };
  });
  const frozenAverage = numOrNull(frozen.average) ?? average;
  const frozenOverall = typeof frozen.overallPosition === "number" ? frozen.overallPosition : overallPosition;
  const frozenPromotion = frozen.promotionDecision === "promoted" || frozen.promotionDecision === "not_promoted" || frozen.promotionDecision === "decision_required" ? frozen.promotionDecision : promotionDecision;
  const frozenWeights = asRecord(frozen.gradingWeights);
  const weights = {
    ca: numOrNull(frozenWeights.ca) ?? Number(settings.gradeCaWeight),
    exam: numOrNull(frozenWeights.exam) ?? Number(settings.gradeExamWeight),
  };
  const frozenSnapshot = Object.keys(frozen).length ? frozen : null;
  const attendanceRows = await tx.attendanceEvent.findMany({ where: { schoolId: input.schoolId, studentId: report.studentId, type: "in", attendanceDate: { gte: report.term.startDate, lte: report.term.endDate } }, select: { attendanceDate: true, isLate: true } });
  const recordedDays = await tx.attendanceEvent.findMany({ where: { schoolId: input.schoolId, studentId: report.studentId, attendanceDate: { gte: report.term.startDate, lte: report.term.endDate } }, distinct: ["attendanceDate"], select: { attendanceDate: true } });
  const liveAttendance = { presentDays: new Set(attendanceRows.map((r) => r.attendanceDate.toISOString().slice(0, 10))).size, lateDays: attendanceRows.filter((r) => r.isLate).length, totalRecorded: recordedDays.length };
  const frozenAttendanceRaw = asRecord(frozen.attendance);
  const attendanceSummary = frozenSnapshot
    ? {
        presentDays: numOrNull(frozenAttendanceRaw.presentDays) ?? liveAttendance.presentDays,
        lateDays: numOrNull(frozenAttendanceRaw.lateDays) ?? liveAttendance.lateDays,
        totalRecorded: numOrNull(frozenAttendanceRaw.totalRecorded) ?? liveAttendance.totalRecorded,
      }
    : liveAttendance;
  if (!frozenSnapshot) {
    await tx.reportCard.update({
      where: { id: report.id },
      data: {
        calculationSnapshot: {
          calculationVersion: 4, calculatedAt: new Date().toISOString(),
          gradingWeights: weights,
          partialReportsAllowed: settings.allowPartialReportCards,
          assessments: results.map((r) => ({ subject: r.subject, ca: r.ca, exam: r.exam, total: r.total, grade: r.grade })),
          average: frozenAverage,
          attendance: attendanceSummary, positionScope: policy.positionScope, overallPosition, classSize: scopeStudents.length, rankedCount,
          subjectPositions: results.map((r) => ({ subject: r.subject, position: r.position, total: r.total, grade: r.grade, remark: r.remark })),
          promotionRule: policy.promotionRule, promotionDecision,
        },
      },
    });
  }
  const nextTerm = await tx.term.findFirst({ where: { schoolId: input.schoolId, academicYearId: report.term.academicYearId, startDate: { gt: report.term.endDate } }, orderBy: { startDate: "asc" }, select: { startDate: true, name: true } });
  const brand = asRecord(school.brandColors);
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const dob = report.student.dob ? new Date(report.student.dob) : null;
  const age = dob && !Number.isNaN(dob.getTime()) ? Math.max(0, new Date(report.term.endDate).getFullYear() - dob.getFullYear()) : null;
  return {
    school: { name: school.name, uniqueCode: school.uniqueCode, logoUrl: school.logoUrl, brandColors: school.brandColors, motto: str(brand.motto), address: str(brand.address) ?? str(brand.schoolAddress), phone: str(brand.phone) ?? str(brand.schoolPhone), watermark: settings.reportCardWatermark ?? str(brand.watermark) ?? "SUKUUNOVA" },
    student: { name: report.student.name, admissionNo: report.student.admissionNo, className: report.student.class.name, level: report.student.class.level, photoUrl: report.student.photoUrl, dob: dob?.toISOString() ?? null, age, classTeacherName: report.student.class.classTeacher?.name ?? "Class Teacher" },
    term: { name: report.term.name, academicYear: report.term.academicYear.name, startDate: report.term.startDate.toISOString(), endDate: report.term.endDate.toISOString(), nextTermStartDate: nextTerm?.startDate.toISOString() ?? null, nextTermName: nextTerm?.name ?? null },
    results,
    gradingScale: scale,
    gradingWeights: weights,
    summary: { average: frozenAverage, grade: frozenAverage == null ? null : gradeForPercentage(frozenAverage, scale.length ? scale : undefined), total: results.reduce((a, b) => a + (b.total ?? 0), 0) },
    attendance: { present: attendanceSummary.presentDays, late: attendanceSummary.lateDays, totalRecorded: attendanceSummary.totalRecorded },
    position: policy.showOverallPosition ? frozenOverall : null,
    showSubjectPosition: policy.showSubjectPosition,
    classSize: scopeStudents.length,
    rankedCount,
    remarks: report.remarks ?? "",
    headRemark: await readHeadRemark(tx, input.schoolId, report.id),
    promotionDecision: frozenPromotion,
    promotionRule: policy.promotionRule,
    positionPromotionCutoffPercent: policy.positionPromotionCutoffPercent,
    reportSettings: { showOverallPosition: policy.showOverallPosition, showSubjectPosition: policy.showSubjectPosition, positionScope: policy.positionScope, remarkSource: policy.remarkSource, positionBandLabels: policy.positionBandLabels, behaviorRatingFields: policy.behaviorRatingFields, promotionRule: policy.promotionRule },
  };
}
