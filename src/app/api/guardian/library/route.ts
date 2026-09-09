import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { guardianLibraryAction, guardianLibraryOverview } from "@/lib/library-resource-service";

export async function GET(request: Request) {
  try {
    const session = await requireGuardianSession();
    const studentId = new URL(request.url).searchParams.get("studentId")?.trim() || undefined;
    const result = await withTenant(session.schoolId, async tx => {
      await requireSchoolFeatureInTransaction(tx, session.schoolId, "library");
      return guardianLibraryOverview(tx, { schoolId: session.schoolId, guardianId: session.guardianId, userId: session.userId }, studentId);
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireGuardianSession();
    const body = await parseJson(request, z.record(z.string().min(1).max(100), z.unknown()));
    const result = await withTenant(session.schoolId, async tx => {
      await requireSchoolFeatureInTransaction(tx, session.schoolId, "library");
      return guardianLibraryAction(tx, { schoolId: session.schoolId, guardianId: session.guardianId, userId: session.userId }, body);
    });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}
