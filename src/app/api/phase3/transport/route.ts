import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, ForbiddenError, routeError } from "@/lib/errors";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { getSchoolAuthorization } from "@/lib/authorization";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { mutatePhase3 } from "@/lib/phase3-service";

type Row = Record<string, unknown>;
const bodySchema = z.record(z.string().min(1).max(120), z.unknown());
const FAMILY_ROLE_KEYS = new Set(["parent", "guardian"]);

function isFamilyOnly(roleKeys: string[]) {
  return roleKeys.length > 0 && roleKeys.every((key) => FAMILY_ROLE_KEYS.has(key));
}

async function schoolTransport(tx: Parameters<Parameters<typeof withTenant>[1]>[0], schoolId: string, canManage: boolean) {
  const [vehicles, routes, stops, locations, boarding, reminders] = await Promise.all([
    tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3Vehicle" WHERE "schoolId"=$1 ORDER BY "registrationNumber"`, schoolId),
    tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3BusRoute" WHERE "schoolId"=$1 ORDER BY "name"`, schoolId),
    tx.$queryRawUnsafe<Row[]>(`SELECT rs."routeId",rs."stopId",rs."sequence",rs."etaMinutes",s."name" AS "stopName" FROM "P3RouteStop" rs JOIN "P3BusStop" s ON s."id"=rs."stopId" AND s."schoolId"=rs."schoolId" WHERE rs."schoolId"=$1 ORDER BY rs."routeId",rs."sequence"`, schoolId),
    tx.$queryRawUnsafe<Row[]>(`SELECT DISTINCT ON ("vehicleId") * FROM "P3VehicleLocation" WHERE "schoolId"=$1 ORDER BY "vehicleId","reportedAt" DESC`, schoolId),
    tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3BoardingEvent" WHERE "schoolId"=$1 ORDER BY "eventAt" DESC LIMIT 100`, schoolId),
    tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3VehicleComplianceReminder" WHERE "schoolId"=$1 ORDER BY "dueAt" ASC LIMIT 100`, schoolId),
  ]);
  return { scope: "school" as const, canManage, vehicles, routes, stops, locations, boarding, reminders };
}

async function familyTransport(tx: Parameters<Parameters<typeof withTenant>[1]>[0], schoolId: string, actorId: string) {
  const guardian = await tx.guardian.findFirst({ where: { userId: actorId }, select: { id: true } });
  if (!guardian) throw new ForbiddenError("Family transport access requires a linked guardian profile.");
  const parentLocation = await tx.$queryRawUnsafe<Array<{ routeId: string | null; latitude: string; longitude: string; updatedAt: Date }>>(
    `SELECT "routeId","latitude"::text,"longitude"::text,"updatedAt" FROM "P3ParentLocation" WHERE "schoolId"=$1 AND "guardianId"=$2`,
    schoolId,
    guardian.id,
  );
  const routeId = parentLocation[0]?.routeId ?? null;
  const childIds = (await tx.studentGuardian.findMany({ where: { guardianId: guardian.id }, select: { studentId: true } })).map((row) => row.studentId);
  const [vehicles, routes, stops, locations, boarding] = await Promise.all([
    routeId ? tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3Vehicle" WHERE "schoolId"=$1 AND "id" IN (SELECT DISTINCT "vehicleId" FROM "P3VehicleLocation" WHERE "schoolId"=$1 AND "routeId"=$2)`, schoolId, routeId) : Promise.resolve([]),
    routeId ? tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3BusRoute" WHERE "schoolId"=$1 AND "id"=$2`, schoolId, routeId) : Promise.resolve([]),
    routeId ? tx.$queryRawUnsafe<Row[]>(`SELECT rs."stopId",rs."sequence",rs."etaMinutes",s."name" AS "stopName" FROM "P3RouteStop" rs JOIN "P3BusStop" s ON s."id"=rs."stopId" AND s."schoolId"=rs."schoolId" WHERE rs."schoolId"=$1 AND rs."routeId"=$2 ORDER BY rs."sequence"`, schoolId, routeId) : Promise.resolve([]),
    routeId ? tx.$queryRawUnsafe<Row[]>(`SELECT DISTINCT ON ("vehicleId") * FROM "P3VehicleLocation" WHERE "schoolId"=$1 AND "routeId"=$2 ORDER BY "vehicleId","reportedAt" DESC`, schoolId, routeId) : Promise.resolve([]),
    childIds.length ? tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3BoardingEvent" WHERE "schoolId"=$1 AND "studentId"=ANY($2::text[]) ORDER BY "eventAt" DESC LIMIT 100`, schoolId, childIds) : Promise.resolve([]),
  ]);
  return { scope: "family" as const, canManage: false, vehicles, routes, stops, locations, parentLocation, boarding, reminders: [] };
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      await requireSchoolFeatureInTransaction(tx, session.schoolId, "transport");
      await requirePermission(tx, session.userId, "transport:view");
      const [access, canManage] = await Promise.all([
        getSchoolAuthorization(tx, session.userId),
        hasPermission(tx, session.userId, "transport:manage"),
      ]);
      return isFamilyOnly(access.roleKeys)
        ? familyTransport(tx, session.schoolId, session.userId)
        : schoolTransport(tx, session.schoolId, canManage);
    });
    // SchoolLifeStudio consumes transport data directly; do not wrap it in the
    // generic Phase 3 { result } envelope.
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw new AppError("Transport request body must be an object with short field names.", 400, "INVALID_INPUT");
    if (Object.keys(parsed.data).length > 60) throw new AppError("Transport request contains too many fields.", 413, "BODY_TOO_LARGE");
    for (const value of Object.values(parsed.data)) {
      if (typeof value === "string" && value.length > 10000) throw new AppError("A transport request field is too large.", 413, "BODY_TOO_LARGE");
    }

    const result = await withTenant(session.schoolId, async (tx) => {
      await requireSchoolFeatureInTransaction(tx, session.schoolId, "transport");
      await requirePermission(tx, session.userId, "transport:view");
      const [access, canManage] = await Promise.all([
        getSchoolAuthorization(tx, session.userId),
        hasPermission(tx, session.userId, "transport:manage"),
      ]);
      const familyOnly = isFamilyOnly(access.roleKeys);
      if (!canManage && !familyOnly) {
        throw new ForbiddenError("Transport changes require transport management permission.");
      }
      if (familyOnly && parsed.data.action !== "setParentLocation") {
        throw new ForbiddenError("Family transport accounts may only update their own pickup location.");
      }
      return mutatePhase3(tx, session.schoolId, session.userId, "transport", parsed.data as Row);
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
