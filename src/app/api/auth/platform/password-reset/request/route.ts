import { NextResponse } from "next/server";
import { z } from "zod";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { issuePlatformPasswordReset } from "@/lib/password-reset";
import { recordLoginAttempt, requestIp } from "@/lib/rate-limit";
import { deliverResetToken } from "@/lib/reset-delivery";

const schema = z.object({
  email: z.string().trim().email().max(254)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    await recordLoginAttempt(
      "platform-password-reset",
      input.email,
      requestIp(request.headers)
    );
    const envelope = await issuePlatformPasswordReset(input.email);
    if (envelope) await deliverResetToken(envelope);

    return NextResponse.json(
      { ok: true, message: "If the account exists, reset instructions will be delivered." },
      { status: 202 }
    );
  } catch (error) {
    return routeError(error);
  }
}
