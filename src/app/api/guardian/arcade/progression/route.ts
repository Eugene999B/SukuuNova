import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { ForbiddenError, routeError } from "@/lib/errors";
import { guardianArcadeProgression } from "@/lib/arcade-progression";

const query = z.object({ studentId: z.string().min(1).max(100) });

export async function GET(request: Request) {
  try {
    const current = await requireGuardianSession();
    if (current.needsPasswordChange) throw new ForbiddenError("Change your temporary password before opening Learning Arcade.");
    const url = new URL(request.url);
    const input = query.parse({ studentId: url.searchParams.get("studentId") ?? "" });
    const result = await withTenant(current.schoolId, (tx) => guardianArcadeProgression(tx, current, input.studentId));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
