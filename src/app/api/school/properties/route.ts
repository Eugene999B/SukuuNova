import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { readBoundedJson } from "@/lib/bounded-json";
import { isOperationalStaffAccount, requireActiveStaffTarget } from "@/lib/authorization";
import { createPropertyItem, createPropertyLocation, receiveProperty, reportPropertyOutcome, schoolPropertiesWorkspace, transferProperty } from "@/lib/school-properties-service";

const optionalText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional();
const condition = z.enum(["good","fair","damaged","maintenance"]);
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createLocation"), name: z.string().trim().min(1).max(160), code: z.string().trim().min(1).max(50), locationType: z.string().trim().min(1).max(80), building: optionalText(120), floor: optionalText(60), description: optionalText(800) }).strict(),
  z.object({ action: z.literal("createItem"), itemCode: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(160), category: optionalText(100), unit: optionalText(50), description: optionalText(800), trackSerial: z.boolean().optional(), locationId: z.string().min(1).max(160), quantity: z.coerce.number().int().min(1).max(1_000_000), condition: condition.optional(), serialNumber: optionalText(160), acquiredAt: optionalText(100), unitValue: z.union([z.coerce.number().min(0).max(1_000_000_000), z.null()]).optional(), custodianUserId: optionalText(160), notes: optionalText(500) }).strict(),
  z.object({ action: z.literal("receive"), itemId: z.string().min(1).max(160), locationId: z.string().min(1).max(160), quantity: z.coerce.number().int().min(1).max(1_000_000), condition: condition.optional(), serialNumber: optionalText(160), acquiredAt: optionalText(100), unitValue: z.union([z.coerce.number().min(0).max(1_000_000_000), z.null()]).optional(), custodianUserId: optionalText(160), notes: optionalText(500) }).strict(),
  z.object({ action: z.literal("transfer"), holdingId: z.string().min(1).max(160), toLocationId: z.string().min(1).max(160), quantity: z.coerce.number().int().min(1).max(1_000_000), reason: z.string().trim().min(3).max(500) }).strict(),
  z.object({ action: z.literal("report"), holdingId: z.string().min(1).max(160), quantity: z.coerce.number().int().min(1).max(1_000_000), outcome: z.enum(["good","fair","damaged","maintenance","restore","lost","destroyed","disposed"]), reason: z.string().trim().min(3).max(500), reference: optionalText(160) }).strict(),
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      const workspace = await schoolPropertiesWorkspace(tx, session.schoolId, session.userId);
      const candidates = await tx.user.findMany({
        where: { schoolId: session.schoolId, status: "active" },
        orderBy: { name: "asc" },
        take: 1500,
        select: { id: true, name: true, userRoles: { select: { role: { select: { key: true, name: true } } } } }
      });
      const users = candidates
        .filter((user) => isOperationalStaffAccount(user.userRoles.map(({ role }) => role)))
        .map(({ userRoles: _roles, ...user }) => user);
      return { ...workspace, users };
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const parsed = bodySchema.parse(await readBoundedJson(request, 96 * 1024, "School properties request"));
    const result = await withTenant(session.schoolId, async (tx) => {
      if ((parsed.action === "createItem" || parsed.action === "receive") && parsed.custodianUserId) {
        await requireActiveStaffTarget(tx, session.schoolId, parsed.custodianUserId);
      }
      if (parsed.action === "createLocation") return createPropertyLocation(tx, { schoolId: session.schoolId, actorId: session.userId, ...parsed });
      if (parsed.action === "createItem") return createPropertyItem(tx, { schoolId: session.schoolId, actorId: session.userId, ...parsed });
      if (parsed.action === "receive") return receiveProperty(tx, { schoolId: session.schoolId, actorId: session.userId, ...parsed });
      if (parsed.action === "transfer") return transferProperty(tx, { schoolId: session.schoolId, actorId: session.userId, ...parsed });
      return reportPropertyOutcome(tx, { schoolId: session.schoolId, actorId: session.userId, holdingId: parsed.holdingId, quantity: parsed.quantity, outcome: parsed.outcome, reason: parsed.reason, reference: parsed.reference });
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
