import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { runRiskScanForAllSchools } from "@/lib/phase4-ops-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const expected = process.env.RISK_SCAN_CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 32 || !provided) return false;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const results = await runRiskScanForAllSchools();
    return Response.json({ ok: true, results });
  } catch (error) {
    console.error("SukuuNova risk scan failed", error);
    return Response.json({ error: "Risk scan failed." }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: "Method not allowed. Use POST." }, { status: 405, headers: { Allow: "POST" } });
}
