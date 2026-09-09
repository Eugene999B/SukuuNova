import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { previewDefaultRoleUpgrades, applyDefaultRoleUpgrades, defaultRoleUpgradeSchema } from "@/lib/default-role-upgrade-service";

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, tx => previewDefaultRoleUpgrades(tx, { schoolId: session.schoolId, actorId: session.userId }));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}
export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, defaultRoleUpgradeSchema);
    const result = await withTenant(session.schoolId, tx => applyDefaultRoleUpgrades(tx, { ...input, schoolId: session.schoolId, actorId: session.userId }));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}
