import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { getSchoolTransportControl, reviewPickupPoint } from "@/lib/novacore/family-transport-service";
import {
  assignStudentTransport,
  finishTransportTrip,
  registerCertifiedTracker,
  replaceRouteShape,
  startTransportTrip,
} from "@/lib/novacore/transport-operations-service";
import { provisionTrackerGatewayBinding } from "@/lib/novacore/tracker-gateway-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reviewPickup"), pickupPointId: z.string().min(1), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("registerTracker"), vehicleId: z.string().min(1), imei: z.string().regex(/^\d{14,20}$/), model: z.literal("FMC130"), simIccid: z.string().trim().max(40).optional(), simMsisdn: z.string().trim().max(40).optional(), apn: z.string().trim().max(100).optional() }),
  z.object({ action: z.literal("provisionTracker"), trackerDeviceId: z.string().min(1), imei: z.string().regex(/^\d{14,20}$/) }),
  z.object({ action: z.literal("assignStudent"), studentId: z.string().min(1), routeId: z.string().min(1), vehicleId: z.string().min(1).nullable().optional(), morningEnabled: z.boolean(), afternoonEnabled: z.boolean() }),
  z.object({ action: z.literal("replaceRouteShape"), routeId: z.string().min(1), points: z.array(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })).min(2).max(5000) }),
  z.object({ action: z.literal("startTrip"), routeId: z.string().min(1), vehicleId: z.string().min(1), trackerDeviceId: z.string().min(1), direction: z.enum(["morning", "afternoon"]) }),
  z.object({ action: z.literal("finishTrip"), tripId: z.string().min(1) }),
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "transport:manage");
      return NextResponse.json(await getSchoolTransportControl(tx, session.schoolId), { headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);

    if (input.action === "registerTracker") {
      const tracker = await withTenant(session.schoolId, async (tx) => {
        await requirePermission(tx, session.userId, "transport:manage");
        return registerCertifiedTracker(tx, { schoolId: session.schoolId, actorId: session.userId, ...input });
      });
      const binding = await provisionTrackerGatewayBinding({ schoolId: session.schoolId, trackerDeviceId: tracker.id, imei: input.imei });
      return NextResponse.json({ ok: true, tracker: { ...tracker, imei: undefined }, binding: { ...binding, imeiHash: undefined } }, { status: 201 });
    }

    if (input.action === "provisionTracker") {
      await withTenant(session.schoolId, async (tx) => requirePermission(tx, session.userId, "transport:manage"));
      await provisionTrackerGatewayBinding({ schoolId: session.schoolId, trackerDeviceId: input.trackerDeviceId, imei: input.imei });
      return NextResponse.json({ ok: true });
    }

    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "transport:manage");
      const common = { schoolId: session.schoolId, actorId: session.userId };
      switch (input.action) {
        case "reviewPickup": return reviewPickupPoint(tx, { ...common, pickupPointId: input.pickupPointId, decision: input.decision, note: input.note });
        case "assignStudent": return assignStudentTransport(tx, { ...common, studentId: input.studentId, routeId: input.routeId, vehicleId: input.vehicleId, morningEnabled: input.morningEnabled, afternoonEnabled: input.afternoonEnabled });
        case "replaceRouteShape": return replaceRouteShape(tx, { ...common, routeId: input.routeId, points: input.points });
        case "startTrip": return startTransportTrip(tx, { ...common, routeId: input.routeId, vehicleId: input.vehicleId, trackerDeviceId: input.trackerDeviceId, direction: input.direction });
        case "finishTrip": return finishTransportTrip(tx, { ...common, tripId: input.tripId });
      }
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
