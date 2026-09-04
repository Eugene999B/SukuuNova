import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { routeError, UnauthorizedError, ForbiddenError, AppError } from "@/lib/errors";
import { getPlatformSchoolScope, requirePlatformPermission } from "@/lib/platform-permissions";
import { requireSchoolScope } from "@/lib/platform-school-scope";
import { listScopedPlatformAudit } from "@/lib/platform-scoped-audit";
import { getPlatformOverview, listPlatformAdmins, createPlatformAdmin, updatePlatformAdmin, listPlatformAudit, getPlatformHealth, getSchoolSnapshot, ADMIN_PERMISSIONS } from "@/lib/platform-admin-service";
import { getScopedPlatformOverview } from "@/lib/platform-scoped-overview";
import { db } from "@/lib/db";
import { appendPlatformAudit } from "@/lib/audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createWorker"), name: z.string().min(2).max(160), email: z.string().email(), password: z.string().min(12).max(256), role: z.enum(["platform_admin", "support_admin", "billing_admin", "analytics_admin"]), permissions: z.array(z.string()).max(30) }),
  z.object({ action: z.literal("updateWorker"), adminId: z.string(), status: z.enum(["active", "suspended"]), role: z.enum(["super_admin", "platform_admin", "support_admin", "billing_admin", "analytics_admin"]).optional(), permissions: z.array(z.string()).max(30).optional() }),
  z.object({ action: z.literal("revokeSessions"), adminId: z.string().min(1) }),
]);

function optionalBoolean(value: string | null) {
  return value === "true" || value === "1";
}

function parseAuditLimit(value: string | null) {
  if (value === null || value === "") return 50;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new AppError("Audit limit must be an integer between 1 and 100.", 400, "INVALID_LIMIT");
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const session = await requirePlatformSession();
    const u = new URL(request.url);
    const view = u.searchParams.get("view") || "overview";
    const schoolId = u.searchParams.get("schoolId") || "";
    if (view === "overview") {
      await requirePlatformPermission(session, "analytics.view");
      const schoolScope = await getPlatformSchoolScope(session);
      return NextResponse.json(schoolScope === null ? await getPlatformOverview() : await getScopedPlatformOverview(session));
    }
    if (view === "admins") {
      await requirePlatformPermission(session, "admins.view");
      return NextResponse.json({ admins: await listPlatformAdmins(session.role), permissions: ADMIN_PERMISSIONS });
    }
    if (view === "audit") {
      await requirePlatformPermission(session, "audit.view");
      const input = {
        limit: parseAuditLimit(u.searchParams.get("limit")),
        cursor: u.searchParams.get("cursor") || undefined,
        query: u.searchParams.get("q") || undefined,
        action: u.searchParams.get("action") || undefined,
        sensitiveOnly: optionalBoolean(u.searchParams.get("sensitive")),
      };
      const schoolScope = await getPlatformSchoolScope(session);
      const page = schoolScope === null
        ? await listPlatformAudit({ role: session.role, ...input })
        : await listScopedPlatformAudit(schoolScope, input);
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
    const parsed = schema.parse(await request.json());
    await requirePlatformPermission(session, "admins.manage");
    if (parsed.action === "createWorker") {
      return NextResponse.json({ ok: true, worker: await createPlatformAdmin({ actorId: session.adminId, actorRole: session.role, ...parsed }) }, { status: 201 });
    }
    if (parsed.action === "revokeSessions") {
      if (session.role !== "super_admin") throw new ForbiddenError("Only Super Admin can revoke another operator's sessions.");
      if (session.adminId === parsed.adminId) throw new ForbiddenError("Use sign out on this device to end your current session.");
      const target = await db.platformAdmin.findUnique({ where: { id: parsed.adminId }, select: { id: true, name: true, email: true, role: true, status: true } });
      if (!target) throw new AppError("Worker account was not found.", 404, "WORKER_NOT_FOUND");
      if (target.role === "super_admin") throw new ForbiddenError("Super Admin sessions are protected from routine revocation.");
      await db.$executeRawUnsafe(`UPDATE "PlatformAdminMeta" SET "sessionVersion"="sessionVersion"+1 WHERE "adminId"=$1`, target.id);
      await appendPlatformAudit({ actorId: session.adminId, action: "platform_admin.sessions_revoked", targetEntity: `PlatformAdmin:${target.id}`, meta: { targetName: target.name, targetEmail: target.email, targetRole: target.role } });
      return NextResponse.json({ ok: true, message: `All active sessions for ${target.name} have been revoked.` });
    }
    return NextResponse.json({ ok: true, worker: await updatePlatformAdmin({ actorId: session.adminId, actorRole: session.role, ...parsed }) });
  } catch (e) {
    return routeError(e);
  }
}
