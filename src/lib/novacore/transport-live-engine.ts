import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import {
  haversineDistanceMeters,
  nextGeofenceState,
  type GeofenceMemory,
  type GeoPoint,
} from "./transport";

export type ActiveTransportTrip = {
  id: string;
  routeId: string;
  vehicleId: string;
  direction: string;
};

type PickupRow = {
  id: string;
  studentId: string;
  latitude: string;
  longitude: string;
};

type StateRow = {
  state: GeofenceMemory["state"];
  previousDistanceMeters: string | null;
  consecutiveSamples: number;
};

export type LiveTransportProcessingResult = {
  pickupsEvaluated: number;
  transitions: number;
  guardianAlertsQueued: number;
};

function directionColumn(direction: string) {
  if (direction === "morning") return 'a."morningEnabled"=true';
  if (direction === "afternoon") return 'a."afternoonEnabled"=true';
  return "true";
}

export async function processLiveTransportLocation(
  tx: TenantDb,
  schoolId: string,
  trip: ActiveTransportTrip,
  point: GeoPoint,
  reportedAt: Date,
): Promise<LiveTransportProcessingResult> {
  const pickups = await tx.$queryRawUnsafe<PickupRow[]>(
    `SELECT p."id",p."studentId",p."latitude"::text,p."longitude"::text
     FROM "P3PickupPoint" p
     JOIN "P3StudentTransportAssignment" a
       ON a."schoolId"=p."schoolId" AND a."studentId"=p."studentId" AND a."routeId"=$2
     WHERE p."schoolId"=$1
       AND p."routeId"=$2
       AND p."direction"=$3
       AND p."status"='approved'
       AND (p."effectiveFrom" IS NULL OR p."effectiveFrom" <= $4)
       AND (p."effectiveTo" IS NULL OR p."effectiveTo" >= $4)
       AND a."status"='active'
       AND a."effectiveFrom" <= $4
       AND (a."effectiveTo" IS NULL OR a."effectiveTo" >= $4)
       AND ${directionColumn(trip.direction)}`,
    schoolId,
    trip.routeId,
    trip.direction,
    reportedAt,
  );

  let transitions = 0;
  let guardianAlertsQueued = 0;

  for (const pickup of pickups) {
    const distanceMeters = haversineDistanceMeters(point, {
      latitude: Number(pickup.latitude),
      longitude: Number(pickup.longitude),
    });
    const existing = await tx.$queryRawUnsafe<StateRow[]>(
      `SELECT "state","previousDistanceMeters"::text,"consecutiveSamples"
       FROM "P3GeofenceState"
       WHERE "schoolId"=$1 AND "tripId"=$2 AND "studentId"=$3
       LIMIT 1`,
      schoolId,
      trip.id,
      pickup.studentId,
    );
    const memory: GeofenceMemory = existing[0] ? {
      state: existing[0].state,
      previousDistanceMeters: existing[0].previousDistanceMeters == null ? null : Number(existing[0].previousDistanceMeters),
      consecutiveSamples: existing[0].consecutiveSamples,
    } : { state: "outside", previousDistanceMeters: null, consecutiveSamples: 0 };
    const decision = nextGeofenceState(memory, distanceMeters);
    if (decision.transitioned) transitions += 1;

    const transitionAt = decision.transitioned ? reportedAt : null;
    await tx.$executeRawUnsafe(
      `INSERT INTO "P3GeofenceState"
        ("id","schoolId","tripId","studentId","pickupPointId","state","previousDistanceMeters","consecutiveSamples","approachingAt","arrivingAt","arrivedAt","passedAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
         CASE WHEN $6='approaching' THEN $9 ELSE NULL END,
         CASE WHEN $6='arriving' THEN $9 ELSE NULL END,
         CASE WHEN $6='arrived' THEN $9 ELSE NULL END,
         CASE WHEN $6='passed' THEN $9 ELSE NULL END,
         CURRENT_TIMESTAMP)
       ON CONFLICT ("schoolId","tripId","studentId") DO UPDATE SET
         "pickupPointId"=EXCLUDED."pickupPointId",
         "state"=EXCLUDED."state",
         "previousDistanceMeters"=EXCLUDED."previousDistanceMeters",
         "consecutiveSamples"=EXCLUDED."consecutiveSamples",
         "approachingAt"=COALESCE("P3GeofenceState"."approachingAt",EXCLUDED."approachingAt"),
         "arrivingAt"=COALESCE("P3GeofenceState"."arrivingAt",EXCLUDED."arrivingAt"),
         "arrivedAt"=COALESCE("P3GeofenceState"."arrivedAt",EXCLUDED."arrivedAt"),
         "passedAt"=COALESCE("P3GeofenceState"."passedAt",EXCLUDED."passedAt"),
         "updatedAt"=CURRENT_TIMESTAMP`,
      createId(),
      schoolId,
      trip.id,
      pickup.studentId,
      pickup.id,
      decision.state,
      distanceMeters,
      decision.consecutiveSamples,
      transitionAt,
    );

    if (!decision.transitioned || !decision.notification) continue;
    const guardians = await tx.studentGuardian.findMany({
      where: { studentId: pickup.studentId },
      select: { guardianId: true },
    });
    for (const guardian of guardians) {
      const idempotencyKey = `${trip.id}:${pickup.studentId}:${guardian.guardianId}:${decision.notification}`;
      const inserted = await tx.$executeRawUnsafe(
        `INSERT INTO "P3TransportAlert"
          ("id","schoolId","tripId","studentId","guardianId","type","channel","idempotencyKey","status","details")
         VALUES ($1,$2,$3,$4,$5,$6,'policy',$7,'queued',$8::jsonb)
         ON CONFLICT ("schoolId","idempotencyKey") DO NOTHING`,
        createId(),
        schoolId,
        trip.id,
        pickup.studentId,
        guardian.guardianId,
        decision.notification,
        idempotencyKey,
        JSON.stringify({ pickupPointId: pickup.id, distanceMeters: Math.round(distanceMeters), reportedAt: reportedAt.toISOString() }),
      );
      guardianAlertsQueued += Number(inserted ?? 0);
    }
  }

  return { pickupsEvaluated: pickups.length, transitions, guardianAlertsQueued };
}
