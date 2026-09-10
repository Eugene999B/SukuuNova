import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { evaluateTransportHealth, type TransportHealthLocation } from "./transport-health";

type ActiveTripRow = {
  id: string;
  trackerDeviceId: string | null;
};

type LocationRow = {
  reportedAt: Date;
  routeDeviation: boolean;
  routeDistanceMeters: string | null;
  routeMatchConfidence: string | null;
};

type OpenIncidentRow = {
  id: string;
  type: "route_deviation" | "tracker_offline" | "gps_degraded";
  severity: "info" | "warning" | "critical";
};

export async function refreshActiveTransportIncidents(tx: TenantDb, schoolId: string) {
  const trips = await tx.$queryRawUnsafe<ActiveTripRow[]>(
    `SELECT "id","trackerDeviceId" FROM "P3TransportTrip" WHERE "schoolId"=$1 AND "status"='active'`,
    schoolId,
  );
  let opened = 0;
  let resolved = 0;
  let updated = 0;

  for (const trip of trips) {
    const locations = await tx.$queryRawUnsafe<LocationRow[]>(
      `SELECT "reportedAt","routeDeviation","routeDistanceMeters"::text,"routeMatchConfidence"::text
       FROM "P3VehicleLocation"
       WHERE "schoolId"=$1 AND "tripId"=$2 AND "quality"='accepted'
       ORDER BY "reportedAt" DESC LIMIT 8`,
      schoolId,
      trip.id,
    );
    const healthLocations: TransportHealthLocation[] = locations.map((location) => ({
      reportedAt: location.reportedAt,
      routeDeviation: location.routeDeviation,
      routeDistanceMeters: location.routeDistanceMeters == null ? null : Number(location.routeDistanceMeters),
      routeMatchConfidence: location.routeMatchConfidence == null ? null : Number(location.routeMatchConfidence),
    }));
    const signals = evaluateTransportHealth({ locations: healthLocations });
    const existing = await tx.$queryRawUnsafe<OpenIncidentRow[]>(
      `SELECT "id","type","severity" FROM "P3TransportIncident"
       WHERE "schoolId"=$1 AND "tripId"=$2 AND "status"='open'`,
      schoolId,
      trip.id,
    );
    const byType = new Map(existing.map((incident) => [incident.type, incident]));

    for (const signal of signals) {
      const current = byType.get(signal.type);
      if (signal.active && !current) {
        const id = createId();
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3TransportIncident"
            ("id","schoolId","tripId","trackerDeviceId","type","severity","status","idempotencyKey","evidence")
           VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8::jsonb)`,
          id,
          schoolId,
          trip.id,
          trip.trackerDeviceId,
          signal.type,
          signal.severity,
          `${trip.id}:${signal.type}:${id}`,
          JSON.stringify(signal.evidence),
        );
        opened += 1;
        continue;
      }
      if (signal.active && current) {
        await tx.$executeRawUnsafe(
          `UPDATE "P3TransportIncident" SET "severity"=$3,"evidence"=$4::jsonb,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "schoolId"=$1 AND "id"=$2`,
          schoolId,
          current.id,
          signal.severity,
          JSON.stringify(signal.evidence),
        );
        updated += 1;
        continue;
      }
      if (!signal.active && current) {
        await tx.$executeRawUnsafe(
          `UPDATE "P3TransportIncident" SET "status"='resolved',"resolvedAt"=CURRENT_TIMESTAMP,"evidence"="evidence" || $3::jsonb,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "schoolId"=$1 AND "id"=$2 AND "status"='open'`,
          schoolId,
          current.id,
          JSON.stringify({ recoveredAt: new Date().toISOString() }),
        );
        resolved += 1;
      }
    }
  }

  return { tripsExamined: trips.length, opened, resolved, updated };
}
