import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db, withTenant } from "./db";
import { ForbiddenError, AppError } from "./errors";
import { appendPlatformAudit } from "./audit";

export const ADMIN_PERMISSIONS = [
  "schools.view", "schools.manage", "schools.suspend", "schools.impersonate",
  "billing.view", "billing.manage", "plans.manage",
  "analytics.view", "support.view", "support.manage",
  "admins.view", "admins.manage", "audit.view", "security.manage", "settings.manage",
] as const;

const WORKER_ROLES = ["platform_admin", "support_admin", "billing_admin", "analytics_admin"] as const;
type WorkerRole = typeof WORKER_ROLES[number];

function superOnly(role: string) {
  if (role !== "super_admin") throw new ForbiddenError("Super Admin permission required.");
}

function isKnownPermission(value: string): value is typeof ADMIN_PERMISSIONS[number] {
  return (ADMIN_PERMISSIONS as readonly string[]).includes(value);
}

function validatePermissions(values: string[]) {
  const permissions = [...new Set(values)].sort();
  const invalid = permissions.filter((permission) => !isKnownPermission(permission));
  if (invalid.length) throw new AppError(`Unknown platform permission: ${invalid[0]}`, 400, "INVALID_PERMISSION");
  return permissions;
}

function validateWorkerRole(role: string): asserts role is WorkerRole {
  if (!(WORKER_ROLES as readonly string[]).includes(role)) {
    throw new AppError(`Invalid platform worker role: ${role}`, 400, "INVALID_ROLE");
  }
}

type PlatformAdminListRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  createdById: string | null;
};
type PlatformAdminView = PlatformAdminListRow & { permissions: string[] };

export async function getPlatformOverview() {
  const dirs = await db.schoolLoginDirectory.findMany({ orderBy: { createdAt: "desc" } });
  let activeSchools = 0, suspendedSchools = 0, students = 0, users = 0, classes = 0, invoices = 0, unpaidInvoices = 0, collected = 0;
  const schoolStats: Record<string, unknown>[] = [];
  const today = new Date(new Date().toISOString().slice(0, 10));

  for (const dir of dirs) {
    try {
      const stats = await withTenant(dir.schoolId, async (tx) => {
        const [school, studentCount, userCount, classCount, attendanceToday, invoiceRows, paymentRows] = await Promise.all([
          tx.school.findUnique({
            where: { id: dir.schoolId },
            select: { id: true, name: true, uniqueCode: true, status: true, createdAt: true, subscriptionPlan: { select: { id: true, name: true, price: true } } },
          }),
          tx.student.count({ where: { status: "active" } }),
          tx.user.count(),
          tx.class.count(),
          tx.attendanceEvent.count({ where: { attendanceDate: today, type: "in" } }),
          tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "PlatformInvoice" WHERE "schoolId"=$1`, dir.schoolId),
          tx.$queryRawUnsafe<Array<{ amount: string }>>(`SELECT "amount"::text amount FROM "PlatformPayment" WHERE "schoolId"=$1`, dir.schoolId),
        ]);
        const paid = paymentRows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        return { school, studentCount, userCount, classCount, attendanceToday, invoices: invoiceRows.length, unpaidInvoices: invoiceRows.filter((invoice) => invoice.status !== "paid").length, collected: paid };
      });
      if (!stats.school) continue;
      if (stats.school.status === "suspended") suspendedSchools++; else activeSchools++;
      students += stats.studentCount; users += stats.userCount; classes += stats.classCount;
      invoices += stats.invoices; unpaidInvoices += stats.unpaidInvoices; collected += stats.collected;
      schoolStats.push({ ...stats.school, ...stats });
    } catch {
      // One unavailable tenant should not prevent the control center from loading.
    }
  }

  return { totals: { schools: dirs.length, activeSchools, suspendedSchools, students, users, classes, invoices, unpaidInvoices, collected }, schools: schoolStats };
}

export async function listPlatformAdmins(_role: string): Promise<PlatformAdminView[]> {
  const admins = await db.$queryRawUnsafe<Array<PlatformAdminListRow & { permissions: unknown }>>(
    `SELECT a."id",a."name",a."email",a."role",a."status",a."createdAt",m."createdById",
            COALESCE(json_agg(p."permission") FILTER (WHERE p."permission" IS NOT NULL),'[]') AS "permissions"
     FROM "PlatformAdmin" a
     LEFT JOIN "PlatformAdminMeta" m ON m."adminId"=a."id"
     LEFT JOIN "PlatformAdminPermission" p ON p."adminId"=a."id"
     GROUP BY a."id",m."createdById"
     ORDER BY a."createdAt" DESC`,
  );
  return admins.map((admin) => ({ ...admin, permissions: Array.isArray(admin.permissions) ? admin.permissions.filter((value): value is string => typeof value === "string").sort() : [] }));
}

export async function createPlatformAdmin(input: {
  actorId: string; actorRole: string; name: string; email: string; password: string; role: string; permissions: string[];
}) {
  superOnly(input.actorRole);
  validateWorkerRole(input.role);
  if (!/^(?=.*[A-Za-z])(?=.*\d).{12,}$/.test(input.password)) throw new AppError("Worker password must be at least 12 characters and contain letters and numbers.", 400, "WEAK_PASSWORD");
  const permissions = validatePermissions(input.permissions);
  const name = input.name.trim(); const email = input.email.trim().toLowerCase();
  if (name.length < 2 || email.length < 3) throw new AppError("Worker identity is incomplete.", 400, "INVALID_INPUT");
  const result = await db.$transaction(async (tx) => {
    const a = await tx.platformAdmin.create({ data: { name, email, passwordHash: await hash(input.password, 12), role: input.role, status: "active" } });
    await tx.$executeRawUnsafe(`INSERT INTO "PlatformAdminMeta" ("adminId","createdById") VALUES ($1,$2)`, a.id, input.actorId);
    for (const permission of permissions) await tx.$executeRawUnsafe(`INSERT INTO "PlatformAdminPermission" ("adminId","permission") VALUES ($1,$2) ON CONFLICT DO NOTHING`, a.id, permission);
    await appendPlatformAudit({ actorId: input.actorId, action: "platform_admin.created", targetEntity: `PlatformAdmin:${a.id}`, meta: { role: input.role, permissions } }, tx as unknown as Prisma.TransactionClient);
    return a.id;
  });
  return { id: result, name, email, role: input.role, status: "active", permissions };
}

export async function updatePlatformAdmin(input: {
  actorId: string; actorRole: string; adminId: string; status?: string; role?: string; permissions?: string[];
}) {
  superOnly(input.actorRole);
  if (input.actorId === input.adminId) throw new ForbiddenError("You cannot change your own platform role, permissions or account status.");
  if (input.status && !["active", "suspended"].includes(input.status)) throw new AppError("Invalid worker status.", 400, "INVALID_STATUS");
  if (input.role) validateWorkerRole(input.role);
  const permissions = input.permissions ? validatePermissions(input.permissions) : undefined;
  await db.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('sukuunova.platform-admin-governance'))`);
    const target = await tx.platformAdmin.findUnique({ where: { id: input.adminId }, select: { id: true, name: true, email: true, role: true, status: true } });
    if (!target) throw new AppError("Worker account was not found.", 404, "WORKER_NOT_FOUND");
    if (target.role === "super_admin" || input.role === "super_admin") throw new ForbiddenError("Super Admin accounts are protected from routine worker edits.");
    const nextRole = input.role ?? target.role; const nextStatus = input.status ?? target.status; const changedFields: Record<string, unknown> = {};
    if (target.role !== nextRole) changedFields.role = { before: target.role, after: nextRole };
    if (target.status !== nextStatus) changedFields.status = { before: target.status, after: nextStatus };
    if (Object.keys(changedFields).length) await tx.platformAdmin.update({ where: { id: target.id }, data: { role: nextRole, status: nextStatus } });
    let previousPermissions: string[] = [];
    let nextPermissions: string[] = [];
    let permissionsChanged = false;
    if (permissions) {
      const rows = await tx.$queryRawUnsafe<Array<{ permission: string }>>(`SELECT "permission" FROM "PlatformAdminPermission" WHERE "adminId"=$1 ORDER BY "permission" ASC`, target.id);
      previousPermissions = rows.map((row) => row.permission).sort();
      nextPermissions = permissions;
      permissionsChanged = previousPermissions.length !== nextPermissions.length || previousPermissions.some((permission, index) => permission !== nextPermissions[index]);
      if (permissionsChanged) {
        await tx.$executeRawUnsafe(`DELETE FROM "PlatformAdminPermission" WHERE "adminId"=$1`, target.id);
        for (const permission of nextPermissions) await tx.$executeRawUnsafe(`INSERT INTO "PlatformAdminPermission" ("adminId","permission") VALUES ($1,$2) ON CONFLICT DO NOTHING`, target.id, permission);
      }
    }
    await appendPlatformAudit({
      actorId: input.actorId,
      action: "platform_admin.updated",
      targetEntity: `PlatformAdmin:${input.adminId}`,
      meta: {
        before: { role: target.role, status: target.status, permissions: input.permissions ? previousPermissions : undefined },
        after: { role: nextRole, status: nextStatus, permissions: input.permissions ? nextPermissions : undefined },
        changedFields,
        permissionsChanged,
      },
    }, tx as unknown as Prisma.TransactionClient);
  });
  return (await listPlatformAdmins(input.actorRole)).find((admin) => admin.id === input.adminId);
}

export type PlatformAuditPage = { events: Array<{ id:string; actorId:string; actorName:string|null; actorEmail:string|null; action:string; targetSchoolId:string|null; targetEntity:string|null; createdAt:Date; meta:unknown }>; nextCursor:string|null };

export async function listPlatformAudit(_input: {
  role: string; limit?: number; cursor?: string; query?: string; action?: string; sensitiveOnly?: boolean;
}): Promise<PlatformAuditPage> {
  const limit = Math.min(Math.max(_input.limit ?? 50, 1), 100);
  const query = _input.query?.trim().toLowerCase() ?? ""; const action = _input.action?.trim() ?? ""; const sensitiveOnly = Boolean(_input.sensitiveOnly);
  let cursorDate: Date | null = null; let cursorId: string | null = null;
  if (_input.cursor) {
    const separator = _input.cursor.lastIndexOf("_");
    if (separator <= 0) throw new AppError("Invalid audit cursor.", 400, "INVALID_CURSOR");
    const dateText = _input.cursor.slice(0, separator); const idText = _input.cursor.slice(separator + 1); const parsedDate = new Date(dateText);
    if (!idText || Number.isNaN(parsedDate.getTime())) throw new AppError("Invalid audit cursor.", 400, "INVALID_CURSOR");
    cursorDate = parsedDate; cursorId = idText;
  }
  const rows = await db.$queryRawUnsafe<PlatformAuditPage["events"]>(
    `SELECT l."id", l."actorId", a."name" AS "actorName", a."email" AS "actorEmail", l."action", l."targetSchoolId", l."targetEntity", l."createdAt", l."meta"
     FROM "AuditLogPlatform" l LEFT JOIN "PlatformAdmin" a ON a."id"=l."actorId"
     WHERE ($1='' OR LOWER(l."action") LIKE '%' || $1 || '%' OR LOWER(COALESCE(a."name",'')) LIKE '%' || $1 || '%' OR LOWER(COALESCE(a."email",'')) LIKE '%' || $1 || '%' OR LOWER(COALESCE(l."targetEntity",'')) LIKE '%' || $1 || '%' OR LOWER(COALESCE(l."targetSchoolId",'')) LIKE '%' || $1 || '%')
       AND ($2='' OR l."action"=$2)
       AND ($3=false OR LOWER(l."action") ~ '(imperson|delete|suspend|permission|password|role|setting|billing)')
       AND ($4::timestamptz IS NULL OR (l."createdAt",l."id") < ($4::timestamptz,$5))
     ORDER BY l."createdAt" DESC, l."id" DESC LIMIT $6`, query, action, sensitiveOnly, cursorDate, cursorId, limit + 1,
  );
  const hasMore = rows.length > limit; const events = hasMore ? rows.slice(0, limit) : rows; const last = events.at(-1); const nextCursor = hasMore && last ? `${last.createdAt.toISOString()}_${last.id}` : null;
  return { events, nextCursor };
}

export async function getPlatformHealth() {
  const started = Date.now(); let database = "operational"; let migrations = "operational";
  try { await db.$queryRaw`SELECT 1`; await db.$queryRaw`SELECT 1 FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL LIMIT 1`; } catch { database = "degraded"; migrations = "degraded"; }
  return { database, migrations, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), nextjs: "self", api: "self" };
}

export async function getSchoolSnapshot(_role: string, schoolId: string) {
  return withTenant(schoolId, async (tx) => {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const [school, students, users, classes, subjects, attendanceToday, recentAudit] = await Promise.all([
      tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true, status: true, createdAt: true, subscriptionPlan: { select: { id: true, name: true, price: true, featureFlags: true } } } }),
      tx.student.findMany({ where: { status: "active" }, select: { id: true, name: true, admissionNo: true, classId: true, status: true }, orderBy: { admissionNo: "desc" }, take: 50 }),
      tx.user.findMany({ select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }),
      tx.class.findMany({ select: { id: true, name: true, level: true, classTeacherId: true }, orderBy: { name: "asc" } }),
      tx.subject.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.attendanceEvent.findMany({ where: { attendanceDate: today }, select: { id: true, studentId: true, type: true, recordedBy: true }, take: 1000 }),
      tx.auditLogSchool.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    ]);
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    return { school, students, users, classes, subjects, attendanceToday, recentAudit };
  });
}
