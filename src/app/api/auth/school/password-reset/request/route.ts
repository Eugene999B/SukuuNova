import { NextResponse } from "next/server";
import { z } from "zod";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { issueSchoolPasswordReset } from "@/lib/password-reset";
import { recordLoginAttempt } from "@/lib/rate-limit";
import { deliverResetToken } from "@/lib/reset-delivery";

const schema = z.object({
  uniqueCode: z.string().trim().min(2).max(80),
  identifier: z.string().trim().min(3).max(254),
  universe: z.enum(["school", "guardian"]).default("school")
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const schoolCode = input.uniqueCode.toLowerCase();
    await recordLoginAttempt(
      "school-password-reset:" + schoolCode,
      input.identifier
    );
    const envelope = await issueSchoolPasswordReset(input);
    if (envelope) await deliverResetToken(envelope);

    return NextResponse.json(
      { ok: true, message: "If the account exists, reset instructions will be delivered." },
      { status: 202 }
    );
  } catch (error) {
    return routeError(error);
  }
}
