import { db, withTenant } from "./db";
import { AppError } from "./errors";
import { appendPlatformAudit, appendSchoolAudit } from "./audit";
import { getPlatformSchoolScope, requirePlatformPermission } from "./platform-permissions";
import type { PlatformSession } from "./auth";

function parseJsonFlags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

async function scopedDirectoryIds(session: PlatformSession) {
  const scope = await getPlatformSchoolScope(session);
  if (scope === null) return db.schoolLoginDirectory.findMany({ where: { status: "active" }, select: { schoolId: true, uniqueCode: true }, orderBy: { createdAt: "desc" } });
  if (!scope.length) return [];
  return db.schoolLoginDirectory.findMany({ where: { status: "active", schoolId: { in: scope } }, select: { schoolId: true, uniqueCode: true }, orderBy: { createdAt: "desc" } });
}

export async function listCanonicalPlatformPlans(session: PlatformSession) {
  await requirePlatformPermission(session, "plans.manage");
  return db.subscriptionPlan.findMany({ orderBy: { price: "asc" } });
}

export async function assignCanonicalPlatformPlan(session: PlatformSession, schoolId: string, planId: string) {
  await requirePlatformPermission(session, "plans.manage");
  const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new AppError("Plan not found.", 404, "NOT_FOUND");
  const scope = await getPlatformSchoolScope(session);
  if (scope !== null && !scope.includes(schoolId)) throw new AppError("School is outside your assigned platform scope.", 403, "FORBIDDEN");
  const result = await withTenant(schoolId, async (tx) => {
    const before = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, subscriptionPlanId: true } });
    if (!before) throw new AppError("School not found.", 404, "NOT_FOUND");
    await tx.school.update({ where: { id: schoolId }, data: { subscriptionPlanId: plan.id }, select: { id: true } });
    await appendSchoolAudit(tx, { schoolId, actorId: `platform:${session.adminId}`, action: "subscription.plan_assigned", entityType: "School", entityId: schoolId, before: { planId: before.subscriptionPlanId }, after: { planId: plan.id, planName: plan.name } });
    return { schoolId, previousPlanId: before.subscriptionPlanId, planId: plan.id, planName: plan.name, featureFlags: parseJsonFlags(plan.featureFlags) };
  });
  await appendPlatformAudit({ actorId: session.adminId, action: "subscription.plan_assigned", targetSchoolId: schoolId, targetEntity: "School", meta: { before: { planId: result.previousPlanId }, after: { planId: result.planId, planName: result.planName } } });
  return result;
}

export async function listCanonicalPlatformBilling(session: PlatformSession, schoolId: string) {
  await requirePlatformPermission(session, "billing.view");
  const scope = await getPlatformSchoolScope(session);
  if (scope !== null && !scope.includes(schoolId)) throw new AppError("School is outside your assigned platform scope.", 403, "FORBIDDEN");
  return withTenant(schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, subscriptionPlan: { select: { id: true, name: true, price: true } } } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    const [invoices, payments] = await Promise.all([
      tx.$queryRawUnsafe<unknown[]>(`SELECT * FROM "PlatformInvoice" WHERE "schoolId"=$1 ORDER BY "period" DESC`, schoolId),
      tx.$queryRawUnsafe<unknown[]>(`SELECT * FROM "PlatformPayment" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC`, schoolId),
    ]);
    return { school, invoices, payments };
  });
}

export async function searchCanonicalPlatform(session: PlatformSession, query: string) {
  await requirePlatformPermission(session, "schools.view");
  const q = query.trim().toLowerCase();
  if (!q) throw new AppError("Search query is required.", 400, "INVALID_INPUT");
  if (q.length > 120) throw new AppError("Search query is too long.", 400, "INVALID_INPUT");
  const dirs = await scopedDirectoryIds(session);
  const out: Record<string, unknown>[] = [];
  for (const dir of dirs) {
    const rows = await withTenant(dir.schoolId, async (tx) => {
      const [students, users, school] = await Promise.all([
        tx.student.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { admissionNo: { contains: q, mode: "insensitive" } }] }, select: { id: true, name: true, admissionNo: true, status: true }, take: 20 }),
        tx.user.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q, mode: "insensitive" } }] }, select: { id: true, name: true, email: true, phone: true, status: true }, take: 20 }),
        tx.school.findUnique({ where: { id: dir.schoolId }, select: { name: true, uniqueCode: true } }),
      ]);
      return { school, students, users };
    });
    if (rows.students.length || rows.users.length) out.push({ schoolId: dir.schoolId, ...rows });
  }
  await appendPlatformAudit({ actorId: session.adminId, action: "cross_school.search", meta: { q, resultSchools: out.length } });
  return out;
}
