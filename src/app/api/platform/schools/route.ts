import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePlatformPermission, getPlatformSchoolScope } from "@/lib/platform-permissions";
import { onboardPlatformSchool } from "@/lib/platform-atomic-onboarding-service";

const schema = z.object({
  uniqueCode: z.string().min(3).max(40), schoolName: z.string().min(2).max(160), schoolType: z.string().max(60).optional(), country: z.string().max(80).optional(), region: z.string().max(120).optional(), city: z.string().max(120).optional(), address: z.string().max(400).optional(), schoolPhone: z.string().max(40).optional(), schoolEmail: z.string().email().optional().or(z.literal("")),
  ownerName: z.string().min(2).max(160), ownerEmail: z.string().email(), ownerPhone: z.string().max(40).optional(), ownerPassword: z.string().min(12).max(256), currency: z.string().min(3).max(8).default("GHS"), billingMode: z.enum(["flat", "per_student"]).default("flat"), studentRate: z.coerce.number().min(0).default(0), flatRate: z.coerce.number().min(0).default(0), billingDay: z.coerce.number().int().min(1).max(28).default(1), graceDays: z.coerce.number().int().min(0).max(90).default(7), trialDays: z.coerce.number().int().min(0).max(365).default(0), timezone: z.string().min(3).max(80).default("Africa/Accra"),
});

export async function GET() {
  try { const session = await requirePlatformSession(); await requirePlatformPermission(session, "schools.view"); const scope = await getPlatformSchoolScope(session); const schools = scope === null ? await db.schoolLoginDirectory.findMany({ orderBy: { createdAt: "desc" } }) : await db.schoolLoginDirectory.findMany({ where: { schoolId: { in: scope } }, orderBy: { createdAt: "desc" } }); return NextResponse.json({ schools }); }
  catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "schools.manage");
    const input = await parseJson(request, schema);
    const result = await onboardPlatformSchool({ adminId: session.adminId, adminRole: session.role, ...input });
    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (error) { return routeError(error); }
}
