import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { ForbiddenError, routeError } from "@/lib/errors";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { appendPlatformAudit } from "@/lib/audit";
import { db, withTenant } from "@/lib/db";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(2).max(80), price: z.number().finite().min(0).max(1_000_000), featureFlags: z.array(z.string().trim().min(1).max(80)).max(30) }),
  z.object({ action: z.literal("update"), planId: z.string().min(1), name: z.string().trim().min(2).max(80), price: z.number().finite().min(0).max(1_000_000), featureFlags: z.array(z.string().trim().min(1).max(80)).max(30) }),
  z.object({ action: z.literal("assign"), schoolId: z.string().min(1), planId: z.string().min(1) }),
]);

async function visibleSchoolIds(adminId: string, role: string) {
  if (role === "super_admin") {
    const dirs = await db.schoolLoginDirectory.findMany({ where: { status: "active" }, orderBy: { createdAt: "desc" }, select: { schoolId: true } });
    return dirs.map((row) => row.schoolId);
  }
  const rows = await db.$queryRawUnsafe<Array<{ schoolId: string }>>(
    `SELECT d."schoolId" FROM "SchoolLoginDirectory" d
     INNER JOIN "PlatformAdminSchoolAccess" a ON a."schoolId"=d."schoolId"
     WHERE d."status"='active' AND a."adminId"=$1
     ORDER BY d."createdAt" DESC`,
    adminId,
  );
  return rows.map((row) => row.schoolId);
}

async function visibleSchools(adminId: string, role: string) {
  const ids = await visibleSchoolIds(adminId, role);
  const rows = await Promise.all(ids.map((schoolId) => withTenant(schoolId, (tx) => tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true, status: true, subscriptionPlan: { select: { id: true, name: true, price: true, featureFlags: true } } } }))));
  return rows.filter(Boolean).map((school) => ({ ...school, subscriptionPlan: school?.subscriptionPlan ? { ...school.subscriptionPlan, featureFlags: Array.isArray(school.subscriptionPlan.featureFlags) ? school.subscriptionPlan.featureFlags.filter((value): value is string => typeof value === "string") : [] } : null }));
}

export async function GET() {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "plans.manage");
    const [plans, schools] = await Promise.all([
      db.subscriptionPlan.findMany({ orderBy: [{ price: "asc" }, { name: "asc" }] }),
      visibleSchools(session.adminId, session.role),
    ]);
    return NextResponse.json({ plans, schools, canEditCatalog: session.role === "super_admin" });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    const input = schema.parse(await request.json());
    await requirePlatformPermission(session, "plans.manage");

    if (input.action === "create") {
      if (session.role !== "super_admin") throw new ForbiddenError("Only a Super Admin can create platform plans.");
      const normalizedFlags = [...new Set(input.featureFlags.map((value) => value.trim()).filter(Boolean))];
      const plan = await db.subscriptionPlan.create({ data: { name: input.name, price: input.price, featureFlags: normalizedFlags } });
      await appendPlatformAudit({ actorId: session.adminId, action: "subscription.plan_created", targetEntity: `SubscriptionPlan:${plan.id}`, meta: { name: plan.name, price: input.price, featureCount: normalizedFlags.length } });
      return NextResponse.json({ ok: true, plan }, { status: 201 });
    }

    if (input.action === "update") {
      if (session.role !== "super_admin") throw new ForbiddenError("Only a Super Admin can update platform plans.");
      const current = await db.subscriptionPlan.findUnique({ where: { id: input.planId }, select: { id: true, name: true, price: true, featureFlags: true } });
      if (!current) return NextResponse.json({ error: "NOT_FOUND", message: "Plan not found." }, { status: 404 });
      const normalizedFlags = [...new Set(input.featureFlags.map((value) => value.trim()).filter(Boolean))];
      const plan = await db.subscriptionPlan.update({ where: { id: input.planId }, data: { name: input.name, price: input.price, featureFlags: normalizedFlags } });
      await appendPlatformAudit({ actorId: session.adminId, action: "subscription.plan_updated", targetEntity: `SubscriptionPlan:${plan.id}`, meta: { before: { name: current.name, price: Number(current.price), featureCount: Array.isArray(current.featureFlags) ? current.featureFlags.length : 0 }, after: { name: plan.name, price: Number(plan.price), featureCount: normalizedFlags.length } } });
      return NextResponse.json({ ok: true, plan });
    }

    const visibleIds = await visibleSchoolIds(session.adminId, session.role);
    if (!visibleIds.includes(input.schoolId)) return NextResponse.json({ error: "FORBIDDEN", message: "This worker is not assigned to manage this school." }, { status: 403 });
    const plan = await db.subscriptionPlan.findUnique({ where: { id: input.planId }, select: { id: true, name: true, price: true, featureFlags: true } });
    if (!plan) return NextResponse.json({ error: "NOT_FOUND", message: "Plan not found." }, { status: 404 });
    const result = await withTenant(input.schoolId, async (tx) => {
      const school = await tx.school.update({ where: { id: input.schoolId }, data: { subscriptionPlanId: plan.id }, select: { id: true, name: true, uniqueCode: true } });
      return { school, plan };
    });
    await appendPlatformAudit({ actorId: session.adminId, action: "subscription.plan_assigned", targetSchoolId: input.schoolId, targetEntity: "School", meta: { planId: plan.id, planName: plan.name } });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
