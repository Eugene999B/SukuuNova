import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { rawDb } from "./db";
import { UnauthorizedError } from "./errors";

export const SCHOOL_COOKIE = "sukuunova_school_session";
export const PLATFORM_COOKIE = "sukuunova_platform_session";
const SESSION_SECONDS = 60 * 60 * 8;
export const IMPERSONATION_SECONDS = 60 * 30;

export type SchoolSession = {
  kind: "school";
  userId: string;
  schoolId: string;
  name: string;
  authorizationVersion: string;
  impersonationId?: string;
  impersonatedByAdminId?: string;
};

export type PlatformSession = {
  kind: "platform";
  adminId: string;
  name: string;
  role: string;
  authorizationVersion: string;
};

function secret(name: "SCHOOL_AUTH_SECRET" | "PLATFORM_AUTH_SECRET"): Uint8Array {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(name + " must be configured with at least 32 characters.");
  return new TextEncoder().encode(value);
}

export function sessionCookieOptions(maxAge = SESSION_SECONDS) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}

export type SchoolAuthorizationState = {
  id: string;
  schoolId: string;
  name: string;
  status: string;
  passwordHash: string;
  userRoles: Array<{ role: { id: string; name: string; key: string | null; rolePermissions: Array<{ permissionId: string }> } }>;
  permissionOverrides: Array<{ permissionId: string; granted: boolean }>;
};

export type PlatformAuthorizationState = {
  id: string;
  name: string;
  role: string;
  status: string;
  passwordHash: string;
};

export function authorizationVersion(state: SchoolAuthorizationState): string {
  const normalized = {
    id: state.id,
    schoolId: state.schoolId,
    status: state.status,
    passwordHash: state.passwordHash,
    roles: state.userRoles
      .map(({ role }) => ({
        id: role.id,
        name: role.name,
        key: role.key,
        permissions: role.rolePermissions.map((permission) => permission.permissionId).sort()
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    overrides: state.permissionOverrides
      .map((override) => ({ permissionId: override.permissionId, granted: override.granted }))
      .sort((a, b) => a.permissionId.localeCompare(b.permissionId))
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function platformAuthorizationVersion(state: PlatformAuthorizationState): string {
  return createHash("sha256").update(JSON.stringify({
    id: state.id,
    name: state.name,
    role: state.role,
    status: state.status,
    passwordHash: state.passwordHash
  })).digest("hex");
}

export async function getSchoolAuthorizationState(userId: string, schoolId: string): Promise<SchoolAuthorizationState | null> {
  return rawDb.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id', $1, true)", schoolId);
    return tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        schoolId: true,
        name: true,
        status: true,
        passwordHash: true,
        userRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                key: true,
                rolePermissions: { select: { permissionId: true } }
              }
            }
          }
        },
        permissionOverrides: { select: { permissionId: true, granted: true } }
      }
    });
  });
}

export async function getPlatformAuthorizationState(adminId: string): Promise<PlatformAuthorizationState | null> {
  return rawDb.platformAdmin.findUnique({
    where: { id: adminId },
    select: { id: true, name: true, role: true, status: true, passwordHash: true }
  });
}

export async function createSchoolSessionToken(session: Omit<SchoolSession, "authorizationVersion"> | SchoolSession, expiresInSeconds = SESSION_SECONDS): Promise<string> {
  const state = await getSchoolAuthorizationState(session.userId, session.schoolId);
  if (!state || state.status !== "active" || state.schoolId !== session.schoolId) {
    throw new UnauthorizedError("This school account is no longer active.");
  }
  const currentAuthorizationVersion = authorizationVersion(state);
  const payload: Record<string, string> = {
    kind: "school",
    schoolId: session.schoolId,
    name: state.name,
    authorizationVersion: currentAuthorizationVersion
  };
  if (session.impersonationId) payload.impersonationId = session.impersonationId;
  if (session.impersonatedByAdminId) payload.impersonatedByAdminId = session.impersonatedByAdminId;
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(session.userId).setIssuer("sukuunova-school").setAudience("sukuunova-school").setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds).sign(secret("SCHOOL_AUTH_SECRET"));
}

export async function createPlatformSessionToken(session: Omit<PlatformSession, "authorizationVersion"> | PlatformSession): Promise<string> {
  const state = await getPlatformAuthorizationState(session.adminId);
  if (!state || state.status !== "active") throw new UnauthorizedError("This platform account is no longer active.");
  const currentAuthorizationVersion = platformAuthorizationVersion(state);
  return new SignJWT({ kind: "platform", name: state.name, role: state.role, authorizationVersion: currentAuthorizationVersion })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(session.adminId)
    .setIssuer("sukuunova-platform")
    .setAudience("sukuunova-platform")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_SECONDS)
    .sign(secret("PLATFORM_AUTH_SECRET"));
}

export async function verifySchoolSessionToken(token: string): Promise<SchoolSession> {
  const { payload } = await jwtVerify(token, secret("SCHOOL_AUTH_SECRET"), { issuer: "sukuunova-school", audience: "sukuunova-school" });
  if (
    payload.kind !== "school" ||
    typeof payload.sub !== "string" ||
    typeof payload.schoolId !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.authorizationVersion !== "string"
  ) throw new UnauthorizedError("Invalid school session.");
  return {
    kind: "school",
    userId: payload.sub,
    schoolId: payload.schoolId,
    name: payload.name,
    authorizationVersion: payload.authorizationVersion,
    impersonationId: typeof payload.impersonationId === "string" ? payload.impersonationId : undefined,
    impersonatedByAdminId: typeof payload.impersonatedByAdminId === "string" ? payload.impersonatedByAdminId : undefined
  };
}

export async function verifyPlatformSessionToken(token: string): Promise<PlatformSession> {
  const { payload } = await jwtVerify(token, secret("PLATFORM_AUTH_SECRET"), { issuer: "sukuunova-platform", audience: "sukuunova-platform" });
  if (payload.kind !== "platform" || typeof payload.sub !== "string" || typeof payload.name !== "string" || typeof payload.role !== "string" || typeof payload.authorizationVersion !== "string") throw new UnauthorizedError("Invalid platform session.");
  return { kind: "platform", adminId: payload.sub, name: payload.name, role: payload.role, authorizationVersion: payload.authorizationVersion };
}

export async function getSchoolSession() {
  const token = (await cookies()).get(SCHOOL_COOKIE)?.value;
  if (!token) return null;
  try { return await verifySchoolSessionToken(token); } catch { return null; }
}

export async function getPlatformSession() {
  const token = (await cookies()).get(PLATFORM_COOKIE)?.value;
  if (!token) return null;
  try { return await verifyPlatformSessionToken(token); } catch { return null; }
}

export async function requireSchoolSession() {
  const session = await getSchoolSession();
  if (!session) throw new UnauthorizedError();
  const state = await getSchoolAuthorizationState(session.userId, session.schoolId);
  if (!state || state.status !== "active" || state.schoolId !== session.schoolId) {
    throw new UnauthorizedError("This school account is no longer active.");
  }
  if (authorizationVersion(state) !== session.authorizationVersion) {
    throw new UnauthorizedError("Your school access has changed. Please sign in again.");
  }
  return { ...session, name: state.name };
}

export async function requirePlatformSession() {
  const session = await getPlatformSession();
  if (!session) throw new UnauthorizedError();
  const state = await getPlatformAuthorizationState(session.adminId);
  if (!state || state.status !== "active") throw new UnauthorizedError("This platform account is no longer active.");
  if (platformAuthorizationVersion(state) !== session.authorizationVersion) throw new UnauthorizedError("Your platform access has changed. Please sign in again.");
  return { ...session, name: state.name, role: state.role };
}