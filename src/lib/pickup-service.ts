import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError, ForbiddenError } from "./errors";
import { requirePermission } from "./rbac";

async function assertActivePickupLearner(tx: TenantDb, schoolId: string, studentId: string) {
  const student = await tx.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true, status: true },
  });
  if (!student) throw new AppError("Student not found in this school.", 404, "NOT_FOUND");
  if (student.status !== "active") {
    throw new AppError("Only an active learner can be collected from school.", 409, "PICKUP_STUDENT_NOT_ACTIVE");
  }
  return student;
}

async function assertNoPickupCompletedToday(tx: TenantDb, schoolId: string, studentId: string) {
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId }, select: { timezone: true } });
  const timezone = settings?.timezone ?? "Africa/Accra";
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id"
       FROM "PickupEvent"
      WHERE "schoolId"=$1 AND "studentId"=$2
        AND ("timestamp" AT TIME ZONE $3)::date = (CURRENT_TIMESTAMP AT TIME ZONE $3)::date
      LIMIT 1`,
    schoolId,
    studentId,
    timezone
  );
  if (rows.length) {
    throw new AppError("This learner has already been collected today.", 409, "PICKUP_ALREADY_COMPLETED");
  }
}

export async function addApprovedPickup(tx: TenantDb, input: { schoolId: string; actorId: string; studentId: string; guardianId: string }) {
  await requirePermission(tx, input.actorId, "attendance:pickup_approve");
  const [student, guardian] = await Promise.all([
    tx.student.findFirst({ where: { id: input.studentId, schoolId: input.schoolId }, select: { id: true, status: true } }),
    tx.guardian.findFirst({ where: { id: input.guardianId, schoolId: input.schoolId }, select: { id: true } })
  ]);
  if (!student || !guardian) throw new AppError("Student or guardian not found in this school.", 404, "NOT_FOUND");
  if (student.status !== "active") throw new AppError("Approved pickup contacts can only be added for active learners.", 409, "PICKUP_STUDENT_NOT_ACTIVE");
  const approved = await tx.approvedPickup.upsert({ where: { schoolId_studentId_guardianId: { schoolId: input.schoolId, studentId: input.studentId, guardianId: input.guardianId } }, update: {}, create: { schoolId: input.schoolId, studentId: input.studentId, guardianId: input.guardianId } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "pickup.guardian_approved", entityType: "ApprovedPickup", entityId: approved.id, after: approved });
  return approved;
}

export async function attemptPickup(tx: TenantDb, input: { schoolId: string; actorId: string; studentId: string; guardianId: string }) {
  await requirePermission(tx, input.actorId, "attendance:record");
  // Lock at learner level, not learner+guardian, so two different collectors cannot complete
  // the same learner's pickup concurrently.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pickup:${input.schoolId}:${input.studentId}`}))`;
  const [guardian, approved] = await Promise.all([
    tx.guardian.findFirst({ where: { id: input.guardianId, schoolId: input.schoolId }, select: { id: true } }),
    tx.approvedPickup.findFirst({ where: { schoolId: input.schoolId, studentId: input.studentId, guardianId: input.guardianId }, select: { id: true } })
  ]);
  if (!guardian) throw new AppError("Collecting guardian not found in this school.", 404, "NOT_FOUND");
  await assertActivePickupLearner(tx, input.schoolId, input.studentId);
  await assertNoPickupCompletedToday(tx, input.schoolId, input.studentId);

  if (approved) {
    const event = await tx.pickupEvent.create({ data: { schoolId: input.schoolId, studentId: input.studentId, collectedByGuardianId: input.guardianId, wasPreApproved: true } });
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "pickup.completed_preapproved", entityType: "PickupEvent", entityId: event.id, after: event });
    return { status: "completed" as const, event };
  }
  const existing = await tx.pickupApprovalRequest.findFirst({ where: { schoolId: input.schoolId, studentId: input.studentId, collectedByGuardianId: input.guardianId, status: "pending" } });
  const request = existing ?? await tx.pickupApprovalRequest.create({ data: { schoolId: input.schoolId, studentId: input.studentId, collectedByGuardianId: input.guardianId, requestedByUserId: input.actorId } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "pickup.approval_requested", entityType: "PickupApprovalRequest", entityId: request.id, after: { studentId: request.studentId, guardianId: request.collectedByGuardianId } });
  return { status: "approval_required" as const, request };
}

export async function reviewPickupRequest(tx: TenantDb, input: { schoolId: string; actorId: string; requestId: string; decision: "approved" | "rejected" }) {
  await requirePermission(tx, input.actorId, "attendance:pickup_approve");
  const request = await tx.pickupApprovalRequest.findFirst({ where: { id: input.requestId, schoolId: input.schoolId } });
  if (!request) throw new AppError("Pickup request not found.", 404, "NOT_FOUND");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pickup:${input.schoolId}:${request.studentId}`}))`;
  const current = await tx.pickupApprovalRequest.findFirst({ where: { id: request.id, schoolId: input.schoolId } });
  if (!current) throw new AppError("Pickup request not found.", 404, "NOT_FOUND");
  if (current.status !== "pending") throw new AppError("Pickup request is already complete.", 409, "INVALID_STATE");
  if (current.requestedByUserId === input.actorId) throw new ForbiddenError("A different authorized staff member must approve an unscheduled pickup.");
  if (input.decision === "rejected") {
    const rejected = await tx.pickupApprovalRequest.update({ where: { id: current.id }, data: { status: "rejected", approvedByUserId: input.actorId, reviewedAt: new Date() } });
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "pickup.rejected", entityType: "PickupApprovalRequest", entityId: current.id, before: { status: current.status }, after: { status: rejected.status, studentId: current.studentId, guardianId: current.collectedByGuardianId } });
    return rejected;
  }

  await assertActivePickupLearner(tx, input.schoolId, current.studentId);
  await assertNoPickupCompletedToday(tx, input.schoolId, current.studentId);
  await tx.pickupApprovalRequest.update({ where: { id: current.id }, data: { status: "approved", approvedByUserId: input.actorId, reviewedAt: new Date() } });
  const event = await tx.pickupEvent.create({ data: { schoolId: input.schoolId, studentId: current.studentId, collectedByGuardianId: current.collectedByGuardianId, wasPreApproved: false, approvedByUserId: input.actorId } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "pickup.completed_after_approval", entityType: "PickupEvent", entityId: event.id, after: event });
  return { requestId: current.id, event };
}