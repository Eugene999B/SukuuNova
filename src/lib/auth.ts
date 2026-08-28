import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { UnauthorizedError } from "./errors";

export const SCHOOL_COOKIE = "sukuunova_school_session";
export const PLATFORM_COOKIE = "sukuunova_platform_session";
const SESSION_SECONDS = 60 * 60 * 8;

export type SchoolSession = {
  kind: "school";
  userId: string;
  schoolId: string;
  name: string;
};

export type PlatformSession = {
  kind: "platform";
  adminId: string;
  name: string;
  role: string;
};

function secret(name: "SCHOOL_AUTH_SECRET" | "PLATFORM_AUTH_SECRET"): Uint8Array {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(name + " must be configured with at least 32 characters.");
  }
  return new TextEncoder().encode(value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS
  };
}

export async function createSchoolSessionToken(
  session: SchoolSession
): Promise<string> {
  return new SignJWT({
    kind: "school",
    schoolId: session.schoolId,
    name: session.name
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(session.userId)
    .setIssuer("sukuunova-school")
    .setAudience("sukuunova-school")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_SECONDS)
    .sign(secret("SCHOOL_AUTH_SECRET"));
}

export async function createPlatformSessionToken(
  session: PlatformSession
): Promise<string> {
  return new SignJWT({
    kind: "platform",
    name: session.name,
    role: session.role
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(session.adminId)
    .setIssuer("sukuunova-platform")
    .setAudience("sukuunova-platform")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_SECONDS)
    .sign(secret("PLATFORM_AUTH_SECRET"));
}

export async function verifySchoolSessionToken(
  token: string
): Promise<SchoolSession> {
  const { payload } = await jwtVerify(token, secret("SCHOOL_AUTH_SECRET"), {
    issuer: "sukuunova-school",
    audience: "sukuunova-school"
  });

  if (
    payload.kind !== "school" ||
    typeof payload.sub !== "string" ||
    typeof payload.schoolId !== "string" ||
    typeof payload.name !== "string"
  ) {
    throw new UnauthorizedError("Invalid school session.");
  }

  return {
    kind: "school",
    userId: payload.sub,
    schoolId: payload.schoolId,
    name: payload.name
  };
}

export async function verifyPlatformSessionToken(
  token: string
): Promise<PlatformSession> {
  const { payload } = await jwtVerify(token, secret("PLATFORM_AUTH_SECRET"), {
    issuer: "sukuunova-platform",
    audience: "sukuunova-platform"
  });

  if (
    payload.kind !== "platform" ||
    typeof payload.sub !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.role !== "string"
  ) {
    throw new UnauthorizedError("Invalid platform session.");
  }

  return {
    kind: "platform",
    adminId: payload.sub,
    name: payload.name,
    role: payload.role
  };
}

export async function getSchoolSession(): Promise<SchoolSession | null> {
  const token = (await cookies()).get(SCHOOL_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifySchoolSessionToken(token);
  } catch {
    return null;
  }
}

export async function getPlatformSession(): Promise<PlatformSession | null> {
  const token = (await cookies()).get(PLATFORM_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyPlatformSessionToken(token);
  } catch {
    return null;
  }
}

export async function requireSchoolSession(): Promise<SchoolSession> {
  const session = await getSchoolSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export async function requirePlatformSession(): Promise<PlatformSession> {
  const session = await getPlatformSession();
  if (!session) throw new UnauthorizedError();
  return session;
}
