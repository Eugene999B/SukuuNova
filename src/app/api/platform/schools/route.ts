import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { db, withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePlatformPermission, getPlatformSchoolScope } from "@/lib/platform-permissions";
import { onboardSchool } from "@/lib/onboarding-service";

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
    const result = await onboardSchool({ adminId: session.adminId, adminRole: session.role, ...input });
    await withTenant(result.school.id, async (tx) => {
      await tx.schoolSettings.update({ where: { schoolId: result.school.id }, data: { timezone: input.timezone, notificationChannels: { schoolType: input.schoolType ?? null, country: input.country ?? "Ghana", region: input.region ?? null, city: input.city ?? null, address: input.address ?? null, phone: input.schoolPhone ?? null, email: input.schoolEmail || null, ownerPhone: input.ownerPhone ?? null } } });
      await tx.$executeRawUnsafe(`INSERT INTO "PlatformSchoolBillingConfig" ("schoolId","billingMode","currency","studentRate","flatRate","billingDay","graceDays","trialDays","minimumCharge","maximumCharge","active","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,NULL,true,CURRENT_TIMESTAMP) ON CONFLICT ("schoolId") DO UPDATE SET "billingMode"=EXCLUDED."billingMode","currency"=EXCLUDED."currency","studentRate"=EXCLUDED."studentRate","flatRate"=EXCLUDED."flatRate","billingDay"=EXCLUDED."billingDay","graceDays"=EXCLUDED."graceDays","trialDays"=EXCLUDED."trialDays","updatedAt"=CURRENT_TIMESTAMP`, result.school.id, input.billingMode, input.currency.toUpperCase(), input.studentRate, input.flatRate, input.billingDay, input.graceDays, input.trialDays);
      await tx.$executeRawUnsafe(`INSERT INTO "PlatformMessagingWallet" ("schoolId","smsBalance","whatsappBalance","smsSellRate","whatsappSellRate","smsCostRate","whatsappCostRate","lowBalanceThreshold","status","updatedAt") VALUES ($1,0,0,0,0,0,0,50,'active',CURRENT_TIMESTAMP) ON CONFLICT ("schoolId") DO NOTHING`, result.school.id);
    });
    return NextResponse.json({ ok: true, result: { ...result, billing: { billingMode: input.billingMode, currency: input.currency, studentRate: input.studentRate, flatRate: input.flatRate, graceDays: input.graceDays, trialDays: input.trialDays }, messaging: { smsBalance: 0, whatsappBalance: 0 } } }, { status: 201 });
  } catch (error) { return routeError(error); }
}
