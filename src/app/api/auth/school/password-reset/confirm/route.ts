import { NextResponse } from "next/server";
import { z } from "zod";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { confirmSchoolPasswordReset } from "@/lib/password-reset";
import { recordLoginAttempt, requestIp } from "@/lib/rate-limit";

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
      input.token.slice(0, 16),
      requestIp(request.headers)
    );
    await confirmSchoolPasswordReset(input);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
