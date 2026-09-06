import { NextResponse } from "next/server";
import { PLATFORM_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PLATFORM_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return response;
}
