import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";

export type PickupDirection = "morning" | "afternoon";

type AssignmentRow = {
  id: string;
  routeId: string;
  vehicleId: string | null;
  morningEnabled: boolean;
  afternoonEnabled: boolean;
};

type PickupRow = {
  id: string;
  guardianId: string;
  studentId: string;
  routeId: string | null;
  direction: PickupDirection;
  label: string | null;
  latitude: string;
  longitude: string;
  status: string;
  isTemporary: boolean;
  requestedAt: Date;
  approvedAt: Date | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  decisionNote: string | null;
};

async function linkedStudent(tx: TenantDb, schoolId: string, guardianId: string, studentId: string) {
  return tx.studentGuardian.findFirst({
    where: { schoolId, guardianId, studentId },
    include: { student: { select: { id: true, name: true, admissionNo: true, class: { select: { name: true } } } } },
  });
}

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

export async function requestGuardianPickupPoint(tx: TenantDb, input: {
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
  const link = await linkedStudent(tx, input.schoolId, input.guardianId, input.studentId);
  if (!link) throw new AppError("This learner is not linked to your family account.", 403, "GUARDIAN_STUDENT_FORBIDDEN");
  const assignment = await activeAssignment(tx, input.schoolId, input.studentId);
  if (!assignment) throw new AppError("This learner does not have an active school transport assignment.", 409, "TRANSPORT_ASSIGNMENT_REQUIRED");
  if (input.direction === "morning" && !assignment.morningEnabled) throw new AppError("Morning transport is not enabled for this learner.", 409, "MORNING_TRANSPORT_DISABLED");
  if (input.direction === "afternoon" && !assignment.afternoonEnabled) throw new AppError("Afternoon transport is not enabled for this learner.", 409, "AFTERNOON_TRANSPORT_DISABLED");
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90 || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new AppError("Choose a valid pickup location.", 400, "INVALID_PICKUP_LOCATION");
  }
  if (input.isTemporary && !input.effectiveTo) throw new AppError("A temporary pickup point needs an end date.", 400, "TEMPORARY_PICKUP_END_REQUIRED");
  if (input.effectiveFrom && input.effectiveTo && input.effectiveTo <= input.effectiveFrom) throw new AppError("Pickup end time must be after its start time.", 400, "INVALID_PICKUP_WINDOW");

  await tx.$executeRawUnsafe(
    `UPDATE "P3PickupPoint" SET "status"='superseded',"decisionNote"='Replaced by a newer family request',"updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=$1 AND "guardianId"=$2 AND "studentId"=$3 AND "direction"=$4 AND "status"='pending'`,
    input.schoolId,
    input.guardianId,
    input.studentId,
    input.direction,
  );

  const id = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "P3PickupPoint"
      ("id","schoolId","guardianId","studentId","routeId","direction","label","latitude","longitude","status","isTemporary","effectiveFrom","effectiveTo")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12)`,
    id,
    input.schoolId,
    input.guardianId,
    input.studentId,
    assignment.routeId,
    input.direction,
    input.label?.trim().slice(0, 160) || null,
    input.latitude,
    input.longitude,
    Boolean(input.isTemporary),
    input.effectiveFrom ?? null,
    input.effectiveTo ?? null,
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.guardianUserId,
    action: "transport.pickup_requested",
    entityType: "P3PickupPoint",
    entityId: id,
    after: { studentId: input.studentId, routeId: assignment.routeId, direction: input.direction, isTemporary: Boolean(input.isTemporary) },
  });
  return { id, status: "pending", studentId: input.studentId, routeId: assignment.routeId, direction: input.direction };
}

export async function reviewPickupPoint(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  pickupPointId: string;
  decision: "approve" | "reject";
  note?: string | null;
}) {
  const rows = await tx.$queryRawUnsafe<PickupRow[]>(
    `SELECT "id","guardianId","studentId","routeId","direction","label","latitude"::text,"longitude"::text,"status","isTemporary","requestedAt","approvedAt","effectiveFrom","effectiveTo","decisionNote"
     FROM "P3PickupPoint" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
    input.schoolId,
    input.pickupPointId,
  );
  const pickup = rows[0];
  if (!pickup) throw new AppError("Pickup request was not found.", 404, "PICKUP_REQUEST_NOT_FOUND");
  if (pickup.status !== "pending") throw new AppError("Only a pending pickup request can be reviewed.", 409, "PICKUP_REQUEST_ALREADY_REVIEWED");
  const now = new Date();
  const note = input.note?.trim().slice(0, 500) || null;

  if (input.decision === "approve") {
    await tx.$executeRawUnsafe(
      `UPDATE "P3PickupPoint" SET "effectiveTo"=$5,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "schoolId"=$1 AND "studentId"=$2 AND "direction"=$3 AND "status"='approved' AND "effectiveTo" IS NULL AND "id"<>$4`,
      input.schoolId,
      pickup.studentId,
      pickup.direction,
      pickup.id,
      now,
    );
    await tx.$executeRawUnsafe(
      `UPDATE "P3PickupPoint" SET "status"='approved',"approvedBy"=$3,"approvedAt"=$4,"effectiveFrom"=COALESCE("effectiveFrom",$4),"decisionNote"=$5,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "schoolId"=$1 AND "id"=$2`,
      input.schoolId,
      pickup.id,
      input.actorId,
      now,
      note,
    );
  } else {
    await tx.$executeRawUnsafe(
      `UPDATE "P3PickupPoint" SET "status"='rejected',"rejectedBy"=$3,"rejectedAt"=$4,"decisionNote"=$5,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "schoolId"=$1 AND "id"=$2`,
      input.schoolId,
      pickup.id,
      input.actorId,
      now,
      note,
    );
  }

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: input.decision === "approve" ? "transport.pickup_approved" : "transport.pickup_rejected",
    entityType: "P3PickupPoint",
    entityId: pickup.id,
    before: { status: pickup.status },
    after: { status: input.decision === "approve" ? "approved" : "rejected", studentId: pickup.studentId, direction: pickup.direction, note },
  });
  return { id: pickup.id, status: input.decision === "approve" ? "approved" : "rejected" };
}

export async function getGuardianTransportOverview(tx: TenantDb, input: { schoolId: string; guardianId: string }) {
  const links = await tx.studentGuardian.findMany({
    where: { schoolId: input.schoolId, guardianId: input.guardianId },
    include: { student: { select: { id: true, name: true, admissionNo: true, class: { select: { name: true } } } } },
    orderBy: { student: { name: "asc" } },
  });

  const children = [] as Array<Record<string, unknown>>;
  for (const link of links) {
    const assignment = await activeAssignment(tx, input.schoolId, link.studentId);
    const pickups = await tx.$queryRawUnsafe<PickupRow[]>(
      `SELECT "id","guardianId","studentId","routeId","direction","label","latitude"::text,"longitude"::text,"status","isTemporary","requestedAt","approvedAt","effectiveFrom","effectiveTo","decisionNote"
       FROM "P3PickupPoint"
       WHERE "schoolId"=$1 AND "studentId"=$2 AND ("status"='approved' OR "guardianId"=$3)
       ORDER BY "requestedAt" DESC`,
      input.schoolId,
      link.studentId,
      input.guardianId,
    );
    let route: Record<string, unknown> | null = null;
    let activeTrip: Record<string, unknown> | null = null;
    if (assignment) {
      const routes = await tx.$queryRawUnsafe<Array<{ id: string; name: string; code: string; origin: string | null; destination: string | null }>>(
        `SELECT "id","name","code","origin","destination" FROM "P3BusRoute" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
        input.schoolId,
        assignment.routeId,
      );
      route = routes[0] ?? null;
      const trips = await tx.$queryRawUnsafe<Array<{ id: string; direction: PickupDirection; status: string; startedAt: Date | null; lastLocationAt: Date | null; vehicleId: string; registrationNumber: string; vehicleName: string | null }>>(
        `SELECT tr."id",tr."direction",tr."status",tr."startedAt",tr."lastLocationAt",tr."vehicleId",v."registrationNumber",v."name" AS "vehicleName"
         FROM "P3TransportTrip" tr
         JOIN "P3Vehicle" v ON v."id"=tr."vehicleId" AND v."schoolId"=tr."schoolId"
         WHERE tr."schoolId"=$1 AND tr."routeId"=$2 AND tr."status"='active'
         ORDER BY tr."startedAt" DESC NULLS LAST LIMIT 1`,
        input.schoolId,
        assignment.routeId,
      );
      if (trips[0]) {
        const [locations, shape, geofence] = await Promise.all([
          tx.$queryRawUnsafe<Array<{
            latitude: string;
            longitude: string;
            rawLatitude: string;
            rawLongitude: string;
            speedKph: string;
            heading: string | null;
            reportedAt: Date;
            routeDeviation: boolean;
            routeDistanceMeters: string | null;
            routeProgressMeters: string | null;
            routeRemainingMeters: string | null;
            routeMatchConfidence: string | null;
            algorithmVersion: string | null;
          }>>(
            `SELECT COALESCE("normalizedLatitude","latitude")::text AS "latitude",
                    COALESCE("normalizedLongitude","longitude")::text AS "longitude",
                    "latitude"::text AS "rawLatitude","longitude"::text AS "rawLongitude",
                    "speedKph"::text,"heading"::text,"reportedAt","routeDeviation",
                    "routeDistanceMeters"::text,"routeProgressMeters"::text,"routeRemainingMeters"::text,
                    "routeMatchConfidence"::text,"algorithmVersion"
             FROM "P3VehicleLocation"
             WHERE "schoolId"=$1 AND "tripId"=$2 AND "quality"='accepted'
             ORDER BY "reportedAt" DESC LIMIT 1`,
            input.schoolId,
            trips[0].id,
          ),
          tx.$queryRawUnsafe<Array<{ latitude: string; longitude: string; sequence: number }>>(
            `SELECT "latitude"::text,"longitude"::text,"sequence"
             FROM "P3RouteShapePoint"
             WHERE "schoolId"=$1 AND "routeId"=$2 AND "direction"=$3
             ORDER BY "sequence" ASC`,
            input.schoolId,
            assignment.routeId,
            trips[0].direction,
          ),
          tx.$queryRawUnsafe<Array<{
            state: string;
            etaMinutes: number | null;
            etaConfidenceMinutes: number | null;
            routeRemainingMeters: string | null;
            predictionVersion: string | null;
            approachingAt: Date | null;
            arrivingAt: Date | null;
            arrivedAt: Date | null;
            passedAt: Date | null;
            updatedAt: Date;
          }>>(
            `SELECT "state","etaMinutes","etaConfidenceMinutes","routeRemainingMeters"::text,"predictionVersion",
                    "approachingAt","arrivingAt","arrivedAt","passedAt","updatedAt"
             FROM "P3GeofenceState"
             WHERE "schoolId"=$1 AND "tripId"=$2 AND "studentId"=$3 LIMIT 1`,
            input.schoolId,
            trips[0].id,
            link.studentId,
          ),
        ]);
        activeTrip = {
          ...trips[0],
          latestLocation: locations[0] ?? null,
          routeShape: shape,
          childProgress: geofence[0] ?? null,
        };
      }
    }
    const alerts = await tx.$queryRawUnsafe<Array<{ id: string; type: string; status: string; queuedAt: Date; sentAt: Date | null; details: unknown }>>(
      `SELECT "id","type","status","queuedAt","sentAt","details"
       FROM "P3TransportAlert"
       WHERE "schoolId"=$1 AND "guardianId"=$2 AND "studentId"=$3
       ORDER BY "queuedAt" DESC LIMIT 20`,
      input.schoolId,
      input.guardianId,
      link.studentId,
    );
    children.push({ student: link.student, assignment, route, pickups, activeTrip, alerts });
  }
  return { children };
}

export async function getSchoolTransportControl(tx: TenantDb, schoolId: string) {
  const [pendingPickups, trackers, activeTrips, recentAlerts, routeReadiness] = await Promise.all([
    tx.$queryRawUnsafe(
      `SELECT p."id",p."studentId",s."name" AS "studentName",p."guardianId",g."name" AS "guardianName",p."routeId",p."direction",p."label",p."latitude"::text,p."longitude"::text,p."isTemporary",p."effectiveFrom",p."effectiveTo",p."requestedAt"
       FROM "P3PickupPoint" p
       JOIN "Student" s ON s."id"=p."studentId" AND s."schoolId"=p."schoolId"
       JOIN "Guardian" g ON g."id"=p."guardianId" AND g."schoolId"=p."schoolId"
       WHERE p."schoolId"=$1 AND p."status"='pending' ORDER BY p."requestedAt" ASC`,
      schoolId,
    ),
    tx.$queryRawUnsafe(
      `SELECT t."id",t."vehicleId",v."registrationNumber",v."name" AS "vehicleName",t."model",t."status",t."firmwareVersion",t."lastSeenAt",t."lastPowerState",t."lastNetworkState",
              c."id" AS "certificationId",c."status" AS "certificationStatus",c."startedAt" AS "certificationStartedAt",c."endedAt" AS "certificationEndedAt",
              c."acceptedPackets",c."rejectedPackets",c."acceptedRatio"::text,c."maxHeartbeatGapSeconds"::text,c."latestPacketAgeSeconds"::text,c."failureReasons",c."algorithmVersion" AS "certificationVersion"
       FROM "P3TrackerDevice" t
       LEFT JOIN "P3Vehicle" v ON v."id"=t."vehicleId" AND v."schoolId"=t."schoolId"
       LEFT JOIN LATERAL (
         SELECT * FROM "P3TrackerCertification" c0
         WHERE c0."schoolId"=t."schoolId" AND c0."trackerDeviceId"=t."id"
         ORDER BY c0."startedAt" DESC LIMIT 1
       ) c ON true
       WHERE t."schoolId"=$1 ORDER BY t."updatedAt" DESC`,
      schoolId,
    ),
    tx.$queryRawUnsafe(
      `SELECT tr."id",tr."routeId",r."name" AS "routeName",tr."vehicleId",v."registrationNumber",tr."direction",tr."status",tr."startedAt",tr."lastLocationAt",
              loc."latitude",loc."longitude",loc."speedKph",loc."reportedAt",loc."routeDeviation",loc."routeMatchConfidence"
       FROM "P3TransportTrip" tr
       JOIN "P3BusRoute" r ON r."id"=tr."routeId" AND r."schoolId"=tr."schoolId"
       JOIN "P3Vehicle" v ON v."id"=tr."vehicleId" AND v."schoolId"=tr."schoolId"
       LEFT JOIN LATERAL (
         SELECT COALESCE(l."normalizedLatitude",l."latitude")::text AS "latitude",
                COALESCE(l."normalizedLongitude",l."longitude")::text AS "longitude",
                l."speedKph"::text AS "speedKph",l."reportedAt",l."routeDeviation",l."routeMatchConfidence"::text AS "routeMatchConfidence"
         FROM "P3VehicleLocation" l
         WHERE l."schoolId"=tr."schoolId" AND l."tripId"=tr."id" AND l."quality"='accepted'
         ORDER BY l."reportedAt" DESC LIMIT 1
       ) loc ON true
       WHERE tr."schoolId"=$1 AND tr."status" IN ('scheduled','active')
       ORDER BY tr."serviceDate" ASC,tr."plannedStartAt" ASC NULLS LAST`,
      schoolId,
    ),
    tx.$queryRawUnsafe(
      `SELECT "id","tripId","studentId","guardianId","type","channel","status","queuedAt","sentAt","details"
       FROM "P3TransportAlert" WHERE "schoolId"=$1 ORDER BY "queuedAt" DESC LIMIT 100`,
      schoolId,
    ),
    tx.$queryRawUnsafe(
      `SELECT r."id",r."name",r."code",
              COUNT(*) FILTER (WHERE p."direction"='morning')::int AS "morningShapePoints",
              COUNT(*) FILTER (WHERE p."direction"='afternoon')::int AS "afternoonShapePoints"
       FROM "P3BusRoute" r
       LEFT JOIN "P3RouteShapePoint" p ON p."schoolId"=r."schoolId" AND p."routeId"=r."id"
       WHERE r."schoolId"=$1
       GROUP BY r."id",r."name",r."code"
       ORDER BY r."name" ASC`,
      schoolId,
    ),
  ]);
  return { pendingPickups, trackers, activeTrips, recentAlerts, routeReadiness };
}
