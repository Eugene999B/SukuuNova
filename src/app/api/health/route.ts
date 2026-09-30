import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Share a pending probe so an unavailable database cannot build up a fresh
// connection request for every load-balancer health check.
let pendingProbe: Promise<boolean> | undefined;
let lastSuccess = 0;
function probeDatabase() {
  if (Date.now() - lastSuccess < 1000) return Promise.resolve(true);
  if (!pendingProbe) {
    pendingProbe = db.$queryRaw`SELECT 1`
      .then(() => { lastSuccess = Date.now(); return true; })
      .catch(() => false)
      .finally(() => { pendingProbe = undefined; });
  }
  return pendingProbe;
}

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ok = await Promise.race([
      probeDatabase(),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 3000); }),
    ]);
    return NextResponse.json(
      { ok, service: "sukuunova", ...(ok ? { commit: process.env.RAILWAY_GIT_COMMIT_SHA || null } : {}) },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
