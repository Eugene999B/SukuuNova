import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { platformOnboardingSchema as schema } from "@/lib/platform-onboarding-input";
import { requirePlatformSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePlatformPermission, getPlatformSchoolScope } from "@/lib/platform-permissions";
import { onboardPlatformSchool } from "@/lib/platform-atomic-onboarding-service";



export async function GET() {
  try { const session = await requirePlatformSession(); await requirePlatformPermission(session, "schools.view"); const scope = await getPlatformSchoolScope(session); const schools = scope === null ? await db.schoolLoginDirectory.findMany({ orderBy: { createdAt: "desc" } }) : await db.schoolLoginDirectory.findMany({ where: { schoolId: { in: scope } }, orderBy: { createdAt: "desc" } }); return NextResponse.json({ schools }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "schools.manage");
    const input = await parseJson(request, schema);
    const result = await onboardPlatformSchool({ adminId: session.adminId, adminRole: session.role, ...input });
    revalidatePath("/platform/schools");
    revalidatePath("/platform/schools/[id]", "page");
    return NextResponse.json({ ok: true, result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}
