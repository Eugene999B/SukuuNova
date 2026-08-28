import { SignJWT, jwtVerify } from "jose";
import { AppError } from "./errors";

type QrTarget = { kind: "student" | "staff"; id: string };

function secret() {
  const value = process.env.SCHOOL_AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SCHOOL_AUTH_SECRET must be configured with at least 32 characters.");
  }
  return new TextEncoder().encode(value);
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
