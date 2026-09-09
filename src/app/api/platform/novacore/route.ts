import { NextResponse } from "next/server";
import { requirePlatformSession } from "@/lib/auth";
import { AppError, routeError } from "@/lib/errors";
import { novaCoreRegistrySummary } from "@/lib/novacore/registry";

export async function GET() {
  try {
    const session = await requirePlatformSession();
    if (session.role !== "super_admin") {
      throw new AppError("Only Super Admin can inspect NovaCore algorithm controls.", 403, "FORBIDDEN");
    }
    return NextResponse.json(novaCoreRegistrySummary(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return routeError(error);
  }
}
