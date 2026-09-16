import { NextResponse } from "next/server";
import { z } from "zod";
import { issuePlatformPasswordReset, confirmPlatformPasswordReset } from "@/lib/password-reset";
import { deliverResetToken } from "@/lib/reset-delivery";
import { routeError } from "@/lib/errors";
import { recordLoginAttempt, requestIp } from "@/lib/rate-limit";

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("request"), email: z.string().trim().email() }),
  z.object({ mode: z.literal("confirm"), email: z.string().trim().email(), token: z.string().regex(/^\d{6}$/), newPassword: z.string().min(6).max(256) })
]);

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    if (input.mode === "request") {
      await recordLoginAttempt("platform-password-reset-legacy", input.email.toLowerCase(), requestIp(request.headers));
      const envelope = await issuePlatformPasswordReset(input.email);
      if (envelope) await deliverResetToken(envelope);
      return NextResponse.json({
        ok: true,
        message: "If that account is active, a 6-digit verification code has been sent. It expires in 10 minutes."
      });
    }
    await recordLoginAttempt("platform-password-reset-confirm", input.email.toLowerCase(), requestIp(request.headers));
    await confirmPlatformPasswordReset(input);
    return NextResponse.json({ ok: true, message: "Password reset completed." });
  } catch (e) {
    return routeError(e);
  }
}
