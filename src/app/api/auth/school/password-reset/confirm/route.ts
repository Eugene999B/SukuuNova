import { NextResponse } from "next/server";
import { z } from "zod";
import { accountLoginRateIdentityForUserId } from "@/lib/account-login-identity";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { confirmSchoolPasswordReset } from "@/lib/password-reset";
import { clearAccountLoginAttempts, recordLoginAttempt } from "@/lib/rate-limit";

const schema = z.object({
  uniqueCode: z.string().trim().min(2).max(80),
  token: z.string().min(32).max(256),
  newPassword: z.string().min(12).max(256),
  universe: z.enum(["school", "guardian"]).default("school")
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    await recordLoginAttempt(
      "school-password-reset-confirm:" + input.uniqueCode.toLowerCase(),
      input.token.slice(0, 16)
    );
    const reset = await confirmSchoolPasswordReset(input);
    const rateIdentity = accountLoginRateIdentityForUserId(reset.userId);
    await Promise.all([
      clearAccountLoginAttempts("school-login:" + reset.schoolCode, [rateIdentity]),
      clearAccountLoginAttempts("guardian-login:" + reset.schoolCode, [rateIdentity]),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
