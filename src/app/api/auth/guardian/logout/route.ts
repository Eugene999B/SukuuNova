import { NextResponse } from "next/server";
import { GUARDIAN_COOKIE } from "@/lib/guardian-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(GUARDIAN_COOKIE);
  return response;
}
