import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { requireSchoolScope } from "@/lib/platform-school-scope";
import {
  clearSchoolUserLoginLock,
  getSchoolUserSupportState,
  sendSchoolUserPasswordReset,
} from "@/lib/platform-account-support-service";

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("clear_login_lock"), userId: z.string().min(1).max(120), reason: z.string().trim().min(8).max(500) }),
  z.object({ action: z.literal("send_password_reset"), userId: z.string().min(1).max(120), reason: z.string().trim().min(8).max(500) }),
]);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "security.manage");
    const { id } = await context.params;
    await requireSchoolScope(session, id);
    const userId = new URL(request.url).searchParams.get("userId")?.trim();
    if (!userId) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Choose an account." }, { status: 400 });
    return NextResponse.json(await getSchoolUserSupportState(id, userId));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "security.manage");
    const { id } = await context.params;
    await requireSchoolScope(session, id);
    const input = await parseJson(request, postSchema);
    const actor = { adminId: session.adminId, adminName: session.name };
    if (input.action === "clear_login_lock") {
      return NextResponse.json({ ok: true, result: await clearSchoolUserLoginLock(id, input.userId, actor, input.reason) });
    }
    return NextResponse.json({ ok: true, result: await sendSchoolUserPasswordReset(id, input.userId, actor, input.reason) });
  } catch (error) {
    return routeError(error);
  }
}
