import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError, ForbiddenError } from "@/lib/errors";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { enqueueSms } from "@/lib/message-outbox";
import { freezeReportCardRanking } from "@/lib/report-card-ranking";
import { calculateIntelligentReportCard } from "@/lib/report-card-intelligence";
import { applyApprovedPromotion, readManualPromotionDecision } from "@/lib/report-card-promotion";
import { resolveCurrentReportSignatures } from "@/lib/report-card-signatures";

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_VERSION = "rcpdf-v1";
type TokenPayload = { v: string; schoolId: string; reportId: string; exp: number };
type Channel = "sms" | "whatsapp";

function secret(): Buffer {
  const value = process.env.SCHOOL_AUTH_SECRET;
  if (!value || value.length < 32) throw new AppError("SCHOOL_AUTH_SECRET is not configured securely.", 500, "CONFIGURATION_ERROR");
  return Buffer.from(`${value}:report-card-public-pdf:v1`, "utf8");
}

async function writeHeadRemark(tx: TenantDb, schoolId: string, reportId: string, headRemark: string): Promise<void> {
  const columns = await tx.$queryRawUnsafe<Array<{ exists: boolean }>>(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ReportCard' AND column_name='headRemark') AS "exists"`);
  if (!columns[0]?.exists) return;
  await tx.$executeRawUnsafe(`UPDATE "ReportCard" SET "headRemark"=$1 WHERE "id"=$2 AND "schoolId"=$3`, headRemark, reportId, schoolId);
}

export async function readHeadRemark(tx: TenantDb, schoolId: string, reportId: string): Promise<string | null> {
  const columns = await tx.$queryRawUnsafe<Array<{ exists: boolean }>>(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ReportCard' AND column_name='headRemark') AS "exists"`);
  if (!columns[0]?.exists) return null;
  const rows = await tx.$queryRawUnsafe<Array<{ headRemark: string | null }>>(`SELECT "headRemark" FROM "ReportCard" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, reportId, schoolId);
  return rows[0]?.headRemark?.trim() ? String(rows[0].headRemark) : null;
}

async function freezeIntelligentReportCard(tx: TenantDb, schoolId: string, reportId: string) {
  const report = await tx.reportCard.findFirst({
    where: { id: reportId, schoolId },
    select: {
      id: true,
      calculationSnapshot: true,
      student: {
        select: {
          id: true,
          name: true,
          admissionNo: true,
          photoUrl: true,
          classId: true,
          class: { select: { name: true, level: true, classTeacher: { select: { name: true } } } },
        },
      },
    },
  });
  if (!report) return;
  if (!report.student.classId || !report.student.class) {
    await freezeReportCardRanking(tx, { schoolId, reportCardId: report.id });
    return;
  }
  const [data, signatureSnapshot] = await Promise.all([
    calculateIntelligentReportCard(tx, { schoolId, reportId }),
    resolveCurrentReportSignatures(tx, schoolId),
  ]);
  const previous = report.calculationSnapshot && typeof report.calculationSnapshot === "object" && !Array.isArray(report.calculationSnapshot)
    ? report.calculationSnapshot as Record<string, Prisma.JsonValue>
    : {};
  const manualPromotion = readManualPromotionDecision(report.calculationSnapshot);
  const promotionDecision = manualPromotion ?? data.promotionDecision;
  const snapshot = {
    ...previous,
    calculationVersion: 5,
    rankingFrozenAt: new Date().toISOString(),
    gradingWeights: data.gradingWeights,
    assessments: data.results.map((result) => ({ subject: result.subject, ca: result.ca, exam: result.exam, total: result.total, grade: result.grade })),
    overallTotal: data.summary.total,
    average: data.summary.average,
    overallGrade: data.summary.grade,
    positionScope: data.reportSettings.showOverallPosition ? "class" : "none",
    overallPosition: data.position,
    classSize: data.classSize,
    rankedCount: data.rankedCount,
    subjectPositions: data.results.map((result) => ({ subject: result.subject, position: result.position, total: result.total, grade: result.grade, remark: null })),
    promotionRule: data.reportSettings.promotionRule,
    promotionDecision,
    themeId: data.reportSettings.themeId,
    signatureSnapshot,
    studentName: report.student.name,
    admissionNo: report.student.admissionNo,
    studentPhotoUrl: report.student.photoUrl,
    classId: report.student.classId,
    className: report.student.class.name,
    classLevel: report.student.class.level,
    classTeacherName: report.student.class.classTeacher?.name ?? data.classTeacherName,
  } as Prisma.InputJsonObject;
  await tx.reportCard.update({ where: { id: report.id }, data: { calculationSnapshot: snapshot, calculationVersion: 5 } });
}

function encode(value: string): string { return Buffer.from(value, "utf8").toString("base64url"); }
function decode(value: string): string { return Buffer.from(value, "base64url").toString("utf8"); }
function signature(encodedPayload: string): string { return createHmac("sha256", secret()).update(encodedPayload, "utf8").digest("base64url"); }

export function createPublicReportPdfToken(input: { schoolId: string; reportId: string; expiresAt?: Date }): string {
  const exp = Math.floor((input.expiresAt?.getTime() ?? (Date.now() + TOKEN_TTL_SECONDS * 1000)) / 1000);
  const payload: TokenPayload = { v: TOKEN_VERSION, schoolId: input.schoolId, reportId: input.reportId, exp };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function verifyPublicReportPdfToken(token: string): TokenPayload | null {
  const parts = token.trim().split(".");
  const encoded = parts[0];
  const supplied = parts[1];
  if (!encoded || !supplied || supplied.length < 20) return null;
  const expected = signature(encoded);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) return null;
  try {
    const parsed = JSON.parse(decode(encoded)) as Partial<TokenPayload>;
    const exp = typeof parsed.exp === "number" ? parsed.exp : null;
    const schoolId = typeof parsed.schoolId === "string" ? parsed.schoolId : null;
    const reportId = typeof parsed.reportId === "string" ? parsed.reportId : null;
    if (parsed.v !== TOKEN_VERSION || schoolId === null || reportId === null || exp === null || !Number.isInteger(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
    return { v: TOKEN_VERSION, schoolId, reportId, exp };
  } catch {
    return null;
  }
}

export function publicReportPdfUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/g, "")}/api/public/report-cards/${encodeURIComponent(token)}/pdf`;
}

function extractChannelConfig(value: Prisma.JsonValue | null | undefined) {
  const config = value && !Array.isArray(value) && typeof value === "object" ? value as Record<string, Prisma.JsonValue> : {};
  const channels = Array.isArray(config.channels) ? [...new Set(config.channels.filter((item): item is Channel => item === "sms" || item === "whatsapp"))] : [];
  const whatsappTemplateConfig = config.whatsappTemplateConfig && !Array.isArray(config.whatsappTemplateConfig) && typeof config.whatsappTemplateConfig === "object"
    ? config.whatsappTemplateConfig as Record<string, Prisma.JsonValue>
    : {};
  return { config, channels, whatsappTemplateConfig };
}

function requireProviderConfiguration(channels: Channel[], whatsappTemplateConfig: Record<string, Prisma.JsonValue>) {
  if (channels.includes("sms") && (!process.env.SMS_PROVIDER_URL || !process.env.SMS_PROVIDER_TOKEN)) {
    throw new AppError("SMS is enabled for report-card delivery but the SMS provider is not configured.", 503, "NOTIFICATION_PROVIDER_UNAVAILABLE");
  }
  if (channels.includes("whatsapp")) {
    const configured = whatsappTemplateConfig.report_card_ready;
    const contentSid = typeof configured === "string"
      ? configured
      : configured && !Array.isArray(configured) && typeof configured === "object" && typeof (configured as Record<string, Prisma.JsonValue>).contentSid === "string"
        ? (configured as Record<string, Prisma.JsonValue>).contentSid as string
        : undefined;
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM || !contentSid) {
      throw new AppError("WhatsApp report-card delivery is enabled but the Twilio or report-card template configuration is incomplete.", 503, "NOTIFICATION_PROVIDER_UNAVAILABLE");
    }
  }
}

async function queuePublicRelease(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string; origin: string }) {
  const report = await tx.reportCard.findFirst({
    where: { id: input.reportCardId, schoolId: input.schoolId },
    include: { student: { include: { guardians: { include: { guardian: true } } } }, term: true },
  });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  if (!["approved", "sent"].includes(report.status)) throw new AppError("Only approved reports can be released.", 409, "INVALID_STATE");
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId }, select: { notificationChannels: true, whatsappTemplateConfig: true } });
  const rawChannels = settings?.notificationChannels;
  const combined = rawChannels && !Array.isArray(rawChannels) && typeof rawChannels === "object"
    ? { ...(rawChannels as Record<string, Prisma.JsonValue>), whatsappTemplateConfig: settings?.whatsappTemplateConfig ?? (rawChannels as Record<string, Prisma.JsonValue>).whatsappTemplateConfig }
    : ({ whatsappTemplateConfig: settings?.whatsappTemplateConfig ?? {} } as Record<string, Prisma.JsonValue>);
  const { channels, whatsappTemplateConfig } = extractChannelConfig(combined);
  if (!channels.length) throw new AppError("Select at least one enabled report-card delivery channel before releasing this report.", 409, "NO_NOTIFICATION_CHANNEL");
  requireProviderConfiguration(channels, whatsappTemplateConfig);
  const publicUrl = publicReportPdfUrl(input.origin, createPublicReportPdfToken({ schoolId: input.schoolId, reportId: report.id }));
  const recipients = report.student.guardians.filter((link) => Boolean(link.guardian.phone));
  if (!recipients.length) throw new AppError("No linked guardian has a phone number for this release.", 409, "NO_GUARDIAN_PHONE");
  let queued = 0;
  for (const link of recipients) {
    const result = await enqueueSms(tx, {
      schoolId: input.schoolId,
      recipientType: "guardian",
      recipientId: link.guardianId,
      recipientPhone: link.guardian.phone!,
      body: `SukuuNova: ${report.student.name}'s approved ${report.term.name} report card is ready. Open the secure PDF link: ${publicUrl}`,
      templateKey: "report_card_ready",
      templateVariables: { "1": report.student.name, "2": report.term.name, "3": publicUrl },
      mediaUrl: publicUrl,
    });
    queued += result.length;
  }
  return { report, queued, recipientCount: recipients.length, publicUrl, channels };
}

export async function approveAndQueuePublicReportCard(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string; origin: string; headRemark?: string }) {
  await requirePermission(tx, input.actorId, "report_cards:approve");
  const report = await tx.reportCard.findFirst({ where: { id: input.reportCardId, schoolId: input.schoolId }, select: { id: true, status: true, submittedBy: true, termId: true } });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  if (report.status !== "submitted") throw new AppError("Only submitted reports can be approved.", 409, "INVALID_STATE");
  if (report.submittedBy === input.actorId) throw new ForbiddenError("The submitter cannot approve the same report.");

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`term-mutation:${input.schoolId}:${report.termId}`}))`;
  const current = await tx.reportCard.findFirst({ where: { id: report.id, schoolId: input.schoolId }, select: { id: true, status: true, submittedBy: true } });
  if (!current || current.status !== "submitted") throw new AppError("Only submitted reports can be approved.", 409, "INVALID_STATE");

  await freezeIntelligentReportCard(tx, input.schoolId, current.id);
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId }, select: { notificationChannels: true } });
  const { config, channels } = extractChannelConfig(settings?.notificationChannels);
  const automation = config.automation && !Array.isArray(config.automation) && typeof config.automation === "object" ? config.automation as Record<string, Prisma.JsonValue> : {};
  const approvedAt = new Date();
  const approveClaim = await tx.reportCard.updateMany({ where: { id: current.id, schoolId: input.schoolId, status: "submitted" }, data: { status: "approved", approvedBy: input.actorId, approvedAt } });
  if (approveClaim.count !== 1) throw new AppError("This report card was approved by another request. Refresh and try again.", 409, "RELEASE_ALREADY_CLAIMED");

  const headRemarkValue = input.headRemark?.trim().slice(0, 2000) || null;
  if (headRemarkValue) await writeHeadRemark(tx, input.schoolId, current.id, headRemarkValue);
  const promotion = await applyApprovedPromotion(tx, { schoolId: input.schoolId, actorId: input.actorId, reportCardId: current.id });
  const approved = { id: current.id, status: "approved", approvedBy: input.actorId, approvedAt };
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "report_card.approved",
    entityType: "ReportCard",
    entityId: current.id,
    before: { status: current.status },
    after: { status: approved.status, rankingFrozen: true, signaturesFrozen: true, promotion },
  });

  let notification: { attempted: number; queued: number; skipped: boolean; publicPdf: boolean; reason?: string } = { attempted: 0, queued: 0, skipped: true, publicPdf: true };
  if (automation.report_card_ready === true && channels.length) {
    try {
      const queuedResult = await queuePublicRelease(tx, { ...input, reportCardId: current.id });
      notification = { attempted: queuedResult.recipientCount, queued: queuedResult.queued, skipped: false, publicPdf: true };
      await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.automation_queued", entityType: "ReportCard", entityId: current.id, after: { guardianCount: queuedResult.recipientCount, channelCount: queuedResult.channels.length, queued: queuedResult.queued, publicPdf: true } });
    } catch (error: unknown) {
      if (error instanceof AppError && (error.code === "NO_GUARDIAN_PHONE" || error.code === "NOTIFICATION_PROVIDER_UNAVAILABLE")) {
        notification = { attempted: 0, queued: 0, skipped: true, publicPdf: true, reason: error.code };
        await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.automation_skipped", entityType: "ReportCard", entityId: current.id, after: { reason: error.code, message: error.message } });
      } else {
        throw error;
      }
    }
  }
  return { ...approved, promotion, notification };
}

export async function sendApprovedReportCardPublic(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string; origin: string }) {
  if (!(await hasPermission(tx, input.actorId, "report_cards:approve"))) throw new AppError("You are not permitted to release report cards.", 403, "FORBIDDEN");
  const current = await tx.reportCard.findFirst({ where: { id: input.reportCardId, schoolId: input.schoolId }, select: { id: true, status: true, sentAt: true } });
  if (!current) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  if (current.status === "sent") throw new AppError("This report card has already been released.", 409, "ALREADY_RELEASED");
  if (current.status !== "approved") throw new AppError("Only approved reports can be released.", 409, "INVALID_STATE");
  const claimedAt = new Date();
  const claim = await tx.reportCard.updateMany({ where: { id: input.reportCardId, schoolId: input.schoolId, status: "approved" }, data: { status: "sent", sentAt: claimedAt } });
  if (claim.count !== 1) throw new AppError("This report card was released by another request. Refresh and try again.", 409, "RELEASE_ALREADY_CLAIMED");
  let queued;
  try {
    queued = await queuePublicRelease(tx, input);
  } catch (error) {
    await tx.reportCard.updateMany({ where: { id: current.id, schoolId: input.schoolId, status: "sent" }, data: { status: "approved", sentAt: null } });
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.release_failed", entityType: "ReportCard", entityId: current.id, before: { status: "sent" }, after: { status: "approved", error: error instanceof Error ? error.message.slice(0, 300) : "release failed" } });
    throw error;
  }
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.released", entityType: "ReportCard", entityId: current.id, before: { status: current.status, sentAt: current.sentAt }, after: { status: "sent", sentAt: claimedAt, recipientCount: queued.recipientCount, queued: queued.queued, channels: queued.channels, publicPdf: true } });
  return { ...queued.report, status: "sent", sentAt: claimedAt, queued: queued.queued, recipientCount: queued.recipientCount, publicPdfUrl: queued.publicUrl };
}
