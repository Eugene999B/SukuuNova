import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SCHOOL_COOKIE = "sukuunova_school_session";
const PLATFORM_COOKIE = "sukuunova_platform_session";
const GUARDIAN_COOKIE = "sukuunova_guardian_session";

type SessionKind = "school" | "platform" | "guardian";

function authSecret(name: "SCHOOL_AUTH_SECRET" | "PLATFORM_AUTH_SECRET" | "GUARDIAN_AUTH_SECRET") {
  const value = process.env[name];
  if (!value || value.length < 32) return null;
  return new TextEncoder().encode(value);
}

async function hasLiveSession(cookieValue: string | undefined, kind: SessionKind) {
  if (!cookieValue) return false;
  const config = kind === "platform"
    ? { secret: authSecret("PLATFORM_AUTH_SECRET"), issuer: "sukuunova-platform", audience: "sukuunova-platform" }
    : kind === "guardian"
      ? { secret: authSecret("GUARDIAN_AUTH_SECRET"), issuer: "sukuunova-guardian", audience: "sukuunova-guardian" }
      : { secret: authSecret("SCHOOL_AUTH_SECRET"), issuer: "sukuunova-school", audience: "sukuunova-school" };
  if (!config.secret) return false;
  try {
    const { payload } = await jwtVerify(cookieValue, config.secret, { issuer: config.issuer, audience: config.audience });
    return payload.kind === kind && typeof payload.sub === "string" && typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function protectedApiKind(pathname: string): SessionKind | null {
  if (
    pathname.startsWith("/api/platform/") ||
    pathname === "/api/platform"
  ) return "platform";
  if (
    pathname.startsWith("/api/school/") ||
    pathname === "/api/school" ||
    pathname.startsWith("/api/mvp/") ||
    pathname.startsWith("/api/phase2/") ||
    pathname.startsWith("/api/phase3/") ||
    (pathname.startsWith("/api/phase4") && pathname !== "/api/phase4/whatsapp") ||
    pathname.startsWith("/api/protected/") ||
    pathname === "/api/sync"
  ) return "school";
  if (pathname.startsWith("/api/account/") || pathname === "/api/account") return "platform";
  return null;
}

function isPublicOrSpecialApi(pathname: string) {
  return (
    pathname === "/api/health" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/devices/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/phase4/whatsapp"
  );
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const protectedSchool = pathname.startsWith("/school") || protectedApiKind(pathname) === "school";
  const protectedPlatform = pathname.startsWith("/platform") || protectedApiKind(pathname) === "platform";
  const protectedTeacher = pathname.startsWith("/teacher");
  const protectedGuardian = pathname.startsWith("/guardian");

  if (isPublicOrSpecialApi(pathname)) return NextResponse.next();
  if (!protectedSchool && !protectedPlatform && !protectedTeacher && !protectedGuardian) return NextResponse.next();

  const apiKind = protectedApiKind(pathname);
  const kind: SessionKind = apiKind ?? (protectedPlatform ? "platform" : protectedGuardian ? "guardian" : "school");
  const cookieName = kind === "platform" ? PLATFORM_COOKIE : kind === "guardian" ? GUARDIAN_COOKIE : SCHOOL_COOKIE;
  if (await hasLiveSession(request.cookies.get(cookieName)?.value, kind)) return NextResponse.next();

  if (apiKind) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const loginPath = protectedPlatform ? "/login/platform" : protectedGuardian ? "/login/guardian" : "/login/school";
  const loginUrl = new URL(loginPath, request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  loginUrl.searchParams.set("expired", "1");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/school/:path*",
    "/platform/:path*",
    "/teacher/:path*",
    "/guardian/:path*",
    "/api/platform/:path*",
    "/api/school/:path*",
    "/api/mvp/:path*",
    "/api/phase2/:path*",
    "/api/phase3/:path*",
    "/api/phase4/:path*",
    "/api/protected/:path*",
    "/api/sync",
    "/api/account/:path*",
  ],
};
