import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { hasPermission } from "./rbac";

export type OperationsIntent =
  | "TODAY_ATTENDANCE"
  | "MISSING_SCORES"
  | "OVERDUE_INVOICES"
  | "PENDING_REPORTS"
  | "FAILED_MESSAGES"
  | "UNRESOLVED_PICKUPS"
  | "UNSUPPORTED";

export function classifyOperationsIntent(message: string): OperationsIntent {
  const s = message.trim().toLowerCase();
  if (/today.*attendance|attendance.*today|who.*present|who.*absent/.test(s)) return "TODAY_ATTENDANCE";
  if (/missing.*score|scores.*missing|not entered.*score/.test(s)) return "MISSING_SCORES";
  if (/overdue.*invoice|invoice.*overdue|outstanding.*invoice|fee arrears|overdue fees/.test(s)) return "OVERDUE_INVOICES";
  if (/pending.*report|report.*pending|reports.*awaiting/.test(s)) return "PENDING_REPORTS";
  if (/failed.*message|message.*failed|sms.*failed|whatsapp.*failed/.test(s)) return "FAILED_MESSAGES";
  if (/unresolved.*pickup|pickup.*pending|pickup.*awaiting/.test(s)) return "UNRESOLVED_PICKUPS";
  return "UNSUPPORTED";
}

async function authorizeRead(tx: TenantDb, actorId: string) {
  if (!(await hasPermission(tx, actorId, "analytics:view")) && !(await hasPermission(tx, actorId, "audit:read"))) {
    throw new AppError("This account cannot use the school operations assistant.", 403, "FORBIDDEN");
  }
}

export async function runOperationsAssistant(tx: TenantDb, input: { actorId: string; message: string }) {
  await authorizeRead(tx, input.actorId);
  const intent = classifyOperationsIntent(input.message);
  if (intent === "UNSUPPORTED") return { intent, answer: "I cannot answer that from the available school records." };

  switch (intent) {
    case "TODAY_ATTENDANCE": {
      const rows = await tx.attendanceEvent.findMany({
        where: { attendanceDate: new Date(new Date().toISOString().slice(0, 10)), type: "in", studentId: { not: null } },
        select: { studentId: true, isLate: true, student: { select: { name: true, admissionNo: true } } },
        orderBy: { timestamp: "asc" }, take: 500
      });
      return { intent, answer: `Recorded check-ins today: ${rows.length}.`, records: rows };
    }
    case "MISSING_SCORES": {
      const rows = await tx.assessment.findMany({
        where: { scores: { none: {} } },
        select: { id: true, name: true, type: true, class: { select: { name: true } }, subject: { select: { name: true } } },
        orderBy: [{ subject: { name: "asc" } }, { name: "asc" }], take: 300
      });
      return { intent, answer: `Assessments with no recorded scores: ${rows.length}.`, records: rows };
    }
    case "OVERDUE_INVOICES": {
      const rows = await tx.invoice.findMany({
        where: { status: { not: "paid" } },
        select: { id: true, totalAmount: true, status: true, student: { select: { name: true, admissionNo: true } } },
        orderBy: { createdAt: "asc" }, take: 300
      });
      return { intent, answer: `Unpaid invoices recorded: ${rows.length}.`, records: rows };
    }
    case "PENDING_REPORTS": {
      const rows = await tx.reportCard.findMany({
        where: { status: { in: ["draft", "submitted"] } },
        select: { id: true, status: true, student: { select: { name: true, admissionNo: true } }, term: { select: { name: true } } },
        orderBy: { createdAt: "asc" }, take: 300
      });
      return { intent, answer: `Reports awaiting completion or approval: ${rows.length}.`, records: rows };
    }
    case "FAILED_MESSAGES": {
      const rows = await tx.message.findMany({
        where: { status: "failed" },
        select: { id: true, channel: true, recipientPhone: true, lastError: true, createdAt: true },
        orderBy: { createdAt: "desc" }, take: 300
      });
      return { intent, answer: `Failed messages: ${rows.length}.`, records: rows };
    }
    case "UNRESOLVED_PICKUPS": {
      const rows = await tx.pickupApprovalRequest.findMany({
        where: { status: "pending" },
        select: { id: true, status: true, createdAt: true, student: { select: { name: true, admissionNo: true } }, collectingGuardian: { select: { name: true, phone: true } } },
        orderBy: { createdAt: "asc" }, take: 300
      });
      return { intent, answer: `Unresolved pickup requests: ${rows.length}.`, records: rows };
    }
  }
}
