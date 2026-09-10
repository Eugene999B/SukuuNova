import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { hasPermission, requirePermission } from "./rbac";
import { safeResourceUrl } from "./resource-url";

export const SUPPORT_KINDS = ["problem", "suggestion"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];
export const SUPPORT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type SupportSeverity = (typeof SUPPORT_SEVERITIES)[number];
export const SUPPORT_MODULES = [
  "general", "onboarding", "import", "academics", "gradebook", "report_cards", "attendance",
  "fees", "communications", "transport", "library", "arcade", "devices", "payroll",
  "recruitment", "assets",
] as const;
export type SupportModule = (typeof SUPPORT_MODULES)[number];

type SupportMessageRow = {
  id: string;
  ticketId: string;
  senderId: string;
  senderType: string;
  body: string;
  sentAt: Date;
  schoolUserName: string | null;
};

type SupportTicketRow = {
  id: string;
  raisedByUserId: string;
  raisedByName: string;
  subject: string;
  status: string;
  kind: SupportKind;
  module: SupportModule;
  severity: SupportSeverity;
  context: unknown;
  attachmentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function cleanText(value: string, max: number, field: string) {
  const text = value.trim();
  if (!text || text.length > max) throw new AppError(`${field} is required and must be ${max} characters or fewer.`, 400, "SUPPORT_INPUT_INVALID");
  return text;
}

function cleanContext(value: Record<string, unknown> | undefined) {
  if (!value) return {};
  const allowed = ["pagePath", "browser", "appVersion", "schoolWorkflow", "diagnosticNote"];
  const result: Record<string, string> = {};
  for (const key of allowed) {
    const raw = value[key];
    if (typeof raw === "string" && raw.trim()) result[key] = raw.trim().slice(0, key === "diagnosticNote" ? 1000 : 300);
  }
  return result;
}

function safeAttachment(value?: string | null) {
  if (!value?.trim()) return null;
  const safe = safeResourceUrl(value.trim());
  if (!safe) throw new AppError("Screenshot/attachment URL must be HTTPS, HTTP or a same-site path.", 400, "SUPPORT_ATTACHMENT_INVALID");
  return safe;
}

async function supportAccess(tx: TenantDb, userId: string) {
  const [canCreate, canViewOwn, canManage] = await Promise.all([
    hasPermission(tx, userId, "support:create"),
    hasPermission(tx, userId, "support:view_own"),
    hasPermission(tx, userId, "support:manage"),
  ]);
  if (!canCreate && !canViewOwn && !canManage) throw new AppError("You do not have access to school support.", 403, "FORBIDDEN");
  return { canCreate, canViewOwn: canViewOwn || canManage, canManage };
}

export async function getSchoolSupportCenter(tx: TenantDb, input: { schoolId: string; userId: string }) {
  const access = await supportAccess(tx, input.userId);
  const tickets = await tx.$queryRawUnsafe<SupportTicketRow[]>(
    `SELECT t."id",t."raisedByUserId",u."name" AS "raisedByName",t."subject",t."status",t."kind",t."module",t."severity",t."context",t."attachmentUrl",t."createdAt",t."updatedAt"
     FROM "SupportTicket" t
     JOIN "User" u ON u."id"=t."raisedByUserId" AND u."schoolId"=t."schoolId"
     WHERE t."schoolId"=$1 AND ($3::boolean OR t."raisedByUserId"=$2)
     ORDER BY CASE t."severity" WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
              CASE WHEN t."status" IN ('open','in_progress') THEN 0 ELSE 1 END,
              t."updatedAt" DESC
     LIMIT 250`,
    input.schoolId,
    input.userId,
    access.canManage,
  );
  const ticketIds = tickets.map((ticket) => ticket.id);
  const messages = ticketIds.length ? await tx.$queryRawUnsafe<SupportMessageRow[]>(
    `SELECT m."id",m."ticketId",m."senderId",m."senderType",m."body",m."sentAt",u."name" AS "schoolUserName"
     FROM "SupportTicketMessage" m
     LEFT JOIN "User" u ON u."id"=m."senderId" AND u."schoolId"=m."schoolId" AND m."senderType"='school_user'
     WHERE m."schoolId"=$1 AND m."ticketId"=ANY($2::text[])
     ORDER BY m."sentAt" ASC`,
    input.schoolId,
    ticketIds,
  ) : [];
  const byTicket = new Map<string, Array<Record<string, unknown>>>();
  for (const message of messages) {
    const list = byTicket.get(message.ticketId) ?? [];
    list.push({
      id: message.id,
      senderType: message.senderType,
      senderName: message.senderType === "platform_admin" ? "SukuuNova Support" : message.senderType === "system" ? "SukuuNova" : message.schoolUserName ?? "School user",
      body: message.body,
      sentAt: message.sentAt,
    });
    byTicket.set(message.ticketId, list);
  }
  return {
    access,
    tickets: tickets.map((ticket) => ({ ...ticket, messages: byTicket.get(ticket.id) ?? [] })),
  };
}

export async function createStructuredSupportTicket(tx: TenantDb, input: {
  schoolId: string;
  userId: string;
  kind: SupportKind;
  module: SupportModule;
  severity: SupportSeverity;
  subject: string;
  body: string;
  context?: Record<string, unknown>;
  attachmentUrl?: string | null;
}) {
  await requirePermission(tx, input.userId, "support:create");
  const id = createId();
  const subject = cleanText(input.subject, 240, "Subject");
  const body = cleanText(input.body, 5000, "Description");
  const context = cleanContext(input.context);
  const attachmentUrl = safeAttachment(input.attachmentUrl);
  await tx.$executeRawUnsafe(
    `INSERT INTO "SupportTicket" ("id","schoolId","raisedByUserId","subject","status","kind","module","severity","context","attachmentUrl","updatedAt")
     VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8::jsonb,$9,CURRENT_TIMESTAMP)`,
    id,
    input.schoolId,
    input.userId,
    subject,
    input.kind,
    input.module,
    input.severity,
    JSON.stringify(context),
    attachmentUrl,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "SupportTicketMessage" ("id","schoolId","ticketId","senderId","senderType","body") VALUES ($1,$2,$3,$4,'school_user',$5)`,
    createId(), input.schoolId, id, input.userId, body,
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.userId,
    action: "support.ticket_created",
    entityType: "SupportTicket",
    entityId: id,
    after: { kind: input.kind, module: input.module, severity: input.severity, subject, hasAttachment: Boolean(attachmentUrl), contextKeys: Object.keys(context) },
  });
  return { id, status: "open" };
}

export async function replyToSchoolSupportTicket(tx: TenantDb, input: { schoolId: string; userId: string; ticketId: string; body: string }) {
  const access = await supportAccess(tx, input.userId);
  if (!access.canViewOwn) throw new AppError("You do not have permission to reply to support cases.", 403, "FORBIDDEN");
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; raisedByUserId: string; status: string }>>(
    `SELECT "id","raisedByUserId","status" FROM "SupportTicket" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1 FOR UPDATE`,
    input.schoolId,
    input.ticketId,
  );
  const ticket = rows[0];
  if (!ticket || (!access.canManage && ticket.raisedByUserId !== input.userId)) throw new AppError("Support case was not found.", 404, "SUPPORT_TICKET_NOT_FOUND");
  const body = cleanText(input.body, 5000, "Reply");
  await tx.$executeRawUnsafe(
    `INSERT INTO "SupportTicketMessage" ("id","schoolId","ticketId","senderId","senderType","body") VALUES ($1,$2,$3,$4,'school_user',$5)`,
    createId(), input.schoolId, input.ticketId, input.userId, body,
  );
  await tx.$executeRawUnsafe(
    `UPDATE "SupportTicket" SET "status"=CASE WHEN "status" IN ('resolved','closed') THEN 'open' ELSE "status" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`,
    input.schoolId,
    input.ticketId,
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.userId,
    action: "support.ticket_replied",
    entityType: "SupportTicket",
    entityId: input.ticketId,
    after: { reopened: ["resolved", "closed"].includes(ticket.status) },
  });
  return { id: input.ticketId, status: ["resolved", "closed"].includes(ticket.status) ? "open" : ticket.status };
}
