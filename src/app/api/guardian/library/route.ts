import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { guardianLibraryAction, guardianLibraryOverview } from "@/lib/library-resource-service";

function initialStudentId(request: Request) {
  const url = new URL(request.url);
  const explicit = url.searchParams.get("studentId")?.trim();
  if (explicit) return explicit;
  const referer = request.headers.get("referer");
  if (!referer) return undefined;
  try {
    const page = new URL(referer);
    if (page.origin !== url.origin || page.pathname.replace(/\/$/, "") !== "/guardian/library") return undefined;
    return page.searchParams.get("studentId")?.trim() || undefined;
  } catch { return undefined; }
}

export async function GET(request: Request) {
  try {
    const session = await requireGuardianSession();
    const studentId = initialStudentId(request);
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
