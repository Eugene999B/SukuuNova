import { NextResponse } from "next/server";
import { SCHOOL_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SCHOOL_COOKIE);
  return response;
}
