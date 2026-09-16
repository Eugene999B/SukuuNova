import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { routeError } from "@/lib/errors";
import {
  getSmsCenterOverview,
  previewDirectSms,
  previewSchoolSms,
  sendDirectSms,
  sendSchoolSms,
  topUpSchoolSms,
} from "@/lib/platform-sms-center-service";

const schoolAudience = z.enum(["guardians", "teachers", "staff", "all"]);
const body = z.string().trim().min(1).max(1600);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("topUp"), schoolId: z.string().min(1), quantity: z.number().int().positive().max(1_000_000), reference: z.string().trim().max(120).optional(), notes: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("previewSchool"), schoolId: z.string().min(1), audience: schoolAudience, body }),
  z.object({ action: z.literal("sendSchool"), schoolId: z.string().min(1), audience: schoolAudience, body }),
  z.object({ action: z.literal("previewDirect"), numbers: z.union([z.string().max(10_000), z.array(z.string()).max(200)]), body }),
  z.object({ action: z.literal("sendDirect"), numbers: z.union([z.string().max(10_000), z.array(z.string()).max(200)]), body }),
]);

export async function GET() {
  try {
    const session = await requirePlatformSession();
    return NextResponse.json(await getSmsCenterOverview(session));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    const input = actionSchema.parse(await request.json());
    if (input.action === "topUp") return NextResponse.json(await topUpSchoolSms(session, input));
    if (input.action === "previewSchool") return NextResponse.json(await previewSchoolSms(session, input));
    if (input.action === "sendSchool") return NextResponse.json(await sendSchoolSms(session, input));
    if (input.action === "previewDirect") return NextResponse.json(await previewDirectSms(session, input));
    return NextResponse.json(await sendDirectSms(session, input));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "INVALID_INPUT", message: "Check the SMS recipients, message, audience and credit amount." }, { status: 400 });
    return routeError(error);
  }
}
