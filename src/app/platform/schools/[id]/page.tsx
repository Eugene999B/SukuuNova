import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import PlatformSchool360Workspace from "@/components/PlatformSchool360Workspace";
import PlatformSchoolLifecycle from "@/components/PlatformSchoolLifecycle";
import { requirePlatformSession } from "@/lib/auth";
import { hasPlatformPermission, requirePlatformPermission } from "@/lib/platform-permissions";
import { requireSchoolScope } from "@/lib/platform-school-scope";
import { db, withTenant } from "@/lib/db";
import "@/components/platform-control-plane.css";

export default async function PlatformSchool360Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  const { id } = await params;
  await requireSchoolScope(session, id);
  const [canSupport, canBilling, canAudit] = await Promise.all([
    hasPlatformPermission(session, "support.view"),
    hasPlatformPermission(session, "billing.view"),
    hasPlatformPermission(session, "audit.view"),
  ]);

  const data = await withTenant(id, async (tx) => {
    const school = await tx.school.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        uniqueCode: true,
        status: true,
        createdAt: true,
        subscriptionPlan: { select: { id: true, name: true, price: true } },
        settings: { select: { timezone: true, gradeCaWeight: true, gradeExamWeight: true } },
      },
    });
    if (!school) return null;
    const [students, users, classes, subjects, invoices, payments] = await Promise.all([
      tx.student.count({ where: { status: "active" } }),
      tx.user.count(),
      tx.class.count(),
      tx.subject.count(),
      tx.invoice.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, totalAmount: true, status: true, createdAt: true, student: { select: { name: true } } } }),
      tx.payment.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, amount: true, method: true, reference: true, createdAt: true } }),
    ]);
    const recentMessages = await tx.message.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    const failedMessages = await tx.message.count({ where: { status: "failed", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } });
    return { school, students, users, classes, subjects, invoices, payments, recentMessages, failedMessages };
  });
  if (!data) notFound();

  const audits = canAudit
    ? await db.$queryRawUnsafe<Array<{ id: string; actorId: string | null; actorName: string | null; actorEmail: string | null; action: string; targetEntity: string | null; createdAt: Date }>>(
        `SELECT l."id",l."actorId",a."name" AS "actorName",a."email" AS "actorEmail",l."action",l."targetEntity",l."createdAt" FROM "AuditLogPlatform" l LEFT JOIN "PlatformAdmin" a ON a."id"=l."actorId" WHERE l."targetSchoolId"=$1 ORDER BY l."createdAt" DESC LIMIT 40`,
        id,
      )
    : [];

  const unpaid = data.invoices.filter((invoice) => invoice.status !== "paid").length;
  const collected = data.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

  return <AppShell universe="platform" title={data.school.name} subtitle="School 360 · operator workspace" active="Schools">
    <PlatformSchool360Workspace
      school={data.school}
      students={data.students}
      users={data.users}
      classes={data.classes}
      subjects={data.subjects}
      recentMessages={data.recentMessages}
      failedMessages={data.failedMessages}
      unpaid={unpaid}
      collected={collected}
      invoices={data.invoices}
      audits={audits}
      canSupport={canSupport}
      canBilling={canBilling}
      canAudit={canAudit}
    />
    <PlatformSchoolLifecycle schoolId={id} status={data.school.status} />
  </AppShell>;
}
