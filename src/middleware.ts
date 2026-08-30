import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SCHOOL_COOKIE = "sukuunova_school_session";
const PLATFORM_COOKIE = "sukuunova_platform_session";
const GUARDIAN_COOKIE = "sukuunova_guardian_session";

type SessionKind = "school" | "platform" | "guardian";

function authSecret(name: "SCHOOL_AUTH_SECRET" | "PLATFORM_AUTH_SECRET") {
  const value = process.env[name];
  if (!value || value.length < 32) return null;
  return new TextEncoder().encode(value);
}

async function hasLiveSession(cookieValue: string | undefined, kind: SessionKind) {
  if (!cookieValue) return false;
  const config = kind === "platform"
    ? { secret: authSecret("PLATFORM_AUTH_SECRET"), issuer: "sukuunova-platform", audience: "sukuunova-platform" }
    : kind === "guardian"
      ? { secret: authSecret("SCHOOL_AUTH_SECRET"), issuer: "sukuunova-guardian", audience: "sukuunova-guardian" }
      : { secret: authSecret("SCHOOL_AUTH_SECRET"), issuer: "sukuunova-school", audience: "sukuunova-school" };
  if (!config.secret) return false;
  try {
    const { payload } = await jwtVerify(cookieValue, config.secret, { issuer: config.issuer, audience: config.audience });
    return payload.kind === kind && typeof payload.sub === "string" && typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const protectedSchool = pathname.startsWith("/school");
  const protectedPlatform = pathname.startsWith("/platform");
  const protectedTeacher = pathname.startsWith("/teacher");
  const protectedGuardian = pathname.startsWith("/guardian");

  if (!protectedSchool && !protectedPlatform && !protectedTeacher && !protectedGuardian) return NextResponse.next();

  const kind: SessionKind = protectedPlatform ? "platform" : protectedGuardian ? "guardian" : "school";
  const cookieName = protectedPlatform ? PLATFORM_COOKIE : protectedGuardian ? GUARDIAN_COOKIE : SCHOOL_COOKIE;
  if (await hasLiveSession(request.cookies.get(cookieName)?.value, kind)) return NextResponse.next();

  const loginPath = protectedPlatform ? "/login/platform" : protectedGuardian ? "/login/guardian" : "/login/school";
  const loginUrl = new URL(loginPath, request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  loginUrl.searchParams.set("expired", "1");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/school/:path*", "/platform/:path*", "/teacher/:path*", "/guardian/:path*"],
};
