import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError, ForbiddenError } from "./errors";
import { hasPermission } from "./rbac";

type Row = Record<string, unknown>;

type PropertyCondition = "good" | "fair" | "damaged" | "maintenance";
type PropertyStatus = "active" | "maintenance" | "lost" | "destroyed" | "disposed";
type PropertyOutcome = "good" | "fair" | "damaged" | "maintenance" | "restore" | "lost" | "destroyed" | "disposed";

function text(value: unknown, max: number, field: string) {
  const next = String(value ?? "").trim();
  if (!next || next.length > max) throw new AppError(`${field} is invalid.`, 400, "INVALID_INPUT");
  return next;
}
function optionalText(value: unknown, max: number) {
  if (value === undefined || value === null || value === "") return null;
  const next = String(value).trim();
  if (next.length > max) throw new AppError("A supplied text field is too long.", 400, "INVALID_INPUT");
  return next || null;
}
function validQuantity(value: unknown, max = 1_000_000) {
  const quantity = Math.trunc(Number(value));
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > max) throw new AppError("Quantity is invalid.", 400, "INVALID_INPUT");
  return quantity;
}
function validValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const next = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(next) || next < 0 || next > 1_000_000_000) throw new AppError("Property value is invalid.", 400, "INVALID_INPUT");
  return next;
}
async function allowed(tx: TenantDb, actorId: string, permission: string, legacy = false) {
  if (await hasPermission(tx, actorId, permission)) return true;
  return legacy ? hasPermission(tx, actorId, "assets:manage") : false;
}
async function requirePropertyPermission(tx: TenantDb, actorId: string, permission: string, legacy = false) {
  if (!(await allowed(tx, actorId, permission, legacy))) throw new ForbiddenError(`Missing required permission: ${permission}`);
}

export async function schoolPropertyAccess(tx: TenantDb, actorId: string) {
  const [view, manage, move, dispose, exportRows] = await Promise.all([
    allowed(tx, actorId, "properties:view", true),
    allowed(tx, actorId, "properties:manage", true),
    allowed(tx, actorId, "properties:move", true),
    allowed(tx, actorId, "properties:dispose", false),
    allowed(tx, actorId, "properties:export", true),
  ]);
  return { view, manage, move, dispose, export: exportRows };
}

export async function schoolPropertiesWorkspace(tx: TenantDb, schoolId: string, actorId: string) {
  const access = await schoolPropertyAccess(tx, actorId);
  if (!access.view) throw new ForbiddenError("You do not have access to school properties.");

  const [locations, items, holdings, movements, metrics, locationSummary, users] = await Promise.all([
    tx.$queryRawUnsafe<Row[]>(`SELECT "id","name","code","locationType","building","floor","description","status","createdAt","updatedAt" FROM "SchoolPropertyLocation" WHERE "schoolId"=$1 ORDER BY "name"`, schoolId),
    tx.$queryRawUnsafe<Row[]>(`SELECT "id","itemCode","name","category","unit","description","trackSerial","status","createdAt","updatedAt" FROM "SchoolPropertyItem" WHERE "schoolId"=$1 ORDER BY "name"`, schoolId),
    tx.$queryRawUnsafe<Row[]>(`SELECT h."id",h."itemId",h."locationId",h."quantity",h."condition",h."status",h."serialNumber",h."acquiredAt",h."unitValue",h."custodianUserId",h."notes",i."itemCode",i."name" AS "itemName",i."category",i."unit",i."trackSerial",l."name" AS "locationName",l."code" AS "locationCode",u."name" AS "custodianName" FROM "SchoolPropertyHolding" h JOIN "SchoolPropertyItem" i ON i."id"=h."itemId" AND i."schoolId"=h."schoolId" JOIN "SchoolPropertyLocation" l ON l."id"=h."locationId" AND l."schoolId"=h."schoolId" LEFT JOIN "User" u ON u."id"=h."custodianUserId" AND u."schoolId"=h."schoolId" WHERE h."schoolId"=$1 AND h."quantity">0 ORDER BY l."name",i."name",h."createdAt" DESC LIMIT 3000`, schoolId),
    tx.$queryRawUnsafe<Row[]>(`SELECT m."id",m."itemId",m."fromLocationId",m."toLocationId",m."quantity",m."action",m."fromCondition",m."toCondition",m."fromStatus",m."toStatus",m."reason",m."reference",m."createdAt",i."name" AS "itemName",i."itemCode",fl."name" AS "fromLocationName",tl."name" AS "toLocationName",u."name" AS "actorName" FROM "SchoolPropertyMovement" m JOIN "SchoolPropertyItem" i ON i."id"=m."itemId" AND i."schoolId"=m."schoolId" LEFT JOIN "SchoolPropertyLocation" fl ON fl."id"=m."fromLocationId" AND fl."schoolId"=m."schoolId" LEFT JOIN "SchoolPropertyLocation" tl ON tl."id"=m."toLocationId" AND tl."schoolId"=m."schoolId" LEFT JOIN "User" u ON u."id"=m."createdBy" AND u."schoolId"=m."schoolId" WHERE m."schoolId"=$1 ORDER BY m."createdAt" DESC LIMIT 500`, schoolId),
    tx.$queryRawUnsafe<Row[]>(`SELECT COUNT(DISTINCT "locationId") FILTER (WHERE "quantity">0 AND "status" NOT IN ('destroyed','disposed'))::int AS "usedLocations",COALESCE(SUM("quantity") FILTER (WHERE "status"='active'),0)::int AS "activeUnits",COALESCE(SUM("quantity") FILTER (WHERE "condition" IN ('damaged','maintenance') OR "status" IN ('maintenance','lost')),0)::int AS "attentionUnits",COALESCE(SUM("quantity"*COALESCE("unitValue",0)) FILTER (WHERE "status" NOT IN ('destroyed','disposed')),0)::numeric AS "estimatedValue" FROM "SchoolPropertyHolding" WHERE "schoolId"=$1`, schoolId),
    tx.$queryRawUnsafe<Row[]>(`SELECT l."id",l."name",l."code",l."locationType",COALESCE(SUM(h."quantity") FILTER (WHERE h."status" NOT IN ('destroyed','disposed')),0)::int AS "units",COALESCE(SUM(h."quantity") FILTER (WHERE h."condition" IN ('damaged','maintenance') OR h."status" IN ('maintenance','lost')),0)::int AS "attention",COUNT(DISTINCT h."itemId") FILTER (WHERE h."quantity">0 AND h."status" NOT IN ('destroyed','disposed'))::int AS "itemTypes" FROM "SchoolPropertyLocation" l LEFT JOIN "SchoolPropertyHolding" h ON h."locationId"=l."id" AND h."schoolId"=l."schoolId" WHERE l."schoolId"=$1 AND l."status"='active' GROUP BY l."id" ORDER BY l."name"`, schoolId),
    tx.user.findMany({ where: { schoolId, status: "active" }, orderBy: { name: "asc" }, take: 1500, select: { id: true, name: true } }),
  ]);

  return {
    access,
    locations,
    items,
    holdings: holdings.map((row) => ({ ...row, unitValue: row.unitValue === null ? null : Number(row.unitValue) })),
    movements,
    locationSummary,
    users,
    metrics: {
      usedLocations: Number(metrics[0]?.usedLocations ?? 0),
      activeUnits: Number(metrics[0]?.activeUnits ?? 0),
      attentionUnits: Number(metrics[0]?.attentionUnits ?? 0),
      estimatedValue: Number(metrics[0]?.estimatedValue ?? 0),
    },
  };
}

export async function createPropertyLocation(tx: TenantDb, input: { schoolId: string; actorId: string; name: string; code: string; locationType: string; building?: string | null; floor?: string | null; description?: string | null }) {
  await requirePropertyPermission(tx, input.actorId, "properties:manage", true);
  const name = text(input.name, 160, "Location name");
  const code = text(input.code, 50, "Location code").toUpperCase();
  const locationType = text(input.locationType, 80, "Location type");
  const exists = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "SchoolPropertyLocation" WHERE "schoolId"=$1 AND upper("code")=upper($2) LIMIT 1`, input.schoolId, code);
  if (exists.length) throw new AppError("A property location already uses this code.", 409, "DUPLICATE_LOCATION_CODE");
  const id = createId();
  await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyLocation" ("id","schoolId","name","code","locationType","building","floor","description") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, id, input.schoolId, name, code, locationType, optionalText(input.building, 120), optionalText(input.floor, 60), optionalText(input.description, 800));
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "properties.location_created", entityType: "SchoolPropertyLocation", entityId: id, after: { name, code, locationType } });
  return { locationId: id };
}

export async function createPropertyItem(tx: TenantDb, input: { schoolId: string; actorId: string; itemCode: string; name: string; category?: string | null; unit?: string | null; description?: string | null; trackSerial?: boolean; locationId: string; quantity: number; condition?: PropertyCondition; serialNumber?: string | null; acquiredAt?: string | null; unitValue?: number | null; custodianUserId?: string | null; notes?: string | null }) {
  await requirePropertyPermission(tx, input.actorId, "properties:manage", true);
  const itemCode = text(input.itemCode, 60, "Item code").toUpperCase();
  const name = text(input.name, 160, "Item name");
  const quantity = validQuantity(input.quantity);
  const trackSerial = Boolean(input.trackSerial);
  const serialNumber = optionalText(input.serialNumber, 160);
  if (trackSerial && (quantity !== 1 || !serialNumber)) throw new AppError("Serial-tracked property must be created one unit at a time with a serial number.", 400, "SERIAL_REQUIRED");
  const condition = input.condition ?? "good";
  if (!["good","fair","damaged","maintenance"].includes(condition)) throw new AppError("Condition is invalid.", 400, "INVALID_INPUT");
  const status: PropertyStatus = condition === "maintenance" ? "maintenance" : "active";
  const [location, duplicate] = await Promise.all([
    tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "SchoolPropertyLocation" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`, input.schoolId, input.locationId),
    tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "SchoolPropertyItem" WHERE "schoolId"=$1 AND upper("itemCode")=upper($2) LIMIT 1`, input.schoolId, itemCode),
  ]);
  if (!location.length) throw new AppError("Property location not found.", 404, "NOT_FOUND");
  if (duplicate.length) throw new AppError("A property item already uses this code.", 409, "DUPLICATE_ITEM_CODE");
  if (serialNumber) {
    const existingSerial = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "SchoolPropertyHolding" WHERE "schoolId"=$1 AND "serialNumber"=$2 LIMIT 1`, input.schoolId, serialNumber);
    if (existingSerial.length) throw new AppError("This serial number is already registered.", 409, "DUPLICATE_SERIAL");
  }
  const itemId = createId();
  const holdingId = createId();
  const unit = optionalText(input.unit, 50) ?? "unit";
  await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyItem" ("id","schoolId","itemCode","name","category","unit","description","trackSerial") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, itemId, input.schoolId, itemCode, name, optionalText(input.category, 100), unit, optionalText(input.description, 800), trackSerial);
  await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyHolding" ("id","schoolId","itemId","locationId","quantity","condition","status","serialNumber","acquiredAt","unitValue","custodianUserId","notes") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, holdingId, input.schoolId, itemId, input.locationId, quantity, condition, status, serialNumber, input.acquiredAt ? new Date(input.acquiredAt) : null, validValue(input.unitValue), optionalText(input.custodianUserId, 120), optionalText(input.notes, 500));
  await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyMovement" ("id","schoolId","itemId","toLocationId","quantity","action","toCondition","toStatus","reason","reference","createdBy") VALUES ($1,$2,$3,$4,$5,'receive',$6,$7,'Initial property registration',$8,$9)`, createId(), input.schoolId, itemId, input.locationId, quantity, condition, status, itemCode, input.actorId);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "properties.item_created", entityType: "SchoolPropertyItem", entityId: itemId, after: { itemCode, name, quantity, locationId: input.locationId, condition, status, serialNumber } });
  return { itemId, holdingId };
}

export async function receiveProperty(tx: TenantDb, input: { schoolId: string; actorId: string; itemId: string; locationId: string; quantity: number; condition?: PropertyCondition; serialNumber?: string | null; acquiredAt?: string | null; unitValue?: number | null; custodianUserId?: string | null; notes?: string | null }) {
  await requirePropertyPermission(tx, input.actorId, "properties:manage", true);
  const quantity = validQuantity(input.quantity);
  const itemRows = await tx.$queryRawUnsafe<Array<{ id: string; trackSerial: boolean; itemCode: string }>>(`SELECT "id","trackSerial","itemCode" FROM "SchoolPropertyItem" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`, input.schoolId, input.itemId);
  if (!itemRows[0]) throw new AppError("Property item not found.", 404, "NOT_FOUND");
  const locationRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "SchoolPropertyLocation" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`, input.schoolId, input.locationId);
  if (!locationRows[0]) throw new AppError("Property location not found.", 404, "NOT_FOUND");
  const serialNumber = optionalText(input.serialNumber, 160);
  if (itemRows[0].trackSerial && (quantity !== 1 || !serialNumber)) throw new AppError("Serial-tracked property must be received one unit at a time with a serial number.", 400, "SERIAL_REQUIRED");
  if (serialNumber) {
    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "SchoolPropertyHolding" WHERE "schoolId"=$1 AND "serialNumber"=$2 LIMIT 1`, input.schoolId, serialNumber);
    if (existing.length) throw new AppError("This serial number is already registered.", 409, "DUPLICATE_SERIAL");
  }
  const condition = input.condition ?? "good";
  if (!["good","fair","damaged","maintenance"].includes(condition)) throw new AppError("Condition is invalid.", 400, "INVALID_INPUT");
  const status: PropertyStatus = condition === "maintenance" ? "maintenance" : "active";
  const holdingId = createId();
  await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyHolding" ("id","schoolId","itemId","locationId","quantity","condition","status","serialNumber","acquiredAt","unitValue","custodianUserId","notes") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, holdingId, input.schoolId, input.itemId, input.locationId, quantity, condition, status, serialNumber, input.acquiredAt ? new Date(input.acquiredAt) : null, validValue(input.unitValue), optionalText(input.custodianUserId, 120), optionalText(input.notes, 500));
  await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyMovement" ("id","schoolId","itemId","toLocationId","quantity","action","toCondition","toStatus","reason","reference","createdBy") VALUES ($1,$2,$3,$4,$5,'receive',$6,$7,$8,$9,$10)`, createId(), input.schoolId, input.itemId, input.locationId, quantity, condition, status, optionalText(input.notes, 500) ?? "Property received", itemRows[0].itemCode, input.actorId);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "properties.stock_received", entityType: "SchoolPropertyHolding", entityId: holdingId, after: { itemId: input.itemId, locationId: input.locationId, quantity, condition, serialNumber } });
  return { holdingId };
}

async function lockedHolding(tx: TenantDb, schoolId: string, holdingId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; itemId: string; locationId: string; quantity: number; condition: PropertyCondition; status: PropertyStatus; serialNumber: string | null; acquiredAt: Date | null; unitValue: unknown; custodianUserId: string | null; notes: string | null }>>(`SELECT "id","itemId","locationId","quantity","condition","status","serialNumber","acquiredAt","unitValue","custodianUserId","notes" FROM "SchoolPropertyHolding" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`, schoolId, holdingId);
  if (!rows[0] || rows[0].quantity <= 0) throw new AppError("Property holding not found.", 404, "NOT_FOUND");
  return rows[0];
}

export async function transferProperty(tx: TenantDb, input: { schoolId: string; actorId: string; holdingId: string; toLocationId: string; quantity: number; reason: string }) {
  await requirePropertyPermission(tx, input.actorId, "properties:move", true);
  const quantity = validQuantity(input.quantity);
  const reason = text(input.reason, 500, "Transfer reason");
  const holding = await lockedHolding(tx, input.schoolId, input.holdingId);
  if (["lost","destroyed","disposed"].includes(holding.status)) throw new AppError("This property is no longer available for transfer.", 409, "PROPERTY_UNAVAILABLE");
  if (quantity > holding.quantity) throw new AppError(`Only ${holding.quantity} unit(s) are available in this holding.`, 409, "INSUFFICIENT_PROPERTY");
  if (holding.serialNumber && quantity !== holding.quantity) throw new AppError("A serial-tracked unit must be transferred as a whole unit.", 400, "SERIAL_SPLIT_NOT_ALLOWED");
  if (holding.locationId === input.toLocationId) throw new AppError("Choose a different destination location.", 400, "SAME_LOCATION");
  const destination = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "SchoolPropertyLocation" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`, input.schoolId, input.toLocationId);
  if (!destination[0]) throw new AppError("Destination location not found.", 404, "NOT_FOUND");

  if (quantity === holding.quantity) {
    await tx.$executeRawUnsafe(`UPDATE "SchoolPropertyHolding" SET "locationId"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, input.holdingId, input.toLocationId);
  } else {
    await tx.$executeRawUnsafe(`UPDATE "SchoolPropertyHolding" SET "quantity"="quantity"-$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, input.holdingId, quantity);
    await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyHolding" ("id","schoolId","itemId","locationId","quantity","condition","status","serialNumber","acquiredAt","unitValue","custodianUserId","notes") VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10,$11)`, createId(), input.schoolId, holding.itemId, input.toLocationId, quantity, holding.condition, holding.status, holding.acquiredAt, holding.unitValue === null ? null : Number(holding.unitValue), holding.custodianUserId, holding.notes);
  }
  await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyMovement" ("id","schoolId","itemId","fromLocationId","toLocationId","quantity","action","fromCondition","toCondition","fromStatus","toStatus","reason","createdBy") VALUES ($1,$2,$3,$4,$5,$6,'transfer',$7,$7,$8,$8,$9,$10)`, createId(), input.schoolId, holding.itemId, holding.locationId, input.toLocationId, quantity, holding.condition, holding.status, reason, input.actorId);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "properties.transferred", entityType: "SchoolPropertyHolding", entityId: input.holdingId, before: { locationId: holding.locationId, quantity: holding.quantity }, after: { locationId: input.toLocationId, quantityTransferred: quantity, reason } });
  return { holdingId: input.holdingId };
}

function outcomeState(outcome: PropertyOutcome): { condition: PropertyCondition; status: PropertyStatus; action: string } {
  if (outcome === "good" || outcome === "restore") return { condition: "good", status: "active", action: outcome === "restore" ? "restore" : "condition" };
  if (outcome === "fair") return { condition: "fair", status: "active", action: "condition" };
  if (outcome === "damaged") return { condition: "damaged", status: "active", action: "condition" };
  if (outcome === "maintenance") return { condition: "maintenance", status: "maintenance", action: "maintenance" };
  if (outcome === "lost") return { condition: "fair", status: "lost", action: "lost" };
  if (outcome === "destroyed") return { condition: "damaged", status: "destroyed", action: "destroyed" };
  return { condition: "fair", status: "disposed", action: "dispose" };
}

export async function reportPropertyOutcome(tx: TenantDb, input: { schoolId: string; actorId: string; holdingId: string; quantity: number; outcome: PropertyOutcome; reason: string; reference?: string | null }) {
  const destructive = ["lost","destroyed","disposed"].includes(input.outcome);
  await requirePropertyPermission(tx, input.actorId, destructive ? "properties:dispose" : "properties:move", !destructive);
  const quantity = validQuantity(input.quantity);
  const reason = text(input.reason, 500, "Reason");
  const holding = await lockedHolding(tx, input.schoolId, input.holdingId);
  if (["destroyed","disposed"].includes(holding.status)) throw new AppError("This property has already left the active register.", 409, "PROPERTY_CLOSED");
  if (quantity > holding.quantity) throw new AppError(`Only ${holding.quantity} unit(s) are available in this holding.`, 409, "INSUFFICIENT_PROPERTY");
  if (holding.serialNumber && quantity !== holding.quantity) throw new AppError("A serial-tracked unit must be reported as a whole unit.", 400, "SERIAL_SPLIT_NOT_ALLOWED");
  const next = outcomeState(input.outcome);

  let affectedHoldingId = input.holdingId;
  if (quantity === holding.quantity) {
    await tx.$executeRawUnsafe(`UPDATE "SchoolPropertyHolding" SET "condition"=$3,"status"=$4,"notes"=$5,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, input.holdingId, next.condition, next.status, reason);
  } else {
    await tx.$executeRawUnsafe(`UPDATE "SchoolPropertyHolding" SET "quantity"="quantity"-$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, input.holdingId, quantity);
    affectedHoldingId = createId();
    await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyHolding" ("id","schoolId","itemId","locationId","quantity","condition","status","serialNumber","acquiredAt","unitValue","custodianUserId","notes") VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10,$11)`, affectedHoldingId, input.schoolId, holding.itemId, holding.locationId, quantity, next.condition, next.status, holding.acquiredAt, holding.unitValue === null ? null : Number(holding.unitValue), holding.custodianUserId, reason);
  }
  await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyMovement" ("id","schoolId","itemId","fromLocationId","toLocationId","quantity","action","fromCondition","toCondition","fromStatus","toStatus","reason","reference","createdBy") VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, createId(), input.schoolId, holding.itemId, holding.locationId, quantity, next.action, holding.condition, next.condition, holding.status, next.status, reason, optionalText(input.reference, 160), input.actorId);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: `properties.${next.action}`, entityType: "SchoolPropertyHolding", entityId: affectedHoldingId, before: { condition: holding.condition, status: holding.status, quantity }, after: { condition: next.condition, status: next.status, quantity, reason, reference: input.reference ?? null } });
  return { holdingId: affectedHoldingId };
}

export async function schoolPropertyExportRows(tx: TenantDb, schoolId: string, actorId: string) {
  await requirePropertyPermission(tx, actorId, "properties:export", true);
  return tx.$queryRawUnsafe<Row[]>(`SELECT i."itemCode",i."name" AS "itemName",i."category",i."unit",h."quantity",h."condition",h."status",h."serialNumber",h."acquiredAt",h."unitValue",l."name" AS "locationName",l."code" AS "locationCode",l."locationType",u."name" AS "custodian",h."notes" FROM "SchoolPropertyHolding" h JOIN "SchoolPropertyItem" i ON i."id"=h."itemId" AND i."schoolId"=h."schoolId" JOIN "SchoolPropertyLocation" l ON l."id"=h."locationId" AND l."schoolId"=h."schoolId" LEFT JOIN "User" u ON u."id"=h."custodianUserId" AND u."schoolId"=h."schoolId" WHERE h."schoolId"=$1 ORDER BY l."name",i."name",h."status",h."condition" LIMIT 15000`, schoolId);
}

export async function schoolPropertyMovementExportRows(tx: TenantDb, schoolId: string, actorId: string) {
  await requirePropertyPermission(tx, actorId, "properties:export", true);
  return tx.$queryRawUnsafe<Row[]>(`SELECT m."createdAt",i."itemCode",i."name" AS "itemName",m."quantity",m."action",fl."name" AS "fromLocation",tl."name" AS "toLocation",m."fromCondition",m."toCondition",m."fromStatus",m."toStatus",m."reason",m."reference",u."name" AS "recordedBy" FROM "SchoolPropertyMovement" m JOIN "SchoolPropertyItem" i ON i."id"=m."itemId" AND i."schoolId"=m."schoolId" LEFT JOIN "SchoolPropertyLocation" fl ON fl."id"=m."fromLocationId" AND fl."schoolId"=m."schoolId" LEFT JOIN "SchoolPropertyLocation" tl ON tl."id"=m."toLocationId" AND tl."schoolId"=m."schoolId" LEFT JOIN "User" u ON u."id"=m."createdBy" AND u."schoolId"=m."schoolId" WHERE m."schoolId"=$1 ORDER BY m."createdAt" DESC LIMIT 15000`, schoolId);
}
