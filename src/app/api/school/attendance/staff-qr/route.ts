import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { syncDefaultRbac } from "@/lib/role-builder-service";
import { createStaffAttendanceQr, consumeStaffAttendanceQr, freshChallengeId, freshNonce, hashClientIp, clientIpFromHeaders, verifyStaffAttendanceQr } from "@/lib/qr-attendance";
import { recordStaffSelfAttendance } from "@/lib/attendance-service";

const locationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyM: z.number().finite().positive().max(5000).optional()
}).optional();

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("challenge"), displayLocation: locationSchema }),
  z.object({ action: z.literal("scan"), token: z.string().min(50).max(10000), location: locationSchema })
]);

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371008.8;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const ipHash = hashClientIp(clientIpFromHeaders(request.headers));

    if (input.action === "challenge") {
      const result = await withTenant(session.schoolId, async (tx) => {
        await syncDefaultRbac(tx, session.schoolId);
        await requirePermission(tx, session.userId, "attendance:display");
        const issuedAt = new Date();
        const expiresAt = new Date(issuedAt.getTime() + 45_000);
        const challengeId = freshChallengeId();
        const nonce = freshNonce();
        const token = await createStaffAttendanceQr(session.schoolId, challengeId, nonce, expiresAt, ipHash, input.displayLocation);
        return { token, challengeId, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString() };
      });
      return NextResponse.json({ ok: true, result, refreshAfterSeconds: 30 });
    }

    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "attendance:view_own");
      const verified = await verifyStaffAttendanceQr(input.token, session.schoolId);
      const unknownIpHash = hashClientIp("unknown");
      const sameNetwork = ipHash !== unknownIpHash && ipHash === verified.displayIpHash;

      let geoVerified = false;
      let distanceM: number | undefined;
      let geoReason = "unavailable";
      if (verified.displayLocation && input.location) {
        const displayAccuracy = verified.displayLocation.accuracyM ?? 9999;
        const scanAccuracy = input.location.accuracyM ?? 9999;
        if (displayAccuracy <= 250 && scanAccuracy <= 250) {
          distanceM = distanceMeters(verified.displayLocation, input.location);
          const accuracyAllowance = Math.min(250, displayAccuracy + scanAccuracy);
          geoVerified = distanceM <= Math.max(150, accuracyAllowance);
          geoReason = geoVerified ? "within_display_radius" : "outside_display_radius";
        } else {
          geoReason = "location_accuracy_too_low";
        }
      } else if (!input.location) {
        geoReason = "scan_location_unavailable";
      } else {
        geoReason = "display_location_unavailable";
      }

      if (!sameNetwork && !geoVerified) {
        throw new AppError("Attendance check-in could not verify that you are at school. Please connect to the school's network or allow location access and scan the live code again.", 403, "SCHOOL_PRESENCE_NOT_VERIFIED");
      }

      const verification = sameNetwork && geoVerified ? "qr+network+location" : sameNetwork ? "qr+network" : "qr+location";
      await consumeStaffAttendanceQr(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        challengeId: verified.challengeId,
        nonce: verified.nonce,
        verification,
        meta: {
          networkMatch: sameNetwork,
          locationMatch: geoVerified,
          ...(distanceM !== undefined ? { distanceM: Math.round(distanceM) } : {}),
          locationReason: geoReason
        }
      });

      const event = await recordStaffSelfAttendance(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        type: "in",
        verification,
        verificationMeta: {
          networkMatch: sameNetwork,
          locationMatch: geoVerified,
          ...(distanceM !== undefined ? { distanceM: Math.round(distanceM) } : {})
        }
      });
      return { event, verification };
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
