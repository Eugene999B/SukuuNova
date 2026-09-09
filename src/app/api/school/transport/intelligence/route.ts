import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { replaceDirectionalRouteShape } from "@/lib/novacore/directional-route-service";
import { getSchoolTransportControl, reviewPickupPoint } from "@/lib/novacore/family-transport-service";
import { startTrackerCertification } from "@/lib/novacore/tracker-certification-service";
import {
  assignStudentTransport,
  finishTransportTrip,
  registerCertifiedTracker,
  startTransportTrip,
} from "@/lib/novacore/transport-operations-service";
import { provisionTrackerGatewayBinding } from "@/lib/novacore/tracker-gateway-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reviewPickup"), pickupPointId: z.string().min(1), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("registerTracker"), vehicleId: z.string().min(1), imei: z.string().regex(/^\d{14,20}$/), model: z.literal("FMC130"), simIccid: z.string().trim().max(40).optional(), simMsisdn: z.string().trim().max(40).optional(), apn: z.string().trim().max(100).optional() }),
  z.object({ action: z.literal("provisionTracker"), trackerDeviceId: z.string().min(1), imei: z.string().regex(/^\d{14,20}$/) }),
  z.object({ action: z.literal("restartCertification"), trackerDeviceId: z.string().min(1) }),
  z.object({ action: z.literal("assignStudent"), studentId: z.string().min(1), routeId: z.string().min(1), vehicleId: z.string().min(1).nullable().optional(), morningEnabled: z.boolean(), afternoonEnabled: z.boolean() }),
  z.object({ action: z.literal("replaceRouteShape"), routeId: z.string().min(1), direction: z.enum(["morning", "afternoon"]), points: z.array(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })).min(2).max(5000) }),
  z.object({ action: z.literal("startTrip"), routeId: z.string().min(1), vehicleId: z.string().min(1), trackerDeviceId: z.string().min(1), direction: z.enum(["morning", "afternoon"]) }),
  z.object({ action: z.literal("finishTrip"), tripId: z.string().min(1) }),
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "transport:manage");
      const [control, openIncidents] = await Promise.all([
        getSchoolTransportControl(tx, session.schoolId),
        tx.$queryRawUnsafe(
          `SELECT i."id",i."tripId",i."trackerDeviceId",i."type",i."severity",i."status",i."openedAt",i."evidence",
                  tr."routeId",r."name" AS "routeName",tr."vehicleId",v."registrationNumber"
           FROM "P3TransportIncident" i
           JOIN "P3TransportTrip" tr ON tr."id"=i."tripId" AND tr."schoolId"=i."schoolId"
           JOIN "P3BusRoute" r ON r."id"=tr."routeId" AND r."schoolId"=tr."schoolId"
           JOIN "P3Vehicle" v ON v."id"=tr."vehicleId" AND v."schoolId"=tr."schoolId"
           WHERE i."schoolId"=$1 AND i."status"='open'
           ORDER BY CASE i."severity" WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, i."openedAt" ASC`,
          session.schoolId,
        ),
      ]);
      return NextResponse.json({ ...control, openIncidents }, { headers: { "Cache-Control": "private, no-store" } });
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
        case "restartCertification": return startTrackerCertification(tx, { ...common, trackerDeviceId: input.trackerDeviceId });
        case "assignStudent": return assignStudentTransport(tx, { ...common, studentId: input.studentId, routeId: input.routeId, vehicleId: input.vehicleId, morningEnabled: input.morningEnabled, afternoonEnabled: input.afternoonEnabled });
        case "replaceRouteShape": return replaceDirectionalRouteShape(tx, { ...common, routeId: input.routeId, direction: input.direction, points: input.points });
        case "startTrip": return startTransportTrip(tx, { ...common, routeId: input.routeId, vehicleId: input.vehicleId, trackerDeviceId: input.trackerDeviceId, direction: input.direction });
        case "finishTrip": return finishTransportTrip(tx, { ...common, tripId: input.tripId });
      }
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
