import { NextResponse } from "next/server";
import { db, ensureDatabaseRoleSafe } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  // Shallow liveness stays 200 on DB reachability, but the payload now also
  // reports whether the connection role is RLS-safe: a superuser/BYPASSRLS
  // role silently disables every tenant boundary, so operators must see it
  // as degraded instead of discovering it during an incident.
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, service: "sukuunova" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  let rlsSafe = true;
  let rlsReason: string | null = null;
  try {
    const rows = await db.$queryRawUnsafe<Array<{ bypass: boolean; superuser: boolean }>>(
      `SELECT rolbypassrls AS "bypass", rolsuper AS "superuser" FROM pg_roles WHERE rolname = current_user`
    );
    if (rows[0]?.bypass || rows[0]?.superuser) {
      rlsSafe = false;
      rlsReason = "Database role bypasses row-level security.";
    } else {
      await ensureDatabaseRoleSafe();
    }
  } catch (error) {
    rlsSafe = false;
    rlsReason = error instanceof Error ? error.message.slice(0, 160) : "RLS safety check failed.";
  }
  return NextResponse.json(
    { ok: rlsSafe, service: "sukuunova", database: true, rlsSafe, rlsReason },
    { status: rlsSafe ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
