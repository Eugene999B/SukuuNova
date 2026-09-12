import { NextResponse } from "next/server";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { ForbiddenError, routeError } from "@/lib/errors";
import { ArcadeSessionConflictError } from "./session-errors";

export async function requireArcadeVNextGuardian() {
  const current = await requireGuardianSession();
  if (current.needsPasswordChange) {
    throw new ForbiddenError("Change your temporary password before opening Learning Arcade.");
  }
  return current;
}

export function arcadeVNextJson(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function arcadeVNextRouteError(error: unknown) {
  if (error instanceof ArcadeSessionConflictError) {
    return arcadeVNextJson({
      error: error.code,
      message: error.message,
      authoritative: error.authoritative,
    }, { status: error.status });
  }
  const response = routeError(error);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
