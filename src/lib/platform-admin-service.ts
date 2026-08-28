import { hash } from "bcryptjs";
import { db, withTenant } from "./db";
import { createId } from "@paralleldrive/cuid2";
import { AppError, ForbiddenError } from "./errors";
import { appendPlatformAudit } from "./audit";

export const ADMIN_PERMISSIONS = [
  "schools.view","schools.manage","schools.suspend","schools.impersonate",
  "billing.view","billing.manage","plans.manage","analytics.view",
  "support.view","support.manage","admins.view","admins.manage",
  "audit.view","security.manage","settings.manage"
] as const;

function superOnly(role: string) { if (role !== "super_admin") throw new ForbiddenError("Super Admin permission required."); }

export async function getPlatformOverview() {
  const dirs = await db.schoolLoginDirectory.findMany({ orderBy: { createdAt: "desc" } });
  let activeSchools = 0, suspendedSchools = 0, students = 0, users = 0, classes = 0, invoices = 0, unpaidInvoices = 0, collected = 0;
  const schoolStats: Record<string, unknown>[] = [];
  const today = new Date();
  for (const dir of dirs) {
    try {
      const stats = await withTenant(dir.schoolId, async tx => {
        const [school, studentCount, userCount, classCount, attendanceToday, invoiceRows, paymentRows] = await Promise.all([
          tx.school.findUnique({ where: { id: dir.schoolId }, select: { id:true,name:true,uniqueCode:true,status:true,createdAt:true,subscriptionPlan:{select:{id:true,name:true,price:true}} } }),
          tx.student.count({ where: { status: "active" } }),
          tx.user.count(),
          tx.class.count(),
          tx.attendanceEvent.count({ where: { attendanceDate: today, type: "in" } }),
          tx.$queryRawUnsafe<Array<{status:string}>>(`SELECT "status" FROM "PlatformInvoice" WHERE "schoolId"=$1`, dir.schoolId),
          tx.$queryRawUnsafe<Array<{amount:string}>>(`SELECT "amount"::text amount FROM "PlatformPayment" WHERE "schoolId"=$1`, dir.schoolId)
        ]);
        const paid = paymentRows.reduce((n, p) => n + Number(p.amount || 0), 0);
        const unpaid = invoiceRows.filter(i => i.status !== "paid").length;
        return { school, studentCount, userCount, classCount, attendanceToday, invoices: invoiceRows.length, unpaidInvoices: unpaid, collected: paid };
      });
      if (!stats.school) continue;
      if (stats.school.status === "suspended") suspendedSchools++; else activeSchools++;
      students += stats.studentCount; users += stats.userCount; classes += stats.classCount; invoices += stats.invoices; unpaidInvoices += stats.unpaidInvoices; collected += stats.collected;
      schoolStats.push({ ...stats.school, ...stats });
    } catch { /* skip unavailable tenant without breaking network dashboard */ }
  }
  return { totals: { schools: dirs.length, activeSchools, suspendedSchools, students, users, classes, invoices, unpaidInvoices, collected }, schools: schoolStats };
}

export async function listPlatformAdmins(role: string) {
  if (!["super_admin","platform_admin"].includes(role)) throw new ForbiddenError("Admin management permission required.");
  return db.platformAdmin.findMany({ orderBy: { createdAt: "desc" }, select: { id:true,name:true,email:true,role:true,status:true,createdAt:true,permissions:true,createdById:true } as never });
}

export async function createPlatformAdmin(input: { actorId:string; actorRole:string; name:string; email:string; password:string; role:string; permissions:string[] }) {
  superOnly(input.actorRole);
  if (!/^(?=.*[A-Za-z])(?=.*\d).{12,}$/.test(input.password)) throw new AppError("Worker password must be at least 12 characters and contain letters and numbers.", 400, "WEAK_PASSWORD");
  const permissions = [...new Set(input.permissions.filter(p => (ADMIN_PERMISSIONS as readonly string[]).includes(p)))];
  const admin = await db.platformAdmin.create({ data: { name: input.name.trim(), email: input.email.trim().toLowerCase(), passwordHash: await hash(input.password, 12), role: input.role, permissions, createdById: input.actorId } as never, select: { id:true,name:true,email:true,role:true,status:true,createdAt:true,permissions:true } as never });
  await appendPlatformAudit({ actorId: input.actorId, action: "platform_admin.created", targetEntity: "PlatformAdmin:" + admin.id, meta: { role: input.role, permissions } });
  return admin;
}

export async function updatePlatformAdmin(input: { actorId:string; actorRole:string; adminId:string; status?:string; role?:string; permissions?:string[] }) {
  superOnly(input.actorRole);
  const data: Record<string, unknown> = {};
  if (input.status) data.status = input.status;
  if (input.role) data.role = input.role;
  if (input.permissions) data.permissions = [...new Set(input.permissions.filter(p => (ADMIN_PERMISSIONS as readonly string[]).includes(p)))];
  if (!Object.keys(data).length) throw new AppError("Nothing to update.", 400, "INVALID_INPUT");
  const admin = await db.platformAdmin.update({ where: { id: input.adminId }, data: data as never, select: { id:true,name:true,email:true,role:true,status:true,createdAt:true,permissions:true } as never });
  await appendPlatformAudit({ actorId: input.actorId, action: "platform_admin.updated", targetEntity: "PlatformAdmin:" + input.adminId, meta: data });
  return admin;
}

export async function listPlatformAudit(role: string, limit = 100) {
  if (!["super_admin","platform_admin","support_admin"].includes(role)) throw new ForbiddenError("Audit permission required.");
  return db.auditLogPlatform.findMany({ orderBy:{createdAt:"desc"}, take:Math.min(Math.max(limit,1),200) });
}

export async function getPlatformHealth() {
  const started = Date.now();
  await db.$queryRaw`SELECT 1`;
  return { database: "operational", latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), nextjs: "operational", api: "operational" };
}

export async function getSchoolSnapshot(role: string, schoolId: string) {
  if (!["super_admin","platform_admin","support_admin"].includes(role)) throw new ForbiddenError("School visibility permission required.");
  return withTenant(schoolId, async tx => {
    const [school, students, users, classes, subjects, attendanceToday, recentAudit] = await Promise.all([
      tx.school.findUnique({ where:{id:schoolId}, select:{id:true,name:true,uniqueCode:true,status:true,createdAt:true,subscriptionPlan:{select:{id:true,name:true,price:true,featureFlags:true}}} }),
      tx.student.findMany({ where:{status:"active"}, select:{id:true,name:true,admissionNo:true,classId:true,status:true}, orderBy:{createdAt:"desc"}, take:50 }),
      tx.user.findMany({ select:{id:true,name:true,email:true,phone:true,status:true,createdAt:true}, orderBy:{createdAt:"desc"}, take:50 }),
      tx.class.findMany({ select:{id:true,name:true,level:true,classTeacherId:true}, orderBy:{name:"asc"} }),
      tx.subject.findMany({ select:{id:true,name:true}, orderBy:{name:"asc"} }),
      tx.attendanceEvent.findMany({ where:{attendanceDate:new Date()}, select:{id:true,studentId:true,type:true,recordedAt:true}, take:1000 }),
      tx.auditLogSchool.findMany({ orderBy:{createdAt:"desc"}, take:30 })
    ]);
    if (!school) throw new AppError("School not found.",404,"NOT_FOUND");
    return { school, students, users, classes, subjects, attendanceToday, recentAudit };
  });
}

export function makeResetRequestKey() { return createId(); }
