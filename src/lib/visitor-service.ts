import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";

export async function signInVisitor(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    name: string;
    phone?: string;
    purpose: string;
    hostStaffId?: string;
  }
) {
  await requirePermission(tx, input.actorId, "visitors:log");
  const visitor = await tx.visitorLog.create({
    data: {
      schoolId: input.schoolId,
      name: input.name.trim(),
      phone: input.phone?.trim(),
      purpose: input.purpose.trim(),
      hostStaffId: input.hostStaffId
    }
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "visitor.signed_in",
    entityType: "VisitorLog",
    entityId: visitor.id,
    after: visitor
  });
  return visitor;
}

export async function signOutVisitor(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; visitorId: string }
) {
  await requirePermission(tx, input.actorId, "visitors:log");
  const visitor = await tx.visitorLog.findUnique({ where: { id: input.visitorId } });
  if (!visitor) throw new AppError("Visitor log not found.", 404, "NOT_FOUND");
  if (visitor.timeOut) throw new AppError("Visitor is already signed out.", 409, "INVALID_STATE");
  const updated = await tx.visitorLog.update({
    where: { id: visitor.id },
    data: { timeOut: new Date() }
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "visitor.signed_out",
    entityType: "VisitorLog",
    entityId: visitor.id,
    before: { timeOut: null },
    after: { timeOut: updated.timeOut }
  });
  return updated;
}
