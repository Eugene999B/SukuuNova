import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { AppError, ForbiddenError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";

export type GuardianPickupDirection = "morning" | "afternoon";

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

/**
 * Set the family's active geofence/pickup point without a school approval queue.
 *
 * Safety boundary:
 * - the guardian may only change a learner already linked to their own family account;
 * - the school remains authoritative for route/vehicle assignment and whether morning/afternoon
 *   transport is enabled;
 * - every replacement is transactional and audited;
 * - the live transport engine continues to consume only `approved` points that fall inside their
 *   effective window. Here `approved` means active/usable by NovaCore, not "approved by a staff member".
 */
export async function setGuardianPickupLocation(tx: TenantDb, input: {
  schoolId: string;
  guardianId: string;
  guardianUserId: string;
  studentId: string;
  direction: GuardianPickupDirection;
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
  if (!link) throw new ForbiddenError("This learner is not linked to your family account.");

  const now = new Date();
  const effectiveFrom = input.effectiveFrom ?? now;
  const assignment = await activeAssignment(tx, input.schoolId, input.studentId, effectiveFrom);
  if (!assignment) throw new AppError("This learner does not have an active school transport assignment.", 409, "TRANSPORT_ASSIGNMENT_REQUIRED");
  if (input.direction === "morning" && !assignment.morningEnabled) throw new AppError("Morning transport is not enabled for this learner.", 409, "MORNING_TRANSPORT_DISABLED");
  if (input.direction === "afternoon" && !assignment.afternoonEnabled) throw new AppError("Afternoon transport is not enabled for this learner.", 409, "AFTERNOON_TRANSPORT_DISABLED");

  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90 || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new AppError("Choose a valid pickup location.", 400, "INVALID_PICKUP_LOCATION");
  }
  if (input.isTemporary && !input.effectiveTo) throw new AppError("A temporary pickup location needs an end date.", 400, "TEMPORARY_PICKUP_END_REQUIRED");
  if (input.effectiveTo && input.effectiveTo <= effectiveFrom) throw new AppError("Pickup end time must be after its start time.", 400, "INVALID_PICKUP_WINDOW");

  // One current point per learner/direction is enforced by the database. Retire both legacy pending
  // requests and the previously-active point before inserting the replacement.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guardian-pickup:${input.schoolId}:${input.studentId}:${input.direction}`}))`;
  await tx.$executeRawUnsafe(
    `UPDATE "P3PickupPoint"
     SET "status"='superseded',"effectiveTo"=COALESCE("effectiveTo",$5),
         "decisionNote"='Replaced directly by the linked guardian',"updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=$1 AND "guardianId"=$2 AND "studentId"=$3 AND "direction"=$4
       AND "status" IN ('approved','pending')`,
    input.schoolId,
    input.guardianId,
    input.studentId,
    input.direction,
    effectiveFrom,
  );

  const locationId = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "P3PickupPoint"
      ("id","schoolId","guardianId","studentId","routeId","direction","label","latitude","longitude","status","isTemporary","requestedAt","approvedAt","effectiveFrom","effectiveTo","decisionNote")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved',$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$11,$12,'Set directly by linked guardian')`,
    locationId,
    input.schoolId,
    input.guardianId,
    input.studentId,
    assignment.routeId,
    input.direction,
    input.label?.trim().slice(0, 160) || null,
    input.latitude,
    input.longitude,
    Boolean(input.isTemporary),
    effectiveFrom,
    input.effectiveTo ?? null,
  );

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.guardianUserId,
    action: "transport.pickup_set_by_guardian",
    entityType: "P3PickupPoint",
    entityId: locationId,
    after: {
      studentId: input.studentId,
      routeId: assignment.routeId,
      direction: input.direction,
      latitude: input.latitude,
      longitude: input.longitude,
      isTemporary: Boolean(input.isTemporary),
      effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
    },
  });

  return {
    id: locationId,
    status: "approved",
    active: true,
    studentId: input.studentId,
    routeId: assignment.routeId,
    direction: input.direction,
    effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
  };
}
