import { createHmac, timingSafeEqual } from "node:crypto";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { hasPermission } from "@/lib/rbac";
import { enqueueSms } from "@/lib/message-outbox";

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_VERSION = "rcpdf-v1";

type TokenPayload = { v: string; schoolId: string; reportId: string; exp: number };

function secret(): Buffer {
  const value = process.env.SCHOOL_AUTH_SECRET;
  if (!value || value.length < 32) throw new AppError("SCHOOL_AUTH_SECRET is not configured securely.", 500, "CONFIGURATION_ERROR");
  return Buffer.from(value + ":report-card-public-pdf:v1", "utf8");
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(encodedPayload: string): string {
  return createHmac("sha256", secret()).update(encodedPayload, "utf8").digest("base64url");
}

export function createPublicReportPdfToken(input: { schoolId: string; reportId: string; expiresAt?: Date }): string {
  const exp = Math.floor((input.expiresAt?.getTime() ?? (Date.now() + TOKEN_TTL_SECONDS * 1000)) / 1000);
  const payload: TokenPayload = { v: TOKEN_VERSION, schoolId: input.schoolId, reportId: input.reportId, exp };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function verifyPublicReportPdfToken(token: string): TokenPayload | null {
  const [encoded, supplied] = token.trim().split(".");
  if (!encoded || !supplied || supplied.length < 20) return null;
  const expected = signature(encoded);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) return null;
  try {
    const payload = JSON.parse(decode(encoded)) as Partial<TokenPayload>;
    if (payload.v !== TOKEN_VERSION || typeof payload.schoolId !== "string" || typeof payload.reportId !== "string" || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export function publicReportPdfUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/g, "")}/api/public/report-cards/${encodeURIComponent(token)}/pdf`;
}

export async function sendApprovedReportCardPublic(tx: TenantDb, input: { schoolId: string; actorId: string; reportCardId: string; origin: string }) {
  if (!(await hasPermission(tx, input.actorId, "report_cards:approve"))) throw new AppError("You are not permitted to release report cards.", 403, "FORBIDDEN");
  const report = await tx.reportCard.findFirst({ where: { id: input.reportCardId, schoolId: input.schoolId }, include: { student: { include: { guardians: { include: { guardian: true } } } }, term: true } });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  if (report.status !== "approved") throw new AppError("Only approved reports can be released.", 409, "INVALID_STATE");
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
      mediaUrl: publicUrl
    });
    queued += result.length;
  }
  const final = await tx.reportCard.update({ where: { id: report.id }, data: { sentAt: new Date() } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "report_card.released", entityType: "ReportCard", entityId: report.id, before: { status: report.status, sentAt: report.sentAt }, after: { status: final.status, sentAt: final.sentAt, recipientCount: recipients.length, queued } });
  return { ...final, queued, recipientCount: recipients.length, publicPdfUrl: publicUrl };
}
