import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import PlatformSchool360Workspace from "@/components/PlatformSchool360Workspace";
import PlatformSchoolLifecycle from "@/components/PlatformSchoolLifecycle";
import PlatformSchoolControlCenter from "@/components/PlatformSchoolControlCenter";
import { requirePlatformSession } from "@/lib/auth";
import { hasPlatformPermission, requirePlatformPermission } from "@/lib/platform-permissions";
import { requireSchoolScope } from "@/lib/platform-school-scope";
import { db, withTenant } from "@/lib/db";
import { getPlatformOwnerIntelligence } from "@/lib/platform-owner-intelligence";
import { getPlatformSchoolControlSnapshot } from "@/lib/platform-school-control-service";
import { getSchoolStorageEstimate } from "@/lib/platform-storage-service";
import "@/components/platform-control-plane.css";
import "@/components/platform-school360.css";

function profileValue(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "string" && found.trim() ? found.trim() : null;
}

export default async function PlatformSchool360Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  const { id } = await params;
  await requireSchoolScope(session, id);
  const [canSupport, canBilling, canAudit, canSecurity, canImpersonate, canNotify] = await Promise.all([
    hasPlatformPermission(session, "support.view"),
    hasPlatformPermission(session, "billing.view"),
    hasPlatformPermission(session, "audit.view"),
    hasPlatformPermission(session, "security.manage"),
    hasPlatformPermission(session, "schools.impersonate"),
    hasPlatformPermission(session, "support.manage"),
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
        settings: { select: { timezone: true, gradeCaWeight: true, gradeExamWeight: true, notificationChannels: true, smsSenderId: true } },
      },
    });
    if (!school) return null;
    const [students, users, guardians, classes, subjects, invoices, payments, recentMessages, failedMessages, supportRows, walletRows] = await Promise.all([
      tx.student.count({ where: { status: "active" } }),
      tx.user.count(),
      tx.guardian.count(),
      tx.class.count(),
      tx.subject.count(),
      tx.invoice.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, totalAmount: true, status: true, createdAt: true } }),
      tx.payment.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, amount: true, method: true, reference: true, createdAt: true } }),
      tx.message.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      tx.message.count({ where: { status: "failed", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
      tx.$queryRawUnsafe<Array<{ open: bigint }>>(`SELECT COUNT(*)::bigint AS "open" FROM "SupportTicket" WHERE "schoolId"=$1 AND "status" IN ('open','in_progress')`, id),
      tx.$queryRawUnsafe<Array<{ smsBalance: number; whatsappBalance: number; status: string }>>(`SELECT "smsBalance","whatsappBalance","status" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1 LIMIT 1`, id),
    ]);
    return {
      school,
      students,
      users,
      guardians,
      classes,
      subjects,
      invoices,
      payments,
      recentMessages,
      failedMessages,
      supportOpen: Number(supportRows[0]?.open ?? 0),
      messagingWallet: walletRows[0] ?? null,
    };
  });
  if (!data) notFound();

  const [control, intelligenceResult, storage] = await Promise.all([
    getPlatformSchoolControlSnapshot(id),
    getPlatformOwnerIntelligence({ schoolIds: [id] }),
    getSchoolStorageEstimate(id),
  ]);
  const intelligence = intelligenceResult.schools.find((school) => school.schoolId === id) ?? null;
  const audits = canAudit
    ? await db.$queryRawUnsafe<Array<{ id: string; actorId: string | null; actorName: string | null; actorEmail: string | null; action: string; targetEntity: string | null; createdAt: Date }>>(
        `SELECT l."id",l."actorId",a."name" AS "actorName",a."email" AS "actorEmail",l."action",l."targetEntity",l."createdAt" FROM "AuditLogPlatform" l LEFT JOIN "PlatformAdmin" a ON a."id"=l."actorId" WHERE l."targetSchoolId"=$1 ORDER BY l."createdAt" DESC LIMIT 40`,
        id,
      )
    : [];
  const unpaid = data.invoices.filter((invoice) => invoice.status !== "paid").length;
  const collected = data.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const settingsProfile = data.school.settings?.notificationChannels;
  const profile = {
    schoolType: profileValue(settingsProfile, "schoolType"),
    country: profileValue(settingsProfile, "country"),
    region: profileValue(settingsProfile, "region"),
    city: profileValue(settingsProfile, "city"),
    address: profileValue(settingsProfile, "address"),
    phone: profileValue(settingsProfile, "phone"),
    email: profileValue(settingsProfile, "email"),
  };

  return <AppShell universe="platform" title={data.school.name} subtitle="School 360 · complete tenant operations and control" active="Schools" userName={session.name} role={session.role}>
    <PlatformSchool360Workspace
      school={data.school}
      profile={profile}
      students={data.students}
      users={data.users}
      guardians={data.guardians}
      classes={data.classes}
      subjects={data.subjects}
      recentMessages={data.recentMessages}
      failedMessages={data.failedMessages}
      supportOpen={data.supportOpen}
      messagingWallet={data.messagingWallet}
      unpaid={unpaid}
      collected={collected}
      audits={audits}
      storage={storage}
      intelligence={intelligence}
      controlAccounts={control.accounts}
      canSupport={canSupport}
      canBilling={canBilling}
      canAudit={canAudit}
    />
    <PlatformSchoolControlCenter
      schoolId={id}
      intelligence={intelligence}
      control={control}
      canSecurity={canSecurity}
      canImpersonate={canImpersonate}
      canNotify={canNotify}
    />
    <PlatformSchoolLifecycle schoolId={id} status={data.school.status} />
  </AppShell>;
}
