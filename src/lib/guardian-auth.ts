import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getSchoolAuthorizationState, authorizationVersion } from "./auth";
import { UnauthorizedError } from "./errors";

export const GUARDIAN_COOKIE = "sukuunova_guardian_session";
const SESSION_SECONDS = 60 * 60 * 8;

function secret(): Uint8Array {
  const value = process.env.SCHOOL_AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("SCHOOL_AUTH_SECRET must be configured with at least 32 characters.");
  return new TextEncoder().encode(value);
}

export type GuardianSession = {
  kind: "guardian";
  userId: string;
  guardianId: string;
  schoolId: string;
  name: string;
  schoolName: string;
  needsPasswordChange: boolean;
  authorizationVersion: string;
};

export async function createGuardianSessionToken(session: Omit<GuardianSession, "authorizationVersion"> | GuardianSession): Promise<string> {
  const state = await getSchoolAuthorizationState(session.userId, session.schoolId);
  if (!state || state.status !== "active" || state.schoolId !== session.schoolId) throw new UnauthorizedError("This guardian account is no longer active.");
  const currentAuthorizationVersion = authorizationVersion(state);

  return new SignJWT({
    kind: "guardian",
    guardianId: session.guardianId,
    schoolId: session.schoolId,
    name: session.name,
    schoolName: session.schoolName,
    needsPasswordChange: session.needsPasswordChange ? "1" : "0",
    authorizationVersion: currentAuthorizationVersion
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(session.userId)
    .setIssuer("sukuunova-guardian")
    .setAudience("sukuunova-guardian")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_SECONDS)
    .sign(secret());
}

export async function verifyGuardianSessionToken(token: string): Promise<GuardianSession> {
  const { payload } = await jwtVerify(token, secret(), { issuer: "sukuunova-guardian", audience: "sukuunova-guardian" });
  if (
    payload.kind !== "guardian" ||
    typeof payload.sub !== "string" ||
    typeof payload.guardianId !== "string" ||
    typeof payload.schoolId !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.schoolName !== "string" ||
    typeof payload.authorizationVersion !== "string"
  ) throw new UnauthorizedError("Invalid guardian session.");
  return {
    kind: "guardian",
    userId: payload.sub,
    guardianId: payload.guardianId,
    schoolId: payload.schoolId,
    name: payload.name,
    schoolName: payload.schoolName,
    needsPasswordChange: payload.needsPasswordChange === "1",
    authorizationVersion: payload.authorizationVersion
  };
}

export async function getGuardianSession() {
  const token = (await cookies()).get(GUARDIAN_COOKIE)?.value;
  if (!token) return null;
  try { return await verifyGuardianSessionToken(token); } catch { return null; }
}

export async function requireGuardianSession() {
  const session = await getGuardianSession();
  if (!session) throw new UnauthorizedError();
  const state = await getSchoolAuthorizationState(session.userId, session.schoolId);
  if (!state || state.status !== "active" || state.schoolId !== session.schoolId) throw new UnauthorizedError("This guardian account is no longer active.");
  if (authorizationVersion(state) !== session.authorizationVersion) throw new UnauthorizedError("Your guardian access has changed. Please sign in again.");
  return { ...session, name: state.name };
}