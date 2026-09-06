import { NextResponse } from "next/server";
import { GUARDIAN_COOKIE } from "@/lib/guardian-auth";
import { sessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(GUARDIAN_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return response;
}
