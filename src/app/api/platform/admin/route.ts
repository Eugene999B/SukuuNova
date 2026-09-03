import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { routeError, UnauthorizedError } from "@/lib/errors";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { requireSchoolScope } from "@/lib/platform-school-scope";
import { getPlatformOverview, listPlatformAdmins, createPlatformAdmin, updatePlatformAdmin, listPlatformAudit, getPlatformHealth, getSchoolSnapshot, ADMIN_PERMISSIONS } from "@/lib/platform-admin-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createWorker"), name: z.string().min(2).max(160), email: z.string().email(), password: z.string().min(12).max(256), role: z.enum(["platform_admin", "support_admin", "billing_admin", "analytics_admin"]), permissions: z.array(z.string()).max(30) }),
  z.object({ action: z.literal("updateWorker"), adminId: z.string(), status: z.enum(["active", "suspended"]), role: z.enum(["super_admin", "platform_admin", "support_admin", "billing_admin", "analytics_admin"]).optional(), permissions: z.array(z.string()).max(30).optional() })
]);

function optionalBoolean(value: string | null) {
  return value === "true" || value === "1";
}

export async function GET(request: Request) {
  try {
    const session = await requirePlatformSession();
    const u = new URL(request.url);
    const view = u.searchParams.get("view") || "overview";
    const schoolId = u.searchParams.get("schoolId") || "";
    if (view === "overview") {
      await requirePlatformPermission(session, "analytics.view");
      return NextResponse.json(await getPlatformOverview());
    }
    if (view === "admins") {
      await requirePlatformPermission(session, "admins.view");
      return NextResponse.json({ admins: await listPlatformAdmins(session.role), permissions: ADMIN_PERMISSIONS });
    }
    if (view === "audit") {
      await requirePlatformPermission(session, "audit.view");
      const page = await listPlatformAudit({
        role: session.role,
        limit: Number(u.searchParams.get("limit") || 50),
        cursor: u.searchParams.get("cursor") || undefined,
        query: u.searchParams.get("q") || undefined,
        action: u.searchParams.get("action") || undefined,
        sensitiveOnly: optionalBoolean(u.searchParams.get("sensitive")),
      });
      return NextResponse.json(page);
    }
    if (view === "health") {
      await requirePlatformPermission(session, "security.manage");
      return NextResponse.json(await getPlatformHealth());
    }
    if (view === "school") {
      await requirePlatformPermission(session, "schools.view");
      if (!schoolId) throw new UnauthorizedError("schoolId is required");
      await requireSchoolScope(session, schoolId);
      return NextResponse.json(await getSchoolSnapshot(session.role, schoolId));
    }
    throw new UnauthorizedError("Unknown admin view");
  } catch (e) {
    return routeError(e);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    const input = await request.json();
    const parsed = schema.parse(input);
    await requirePlatformPermission(session, "admins.manage");
    if (parsed.action === "createWorker") {
      return NextResponse.json({ ok: true, worker: await createPlatformAdmin({ actorId: session.adminId, actorRole: session.role, ...parsed }) }, { status: 201 });
    }
    return NextResponse.json({ ok: true, worker: await updatePlatformAdmin({ actorId: session.adminId, actorRole: session.role, ...parsed }) });
  } catch (e) {
    return routeError(e);
  }
}
