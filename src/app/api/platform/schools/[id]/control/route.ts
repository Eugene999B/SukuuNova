import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { requireSchoolScope } from "@/lib/platform-school-scope";
import {
  endSchoolImpersonations,
  forceSignOutSchool,
  forceSignOutSchoolUser,
  getPlatformSchoolControlSnapshot,
  sendPlatformSchoolNotice,
} from "@/lib/platform-school-control-service";

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("force_school_signout"), reason: z.string().trim().min(8).max(500), confirmation: z.literal("SIGN OUT SCHOOL") }),
  z.object({ action: z.literal("force_user_signout"), userId: z.string().min(1).max(120), reason: z.string().trim().min(8).max(500) }),
  z.object({ action: z.literal("end_impersonations"), reason: z.string().trim().min(8).max(500) }),
  z.object({
    action: z.literal("send_notice"),
    title: z.string().trim().min(3).max(160),
    body: z.string().trim().min(3).max(5000),
    audience: z.enum(["leadership", "staff", "all_users"]),
    severity: z.enum(["info", "warning", "critical"]),
  }),
]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "schools.view");
    const { id } = await context.params;
    await requireSchoolScope(session, id);
    return NextResponse.json(await getPlatformSchoolControlSnapshot(id));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePlatformSession();
    const { id } = await context.params;
    await requireSchoolScope(session, id);
    const input = await parseJson(request, postSchema);
    const actor = { adminId: session.adminId, adminName: session.name };

    switch (input.action) {
      case "force_school_signout":
        await requirePlatformPermission(session, "security.manage");
        return NextResponse.json({ ok: true, result: await forceSignOutSchool(id, actor, input.reason) });
      case "force_user_signout":
        await requirePlatformPermission(session, "security.manage");
        return NextResponse.json({ ok: true, result: await forceSignOutSchoolUser(id, input.userId, actor, input.reason) });
      case "end_impersonations":
        await requirePlatformPermission(session, "schools.impersonate");
        return NextResponse.json({ ok: true, result: await endSchoolImpersonations(id, actor, input.reason) });
      case "send_notice":
        await requirePlatformPermission(session, "support.manage");
        return NextResponse.json({ ok: true, result: await sendPlatformSchoolNotice(id, actor, input) });
    }
  } catch (error) {
    return routeError(error);
  }
}
