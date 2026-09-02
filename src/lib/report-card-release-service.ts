import { createHmac, timingSafeEqual } from "node:crypto";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError, ForbiddenError } from "@/lib/errors";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { enqueueSms } from "@/lib/message-outbox";

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_VERSION = "rcpdf-v1";
type TokenPayload = { v: string; schoolId: string; reportId: string; exp: number };
function secret(): Buffer { const value = process.env.SCHOOL_AUTH_SECRET; if (!value || value.length < 32) throw new AppError("SCHOOL_AUTH_SECRET is not configured securely.", 500, "CONFIGURATION_ERROR"); return Buffer.from(value + ":report-card-public-pdf:v1", "utf8"); }
function encode(value: string): string { return Buffer.from(value, "utf8").toString("base64url"); }
function decode(value: string): string { return Buffer.from(value, "base64url").toString("utf8"); }
function signature(encodedPayload: string): string { return createHmac("sha256", secret()).update(encodedPayload, "utf8").digest("base64url"); }
export function createPublicReportPdfToken(input: { schoolId: string; reportId: string; expiresAt?: Date }): string { const exp = Math.floor((input.expiresAt?.getTime() ?? (Date.now() + TOKEN_TTL_SECONDS * 1000)) / 1000); const payload: TokenPayload = { v: TOKEN_VERSION, schoolId: input.schoolId, reportId: input.reportId, exp }; const encoded = encode(JSON.stringify(payload)); return `${encoded}.${signature(encoded)}`; }
export function verifyPublicReportPdfToken(token: string): TokenPayload | null { const [encoded, supplied] = token.trim().split("."); if (!encoded || !supplied || supplied.length < 20) return null; const expected = signature(encoded); const expectedBuffer = Buffer.from(expected, "utf8"); const suppliedBuffer = Buffer.from(supplied, "utf8"); if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) return null; try { const payload = JSON.parse(decode(encoded)) as Partial<TokenPayload>; if (payload.v !== TOKEN_VERSION || typeof payload.schoolId !== "string" || typeof payload.reportId !== "string" || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null; return payload as TokenPayload; } catch { return null; } }
export function publicReportPdfUrl(origin: string, token: string): string { return `${origin.replace(/\/+$/g, "")}/api/public/report-cards/${encodeURIComponent(token)}/pdf`; }

async function queuePublicRelease(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string; origin: string }) {
  const report = await tx.reportCard.findFirst({ where: { id: input.reportCardId, schoolId: input.schoolId }, include: { student: { include: { guardians: { include: { guardian: true } } } }, term: true } });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  if (!["approved", "sent"].includes(report.status)) throw new AppError("Only approved reports can be released.", 409, "INVALID_STATE");
  const publicUrl = publicReportPdfUrl(input.origin, createPublicReportPdfToken({ schoolId: input.schoolId, reportId: report.id }));
  const recipients = report.student.guardians.filter((link) => Boolean(link.guardian.phone));
  if (!recipients.length) throw new AppError("No linked guardian has a phone number for this release.", 409, "NO_GUARDIAN_PHONE");
  let queued = 0;
  for (const link of recipients) { const result = await enqueueSms(tx, { schoolId: input.schoolId, recipientType: "guardian", recipientId: link.guardianId, recipientPhone: link.guardian.phone!, body: `SukuuNova: ${report.student.name}'s approved ${report.term.name} report card is ready. Open the secure PDF link: ${publicUrl}`, templateKey: "report_card_ready", templateVariables: { "1": report.student.name, "2": report.term.name, "3": publicUrl }, mediaUrl: publicUrl }); queued += result.length; }
  return { report, queued, recipientCount: recipients.length, publicUrl };
}

export async function approveAndQueuePublicReportCard(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string; origin: string }) {
  await requirePermission(tx, input.actorId, "report_cards:approve");
  const report = await tx.reportCard.findFirst({ where: { id: input.reportCardId, schoolId: input.schoolId }, select: { id: true, status: true, submittedBy: true } });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  if (report.status !== "submitted") throw new AppError("Only submitted reports can be approved.", 409, "INVALID_STATE");
  if (report.submittedBy === input.actorId) throw new ForbiddenError("The submitter cannot approve the same report.");
  const approved = await tx.reportCard.update({ where: { id: report.id }, data: { status: "approved", approvedBy: input.actorId, approvedAt: new Date() } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.approved", entityType: "ReportCard", entityId: report.id, before: { status: report.status }, after: { status: approved.status } });
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId }, select: { notificationChannels: true } });
  const channelConfig = settings?.notificationChannels && !Array.isArray(settings.notificationChannels) && typeof settings.notificationChannels === "object" ? settings.notificationChannels as Record<string, unknown> : {};
  const automation = channelConfig.automation && typeof channelConfig.automation === "object" ? channelConfig.automation as Record<string, unknown> : {};
  const channels = Array.isArray(channelConfig.channels) ? channelConfig.channels.filter((value): value is "sms"|"whatsapp" => value === "sms" || value === "whatsapp") : [];
  let notification = { attempted: 0, queued: 0, skipped: true, publicPdf: true };
  if (automation.report_card_ready === true && channels.length) {
    const queued = await queuePublicRelease(tx, input);
    notification = { attempted: queued.recipientCount, queued: queued.queued, skipped: false, publicPdf: true };
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.automation_queued", entityType: "ReportCard", entityId: report.id, after: { guardianCount: queued.recipientCount, channelCount: channels.length, queued: queued.queued, publicPdf: true } });
  }
  return { ...approved, notification };
}

export async function sendApprovedReportCardPublic(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string; origin: string }) {
  if (!(await hasPermission(tx, input.actorId, "report_cards:approve"))) throw new AppError("You are not permitted to release report cards.", 403, "FORBIDDEN");
  const queued = await queuePublicRelease(tx, input);
  const final = await tx.reportCard.update({ where: { id: queued.report.id }, data: { sentAt: new Date() } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.released", entityType: "ReportCard", entityId: final.id, before: { status: queued.report.status, sentAt: queued.report.sentAt }, after: { status: final.status, sentAt: final.sentAt, recipientCount: queued.recipientCount, queued: queued.queued, publicPdf: true } });
  return { ...final, queued: queued.queued, recipientCount: queued.recipientCount, publicPdfUrl: queued.publicUrl };
}
