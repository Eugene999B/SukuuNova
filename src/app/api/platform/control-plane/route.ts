import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { routeError, AppError, UnauthorizedError } from "@/lib/errors";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { changeSchoolLifecycle, getMessagingWallet, getPlatformControlSettings, getSchoolBillingConfig, saveSchoolBillingConfig, updateMessagingRates, adjustMessagingBalance, updatePlatformControlSettings } from "@/lib/platform-control-plane-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("savePlatformSettings"), key: z.enum(["platform.defaults", "platform.security", "platform.lifecycle", "platform.messaging"]), value: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("saveSchoolBilling"), schoolId: z.string().min(1), billingMode: z.enum(["flat", "per_student"]), currency: z.string().min(3).max(8), studentRate: z.number().min(0), flatRate: z.number().min(0), billingDay: z.number().int().min(1).max(28), graceDays: z.number().int().min(0).max(90), trialDays: z.number().int().min(0).max(365), minimumCharge: z.number().min(0), maximumCharge: z.number().min(0).nullable(), active: z.boolean() }),
  z.object({ action: z.literal("updateMessagingRates"), schoolId: z.string().min(1), channel: z.enum(["sms", "whatsapp"]), sellRate: z.number().min(0), costRate: z.number().min(0), lowBalanceThreshold: z.number().int().min(0) }),
  z.object({ action: z.literal("allocateMessaging"), schoolId: z.string().min(1), channel: z.enum(["sms", "whatsapp"]), quantity: z.number().int().nonzero(), unitCost: z.number().min(0).optional(), unitPrice: z.number().min(0).optional(), reference: z.string().max(160).optional(), notes: z.string().max(500).optional() }),
  z.object({ action: z.literal("lifecycle"), schoolId: z.string().min(1), lifecycle: z.enum(["lock", "suspend", "reactivate", "archive", "delete"]) }),
]);

export async function GET(request: Request) {
  try {
    const session = await requirePlatformSession();
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "settings";
    const schoolId = url.searchParams.get("schoolId") || "";
    if (view === "settings") return NextResponse.json(await getPlatformControlSettings(session));
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
    await requirePlatformPermission(session, "schools.suspend");
    if (input.lifecycle === "delete" && session.role !== "super_admin") throw new AppError("Only Super Admin can decommission a school.", 403, "FORBIDDEN");
    return NextResponse.json({ ok: true, result: await changeSchoolLifecycle(session, { schoolId: input.schoolId, action: input.lifecycle }) });
  } catch (error) {
    return routeError(error);
  }
}
