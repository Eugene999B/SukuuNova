import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePlatformPermission, getPlatformSchoolScope } from "@/lib/platform-permissions";
import { onboardSchool } from "@/lib/onboarding-service";

const schema = z.object({
  uniqueCode: z.string().min(3).max(40),
  schoolName: z.string().min(2).max(160),
  ownerName: z.string().min(2).max(160),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(12).max(256)
});

export async function GET() {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "schools.view");
    const scope = await getPlatformSchoolScope(session);
    const schools = scope === null
      ? await db.schoolLoginDirectory.findMany({ orderBy: { createdAt: "desc" } })
      : await db.schoolLoginDirectory.findMany({ where: { schoolId: { in: scope } }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ schools });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "schools.manage");
    const input = await parseJson(request, schema);
    const result = await onboardSchool({
      adminId: session.adminId,
      adminRole: session.role,
      ...input
    });
    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (error) { return routeError(error); }
}
