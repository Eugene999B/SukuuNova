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
  const name = input.name.trim();
  const purpose = input.purpose.trim();
  if (!name || !purpose) throw new AppError("Visitor name and purpose are required.", 400, "INVALID_INPUT");
  if (input.hostStaffId) {
    const host = await tx.user.findFirst({ where: { id: input.hostStaffId, schoolId: input.schoolId, status: "active" }, select: { id: true } });
    if (!host) throw new AppError("Host staff member was not found in this school.", 404, "HOST_NOT_FOUND");
  }
  const visitor = await tx.visitorLog.create({
    data: {
      schoolId: input.schoolId,
      name,
      phone: input.phone?.trim(),
      purpose,
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
  const visitor = await tx.visitorLog.findFirst({ where: { id: input.visitorId, schoolId: input.schoolId } });
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
