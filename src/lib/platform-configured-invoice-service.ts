import { createId } from "@paralleldrive/cuid2";
import { withTenant } from "./db";
import { AppError } from "./errors";
import { appendPlatformAudit } from "./audit";
import { getPlatformSchoolScope, requirePlatformPermission } from "./platform-permissions";
import { calculatePlatformTotal, majorUnits, minorUnits } from "./billing-math";
import type { PlatformSession } from "./auth";

function assertScope(session: PlatformSession, schoolId: string) {
  return getPlatformSchoolScope(session).then((scope) => {
    if (scope !== null && !scope.includes(schoolId)) throw new AppError("School is outside your assigned platform scope.", 403, "FORBIDDEN");
  });
}

export async function generateConfiguredPlatformInvoice(session: PlatformSession, schoolId: string, period: string) {
  await requirePlatformPermission(session, "billing.manage");
  await assertScope(session, schoolId);
  const result = await withTenant(schoolId, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"platform-invoice:" + schoolId + ":" + period}))`;
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, subscriptionPlan: { select: { name: true, price: true } } } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    const existing = (await tx.$queryRawUnsafe<Array<{ id: string; amount: string; status: string; calculation: unknown }>>(
      `SELECT "id","amount"::text,"status","calculation" FROM "PlatformInvoice" WHERE "schoolId"=$1 AND "period"=$2 LIMIT 1`, schoolId, period,
    ))[0];
    if (existing) {
      const found = { id: existing.id, amount: Number(existing.amount), status: existing.status, existing: true as const, calculation: existing.calculation };
      await appendPlatformAudit({ actorId: session.adminId, action: "platform.billing.invoice_already_exists", targetSchoolId: schoolId, targetEntity: `PlatformInvoice:${existing.id}`, meta: found }, tx);
      return found;
    }

    const config = (await tx.$queryRawUnsafe<Array<{ billingMode: string; currency: string; studentRate: string; flatRate: string; minimumCharge: string; maximumCharge: string | null; graceDays: number }>>(
      `SELECT "billingMode","currency","studentRate"::text,"flatRate"::text,"minimumCharge"::text,"maximumCharge"::text,"graceDays" FROM "PlatformSchoolBillingConfig" WHERE "schoolId"=$1 AND "active"=true`, schoolId,
    ))[0] ?? null;
    const activeStudents = config?.billingMode === "per_student" ? await tx.student.count({ where: { status: "active" } }) : 0;
    const baseMajor = config ? (config.billingMode === "per_student" ? majorUnits(minorUnits(config.studentRate) * activeStudents) : Number(config.flatRate)) : Number(school.subscriptionPlan?.price ?? 0);
    if (!config && !school.subscriptionPlan) throw new AppError("Configure school billing or assign a subscription plan before generating an invoice.", 409, "BILLING_RULE_REQUIRED");
    const minimum = config ? Number(config.minimumCharge) : 0;
    const maximum = config?.maximumCharge == null ? null : Number(config.maximumCharge);
    const amount = calculatePlatformTotal({ base: baseMajor, minimumCharge: minimum, maximumCharge: maximum }).total;
    const calculation = {
      billingMode: config?.billingMode ?? "plan",
      currency: config?.currency ?? "GHS",
      activeStudents,
      studentRate: config ? Number(config.studentRate) : null,
      flatRate: config ? Number(config.flatRate) : Number(school.subscriptionPlan?.price ?? 0),
      minimumCharge: minimum,
      maximumCharge: maximum,
      baseAmount: baseMajor,
      finalAmount: amount,
      planName: school.subscriptionPlan?.name ?? null,
      graceDays: config?.graceDays ?? 0,
    };
    let created;
    try {
      created = (await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO "PlatformInvoice" ("id","schoolId","period","amount","status","calculation") VALUES ($1,$2,$3,$4,'unpaid',$5::jsonb) RETURNING "id"`, createId(), schoolId, period, amount, JSON.stringify(calculation),
      ))[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        const raced = (await tx.$queryRawUnsafe<Array<{ id: string; amount: string; status: string; calculation: unknown }>>(
          `SELECT "id","amount"::text,"status","calculation" FROM "PlatformInvoice" WHERE "schoolId"=$1 AND "period"=$2 LIMIT 1`, schoolId, period,
        ))[0];
        if (raced) {
          const found = { id: raced.id, amount: Number(raced.amount), status: raced.status, existing: true as const, calculation: raced.calculation };
          await appendPlatformAudit({ actorId: session.adminId, action: "platform.billing.invoice_already_exists", targetSchoolId: schoolId, targetEntity: `PlatformInvoice:${raced.id}`, meta: found }, tx);
          return found;
        }
      }
      throw error;
    }
    const done = { id: created.id, amount, status: "unpaid", existing: false as const, calculation };
    await appendPlatformAudit({ actorId: session.adminId, action: "platform.billing.invoice_generated", targetSchoolId: schoolId, targetEntity: `PlatformInvoice:${created.id}`, meta: done }, tx);
    return done;
  });
  return result;
}
