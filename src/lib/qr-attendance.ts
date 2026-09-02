import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { AppError } from "./errors";
import type { TenantDb } from "./db";

type QrTarget = { kind: "student" | "staff"; id: string };

export type StaffAttendanceQrPayload = {
  schoolId: string;
  purpose: "staff-check-in";
  challengeId: string;
  nonce: string;
  displayIpHash: string;
  displayLocation?: { latitude: number; longitude: number; accuracyM?: number };
};

function secret() {
  const value = process.env.SCHOOL_AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SCHOOL_AUTH_SECRET must be configured with at least 32 characters.");
  }
  return new TextEncoder().encode(value);
}

export function hashQrSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function clientIpFromHeaders(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

export function hashClientIp(ip: string) {
  return hashQrSecret(`${process.env.SCHOOL_AUTH_SECRET ?? ""}:attendance-ip:${ip}`);
}

export function freshChallengeId() {
  return randomBytes(16).toString("hex");
}

export function freshNonce() {
  return randomBytes(32).toString("base64url");
}

export async function createAttendanceQr(
  schoolId: string,
  target: QrTarget,
  expiresInSeconds = 90
) {
  return new SignJWT({ schoolId, kind: target.kind })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(target.id)
    .setIssuer("sukuunova-attendance")
    .setAudience("sukuunova-attendance")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(secret());
}

export async function verifyAttendanceQr(token: string, schoolId: string): Promise<QrTarget> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: "sukuunova-attendance",
      audience: "sukuunova-attendance"
    });
    if (
      payload.schoolId !== schoolId ||
      typeof payload.sub !== "string" ||
      (payload.kind !== "student" && payload.kind !== "staff")
    ) {
      throw new Error("invalid payload");
    }
    return { kind: payload.kind, id: payload.sub };
  } catch {
    throw new AppError("The attendance QR is invalid or expired.", 400, "INVALID_QR");
  }
}

export async function createStaffAttendanceQr(
  schoolId: string,
  challengeId: string,
  nonce: string,
  expiresAt: Date,
  displayIpHash: string,
  displayLocation?: { latitude: number; longitude: number; accuracyM?: number }
) {
  return new SignJWT({
    schoolId,
    purpose: "staff-check-in",
    nonce,
    displayIpHash,
    ...(displayLocation ? { displayLocation } : {})
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("staff-check-in")
    .setJti(challengeId)
    .setIssuer("sukuunova-attendance")
    .setAudience("sukuunova-attendance")
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
}

export async function verifyStaffAttendanceQr(token: string, schoolId: string): Promise<StaffAttendanceQrPayload> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: "sukuunova-attendance",
      audience: "sukuunova-attendance",
      maxTokenAge: "2m"
    });
    if (
      payload.schoolId !== schoolId ||
      payload.purpose !== "staff-check-in" ||
      payload.sub !== "staff-check-in" ||
      typeof payload.jti !== "string" ||
      typeof payload.nonce !== "string" ||
      typeof payload.displayIpHash !== "string"
    ) {
      throw new Error("invalid payload");
    }
    const displayLocation = payload.displayLocation;
    if (
      displayLocation !== undefined &&
      (typeof displayLocation !== "object" || displayLocation === null ||
        typeof displayLocation.latitude !== "number" ||
        typeof displayLocation.longitude !== "number")
    ) {
      throw new Error("invalid location payload");
    }
    return {
      schoolId,
      purpose: "staff-check-in",
      challengeId: payload.jti,
      nonce: payload.nonce,
      displayIpHash: payload.displayIpHash,
      displayLocation: displayLocation as StaffAttendanceQrPayload["displayLocation"]
    };
  } catch {
    throw new AppError("The school check-in QR is invalid or expired.", 400, "INVALID_STAFF_QR");
  }
}

export async function consumeStaffAttendanceQr(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; challengeId: string; nonce: string; verification: string; meta?: Record<string, unknown> }
) {
  const id = hashQrSecret(`staff-qr-consumption:${input.schoolId}:${input.challengeId}:${input.actorId}`);
  const result = await tx.auditLogSchool.createMany({
    data: [{
      id,
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "attendance.qr.consumed",
      entityType: "StaffAttendanceQrChallenge",
      entityId: input.challengeId,
      after: {
        verification: input.verification,
        ...(input.meta ? { meta: input.meta } : {})
      }
    }],
    skipDuplicates: true
  });
  if (result.count !== 1) {
    throw new AppError("This attendance code has already been used on this account.", 409, "QR_REPLAY");
  }
}
