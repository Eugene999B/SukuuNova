import { NextResponse } from "next/server";
import { PLATFORM_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(PLATFORM_COOKIE);
  return response;
}
