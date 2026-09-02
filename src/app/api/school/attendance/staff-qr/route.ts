import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { syncDefaultRbac } from "@/lib/role-builder-service";
import { clientIpFromHeaders, consumeStaffAttendanceQr, createStaffAttendanceQr, displayIpHashFromChallenge, displayLocationFromChallenge, freshChallengeId, freshNonce, hashClientIp, issueStaffAttendanceChallenge, verifyStaffAttendanceQr } from "@/lib/qr-attendance";
import { recordStaffSelfAttendance } from "@/lib/attendance-service";

const locationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyM: z.number().finite().positive().max(5000).optional()
}).nullable().optional();

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
        await issueStaffAttendanceChallenge(tx, {
          schoolId: session.schoolId,
          actorId: session.userId,
          challengeId,
          nonce,
          issuedAt,
          expiresAt,
          displayIpHash: ipHash,
          displayLocation: input.displayLocation ?? undefined
        });
        const token = await createStaffAttendanceQr(session.schoolId, challengeId, nonce, expiresAt);
        return { token, challengeId, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString() };
      });
      return NextResponse.json({ ok: true, result, refreshAfterSeconds: 30 });
    }

    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "attendance:staff_scan");
      const verified = await verifyStaffAttendanceQr(input.token, session.schoolId);
      const challenge = await tx.auditLogSchool.findFirst({
        where: {
          schoolId: session.schoolId,
          action: "attendance.qr.issued",
          entityType: "StaffAttendanceQrChallenge",
          entityId: verified.challengeId
        },
        orderBy: { createdAt: "desc" },
        select: { after: true }
      });
      const displayIpHash = displayIpHashFromChallenge(challenge?.after);
      const displayLocation = displayLocationFromChallenge(challenge?.after);
      if (!displayIpHash) throw new AppError("This school check-in code is no longer valid.", 409, "CHALLENGE_NOT_FOUND");

      const sameNetwork = ipHash !== hashClientIp("unknown") && ipHash === displayIpHash;
      let geoVerified = false;
      let distanceM: number | undefined;
      let geoReason = "unavailable";
      if (displayLocation && input.location) {
        const displayAccuracy = displayLocation.accuracyM ?? 9999;
        const scanAccuracy = input.location.accuracyM ?? 9999;
        if (displayAccuracy <= 250 && scanAccuracy <= 250) {
          distanceM = distanceMeters(displayLocation, input.location);
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

      try {
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

        return { event, verification };
      } catch (error) {
        // Business-rule failures (for example, an existing same-day check-in)
        // must still burn the one-time challenge. Catch AppError, record the
        // consumption in this transaction, then return the failure for the
        // response layer after the transaction has committed.
        if (!(error instanceof AppError)) throw error;
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
            locationReason: geoReason,
            outcome: "rejected",
            errorCode: error.code
          }
        });
        return { error };
      }
    });

    if ("error" in result) throw result.error;
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
