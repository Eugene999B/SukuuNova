import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";
import type { GeoPoint } from "./transport";

export type TransportDirection = "morning" | "afternoon";

export async function replaceDirectionalRouteShape(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  routeId: string;
  direction: TransportDirection;
  points: GeoPoint[];
}) {
  if (input.points.length < 2 || input.points.length > 5000) {
    throw new AppError("A route shape needs between 2 and 5,000 points.", 400, "INVALID_ROUTE_SHAPE_SIZE");
  }
  for (const point of input.points) {
    if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90 || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
      throw new AppError("Route geometry contains an invalid coordinate.", 400, "INVALID_ROUTE_SHAPE_POINT");
    }
  }
  const routes = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
    `SELECT "id","status" FROM "P3BusRoute" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
    input.schoolId,
    input.routeId,
  );
  if (!routes[0]) throw new AppError("Transport route was not found.", 404, "TRANSPORT_ROUTE_NOT_FOUND");

  const payload = input.points.map((point, sequence) => ({
    id: createId(),
    sequence,
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  await tx.$executeRawUnsafe(
    `DELETE FROM "P3RouteShapePoint" WHERE "schoolId"=$1 AND "routeId"=$2 AND "direction"=$3`,
    input.schoolId,
    input.routeId,
    input.direction,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "P3RouteShapePoint" ("id","schoolId","routeId","direction","sequence","latitude","longitude")
     SELECT p.id,$1,$2,$3,p.sequence,p.latitude,p.longitude
     FROM jsonb_to_recordset($4::jsonb) AS p(id text,sequence integer,latitude numeric,longitude numeric)`,
    input.schoolId,
    input.routeId,
    input.direction,
    JSON.stringify(payload),
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "transport.route_shape_replaced",
    entityType: "P3BusRoute",
    entityId: input.routeId,
    after: { direction: input.direction, pointCount: payload.length },
  });
  return { routeId: input.routeId, direction: input.direction, pointCount: payload.length };
}

export async function getDirectionalRouteShape(
  tx: TenantDb,
  input: { schoolId: string; routeId: string; direction: TransportDirection },
): Promise<GeoPoint[]> {
  const rows = await tx.$queryRawUnsafe<Array<{ latitude: string; longitude: string }>>(
    `SELECT "latitude"::text,"longitude"::text
     FROM "P3RouteShapePoint"
     WHERE "schoolId"=$1 AND "routeId"=$2 AND "direction"=$3
     ORDER BY "sequence" ASC`,
    input.schoolId,
    input.routeId,
    input.direction,
  );
  return rows.map((row) => ({ latitude: Number(row.latitude), longitude: Number(row.longitude) }));
}
