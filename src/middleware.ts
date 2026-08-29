import { NextRequest, NextResponse } from "next/server";

const SCHOOL_COOKIE = "sukuunova_school_session";
const PLATFORM_COOKIE = "sukuunova_platform_session";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const protectedSchool = pathname.startsWith("/school");
  const protectedPlatform = pathname.startsWith("/platform");

  if (!protectedSchool && !protectedPlatform) return NextResponse.next();

  const cookieName = protectedSchool ? SCHOOL_COOKIE : PLATFORM_COOKIE;
  if (request.cookies.get(cookieName)?.value) return NextResponse.next();

  const loginPath = protectedSchool ? "/login/school" : "/login/platform";
  const loginUrl = new URL(loginPath, request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/school/:path*", "/platform/:path*"],
};
