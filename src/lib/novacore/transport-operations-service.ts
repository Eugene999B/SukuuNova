import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";
import { startTrackerCertification } from "./tracker-certification-service";

function validImei(value: string) {
  return /^\d{14,20}$/.test(value);
}

export async function registerCertifiedTracker(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  vehicleId: string;
  imei: string;
  model: "FMC130";
  simIccid?: string | null;
  simMsisdn?: string | null;
  apn?: string | null;
}) {
  if (!validImei(input.imei)) throw new AppError("Enter a valid tracker IMEI.", 400, "INVALID_TRACKER_IMEI");
  const vehicles = await tx.$queryRawUnsafe<Array<{ id: string; registrationNumber: string }>>(
    `SELECT "id","registrationNumber" FROM "P3Vehicle" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`,
    input.schoolId,
    input.vehicleId,
  );
  if (!vehicles[0]) throw new AppError("Choose an active school vehicle.", 404, "TRANSPORT_VEHICLE_NOT_FOUND");
  const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "P3TrackerDevice" WHERE "schoolId"=$1 AND "imei"=$2 LIMIT 1`,
    input.schoolId,
    input.imei,
  );
  if (existing[0]) throw new AppError("This IMEI is already registered in the school.", 409, "TRACKER_IMEI_EXISTS");

  const id = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "P3TrackerDevice"
      ("id","schoolId","vehicleId","imei","manufacturer","model","codec","status","simIccid","simMsisdn","apn")
     VALUES ($1,$2,$3,$4,'Teltonika',$5,'8E','testing',$6,$7,$8)`,
    id,
    input.schoolId,
    input.vehicleId,
    input.imei,
    input.model,
    input.simIccid?.trim() || null,
    input.simMsisdn?.trim() || null,
    input.apn?.trim() || null,
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "transport.tracker_registered",
    entityType: "P3TrackerDevice",
    entityId: id,
    after: { vehicleId: input.vehicleId, model: input.model, codec: "8E", status: "testing" },
  });
  const certification = await startTrackerCertification(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    trackerDeviceId: id,
  });
  return { id, vehicleId: input.vehicleId, imei: input.imei, model: input.model, status: "testing", certification };
}

export async function assignStudentTransport(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  studentId: string;
  routeId: string;
  vehicleId?: string | null;
  morningEnabled: boolean;
  afternoonEnabled: boolean;
}) {
  if (!input.morningEnabled && !input.afternoonEnabled) throw new AppError("Enable morning, afternoon, or both transport directions.", 400, "TRANSPORT_DIRECTION_REQUIRED");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`transport-assignment:${input.schoolId}:${input.studentId}`}))`;
  const [student, routes] = await Promise.all([
    tx.student.findFirst({ where: { id: input.studentId, schoolId: input.schoolId, status: "active" }, select: { id: true, name: true } }),
    tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "P3BusRoute" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`, input.schoolId, input.routeId),
  ]);
  if (!student) throw new AppError("Learner was not found or is inactive.", 404, "TRANSPORT_STUDENT_NOT_FOUND");
  if (!routes[0]) throw new AppError("Choose an active transport route.", 404, "TRANSPORT_ROUTE_NOT_FOUND");
  if (input.vehicleId) {
    const vehicle = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "P3Vehicle" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`, input.schoolId, input.vehicleId);
    if (!vehicle[0]) throw new AppError("Choose an active school vehicle.", 404, "TRANSPORT_VEHICLE_NOT_FOUND");
  }

  const now = new Date();
  await tx.$executeRawUnsafe(
    `UPDATE "P3StudentTransportAssignment" SET "status"='inactive',"effectiveTo"=$3,"updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=$1 AND "studentId"=$2 AND "status"='active' AND "effectiveTo" IS NULL`,
    input.schoolId,
    input.studentId,
    now,
  );
  const id = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "P3StudentTransportAssignment"
      ("id","schoolId","studentId","routeId","vehicleId","status","morningEnabled","afternoonEnabled","effectiveFrom","createdBy")
     VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9)`,
    id,
    input.schoolId,
    input.studentId,
    input.routeId,
    input.vehicleId ?? null,
    input.morningEnabled,
    input.afternoonEnabled,
    now,
    input.actorId,
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "transport.student_assigned",
    entityType: "P3StudentTransportAssignment",
    entityId: id,
    after: { studentId: input.studentId, routeId: input.routeId, vehicleId: input.vehicleId ?? null, morningEnabled: input.morningEnabled, afternoonEnabled: input.afternoonEnabled },
  });
  return { id, studentId: input.studentId, routeId: input.routeId };
}

export async function startTransportTrip(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  routeId: string;
  vehicleId: string;
  trackerDeviceId: string;
  direction: "morning" | "afternoon";
}) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`transport-trip:${input.schoolId}:${input.vehicleId}`}))`;
  const [routes, vehicles, trackers, active, routeShape] = await Promise.all([
    tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "P3BusRoute" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`, input.schoolId, input.routeId),
    tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "P3Vehicle" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`, input.schoolId, input.vehicleId),
    tx.$queryRawUnsafe<Array<{ id: string; vehicleId: string | null; status: string; lastSeenAt: Date | null }>>(`SELECT "id","vehicleId","status","lastSeenAt" FROM "P3TrackerDevice" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, input.schoolId, input.trackerDeviceId),
    tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "P3TransportTrip" WHERE "schoolId"=$1 AND "vehicleId"=$2 AND "status"='active' LIMIT 1`, input.schoolId, input.vehicleId),
    tx.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS "count" FROM "P3RouteShapePoint" WHERE "schoolId"=$1 AND "routeId"=$2 AND "direction"=$3`, input.schoolId, input.routeId, input.direction),
  ]);
  if (!routes[0]) throw new AppError("Choose an active transport route.", 404, "TRANSPORT_ROUTE_NOT_FOUND");
  if (!vehicles[0]) throw new AppError("Choose an active school vehicle.", 404, "TRANSPORT_VEHICLE_NOT_FOUND");
  const tracker = trackers[0];
  if (!tracker || tracker.vehicleId !== input.vehicleId || tracker.status !== "active") {
    throw new AppError("This vehicle needs a successfully certified active tracker before a live trip can start.", 409, "TRACKER_NOT_CERTIFIED");
  }
  if (!tracker.lastSeenAt || Date.now() - tracker.lastSeenAt.getTime() > 120_000) {
    throw new AppError("The certified tracker is not reporting a fresh heartbeat. Check power, SIM/APN and network before starting the trip.", 409, "TRACKER_NOT_LIVE");
  }
  if (Number(routeShape[0]?.count ?? 0n) < 2) {
    throw new AppError(`Add the ${input.direction} route geometry before starting a live trip.`, 409, "ROUTE_SHAPE_REQUIRED");
  }
  if (active[0]) throw new AppError("This vehicle already has an active trip.", 409, "TRANSPORT_TRIP_ALREADY_ACTIVE");

  const id = createId();
  const now = new Date();
  const serviceDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  await tx.$executeRawUnsafe(
    `INSERT INTO "P3TransportTrip" ("id","schoolId","routeId","vehicleId","trackerDeviceId","direction","serviceDate","status","startedAt","lastLocationAt","createdBy")
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,NULL,$9)`,
    id,
    input.schoolId,
    input.routeId,
    input.vehicleId,
    input.trackerDeviceId,
    input.direction,
    serviceDate,
    now,
    input.actorId,
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "transport.trip_started",
    entityType: "P3TransportTrip",
    entityId: id,
    after: { routeId: input.routeId, vehicleId: input.vehicleId, trackerDeviceId: input.trackerDeviceId, direction: input.direction },
  });
  return { id, status: "active", startedAt: now };
}

export async function finishTransportTrip(tx: TenantDb, input: { schoolId: string; actorId: string; tripId: string }) {
  const trips = await tx.$queryRawUnsafe<Array<{ id: string; status: string; vehicleId: string; routeId: string; direction: string }>>(
    `SELECT "id","status","vehicleId","routeId","direction" FROM "P3TransportTrip" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
    input.schoolId,
    input.tripId,
  );
  const trip = trips[0];
  if (!trip) throw new AppError("Transport trip was not found.", 404, "TRANSPORT_TRIP_NOT_FOUND");
  if (trip.status !== "active") throw new AppError("Only an active trip can be completed.", 409, "TRANSPORT_TRIP_NOT_ACTIVE");
  const endedAt = new Date();
  await tx.$executeRawUnsafe(
    `UPDATE "P3TransportTrip" SET "status"='completed',"endedAt"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`,
    input.schoolId,
    input.tripId,
    endedAt,
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "transport.trip_completed",
    entityType: "P3TransportTrip",
    entityId: input.tripId,
    before: { status: "active" },
    after: { status: "completed", endedAt: endedAt.toISOString() },
  });
  return { id: input.tripId, status: "completed", endedAt };
}
