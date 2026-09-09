import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RoleIntelligenceHome, type IntelligenceInsight } from "@/components/RoleIntelligenceHome";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import "@/app/globals.css";
import "./guardian-intelligence-home.css";

const PUBLISHED_REPORT_STATES = ["approved", "sent"] as const;

function localDate(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

export default async function GuardianPortalPage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  const data = await withTenant(session.schoolId, async (tx) => {
    const [settings, messageCount, guardian] = await Promise.all([
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.message.count({ where: { schoolId: session.schoolId, recipientType: "user", recipientId: session.userId } }),
      tx.guardian.findFirst({
        where: { id: session.guardianId, schoolId: session.schoolId, userId: session.userId },
        select: {
          name: true,
          students: { include: { student: {
            include: {
              class: true,
              attendanceEvents: true,
              scores: { include: { assessment: true, subject: true }, orderBy: { enteredAt: "desc" } },
              reportCards: { where: { status: { in: [...PUBLISHED_REPORT_STATES] } }, select: { termId: true } },
              invoices: { include: { payments: { include: { reversals: true } } } },
            },
          } } },
        },
      }),
    ]);
    return { timezone: settings?.timezone || "Africa/Accra", messageCount, guardian };
  });
  if (!data.guardian) redirect("/login/guardian");

  const children = data.guardian.students.map((x) => x.student);
  const today = localDate(new Date(), data.timezone);
  const visibleScores = (student: typeof children[number]) => {
    const visibleTerms = new Set(student.reportCards.map((r) => r.termId));
    return student.scores.filter((score) => visibleTerms.has(score.assessment.termId));
  };
  const netPaid = (payments: Array<{ amount: unknown; reversals: Array<{ amount: unknown }> }>) =>
    payments.reduce(
      (sum, payment) =>
        sum.plus(new Prisma.Decimal(String(payment.amount))).minus(
          payment.reversals.reduce((r, row) => r.plus(new Prisma.Decimal(String(row.amount))), new Prisma.Decimal(0))
        ),
      new Prisma.Decimal(0)
    );
  const invoiceDue = (invoice: { totalAmount: unknown; payments: Array<{ amount: unknown; reversals: Array<{ amount: unknown }> }> }) =>
    new Prisma.Decimal(String(invoice.totalAmount)).minus(netPaid(invoice.payments));
  const familyBalance = children.reduce(
    (total, student) => total.plus(student.invoices.reduce((sum, invoice) => sum.plus(invoiceDue(invoice)), new Prisma.Decimal(0))),
    new Prisma.Decimal(0)
  );
  const attendanceRecorded = children.filter((student) => student.attendanceEvents.some((event) => localDate(event.attendanceDate, data.timezone) === today)).length;
  const publishedReports = children.reduce((sum, student) => sum + student.reportCards.length, 0);
  const visibleResultRecords = children.reduce((sum, student) => sum + visibleScores(student).length, 0);

  const insights: IntelligenceInsight[] = [];
  if (children.length === 0) insights.push({ title: "No learner is linked to this guardian account", detail: "Ask the school to connect at least one learner before attendance, fees, results and family tools can work.", severity: "critical" });
  if (familyBalance.gt(0)) insights.push({ title: "There is an outstanding family balance", detail: `The current net balance across linked learners is GH₵${familyBalance.toFixed(2)}. Open Fees & receipts to see the learner-level breakdown.`, href: "/guardian/fees", severity: "warning", actionLabel: "View fees" });
  if (children.length > 0 && attendanceRecorded < children.length) insights.push({ title: "Some children do not yet have attendance recorded today", detail: `${attendanceRecorded} of ${children.length} linked learner${children.length === 1 ? "" : "s"} have an attendance event for ${today}.`, href: "/guardian/attendance", severity: "warning", actionLabel: "Check attendance" });
  if (publishedReports > 0) insights.push({ title: "Published academic reports are available", detail: `${publishedReports} released report card${publishedReports === 1 ? " is" : "s are"} available across your linked children.`, href: "/guardian/academics", severity: "positive", actionLabel: "Open academics" });
  if (data.messageCount > 0) insights.push({ title: "Your school has messages for this account", detail: `${data.messageCount} message record${data.messageCount === 1 ? " is" : "s are"} available in the guardian inbox.`, href: "/guardian/messages", severity: "info", actionLabel: "Read messages" });

  const childFocus = children.map((student) => {
    const todayEvents = student.attendanceEvents.filter((event) => localDate(event.attendanceDate, data.timezone) === today);
    const balance = student.invoices.reduce((sum, invoice) => sum.plus(invoiceDue(invoice)), new Prisma.Decimal(0));
    const latest = visibleScores(student)[0];
    return {
      label: student.name,
      detail: `${student.class?.level ? `${student.class.level} · ` : ""}${student.class?.name ?? "Unassigned"} · ${todayEvents.length ? "attendance recorded" : "attendance not recorded"}${latest ? ` · latest visible score ${String(latest.value)}` : ""}`,
      value: `GH₵${balance.toFixed(2)}`,
      href: `/guardian/children/${student.id}`,
    };
  });

  return <AppShell universe="guardian" title="Family intelligence" subtitle="Children, attendance, academics, fees and school updates." active="Overview" schoolName={session.schoolName} schoolCode="" userName={data.guardian.name} role="Guardian">
    <RoleIntelligenceHome
      eyebrow="Guardian intelligence"
      title={`Good morning, ${data.guardian.name.split(/\s+/)[0] || data.guardian.name}. Your family picture is in one place.`}
      description="The guardian home now brings together each child’s school-day attendance, published academic information, family balance and school communication."
      identity={session.schoolName}
      primaryAction={{ label: "Open children", href: children[0] ? `/guardian/children/${children[0].id}` : "/guardian/attendance" }}
      secondaryAction={{ label: "Fees & receipts", href: "/guardian/fees" }}
      metrics={[
        { label: "Linked children", value: children.length, detail: "Learners connected to this guardian account.", tone: children.length > 0 ? "good" : "critical" },
        { label: "Attendance today", value: `${attendanceRecorded}/${children.length}`, detail: "Linked children with an attendance event today.", href: "/guardian/attendance", tone: children.length > 0 && attendanceRecorded === children.length ? "good" : "warn" },
        { label: "Family balance", value: `GH₵${familyBalance.toFixed(2)}`, detail: "Net invoice balance after posted payments and reversals.", href: "/guardian/fees", tone: familyBalance.gt(0) ? "warn" : "good" },
        { label: "Published reports", value: publishedReports, detail: `${visibleResultRecords} visible score record${visibleResultRecords === 1 ? "" : "s"} connected to released terms.`, href: "/guardian/academics", tone: publishedReports > 0 ? "good" : "default" },
      ]}
      insights={insights}
      focusTitle="Child-by-child pulse"
      focusDescription="Open a learner directly from the family summary."
      focus={childFocus}
      actions={[
        { label: "Attendance", detail: "See today and past attendance for linked learners.", href: "/guardian/attendance" },
        { label: "Academics", detail: "Open released results and report information.", href: "/guardian/academics" },
        { label: "Fees & receipts", detail: "Review balances, payments and receipts.", href: "/guardian/fees" },
        { label: "Messages", detail: "Read school communication for your family.", href: "/guardian/messages" },
      ]}
    >
      <section className="guardian-intelligence-children">
        <div className="guardian-intelligence-children-head"><div><span>Your children</span><h2>Detailed family cards</h2><p>Identity, class, today’s attendance state, latest released score and balance.</p></div></div>
        <div className="guardian-intelligence-child-grid">
          {children.length ? children.map((student) => {
            const scores = visibleScores(student);
            const latest = scores[0];
            const todayAttendance = student.attendanceEvents.filter((event) => localDate(event.attendanceDate, data.timezone) === today);
            const balance = student.invoices.reduce((sum, invoice) => sum.plus(invoiceDue(invoice)), new Prisma.Decimal(0));
            return <article className="guardian-intelligence-child" key={student.id}>
              <div className="guardian-intelligence-child-head"><div className="guardian-intelligence-child-avatar">{student.photoUrl ? <Image src={student.photoUrl} alt="" width={54} height={54} unoptimized /> : student.name.slice(0, 2).toUpperCase()}</div><div><h3>{student.name}</h3><p>{student.admissionNo} · {student.class?.level ? `${student.class.level} · ` : ""}{student.class?.name ?? "Unassigned"}</p></div></div>
              <div className="guardian-intelligence-child-facts"><div><span>Today</span><strong>{todayAttendance.length ? "Recorded" : "Not recorded"}</strong></div><div><span>Latest score</span><strong>{latest ? String(latest.value) : "—"}</strong></div><div><span>Balance</span><strong>GH₵{balance.toFixed(2)}</strong></div></div>
              <Link href={`/guardian/children/${student.id}`}>Open learner <ArrowRight size={14} aria-hidden="true" /></Link>
            </article>;
          }) : <div className="guardian-intelligence-empty"><strong>No children are linked yet.</strong><p>Ask the school to connect this guardian account to a learner.</p></div>}
        </div>
      </section>
    </RoleIntelligenceHome>
  </AppShell>;
}
