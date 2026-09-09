import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { clientIpFromHeaders, consumeStaffAttendanceQr, createStaffAttendanceQr, displayIpHashFromChallenge, displayLocationFromChallenge, freshChallengeId, freshNonce, hashClientIp, issueStaffAttendanceChallenge, verifyStaffAttendanceQr } from "@/lib/qr-attendance";
import { recordStaffSelfAttendance } from "@/lib/attendance-service";
import { assertAutomatedAttendanceWindow, readAttendancePolicy } from "@/lib/attendance-policy";
import { verifyExpectedStaffFace } from "@/lib/face-service";

const locationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyM: z.number().finite().positive().max(5000).optional()
}).nullable().optional();

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("challenge"), displayLocation: locationSchema }),
  z.object({
    action: z.literal("scan"),
    token: z.string().min(50).max(10000),
    location: locationSchema,
    idempotencyKey: z.string().uuid(),
    faceImage: z.string().min(100).max(7_500_000).optional(),
  })
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

function noStoreJson(payload: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  return NextResponse.json(payload, { ...init, headers });
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const policy = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "attendance:staff_scan");
      return readAttendancePolicy(tx, session.schoolId);
    });
    return noStoreJson({
      qr: policy.qr,
      staffWindow: policy.staff,
      expectedResumptionTime: policy.expectedResumptionTime,
      attendanceGraceMinutes: policy.attendanceGraceMinutes,
      timezone: policy.timezone,
      configured: policy.configured,
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const ipHash = hashClientIp(clientIpFromHeaders(request.headers));

    if (input.action === "challenge") {
      const result = await withTenant(session.schoolId, async (tx) => {
        await requirePermission(tx, session.userId, "attendance:display");
        const policy = await readAttendancePolicy(tx, session.schoolId);
        if (!policy.qr.enabled) throw new AppError("Rotating QR attendance is disabled in Attendance Control.", 409, "STAFF_QR_DISABLED");
        const issuedAt = new Date();
        assertAutomatedAttendanceWindow(policy, "staff", issuedAt);
        const expiresAt = new Date(issuedAt.getTime() + (policy.qr.rotationSeconds + 5) * 1000);
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
        return {
          token,
          challengeId,
          issuedAt: issuedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          refreshAfterSeconds: policy.qr.rotationSeconds,
          requireFace: policy.qr.requireFace,
          presenceMode: policy.qr.presenceMode,
        };
      });
      return noStoreJson({ ok: true, result, refreshAfterSeconds: result.refreshAfterSeconds });
    }

    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "attendance:staff_scan");
      const policy = await readAttendancePolicy(tx, session.schoolId);
      if (!policy.qr.enabled) throw new AppError("Rotating QR attendance is disabled in Attendance Control.", 409, "STAFF_QR_DISABLED");

      const idempotencyAuditId = hashClientIp(`staff-qr-idempotency:${session.schoolId}:${session.userId}:${input.idempotencyKey}`);
      const previous = await tx.auditLogSchool.findUnique({ where: { id: idempotencyAuditId }, select: { actorId: true, after: true } });
      if (previous) {
        if (previous.actorId !== session.userId) throw new AppError("That attendance request key is already in use.", 409, "IDEMPOTENCY_KEY_REUSED");
        const previousAfter = previous.after;
        const eventId = previousAfter && typeof previousAfter === "object" && previousAfter !== null && "eventId" in previousAfter && typeof previousAfter.eventId === "string" ? previousAfter.eventId : null;
        if (!eventId) throw new AppError("The previous attendance receipt is incomplete.", 409, "IDEMPOTENCY_RECEIPT_INVALID");
        const event = await tx.attendanceEvent.findFirst({ where: { id: eventId, schoolId: session.schoolId, staffId: session.userId }, select: { id: true, staffId: true, type: true, timestamp: true, attendanceDate: true, isLate: true, method: true } });
        if (!event) throw new AppError("The previous attendance record is no longer available.", 409, "IDEMPOTENCY_EVENT_MISSING");
        const verification = previousAfter && typeof previousAfter === "object" && previousAfter !== null && "verification" in previousAfter && typeof previousAfter.verification === "string" ? previousAfter.verification : "qr";
        return { event, verification };
      }

      const verified = await verifyStaffAttendanceQr(input.token, session.schoolId);
      const challenge = await tx.auditLogSchool.findFirst({
        where: { schoolId: session.schoolId, action: "attendance.qr.issued", entityType: "StaffAttendanceQrChallenge", entityId: verified.challengeId },
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

      const presenceVerified = policy.qr.presenceMode === "network"
        ? sameNetwork
        : policy.qr.presenceMode === "location"
          ? geoVerified
          : sameNetwork || geoVerified;
      if (!presenceVerified) {
        const guidance = policy.qr.presenceMode === "network"
          ? "Connect to the school's attendance network and scan the live code again."
          : policy.qr.presenceMode === "location"
            ? "Allow accurate location access at the school and scan the live code again."
            : "Connect to the school's network or allow location access at the school, then scan the live code again.";
        throw new AppError(`Attendance check-in could not verify that you are at school. ${guidance}`, 403, "SCHOOL_PRESENCE_NOT_VERIFIED");
      }

      let faceConfidence: number | undefined;
      if (policy.qr.requireFace) {
        if (!input.faceImage) throw new AppError("This school requires face verification after scanning the QR code.", 409, "STAFF_FACE_REQUIRED");
        const face = await verifyExpectedStaffFace(tx, { schoolId: session.schoolId, staffId: session.userId, image: input.faceImage });
        faceConfidence = face.confidence;
      }

      const presenceVerification = sameNetwork && geoVerified ? "network+location" : sameNetwork ? "network" : "location";
      const verification = `qr+${presenceVerification}${policy.qr.requireFace ? "+face" : ""}`;
      const verificationMeta = {
        networkMatch: sameNetwork,
        locationMatch: geoVerified,
        ...(distanceM !== undefined ? { distanceM: Math.round(distanceM) } : {}),
        locationReason: geoReason,
        ...(faceConfidence !== undefined ? { faceConfidence } : {}),
        idempotencyKey: input.idempotencyKey,
      };

      // Claim this challenge for this staff account before writing attendance. If the
      // same person races/replays the code, QR_REPLAY aborts before any attendance row
      // can be created. Other staff may still claim the same live school challenge.
      await consumeStaffAttendanceQr(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        challengeId: verified.challengeId,
        nonce: verified.nonce,
        verification,
        meta: verificationMeta,
      });

      try {
        const event = await recordStaffSelfAttendance(tx, {
          schoolId: session.schoolId,
          actorId: session.userId,
          type: "in",
          method: "qr",
          verification,
          verificationMeta: {
            networkMatch: sameNetwork,
            locationMatch: geoVerified,
            ...(distanceM !== undefined ? { distanceM: Math.round(distanceM) } : {}),
            ...(faceConfidence !== undefined ? { faceConfidence } : {}),
          }
        });

        await tx.auditLogSchool.create({
          data: {
            id: idempotencyAuditId,
            schoolId: session.schoolId,
            actorId: session.userId,
            action: "attendance.qr.idempotency",
            entityType: "AttendanceEvent",
            entityId: event.id,
            after: { eventId: event.id, verification }
          }
        });
        return { event, verification };
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        // The verified challenge remains consumed for this staff account so a failed
        // attendance state (for example already checked in) cannot be retried/replayed.
        return { error };
      }
    });

    if ("error" in result) throw result.error;
    return noStoreJson({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
