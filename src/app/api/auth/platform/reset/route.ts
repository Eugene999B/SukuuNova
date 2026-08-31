import { NextResponse } from "next/server";
import { z } from "zod";
import { issuePlatformPasswordReset, confirmPlatformPasswordReset } from "@/lib/password-reset";
import { deliverResetToken } from "@/lib/reset-delivery";
import { routeError } from "@/lib/errors";

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("request"), email: z.string().email() }),
  z.object({ mode: z.literal("confirm"), token: z.string().min(20), newPassword: z.string().min(12).max(256) })
]);

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    if (input.mode === "request") {
      const envelope = await issuePlatformPasswordReset(input.email);
      if (envelope) await deliverResetToken(envelope);
      // Always return the same generic response whether or not the account
      // exists, and NEVER include the token or any delivery details here.
      return NextResponse.json({
        ok: true,
        message: "If that account is active, reset instructions have been sent."
      });
    }
    await confirmPlatformPasswordReset(input);
    return NextResponse.json({ ok: true, message: "Password reset completed." });
  } catch (e) {
    return routeError(e);
  }
}
