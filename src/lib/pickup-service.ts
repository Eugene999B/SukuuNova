import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError, ForbiddenError } from "./errors";
import { requirePermission } from "./rbac";

export async function addApprovedPickup(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    studentId: string;
    guardianId: string;
  }
) {
  await requirePermission(tx, input.actorId, "attendance:pickup_approve");
  const [student, guardian] = await Promise.all([
    tx.student.findFirst({ where: { id: input.studentId, schoolId: input.schoolId }, select: { id: true } }),
    tx.guardian.findFirst({ where: { id: input.guardianId, schoolId: input.schoolId }, select: { id: true } })
  ]);
  if (!student || !guardian) {
    throw new AppError("Student or guardian not found in this school.", 404, "NOT_FOUND");
  }
  const approved = await tx.approvedPickup.upsert({
    where: {
      schoolId_studentId_guardianId: {
        schoolId: input.schoolId,
        studentId: input.studentId,
        guardianId: input.guardianId
      }
    },
    update: {},
    create: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      guardianId: input.guardianId
    }
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "pickup.guardian_approved",
    entityType: "ApprovedPickup",
    entityId: approved.id,
    after: approved
  });
  return approved;
}

export async function attemptPickup(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    studentId: string;
    guardianId: string;
  }
) {
  await requirePermission(tx, input.actorId, "attendance:record");
  const [student, guardian, approved] = await Promise.all([
    tx.student.findFirst({ where: { id: input.studentId, schoolId: input.schoolId }, select: { id: true } }),
    tx.guardian.findFirst({ where: { id: input.guardianId, schoolId: input.schoolId }, select: { id: true } }),
    tx.approvedPickup.findFirst({
      where: { schoolId: input.schoolId, studentId: input.studentId, guardianId: input.guardianId },
      select: { id: true }
    })
  ]);
  if (!student || !guardian) {
    throw new AppError("Student or collecting guardian not found in this school.", 404, "NOT_FOUND");
  }
  if (approved) {
    const event = await tx.pickupEvent.create({
      data: {
        schoolId: input.schoolId,
        studentId: input.studentId,
        collectedByGuardianId: input.guardianId,
        wasPreApproved: true
      }
    });
    await appendSchoolAudit(tx, {
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "pickup.completed_preapproved",
      entityType: "PickupEvent",
      entityId: event.id,
      after: event
    });
    return { status: "completed" as const, event };
  }

  const existing = await tx.pickupApprovalRequest.findFirst({
    where: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      collectedByGuardianId: input.guardianId,
      status: "pending"
    }
  });
  const request = existing ?? await tx.pickupApprovalRequest.create({
    data: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      collectedByGuardianId: input.guardianId,
      requestedByUserId: input.actorId
    }
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "pickup.approval_requested",
    entityType: "PickupApprovalRequest",
    entityId: request.id,
    after: { studentId: request.studentId, guardianId: request.collectedByGuardianId }
  });
  return { status: "approval_required" as const, request };
}

export async function reviewPickupRequest(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    requestId: string;
    decision: "approved" | "rejected";
  }
) {
  await requirePermission(tx, input.actorId, "attendance:pickup_approve");
  const request = await tx.pickupApprovalRequest.findFirst({
    where: { id: input.requestId, schoolId: input.schoolId }
  });
  if (!request) throw new AppError("Pickup request not found.", 404, "NOT_FOUND");
  if (request.status !== "pending") {
    throw new AppError("Pickup request is already complete.", 409, "INVALID_STATE");
  }
  if (request.requestedByUserId === input.actorId) {
    throw new ForbiddenError("A different authorized staff member must approve an unscheduled pickup.");
  }
  if (input.decision === "rejected") {
    const rejected = await tx.pickupApprovalRequest.update({
      where: { id: request.id },
      data: {
        status: "rejected",
        approvedByUserId: input.actorId,
        reviewedAt: new Date()
      }
    });
    await appendSchoolAudit(tx, {
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "pickup.rejected",
      entityType: "PickupApprovalRequest",
      entityId: request.id,
      before: { status: request.status },
      after: { status: rejected.status, studentId: request.studentId, guardianId: request.collectedByGuardianId }
    });
    return rejected;
  }

  await tx.pickupApprovalRequest.update({
    where: { id: request.id },
    data: {
      status: "approved",
      approvedByUserId: input.actorId,
      reviewedAt: new Date()
    }
  });
  const event = await tx.pickupEvent.create({
    data: {
      schoolId: input.schoolId,
      studentId: request.studentId,
      collectedByGuardianId: request.collectedByGuardianId,
      wasPreApproved: false,
      approvedByUserId: input.actorId
    }
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "pickup.completed_after_approval",
    entityType: "PickupEvent",
    entityId: event.id,
    after: event
  });
  return { requestId: request.id, event };
}
