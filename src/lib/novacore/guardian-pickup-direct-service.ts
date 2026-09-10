import { createId } from "@paralleldrive/cuid2";
import { appendSchoolAudit } from "@/lib/audit";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { PickupDirection } from "@/lib/novacore/family-transport-service";

type AssignmentRow = {
  id: string;
  routeId: string;
  vehicleId: string | null;
  morningEnabled: boolean;
  afternoonEnabled: boolean;
};

async function activeAssignment(tx: TenantDb, schoolId: string, studentId: string, at = new Date()) {
  const rows = await tx.$queryRawUnsafe<AssignmentRow[]>(
    `SELECT "id","routeId","vehicleId","morningEnabled","afternoonEnabled"
     FROM "P3StudentTransportAssignment"
     WHERE "schoolId"=$1 AND "studentId"=$2 AND "status"='active'
       AND "effectiveFrom" <= $3 AND ("effectiveTo" IS NULL OR "effectiveTo" >= $3)
     ORDER BY "effectiveFrom" DESC LIMIT 1`,
    schoolId,
    studentId,
    at,
  );
  return rows[0] ?? null;
}

export async function saveGuardianPickupPoint(tx: TenantDb, input: {
  schoolId: string;
  guardianId: string;
  guardianUserId: string;
  studentId: string;
  direction: PickupDirection;
  latitude: number;
  longitude: number;
  label?: string | null;
  isTemporary?: boolean;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
}) {
  const link = await tx.studentGuardian.findFirst({
    where: { schoolId: input.schoolId, guardianId: input.guardianId, studentId: input.studentId },
    select: { studentId: true },
  });
  if (!link) throw new AppError("This learner is not linked to your family account.", 403, "GUARDIAN_STUDENT_FORBIDDEN");

  const now = new Date();
  const effectiveFrom = input.effectiveFrom ?? now;
  const assignment = await activeAssignment(tx, input.schoolId, input.studentId, effectiveFrom);
  if (!assignment) throw new AppError("This learner does not have an active school transport assignment.", 409, "TRANSPORT_ASSIGNMENT_REQUIRED");
  if (input.direction === "morning" && !assignment.morningEnabled) throw new AppError("Morning transport is not enabled for this learner.", 409, "MORNING_TRANSPORT_DISABLED");
  if (input.direction === "afternoon" && !assignment.afternoonEnabled) throw new AppError("Afternoon transport is not enabled for this learner.", 409, "AFTERNOON_TRANSPORT_DISABLED");
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90 || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) throw new AppError("Choose a valid pickup location.", 400, "INVALID_PICKUP_LOCATION");
  if (input.isTemporary && !input.effectiveTo) throw new AppError("A temporary pickup point needs an end date.", 400, "TEMPORARY_PICKUP_END_REQUIRED");
  if (input.effectiveTo && input.effectiveTo <= effectiveFrom) throw new AppError("Pickup end time must be after its start time.", 400, "INVALID_PICKUP_WINDOW");

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guardian-pickup:${input.schoolId}:${input.studentId}:${input.direction}`}))`;

  const previous = await tx.$queryRawUnsafe<Array<{ id: string; latitude: string; longitude: string; label: string | null; status: string; effectiveFrom: Date | null; effectiveTo: Date | null }>>(
    `SELECT "id","latitude"::text,"longitude"::text,"label","status","effectiveFrom","effectiveTo"
     FROM "P3PickupPoint"
     WHERE "schoolId"=$1 AND "studentId"=$2 AND "direction"=$3 AND "status"='approved'
       AND ("effectiveFrom" IS NULL OR "effectiveFrom" <= $4)
       AND ("effectiveTo" IS NULL OR "effectiveTo" >= $4)
     ORDER BY "requestedAt" DESC`,
    input.schoolId,
    input.studentId,
    input.direction,
    effectiveFrom,
  );

  await tx.$executeRawUnsafe(
    `UPDATE "P3PickupPoint"
     SET "status"='superseded',"effectiveTo"=COALESCE("effectiveTo",$4),"decisionNote"='Replaced directly by the linked family account',"updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=$1 AND "studentId"=$2 AND "direction"=$3 AND "status"='approved'
       AND ("effectiveFrom" IS NULL OR "effectiveFrom" <= $4)
       AND ("effectiveTo" IS NULL OR "effectiveTo" >= $4)`,
    input.schoolId,
    input.studentId,
    input.direction,
    effectiveFrom,
  );
  await tx.$executeRawUnsafe(
    `UPDATE "P3PickupPoint"
     SET "status"='superseded',"decisionNote"='Superseded by direct family pickup update',"updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=$1 AND "guardianId"=$2 AND "studentId"=$3 AND "direction"=$4 AND "status"='pending'`,
    input.schoolId,
    input.guardianId,
    input.studentId,
    input.direction,
  );

  const id = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "P3PickupPoint"
      ("id","schoolId","guardianId","studentId","routeId","direction","label","latitude","longitude","status","isTemporary","requestedAt","approvedBy","approvedAt","effectiveFrom","effectiveTo","decisionNote")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved',$10,CURRENT_TIMESTAMP,$11,CURRENT_TIMESTAMP,$12,$13,'Saved directly by linked family account')`,
    id,
    input.schoolId,
    input.guardianId,
    input.studentId,
    assignment.routeId,
    input.direction,
    input.label?.trim().slice(0, 160) || "Family pickup point",
    input.latitude,
    input.longitude,
    Boolean(input.isTemporary),
    input.guardianUserId,
    effectiveFrom,
    input.effectiveTo ?? null,
  );

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.guardianUserId,
    action: "transport.pickup_family_updated",
    entityType: "P3PickupPoint",
    entityId: id,
    before: { activePoints: previous },
    after: {
      studentId: input.studentId,
      routeId: assignment.routeId,
      direction: input.direction,
      latitude: input.latitude,
      longitude: input.longitude,
      label: input.label?.trim().slice(0, 160) || "Family pickup point",
      isTemporary: Boolean(input.isTemporary),
      effectiveFrom: effectiveFrom.toISOString(),
      effectiveTo: input.effectiveTo?.toISOString() ?? null,
      source: "guardian_self_service",
    },
  });

  return {
    id,
    status: "approved",
    studentId: input.studentId,
    routeId: assignment.routeId,
    direction: input.direction,
    effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
  };
}
