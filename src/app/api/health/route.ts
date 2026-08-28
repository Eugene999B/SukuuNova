import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "sukuunova" }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, service: "sukuunova" }, { status: 503 });
  }
}
