import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";

type TripRow = {
  id: string;
  routeId: string;
  routeName: string;
  vehicleId: string;
  registrationNumber: string;
  vehicleName: string | null;
  trackerDeviceId: string | null;
  direction: "morning" | "afternoon";
  serviceDate: Date;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
};

type ReplayLocationRow = {
  id: string;
  rawLatitude: string;
  rawLongitude: string;
  latitude: string;
  longitude: string;
  speedKph: string;
  heading: string | null;
  reportedAt: Date;
  quality: string;
  source: string;
  routeDistanceMeters: string | null;
  routeProgressMeters: string | null;
  routeRemainingMeters: string | null;
  routeMatchConfidence: string | null;
  routeDeviation: boolean;
  algorithmVersion: string | null;
};

export async function getTransportTripReplay(tx: TenantDb, input: { schoolId: string; tripId: string }) {
  const trips = await tx.$queryRawUnsafe<TripRow[]>(
    `SELECT tr."id",tr."routeId",r."name" AS "routeName",tr."vehicleId",v."registrationNumber",v."name" AS "vehicleName",
            tr."trackerDeviceId",tr."direction",tr."serviceDate",tr."status",tr."startedAt",tr."endedAt"
     FROM "P3TransportTrip" tr
     JOIN "P3BusRoute" r ON r."id"=tr."routeId" AND r."schoolId"=tr."schoolId"
     JOIN "P3Vehicle" v ON v."id"=tr."vehicleId" AND v."schoolId"=tr."schoolId"
     WHERE tr."schoolId"=$1 AND tr."id"=$2 LIMIT 1`,
    input.schoolId,
    input.tripId,
  );
  const trip = trips[0];
  if (!trip) throw new AppError("Transport trip was not found.", 404, "TRANSPORT_TRIP_NOT_FOUND");
  const from = trip.startedAt ?? trip.serviceDate;
  const to = trip.endedAt ?? new Date();

  const [routeShape, locationCount, locations, geofences, alerts, incidents, boardingEvents] = await Promise.all([
    tx.$queryRawUnsafe(
      `SELECT "sequence","latitude"::text,"longitude"::text
       FROM "P3RouteShapePoint"
       WHERE "schoolId"=$1 AND "routeId"=$2 AND "direction"=$3
       ORDER BY "sequence" ASC`,
      input.schoolId,
      trip.routeId,
      trip.direction,
    ),
    tx.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS "count" FROM "P3VehicleLocation" WHERE "schoolId"=$1 AND "tripId"=$2`,
      input.schoolId,
      trip.id,
    ),
    tx.$queryRawUnsafe<ReplayLocationRow[]>(
      `SELECT "id","latitude"::text AS "rawLatitude","longitude"::text AS "rawLongitude",
              COALESCE("normalizedLatitude","latitude")::text AS "latitude",
              COALESCE("normalizedLongitude","longitude")::text AS "longitude",
              "speedKph"::text,"heading"::text,"reportedAt","quality","source",
              "routeDistanceMeters"::text,"routeProgressMeters"::text,"routeRemainingMeters"::text,
              "routeMatchConfidence"::text,"routeDeviation","algorithmVersion"
       FROM "P3VehicleLocation"
       WHERE "schoolId"=$1 AND "tripId"=$2
       ORDER BY "reportedAt" ASC
       LIMIT 20000`,
      input.schoolId,
      trip.id,
    ),
    tx.$queryRawUnsafe(
      `SELECT g."studentId",s."name" AS "studentName",g."pickupPointId",g."state",g."previousDistanceMeters"::text,
              g."approachingAt",g."arrivingAt",g."arrivedAt",g."passedAt",g."etaMinutes",g."etaConfidenceMinutes",
              g."routeRemainingMeters"::text,g."predictionVersion",g."updatedAt"
       FROM "P3GeofenceState" g
       JOIN "Student" s ON s."id"=g."studentId" AND s."schoolId"=g."schoolId"
       WHERE g."schoolId"=$1 AND g."tripId"=$2
       ORDER BY s."name" ASC`,
      input.schoolId,
      trip.id,
    ),
    tx.$queryRawUnsafe(
      `SELECT a."id",a."studentId",s."name" AS "studentName",a."guardianId",g."name" AS "guardianName",a."type",a."status",a."queuedAt",a."sentAt",a."details"
       FROM "P3TransportAlert" a
       JOIN "Student" s ON s."id"=a."studentId" AND s."schoolId"=a."schoolId"
       JOIN "Guardian" g ON g."id"=a."guardianId" AND g."schoolId"=a."schoolId"
       WHERE a."schoolId"=$1 AND a."tripId"=$2
       ORDER BY a."queuedAt" ASC`,
      input.schoolId,
      trip.id,
    ),
    tx.$queryRawUnsafe(
      `SELECT "id","type","severity","status","openedAt","resolvedAt","evidence"
       FROM "P3TransportIncident"
       WHERE "schoolId"=$1 AND "tripId"=$2
       ORDER BY "openedAt" ASC`,
      input.schoolId,
      trip.id,
    ),
    tx.$queryRawUnsafe(
      `SELECT b."id",b."studentId",s."name" AS "studentName",b."type",b."stopId",b."eventAt",b."alertQueued"
       FROM "P3BoardingEvent" b
       JOIN "Student" s ON s."id"=b."studentId" AND s."schoolId"=b."schoolId"
       WHERE b."schoolId"=$1 AND b."vehicleId"=$2 AND b."eventAt">=$3 AND b."eventAt"<=$4
         AND (b."routeId" IS NULL OR b."routeId"=$5)
       ORDER BY b."eventAt" ASC`,
      input.schoolId,
      trip.vehicleId,
      from,
      to,
      trip.routeId,
    ),
  ]);

  const totalLocations = Number(locationCount[0]?.count ?? 0n);
  return {
    trip,
    routeShape,
    locations,
    locationEvidence: { total: totalLocations, returned: locations.length, truncated: totalLocations > locations.length },
    geofences,
    alerts,
    incidents,
    boardingEvents,
  };
}
