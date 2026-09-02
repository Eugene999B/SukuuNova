import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError, ForbiddenError } from "@/lib/errors";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { approveAndQueuePublicReportCard, sendApprovedReportCardPublic } from "@/lib/report-card-release-service";

type SubjectResult = { subject: string; ca: number | null; exam: number | null; total: number | null };
type TemplateConfig = { style: string; primary: string; accent: string; watermark: string };
function object(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> { return value && !Array.isArray(value) && typeof value === "object" ? value as Record<string, Prisma.JsonValue> : {}; }
function text(value: Prisma.JsonValue | undefined, fallback: string) { return typeof value === "string" ? value : fallback; }
function hex(value: string) { const match = /^#?([0-9a-f]{6})$/i.exec(value); if (!match) return rgb(0.11, 0.3, 0.72); return rgb(parseInt(match[1].slice(0, 2), 16) / 255, parseInt(match[1].slice(2, 4), 16) / 255, parseInt(match[1].slice(4, 6), 16) / 255); }
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
  for (const [subject, rows] of grouped) {
    const average = (type: string) => { const typed = rows.filter((row) => row.type === type && row.scores[0]); if (!typed.length) return null; return typed.reduce((sum, row) => sum + (Number(row.scores[0].value) / Number(row.maxScore)) * 100, 0) / typed.length; };
    const ca = average("ca"); const exam = average("exam");
    const parts = [ca == null ? null : { value: ca, weight: caWeight }, exam == null ? null : { value: exam, weight: examWeight }].filter((part): part is { value: number; weight: number } => part !== null && part.weight > 0);
    const denominator = parts.reduce((sum, part) => sum + part.weight, 0);
    const total = denominator > 0 ? Math.round((parts.reduce((sum, part) => sum + part.value * part.weight, 0) / denominator) * 100) / 100 : null;
    results.push({ subject, ca, exam, total });
  }
  const attendance = await tx.attendanceEvent.findMany({ where: { studentId, type: "in", attendanceDate: { gte: term.startDate, lte: term.endDate } }, select: { attendanceDate: true, isLate: true } });
  return { student, term, settings, school, template, results, attendance, caWeight, examWeight };
}

async function makePdf(data: Awaited<ReturnType<typeof reportData>>, remarks?: string) {
  if (data.results.length > 20) throw new AppError("This report renderer supports at most 20 subjects. Use the Report Card Print Studio for a full multi-page report.", 409, "PDF_LIMIT");
  const raw = object(data.template.layoutConfig); const brand = object(data.school.brandColors);
  const config: TemplateConfig = { style: text(raw.style, "classic"), primary: text(brand.primary, text(raw.primary, "#1d4ed8")), accent: text(brand.accent, text(raw.accent, "#dbeafe")), watermark: data.settings.reportCardWatermark || text(raw.watermark, "SUKUUNOVA") };
  const pdf = await PDFDocument.create(); const page = pdf.addPage([595, 842]); const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold); const primary = hex(config.primary); const accent = hex(config.accent);
  if (config.style === "modern") page.drawRectangle({ x: 0, y: 750, width: 595, height: 92, color: primary }); else if (config.style === "formal") page.drawRectangle({ x: 35, y: 35, width: 525, height: 772, borderColor: primary, borderWidth: 2 }); else page.drawRectangle({ x: 0, y: 770, width: 595, height: 72, color: accent });
  if (data.school.logoUrl?.startsWith("data:image/")) { try { const separator = data.school.logoUrl.indexOf(","); if (separator < 1) throw new Error("Malformed school logo data URL."); const header = data.school.logoUrl.slice(0, separator); const bytes = Buffer.from(data.school.logoUrl.slice(separator + 1), "base64"); const logo = header.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes); const scale = Math.min(60 / logo.width, 48 / logo.height); page.drawImage(logo, { x: 475, y: 772, width: logo.width * scale, height: logo.height * scale }); } catch {} }
  if (config.watermark) page.drawText(config.watermark.slice(0, 36), { x: 145, y: 390, size: 42, font: bold, color: accent, opacity: 0.18, rotate: degrees(35) });
  const headerColor = config.style === "modern" ? rgb(1, 1, 1) : primary;
  page.drawText(data.school.name, { x: 50, y: 798, size: 20, font: bold, color: headerColor }); page.drawText("SukuuNova Report Card · " + data.template.name, { x: 50, y: 774, size: 10, font: regular, color: headerColor }); page.drawText("Student: " + data.student.name, { x: 50, y: 730, size: 11, font: bold }); page.drawText("Class: " + (data.student.class?.name ?? "Unassigned"), { x: 320, y: 730, size: 11, font: regular }); page.drawText("Term: " + data.term.name, { x: 50, y: 710, size: 11, font: regular }); page.drawRectangle({ x: 45, y: 664, width: 500, height: 24, color: accent }); page.drawText("Subject", { x: 50, y: 675, size: 10, font: bold, color: primary }); page.drawText("CA", { x: 310, y: 675, size: 10, font: bold, color: primary }); page.drawText("Exam", { x: 380, y: 675, size: 10, font: bold, color: primary }); page.drawText("Total", { x: 465, y: 675, size: 10, font: bold, color: primary });
  let y = 653; for (const row of data.results) { page.drawText(row.subject.slice(0, 36), { x: 50, y, size: 9, font: regular }); page.drawText(row.ca === null ? "-" : row.ca.toFixed(1), { x: 310, y, size: 9, font: regular }); page.drawText(row.exam === null ? "-" : row.exam.toFixed(1), { x: 380, y, size: 9, font: regular }); page.drawText(row.total === null ? "-" : row.total.toFixed(1), { x: 465, y, size: 9, font: bold }); y -= 21; }
  const presentDays = new Set(data.attendance.map((row) => row.attendanceDate.toISOString().slice(0, 10))).size; const lateDays = data.attendance.filter((row) => row.isLate).length; page.drawText("Attendance: " + presentDays + " days present; " + lateDays + " late.", { x: 50, y: 190, size: 10, font: regular }); page.drawText("Remarks: " + (remarks?.trim() || "—"), { x: 50, y: 165, size: 10, font: regular }); page.drawText("Generated securely by SukuuNova", { x: 50, y: 60, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) }); return Buffer.from(await pdf.save());
}

export async function generateReportCard(tx: TenantDb, input: { schoolId: string; actorId: string; studentId: string; termId: string; remarks?: string }) {
  await requirePermission(tx, input.actorId, "reports:generate");
  const existing = await tx.reportCard.findUnique({ where: { studentId_termId: { studentId: input.studentId, termId: input.termId } } });
  if (existing && existing.status !== "draft") throw new AppError("A submitted report card cannot be regenerated.", 409, "REPORT_LOCKED");
  const data = await reportData(tx, input.studentId, input.termId); const pdfData = await makePdf(data, input.remarks);
  const calculationSnapshot = { calculationVersion: 2, calculatedAt: new Date().toISOString(), gradingWeights: { ca: data.caWeight, exam: data.examWeight }, partialReportsAllowed: data.settings.allowPartialReportCards, assessments: data.results.map((row) => ({ subject: row.subject, ca: row.ca, exam: row.exam, total: row.total })), attendance: { presentDays: new Set(data.attendance.map((row) => row.attendanceDate.toISOString().slice(0, 10))).size, lateDays: data.attendance.filter((row) => row.isLate).length } };
  const report = await tx.reportCard.upsert({ where: { studentId_termId: { studentId: input.studentId, termId: input.termId } }, update: { pdfData, remarks: input.remarks, templateId: data.template.id, calculationSnapshot, calculationVersion: 2 }, create: { schoolId: input.schoolId, studentId: input.studentId, termId: input.termId, templateId: data.template.id, pdfData, remarks: input.remarks, calculationSnapshot, calculationVersion: 2, generatedPdfUrl: "/api/mvp/report-cards/pending/pdf" } });
  const generatedPdfUrl = "/api/mvp/report-cards/" + report.id + "/pdf"; await tx.reportCard.update({ where: { id: report.id }, data: { generatedPdfUrl } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.generated", entityType: "ReportCard", entityId: report.id, after: { studentId: input.studentId, termId: input.termId, templateId: data.template.id, calculationVersion: 2 } });
  return { ...report, generatedPdfUrl };
}

export async function submitReportCard(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string }) {
  await requirePermission(tx, input.actorId, "report_cards:submit");
  const report = await tx.reportCard.findUnique({ where: { id: input.reportCardId }, include: { student: { include: { class: true } } } });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND"); if (report.status !== "draft") throw new AppError("Only draft reports can be submitted.", 409, "INVALID_STATE"); if (report.student.class?.classTeacherId !== input.actorId) throw new ForbiddenError("Only the student's class teacher may submit this report.");
  const updated = await tx.reportCard.update({ where: { id: report.id }, data: { status: "submitted", submittedBy: input.actorId, submittedAt: new Date() } }); await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.submitted", entityType: "ReportCard", entityId: report.id, before: { status: report.status }, after: { status: updated.status } }); return updated;
}

export async function approveReportCard(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string }) {
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
