import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant, type TenantDb } from "@/lib/db";
import { AppError, ForbiddenError, routeError } from "@/lib/errors";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { getSchoolAuthorization } from "@/lib/authorization";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { mutatePhase3 } from "@/lib/phase3-service";

type Row = Record<string, unknown>;
const FAMILY_ROLE_KEYS = new Set(["parent", "guardian"]);
const MAX_TRANSPORT_BODY_BYTES = 64 * 1024;
const id = z.string().trim().min(1).max(300);
const optionalId = z.union([z.string().max(300), z.null()]).optional();
const optionalText = (max: number) => z.union([z.string().max(max), z.null()]).optional();
const latitude = z.coerce.number().finite().min(-90).max(90);
const longitude = z.coerce.number().finite().min(-180).max(180);

const transportMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setParentLocation"), guardianId: optionalId, routeId: optionalId, latitude, longitude }).strict(),
  z.object({ action: z.literal("createVehicle"), registrationNumber: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(120), capacity: z.coerce.number().int().min(0).max(500), driverName: optionalText(120), driverPhone: optionalText(40) }).strict(),
  z.object({ action: z.literal("createRoute"), name: z.string().trim().min(1).max(120), code: z.string().trim().min(1).max(40), origin: optionalText(160), destination: optionalText(160) }).strict(),
  z.object({ action: z.literal("createStop"), name: z.string().trim().min(1).max(120), latitude, longitude }).strict(),
  z.object({ action: z.literal("linkStop"), routeId: id, stopId: id, sequence: z.coerce.number().int().min(1).max(10000), etaMinutes: z.coerce.number().int().min(0).max(1440) }).strict(),
  z.object({ action: z.literal("updateLocation"), vehicleId: id, routeId: optionalId, latitude, longitude, speedKph: z.coerce.number().finite().min(0).max(300).optional(), heading: z.coerce.number().finite().min(0).max(360).optional() }).strict(),
  z.object({ action: z.literal("boarding"), vehicleId: id, routeId: optionalId, studentId: id, type: z.enum(["boarded", "alighted"]), stopId: optionalId }).strict(),
  z.object({ action: z.literal("complianceReminder"), vehicleId: id, kind: z.string().trim().min(1).max(120), dueAt: z.string().min(1).max(100), notes: optionalText(500) }).strict(),
  z.object({ action: z.literal("completeCompliance"), id }).strict(),
]);

function isFamilyOnly(roleKeys: string[]) {
  return roleKeys.length > 0 && roleKeys.every((key) => FAMILY_ROLE_KEYS.has(key));
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > MAX_TRANSPORT_BODY_BYTES) {
      throw new AppError("Transport request body is too large.", 413, "BODY_TOO_LARGE");
    }
  }

  if (!request.body) throw new AppError("Transport request body is required.", 400, "INVALID_INPUT");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_TRANSPORT_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new AppError("Transport request body is too large.", 413, "BODY_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("Transport request body must be valid JSON.", 400, "INVALID_INPUT");
  }
}

async function schoolTransport(tx: TenantDb, schoolId: string, canManage: boolean) {
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

async function familyTransport(tx: TenantDb, schoolId: string, actorId: string) {
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
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const raw = await readBoundedJson(request);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new AppError("Transport request body must be an object.", 400, "INVALID_INPUT");
    }
    if (Object.keys(raw).length > 60) throw new AppError("Transport request contains too many fields.", 413, "BODY_TOO_LARGE");
    const parsed = transportMutationSchema.safeParse(raw);
    if (!parsed.success) throw new AppError("Transport request contains invalid or unsupported fields.", 400, "INVALID_INPUT");

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
