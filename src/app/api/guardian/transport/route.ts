import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { getGuardianTransportOverview } from "@/lib/novacore/family-transport-service";
import { setGuardianPickupLocation } from "@/lib/novacore/guardian-pickup-location-service";

const setPickupSchema = z.object({
  action: z.enum(["setPickup", "requestPickup"]),
  studentId: z.string().min(1),
  direction: z.enum(["morning", "afternoon"]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  label: z.string().trim().max(160).optional(),
  isTemporary: z.boolean().optional(),
  effectiveFrom: z.coerce.date().nullable().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
});

export async function GET() {
  try {
    const session = await requireGuardianSession();
    return await withTenant(session.schoolId, async (tx) => NextResponse.json(
      await getGuardianTransportOverview(tx, { schoolId: session.schoolId, guardianId: session.guardianId }),
      { headers: { "Cache-Control": "private, no-store" } },
    ));
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireGuardianSession();
    const input = await parseJson(request, setPickupSchema);
    return await withTenant(session.schoolId, async (tx) => NextResponse.json(await setGuardianPickupLocation(tx, {
      schoolId: session.schoolId,
      guardianId: session.guardianId,
      guardianUserId: session.userId,
      studentId: input.studentId,
      direction: input.direction,
      latitude: input.latitude,
      longitude: input.longitude,
      label: input.label,
      isTemporary: input.isTemporary,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
    }), { status: 201, headers: { "Cache-Control": "private, no-store" } }));
  } catch (error) { return routeError(error); }
}
