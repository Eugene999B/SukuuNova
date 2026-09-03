import { NextResponse } from "next/server";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { routeError } from "@/lib/errors";
import { getPlatformAnalytics } from "@/lib/platform-analytics-service";

export async function GET(request: Request) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "analytics.view");
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? 28);
    return NextResponse.json(await getPlatformAnalytics(session.role, Number.isFinite(days) ? days : 28));
  } catch (error) {
    return routeError(error);
  }
}
