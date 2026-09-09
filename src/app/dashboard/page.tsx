import { redirect } from "next/navigation";
import { getPlatformSession, getSchoolSession } from "@/lib/auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { FinanceDashboard } from "@/components/FinanceDashboard";
import { RoleIntelligenceHome, type IntelligenceAction, type IntelligenceInsight } from "@/components/RoleIntelligenceHome";

const NON_WORKFORCE_ROLE_KEYS = ["guardian", "parent", "student"];
type DashboardProfile = "leadership" | "academics" | "people" | "admissions" | "frontdesk" | "transport" | "operations";

function isFinanceRole(roleKeys: string[]) {
  return roleKeys.some((role) => ["accountant", "bursar", "finance_officer", "cashier", "finance_clerk"].includes(role));
}

function dashboardProfile(roleKeys: string[]): DashboardProfile {
  if (roleKeys.some((key) => ["owner", "administrator", "principal", "vice_principal"].includes(key))) return "leadership";
  if (roleKeys.some((key) => ["academic_coordinator", "department_head"].includes(key))) return "academics";
  if (roleKeys.includes("hr_officer")) return "people";
  if (roleKeys.includes("admissions_officer")) return "admissions";
  if (roleKeys.includes("front_desk_security")) return "frontdesk";
  if (roleKeys.includes("transport_officer")) return "transport";
  return "operations";
}

function localDateInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

type SchoolStats = {
  students: number;
  guardians: number;
  staff: number;
  classes: number;
  subjects: number;
  feeItems: number;
  invoices: number;
  payments: number;
  todayAttendance: number;
  events: number;
  announcements: Array<{ id: string; body: string; createdAt: Date }>;
  academicYears: number;
  terms: number;
  reportTemplates: number;
  pendingStaff: number;
  pendingReportCards: number;
  pendingFeeAdjustments: number;
  activatedNonOwnerStaff: number;
  hasBranding: boolean;
  classesWithoutTeacher: number;
  teachingAssignments: number;
  timetableSlots: number;
};

export default async function DashboardPage() {
  const schoolSession = await getSchoolSession();
  if (!schoolSession) {
    const platformSession = await getPlatformSession();
    if (platformSession) redirect("/platform");
    redirect("/");
  }

  const overview = await withTenant(schoolSession.schoolId, async (tx) => {
    const [account, access, settings] = await Promise.all([
      tx.user.findUnique({ where: { id: schoolSession.userId }, select: { name: true, school: { select: { name: true, uniqueCode: true } } } }),
      getSchoolAuthorization(tx, schoolSession.userId),
      tx.schoolSettings.findUnique({ where: { schoolId: schoolSession.schoolId }, select: { timezone: true } }),
    ]);
    return { account, access, timezone: settings?.timezone || "Africa/Accra" };
  });

  if (!overview.account) redirect("/login/school");
  if (overview.access.workspace === "teacher") redirect("/teacher");

  const today = new Date(`${localDateInTimeZone(new Date(), overview.timezone)}T00:00:00.000Z`);
  const stats = await withTenant(schoolSession.schoolId, async (tx): Promise<SchoolStats> => {
    const workforceFilter = { userRoles: { some: { role: { key: { notIn: NON_WORKFORCE_ROLE_KEYS } } } } } } as const;
    const [students, guardians, staff, classes, subjects, feeItems, invoices, payments, todayAttendance, events, announcements, academicYears, terms, reportTemplates, pendingReportCards, pendingFeeAdjustments, pendingStaff, activatedNonOwnerStaff, branding, classesWithoutTeacher, teachingAssignments, timetableSlots] = await Promise.all([
      tx.student.count({ where: { status: "active" } }),
      tx.guardian.count(),
      tx.user.count({ where: { status: "active", ...workforceFilter } }),
      tx.class.count(),
      tx.subject.count(),
      tx.feeItem.count(),
      tx.invoice.count(),
      tx.payment.count(),
      tx.attendanceEvent.count({ where: { attendanceDate: today } }),
      tx.calendarEvent.count(),
      tx.message.findMany({ where: { recipientId: schoolSession.userId, channel: "in_app" }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, body: true, createdAt: true } }),
      tx.academicYear.count(),
      tx.term.count(),
      tx.reportCardTemplate.count({ where: { OR: [{ schoolId: schoolSession.schoolId }, { schoolId: null }] } }),
      tx.reportCard.count({ where: { status: "submitted" } }),
      tx.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int AS count FROM "P3FinanceAdjustment" WHERE "schoolId"=$1 AND "status"='pending'`, schoolSession.schoolId),
      tx.user.count({ where: { status: "pending", ...workforceFilter } }),
      tx.user.count({ where: { status: "active", NOT: { userRoles: { some: { role: { key: "owner" } } } }, ...workforceFilter } }),
      tx.school.findUnique({ where: { id: schoolSession.schoolId }, select: { logoUrl: true, brandColors: true } }),
      tx.class.count({ where: { classTeacherId: null } }),
      tx.classSubjectTeacher.count(),
      tx.timetableSlot.count(),
    ]);
    return {
      students, guardians, staff, classes, subjects, feeItems, invoices, payments, todayAttendance, events, announcements, academicYears, terms, reportTemplates, pendingReportCards,
      pendingFeeAdjustments: pendingFeeAdjustments[0]?.count ?? 0,
      pendingStaff,
      activatedNonOwnerStaff,
      hasBranding: Boolean(branding?.logoUrl || branding?.brandColors),
      classesWithoutTeacher,
      teachingAssignments,
      timetableSlots,
    };
  });

  const roleNames = overview.access.roles.map((entry) => entry.name);
  const roleKeys = overview.access.roleKeys;
  const role = roleNames.join(" · ") || "School staff";
  const shell = { schoolName: overview.account.school.name, schoolCode: overview.account.school.uniqueCode, userName: overview.account.name, role };

  if (isFinanceRole(roleKeys)) {
    return <AppShell universe="school" title="Finance intelligence" subtitle={`${shell.schoolName} · ${shell.schoolCode}`} active="Overview" {...shell}>
      <FinanceDashboard name={shell.userName} school={shell.schoolName} code={shell.schoolCode} role={role} stats={{ invoices: stats.invoices, payments: stats.payments, pendingFeeAdjustments: stats.pendingFeeAdjustments, feeItems: stats.feeItems, students: stats.students }} />
    </AppShell>;
  }

  return <SchoolRoleDashboard name={shell.userName} school={shell.schoolName} code={shell.schoolCode} role={role} profile={dashboardProfile(roleKeys)} stats={stats} />;
}

function SchoolRoleDashboard({ name, school, code, role, profile, stats }: { name: string; school: string; code: string; role: string; profile: DashboardProfile; stats: SchoolStats }) {
  const firstName = name.trim().split(/\s+/)[0] || name;
  const setupChecks = [stats.hasBranding, stats.academicYears > 0 && stats.terms > 0, stats.classes > 0 && stats.subjects > 0, stats.students > 0, stats.activatedNonOwnerStaff > 0, stats.reportTemplates > 0];
  const readiness = Math.round((setupChecks.filter(Boolean).length / setupChecks.length) * 100);
  const commonInsights: IntelligenceInsight[] = [];

  if (stats.pendingReportCards > 0) commonInsights.push({ title: "Report cards are waiting for approval", detail: `${stats.pendingReportCards} submitted report${stats.pendingReportCards === 1 ? "" : "s"} still need review.`, href: "/school/report-cards", severity: "warning", actionLabel: "Review" });
  if (stats.pendingStaff > 0) commonInsights.push({ title: "Staff accounts are waiting for activation", detail: `${stats.pendingStaff} workforce account${stats.pendingStaff === 1 ? "" : "s"} still need access setup.`, href: "/school/settings/access", severity: "warning", actionLabel: "Open access" });
  if (stats.classesWithoutTeacher > 0) commonInsights.push({ title: "Some classes have no class teacher", detail: `${stats.classesWithoutTeacher} class${stats.classesWithoutTeacher === 1 ? "" : "es"} need a class-teacher assignment.`, href: "/school/classes", severity: "warning", actionLabel: "Assign" });
  if (stats.classes > 0 && stats.teachingAssignments === 0) commonInsights.push({ title: "Teaching assignments are not connected", detail: "Classes exist, but no class-subject-teacher connections are configured yet.", href: "/school/academics/setup", severity: "critical", actionLabel: "Configure" });
  if (stats.academicYears === 0 || stats.terms === 0) commonInsights.push({ title: "The academic calendar is incomplete", detail: "Create the academic year and terms so grades, reports and timetables have a valid period.", href: "/school/terms", severity: "critical", actionLabel: "Set calendar" });

  const profileCopy: Record<DashboardProfile, { eyebrow: string; title: string; description: string; primary: { label: string; href: string }; secondary: { label: string; href: string } }> = {
    leadership: { eyebrow: "Leadership intelligence", title: `Good morning, ${firstName}. Run the school from the signals that matter.`, description: "School readiness, people, approvals, academics and daily operations are brought together into one leadership briefing.", primary: { label: "Open school settings", href: "/school/settings" }, secondary: { label: "Management reports", href: "/school/reports" } },
    academics: { eyebrow: "Academic intelligence", title: `Good morning, ${firstName}. Keep teaching, assessment and reporting connected.`, description: "This home prioritises academic setup, teacher-class-subject connections, timetable activity and report workflow readiness.", primary: { label: "Academic setup", href: "/school/academics/setup" }, secondary: { label: "Gradebook", href: "/school/gradebook" } },
    people: { eyebrow: "People intelligence", title: `Good morning, ${firstName}. Keep the staff structure healthy and ready.`, description: "This home centres on workforce activation, access readiness and the people connections that affect daily school operations.", primary: { label: "People & access", href: "/school/settings/access" }, secondary: { label: "Staff directory", href: "/school/staff" } },
    admissions: { eyebrow: "Admissions intelligence", title: `Good morning, ${firstName}. Keep learner onboarding clear and complete.`, description: "This home focuses on learner records, class capacity, guardian records and the setup needed before new learners can operate normally.", primary: { label: "Students", href: "/school/students" }, secondary: { label: "Guardians", href: "/school/guardians" } },
    frontdesk: { eyebrow: "Front desk intelligence", title: `Good morning, ${firstName}. See today’s people flow immediately.`, description: "Attendance activity, people records and fast operational actions are placed first for reception and gate work.", primary: { label: "Attendance control", href: "/school/devices" }, secondary: { label: "Manual register", href: "/school/attendance/register" } },
    transport: { eyebrow: "Transport intelligence", title: `Good morning, ${firstName}. Keep movement and school-day operations visible.`, description: "This home prioritises daily attendance signals, learner population and operational records that support safe movement planning.", primary: { label: "Transport", href: "/school/transport" }, secondary: { label: "Attendance", href: "/school/attendance" } },
    operations: { eyebrow: "School operations intelligence", title: `Good morning, ${firstName}. Start from what needs action.`, description: "Your home surfaces the records, exceptions and workflows most useful to an operational staff account.", primary: { label: "School overview", href: "/school/reports" }, secondary: { label: "Settings", href: "/school/settings" } },
  };
  const copy = profileCopy[profile];

  let insights = commonInsights;
  if (profile === "people") insights = [
    ...commonInsights.filter((item) => item.title.includes("Staff accounts") || item.title.includes("class teacher")),
    { title: "Active workforce visibility", detail: `${stats.staff} active workforce account${stats.staff === 1 ? "" : "s"} are currently available in this school tenant.`, href: "/school/staff", severity: "positive", actionLabel: "Open staff" },
  ];
  if (profile === "admissions") insights = [
    { title: "Learner intake snapshot", detail: `${stats.students} active learner${stats.students === 1 ? "" : "s"}, ${stats.guardians} guardian record${stats.guardians === 1 ? "" : "s"}, and ${stats.classes} class${stats.classes === 1 ? "" : "es"} are available for onboarding work.`, href: "/school/students", severity: "positive", actionLabel: "Open learners" },
    ...(stats.classes === 0 ? [{ title: "No classes are available for placement", detail: "Create the class structure before assigning new learners.", href: "/school/classes", severity: "critical" as const, actionLabel: "Create classes" }] : []),
    ...commonInsights.filter((item) => item.title.includes("academic calendar")),
  ];
  if (profile === "frontdesk") insights = [
    { title: "Today’s attendance channel", detail: `${stats.todayAttendance} entry, exit or register event${stats.todayAttendance === 1 ? "" : "s"} have been recorded today so far.`, href: "/school/attendance", severity: stats.todayAttendance > 0 ? "positive" : "info", actionLabel: "Monitor" },
  ];

  const actionsByProfile: Record<DashboardProfile, IntelligenceAction[]> = {
    leadership: [
      { label: "Add learner", detail: "Create a new student record.", href: "/school/students" },
      { label: "Manage staff", detail: "Open people and access controls.", href: "/school/settings/access" },
      { label: "Review reports", detail: "Approve and print report cards.", href: "/school/report-cards" },
      { label: "School settings", detail: "Configure school-wide policies.", href: "/school/settings" },
    ],
    academics: [
      { label: "Academic setup", detail: "Classes, subjects, teachers and terms.", href: "/school/academics/setup" },
      { label: "Timetable", detail: "Generate or review the official schedule.", href: "/school/timetable" },
      { label: "Gradebook", detail: "Monitor assessment and marks.", href: "/school/gradebook" },
      { label: "Report cards", detail: "Review reporting workflow.", href: "/school/report-cards" },
    ],
    people: [
      { label: "Add staff", detail: "Create a staff account.", href: "/school/staff" },
      { label: "People & access", detail: "Activate roles and permissions.", href: "/school/settings/access" },
      { label: "Staff attendance", detail: "Review workforce attendance.", href: "/school/attendance/staff" },
      { label: "Roles", detail: "Open role responsibilities.", href: "/school/settings/roles" },
    ],
    admissions: [
      { label: "Add learner", detail: "Create a learner profile.", href: "/school/students" },
      { label: "Guardians", detail: "Manage family records.", href: "/school/guardians" },
      { label: "Classes", detail: "Review placement options.", href: "/school/classes" },
      { label: "Student records", detail: "Open the learner directory.", href: "/school/students" },
    ],
    frontdesk: [
      { label: "Attendance control", detail: "Monitor entry and exit channels.", href: "/school/devices" },
      { label: "Manual register", detail: "Record a fallback attendance decision.", href: "/school/attendance/register" },
      { label: "Students", detail: "Find a learner quickly.", href: "/school/students" },
      { label: "Staff", detail: "Find a staff member quickly.", href: "/school/staff" },
    ],
    transport: [
      { label: "Transport", detail: "Open transport operations.", href: "/school/transport" },
      { label: "Attendance", detail: "See school-day arrival signals.", href: "/school/attendance" },
      { label: "Students", detail: "Open learner records.", href: "/school/students" },
      { label: "Messages", detail: "Check school communication.", href: "/school/communications/messages" },
    ],
    operations: [
      { label: "Students", detail: "Open learner records.", href: "/school/students" },
      { label: "Staff", detail: "Open staff records.", href: "/school/staff" },
      { label: "Attendance", detail: "Review attendance activity.", href: "/school/attendance" },
      { label: "Reports", detail: "Open school reports.", href: "/school/reports" },
    ],
  };

  return <AppShell universe="school" title="Home intelligence" subtitle={`${school} · ${code}`} active="Overview" schoolName={school} schoolCode={code} userName={name} role={role}>
    <RoleIntelligenceHome
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      identity={`${school} · ${code} · ${role}`}
      primaryAction={copy.primary}
      secondaryAction={copy.secondary}
      metrics={[
        { label: "Readiness", value: `${readiness}%`, detail: "Core school setup currently configured.", href: "/school/settings", tone: readiness >= 80 ? "good" : readiness >= 50 ? "warn" : "critical" },
        { label: "Learners", value: stats.students, detail: `${stats.classes} class${stats.classes === 1 ? "" : "es"} · ${stats.guardians} guardian records.`, href: "/school/students" },
        { label: "Workforce", value: stats.staff, detail: `${stats.pendingStaff} staff activation${stats.pendingStaff === 1 ? "" : "s"} pending.`, href: "/school/staff", tone: stats.pendingStaff > 0 ? "warn" : "good" },
        { label: "Today’s attendance", value: stats.todayAttendance, detail: "Entry, exit and register events recorded today.", href: "/school/attendance", tone: stats.todayAttendance > 0 ? "good" : "default" },
      ]}
      insights={insights}
      focusTitle="School pulse"
      focusDescription="Live indicators from the connected school workflows."
      focus={[
        { label: "Academic structure", detail: `${stats.subjects} subjects · ${stats.teachingAssignments} teacher-subject connections.`, value: `${stats.timetableSlots} timetable slots`, href: "/school/academics/setup" },
        { label: "Approval queues", detail: "Submitted report cards and fee changes waiting for authorised review.", value: `${stats.pendingReportCards + stats.pendingFeeAdjustments} open`, href: stats.pendingReportCards > 0 ? "/school/report-cards" : "/school/fees/overview" },
        { label: "Calendar & events", detail: "Academic periods and school calendar records currently configured.", value: `${stats.terms} terms · ${stats.events} events`, href: "/school/terms" },
        { label: "Communication", detail: stats.announcements[0]?.body.replace(/\n/g, " ").slice(0, 90) || "No recent in-app message for this account.", value: `${stats.announcements.length} recent`, href: "/school/communications/messages" },
      ]}
      actions={actionsByProfile[profile]}
    />
  </AppShell>;
}
