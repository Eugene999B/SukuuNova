import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Prisma } from "@prisma/client";
import { AppError } from "./errors";
import type { TenantDb } from "./db";

type QrTarget = { kind: "student" | "staff"; id: string };

export type StaffAttendanceQrPayload = {
  schoolId: string;
  purpose: "staff-check-in";
  challengeId: string;
  nonce: string;
};

function secret() {
  const value = process.env.QR_AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("QR_AUTH_SECRET must be configured with at least 32 characters.");
  }
  return new TextEncoder().encode(value);
}

export function hashQrSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Return only a proxy-supplied real-IP header for security decisions.
 * Do not use the first x-forwarded-for value: it may contain an untrusted
 * client-supplied value unless the deployment explicitly guarantees a trusted chain.
 */
export function clientIpFromHeaders(headers: Headers) {
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function hashClientIp(ip: string) {
  return hashQrSecret(`${process.env.QR_AUTH_SECRET ?? ""}:attendance-ip:${ip}`);
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
  expiresAt: Date
) {
  return new SignJWT({
    schoolId,
    purpose: "staff-check-in",
    nonce
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
      payload.nonce.length < 32
    ) {
      throw new Error("invalid payload");
    }
    return {
      schoolId,
      purpose: "staff-check-in",
      challengeId: payload.jti,
      nonce: payload.nonce
    };
  } catch {
    throw new AppError("The school check-in QR is invalid or expired.", 400, "INVALID_STAFF_QR");
  }
}

export async function issueStaffAttendanceChallenge(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    challengeId: string;
    nonce: string;
    issuedAt: Date;
    expiresAt: Date;
    displayIpHash: string;
    displayLocation?: { latitude: number; longitude: number; accuracyM?: number };
  }
) {
  const challenge = await tx.auditLogSchool.create({
    data: {
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "attendance.qr.issued",
      entityType: "StaffAttendanceQrChallenge",
      entityId: input.challengeId,
      after: {
        nonceHash: hashQrSecret(input.nonce),
        issuedAt: input.issuedAt.toISOString(),
        expiresAt: input.expiresAt.toISOString(),
        displayIpHash: input.displayIpHash,
        ...(input.displayLocation ? { displayLocation: input.displayLocation } : {})
      }
    }
  });
  return challenge;
}

export async function consumeStaffAttendanceQr(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; challengeId: string; nonce: string; verification: string; meta?: Record<string, unknown> }
) {
  const challenge = await tx.auditLogSchool.findFirst({
    where: {
      schoolId: input.schoolId,
      action: "attendance.qr.issued",
      entityType: "StaffAttendanceQrChallenge",
      entityId: input.challengeId
    },
    orderBy: { createdAt: "desc" },
    select: { after: true }
  });
  const after = challenge?.after;
  const nonceHash = after && typeof after === "object" && after !== null && "nonceHash" in after && typeof after.nonceHash === "string" ? after.nonceHash : null;
  const expiresAtRaw = after && typeof after === "object" && after !== null && "expiresAt" in after && typeof after.expiresAt === "string" ? after.expiresAt : null;
  const displayIpHash = after && typeof after === "object" && after !== null && "displayIpHash" in after && typeof after.displayIpHash === "string" ? after.displayIpHash : null;
  if (!nonceHash || hashQrSecret(input.nonce) !== nonceHash || !expiresAtRaw || new Date(expiresAtRaw).getTime() <= Date.now()) {
    throw new AppError("This attendance code is invalid or expired.", 409, "CHALLENGE_INVALID_OR_EXPIRED");
  }

  // challengeId deliberately defines the global one-time key. Actor identity
  // must not be part of it because a school-wide challenge can be consumed only once.
  const consumptionId = hashQrSecret(`staff-qr-consumption:${input.schoolId}:${input.challengeId}`);
  const result = await tx.auditLogSchool.createMany({
    data: [{
      id: consumptionId,
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "attendance.qr.consumed",
      entityType: "StaffAttendanceQrChallenge",
      entityId: input.challengeId,
      after: ({
        verification: input.verification,
        ...(displayIpHash ? { displayIpHash } : {}),
        ...(input.meta ? { meta: input.meta } : {})
      } as Prisma.InputJsonValue)
    }],
    skipDuplicates: true
  });
  if (result.count !== 1) {
    throw new AppError("This attendance code has already been used.", 409, "QR_REPLAY");
  }
}

export function displayLocationFromChallenge(after: unknown) {
  if (!after || typeof after !== "object") return undefined;
  const value = "displayLocation" in after ? after.displayLocation : undefined;
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.latitude !== "number" || typeof row.longitude !== "number") return undefined;
  return { latitude: row.latitude, longitude: row.longitude, accuracyM: typeof row.accuracyM === "number" ? row.accuracyM : undefined };
}

export function displayIpHashFromChallenge(after: unknown) {
  if (!after || typeof after !== "object") return undefined;
  const value = "displayIpHash" in after ? after.displayIpHash : undefined;
  return typeof value === "string" ? value : undefined;
}
