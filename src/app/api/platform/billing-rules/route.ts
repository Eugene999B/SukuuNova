import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { routeError } from "@/lib/errors";
import { getBillingRules, generateBillingRulesInvoice, saveBillingRules } from "@/lib/platform-billing-rules-service";

const schema = z.object({
  action: z.enum(["save", "generate"]),
  schoolId: z.string().min(1),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  billingMode: z.enum(["flat", "per_student"]).optional(),
  currency: z.string().min(3).max(8).optional(),
  studentRate: z.number().min(0).optional(),
  flatRate: z.number().min(0).optional(),
  billingDay: z.number().int().min(1).max(28).optional(),
  graceDays: z.number().int().min(0).max(90).optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  minimumCharge: z.number().min(0).optional(),
  maximumCharge: z.number().min(0).nullable().optional(),
  active: z.boolean().optional(),
  autoGenerateInvoices: z.boolean().optional(),
  invoiceDueDays: z.number().int().min(0).max(90).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  invoicePrefix: z.string().min(1).max(20).optional(),
  sendBillingNotifications: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requirePlatformSession();
    const schoolId = new URL(request.url).searchParams.get("schoolId") || "";
    if (!schoolId) return NextResponse.json({ message: "schoolId is required" }, { status: 400 });
    return NextResponse.json(await getBillingRules(session, schoolId));
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    const input = schema.parse(await request.json());
    if (input.action === "generate") {
      if (!input.period) return NextResponse.json({ message: "Billing period is required" }, { status: 400 });
      return NextResponse.json({ ok: true, invoice: await generateBillingRulesInvoice(session, input.schoolId, input.period) });
    }
    if (input.billingMode === undefined || input.currency === undefined || input.studentRate === undefined || input.flatRate === undefined || input.billingDay === undefined || input.graceDays === undefined || input.trialDays === undefined || input.minimumCharge === undefined || input.maximumCharge === undefined || input.active === undefined || input.autoGenerateInvoices === undefined || input.invoiceDueDays === undefined || input.taxPercent === undefined || input.discountPercent === undefined || input.invoicePrefix === undefined || input.sendBillingNotifications === undefined) {
      return NextResponse.json({ message: "Complete billing configuration is required." }, { status: 400 });
    }
    return NextResponse.json(await saveBillingRules(session, input as Required<Omit<typeof input, "action" | "period">> & { schoolId: string }));
  } catch (error) { return routeError(error); }
}
