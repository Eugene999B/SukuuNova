import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { routeError, AppError, UnauthorizedError } from "@/lib/errors";
import { requirePlatformPermission, getPlatformSchoolScope } from "@/lib/platform-permissions";
import { getMessagingWallet, getPlatformControlSettings, getSchoolBillingConfig, saveSchoolBillingConfig, updateMessagingRates, adjustMessagingBalance, updatePlatformControlSettings } from "@/lib/platform-control-plane-safe-service";
import { generateBillingRulesInvoice } from "@/lib/platform-billing-rules-service";
import { performSchoolLifecycle } from "@/lib/platform-school-lifecycle-service";
import { listScopedPlatformSchools } from "@/lib/platform-scoped-schools";
import { listPlatformSchools } from "@/lib/phase4-service";

const schoolSelectorSchema = z.object({
  id: z.unknown(), name: z.unknown(), uniqueCode: z.unknown(), status: z.unknown(), studentCount: z.unknown().optional(), subscriptionPlan: z.unknown().optional(),
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("savePlatformSettings"), key: z.enum(["platform.defaults", "platform.security", "platform.lifecycle", "platform.messaging"]), value: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("saveSchoolBilling"), schoolId: z.string().min(1), billingMode: z.enum(["flat", "per_student"]), currency: z.string().min(3).max(8), studentRate: z.number().min(0), flatRate: z.number().min(0), billingDay: z.number().int().min(1).max(28), graceDays: z.number().int().min(0).max(90), trialDays: z.number().int().min(0).max(365), minimumCharge: z.number().min(0), maximumCharge: z.number().min(0).nullable(), active: z.boolean() }),
  z.object({ action: z.literal("updateMessagingRates"), schoolId: z.string().min(1), channel: z.enum(["sms", "whatsapp"]), sellRate: z.number().min(0), costRate: z.number().min(0), lowBalanceThreshold: z.number().int().min(0) }),
  z.object({ action: z.literal("allocateMessaging"), schoolId: z.string().min(1), channel: z.enum(["sms", "whatsapp"]), quantity: z.number().int().refine((value) => value !== 0, "Quantity cannot be zero."), unitCost: z.number().min(0).optional(), unitPrice: z.number().min(0).optional(), reference: z.string().max(160).optional(), notes: z.string().max(500).optional() }),
  z.object({ action: z.literal("generateInvoice"), schoolId: z.string().min(1), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
  z.object({ action: z.literal("lifecycle"), schoolId: z.string().min(1), lifecycle: z.enum(["lock", "suspend", "reactivate", "archive", "delete"]) }),
]);

type SchoolSelectorRow = {
  id: unknown; name: unknown; uniqueCode: unknown; status: unknown; studentCount?: unknown;
  subscriptionPlan?: unknown;
};

function normalizeSchoolRow(row: SchoolSelectorRow) {
  const candidate = schoolSelectorSchema.parse(row);
  const plan = candidate.subscriptionPlan && typeof candidate.subscriptionPlan === "object" ? candidate.subscriptionPlan as Record<string, unknown> : null;
  return {
    id: String(candidate.id),
    name: String(candidate.name),
    uniqueCode: String(candidate.uniqueCode),
    status: String(candidate.status),
    studentCount: Number(candidate.studentCount ?? 0),
    subscriptionPlan: plan ? { name: String(plan.name ?? ""), price: Number(plan.price ?? 0) } : null,
  };
}

export async function GET(request: Request) {
  try {
    const session = await requirePlatformSession();
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "settings";
    const schoolId = url.searchParams.get("schoolId") || "";
    if (view === "settings") return NextResponse.json(await getPlatformControlSettings(session));
    if (view === "schools") {
      await requirePlatformPermission(session, "billing.view");
      const scope = await getPlatformSchoolScope(session);
      const rows = (scope === null ? await listPlatformSchools() : await listScopedPlatformSchools(session)) as SchoolSelectorRow[];
      return NextResponse.json({ schools: rows.map(normalizeSchoolRow) });
    }
    if (view === "billing") {
      if (!schoolId) throw new UnauthorizedError("schoolId is required");
      return NextResponse.json(await getSchoolBillingConfig(session, schoolId));
    }
    if (view === "messaging") {
      if (!schoolId) throw new UnauthorizedError("schoolId is required");
      return NextResponse.json(await getMessagingWallet(session, schoolId));
    }
    throw new UnauthorizedError("Unknown control-plane view");
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    const input = schema.parse(await request.json());
    if (input.action === "savePlatformSettings") return NextResponse.json(await updatePlatformControlSettings(session, input.key, input.value));
    if (input.action === "saveSchoolBilling") return NextResponse.json(await saveSchoolBillingConfig(session, input));
    if (input.action === "updateMessagingRates") return NextResponse.json(await updateMessagingRates(session, input));
    if (input.action === "allocateMessaging") return NextResponse.json(await adjustMessagingBalance(session, input));
    if (input.action === "generateInvoice") return NextResponse.json({ ok: true, invoice: await generateBillingRulesInvoice(session, input.schoolId, input.period) });
    if (input.lifecycle === "delete" && session.role !== "super_admin") throw new AppError("Only Super Admin can decommission a school.", 403, "FORBIDDEN");
    return NextResponse.json({ ok: true, result: await performSchoolLifecycle(session, input.schoolId, input.lifecycle) });
  } catch (error) {
    return routeError(error);
  }
}
