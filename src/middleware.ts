import { NextRequest, NextResponse } from "next/server";

const SCHOOL_COOKIE = "sukuunova_school_session";
const PLATFORM_COOKIE = "sukuunova_platform_session";

function hasLiveSession(cookieValue: string | undefined) {
  if (!cookieValue) return false;
  try {
    const parts = cookieValue.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const protectedSchool = pathname.startsWith("/school");
  const protectedPlatform = pathname.startsWith("/platform");

  if (!protectedSchool && !protectedPlatform) return NextResponse.next();

  const cookieName = protectedSchool ? SCHOOL_COOKIE : PLATFORM_COOKIE;
  if (hasLiveSession(request.cookies.get(cookieName)?.value)) return NextResponse.next();

  const loginPath = protectedSchool ? "/login/school" : "/login/platform";
  const loginUrl = new URL(loginPath, request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  loginUrl.searchParams.set("expired", "1");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/school/:path*", "/platform/:path*"],
};
