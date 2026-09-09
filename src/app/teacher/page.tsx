import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RoleIntelligenceHome, type IntelligenceInsight } from "@/components/RoleIntelligenceHome";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "@/app/globals.css";

type Props = { searchParams?: Promise<{ view?: string }> };
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function TeacherPortalPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  if (params.view === "My Messages") redirect("/teacher/messages");
  if (params.view === "My Homework") redirect("/teacher/homework");
  if (params.view === "My Timetable") redirect("/teacher/timetable");
  if (params.view === "My Gradebook") redirect("/teacher/gradebook");

  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [access, messageCount, user, school, settings, led, assignments, timetable] = await Promise.all([
      getSchoolAuthorization(tx, session.userId),
      tx.message.count({ where: { schoolId: session.schoolId, recipientType: "user", recipientId: session.userId } }),
      tx.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true, phone: true } }),
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId, classTeacherId: session.userId }, select: { id: true, name: true, level: true, _count: { select: { students: true } } }, orderBy: { name: "asc" } }),
      tx.classSubjectTeacher.findMany({ where: { schoolId: session.schoolId, teacherId: session.userId }, select: { classId: true, subjectId: true, class: { select: { id: true, name: true, level: true, _count: { select: { students: true } } } }, subject: { select: { id: true, name: true } } }, orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }] }),
      tx.timetableSlot.findMany({ where: { schoolId: session.schoolId, teacherId: session.userId }, select: { id: true, dayOfWeek: true, period: true, class: { select: { name: true, level: true } }, subject: { select: { name: true } } }, orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }] }),
    ]);
    return user ? { ...user, messageCount, access, school, timezone: settings?.timezone || "Africa/Accra", led, assignments, timetable } : null;
  });
  if (!data) redirect("/login/school");
  if (data.access.workspace !== "teacher") redirect("/dashboard");

  const assignments = data.assignments;
  const led = data.led;
  const classIds = new Set([...led.map((classroom) => classroom.id), ...assignments.map((assignment) => assignment.class.id)]);
  const scopedStudentCount = new Map<string, number>();
  for (const classroom of led) scopedStudentCount.set(classroom.id, classroom._count.students);
  for (const assignment of assignments) scopedStudentCount.set(assignment.class.id, assignment.class._count.students);
  const totalStudents = [...scopedStudentCount.values()].reduce((sum, count) => sum + count, 0);
  const roleLabel = data.access.roles.map((role) => role.name).join(" · ") || "Teacher";
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: data.timezone, weekday: "long" }).format(new Date());
  const dayOfWeek = days.indexOf(weekday) + 1;
  const todayLessons = dayOfWeek > 0 ? data.timetable.filter((slot) => slot.dayOfWeek === dayOfWeek) : [];

  const insights: IntelligenceInsight[] = [];
  if (assignments.length === 0 && led.length === 0) insights.push({ title: "No teaching responsibility is connected to your account", detail: "Your school needs to assign a class or class-subject-teacher connection before gradebook and teaching workflows can become useful.", severity: "critical" });
  if (data.timetable.length === 0 && assignments.length > 0) insights.push({ title: "Your teaching assignments have no timetable periods yet", detail: "Assignments exist, but the published timetable does not currently give this account a teaching period.", href: "/teacher/timetable", severity: "warning", actionLabel: "Open timetable" });
  if (todayLessons.length > 0) insights.push({ title: `${todayLessons.length} lesson${todayLessons.length === 1 ? "" : "s"} scheduled today`, detail: `Your ${weekday} timetable is ready below so you can move directly into attendance, teaching and marks.`, href: "/teacher/timetable", severity: "positive", actionLabel: "View day" });
  if (led.length > 0) insights.push({ title: "You hold class-teacher responsibility", detail: `${led.length} class${led.length === 1 ? " is" : "es are"} assigned to you as class teacher, including attendance and learner-specific class duties.`, href: "/teacher/students", severity: "info", actionLabel: "Open learners" });
  if (data.messageCount > 0) insights.push({ title: "You have school messages available", detail: `${data.messageCount} message record${data.messageCount === 1 ? " is" : "s are"} available in the teacher inbox.`, href: "/teacher/messages", severity: "info", actionLabel: "Read messages" });

  const focus = todayLessons.length ? todayLessons.slice(0, 5).map((slot) => ({
    label: `${slot.subject.name} · Period ${slot.period}`,
    detail: `${slot.class.level ? `${slot.class.level} · ` : ""}${slot.class.name}`,
    value: weekday,
    href: "/teacher/timetable",
  })) : [
    { label: "No lesson is scheduled for today", detail: data.timetable.length ? "Your next assigned period is available from My Timetable." : "The school has not published timetable periods for this account yet.", value: weekday, href: "/teacher/timetable" },
    ...(led.length ? [{ label: "Class-teacher duties", detail: `${led.map((item) => item.name).slice(0, 2).join(", ")}${led.length > 2 ? " and more" : ""}.`, value: `${led.length} classes`, href: "/teacher/attendance" }] : []),
  ];

  return <AppShell universe="teacher" title="Teacher intelligence" subtitle={`${data.school?.name ?? "School Workspace"} · your teaching day`} active="Teacher Home" userName={data.name} schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} role={roleLabel}>
    <RoleIntelligenceHome
      eyebrow={`Teacher intelligence · ${roleLabel}`}
      title={`Good morning, ${data.name.split(/\s+/)[0]}. Your teaching day is already organised.`}
      description="Your home prioritises today’s lessons, classes in scope, learner responsibility, messages and the connected teaching workflows you actually use."
      identity={`${data.school?.name ?? "School Workspace"} · ${data.school?.uniqueCode ?? ""}`}
      primaryAction={{ label: "Take attendance", href: "/teacher/attendance" }}
      secondaryAction={{ label: "Open gradebook", href: "/teacher/gradebook" }}
      metrics={[
        { label: "Today’s lessons", value: todayLessons.length, detail: `${weekday} periods assigned to you.`, href: "/teacher/timetable", tone: todayLessons.length > 0 ? "good" : "default" },
        { label: "Students in scope", value: totalStudents, detail: `${classIds.size} class${classIds.size === 1 ? "" : "es"} connected to this account.`, href: "/teacher/students" },
        { label: "Subject assignments", value: assignments.length, detail: "Class-subject responsibilities available for teaching and marks.", href: "/teacher/gradebook", tone: assignments.length > 0 ? "good" : "critical" },
        { label: "Messages", value: data.messageCount, detail: "School messages available to this account.", href: "/teacher/messages" },
      ]}
      insights={insights}
      focusTitle={`${weekday} teaching plan`}
      focusDescription="The next teaching responsibilities from your published timetable."
      focus={focus}
      actions={[
        { label: "Take attendance", detail: "Open the class register for learners in your scope.", href: "/teacher/attendance" },
        { label: "Enter marks", detail: "Use the atomic gradebook for your assigned classes.", href: "/teacher/gradebook" },
        { label: "Homework", detail: "Create connected learner work and publish submissions.", href: "/teacher/homework" },
        { label: "My timetable", detail: "See all assigned teaching periods.", href: "/teacher/timetable" },
      ]}
    />
  </AppShell>;
}
