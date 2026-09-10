import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IdentityCardBatchActions } from "@/components/IdentityCardBatchActions";
import { StaffDirectory } from "@/components/staff/StaffDirectory";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { StaffCreateDialog } from "./StaffCreateDialog";
import "./staff-workspace.css";
import "./staff-simple.css";

export default async function StaffPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, users, classes, subjects, canManageCards] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.user.findMany({
        where: { status: { in: ["active", "pending", "suspended"] } },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, email: true, phone: true, status: true,
          userRoles: { select: { role: { select: { name: true, key: true } } } },
          classTeacherFor: { select: { id: true, name: true, level: true } },
          subjectAssignments: { select: { subject: { select: { id: true, name: true } }, class: { select: { id: true, name: true, level: true } } } },
        },
      }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      hasPermission(tx, session.userId, "identity_cards:manage").catch(() => false),
    ]);
    return { school, users, classes, subjects, canManageCards };
  });

  const teachers = data.users.filter((user) => user.userRoles.some((role) => /teacher/i.test(role.role.name)));
  const pending = data.users.filter((user) => user.status === "pending");
  const active = data.users.filter((user) => user.status === "active");
  const people = data.users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    roles: user.userRoles.map((role) => role.role.name),
    classLead: user.classTeacherFor.map((schoolClass) => `${schoolClass.level ?? ""} ${schoolClass.name}`.trim()),
    assignments: user.subjectAssignments.map((assignment) => `${assignment.class.level ?? ""} ${assignment.class.name} · ${assignment.subject.name}`.trim()),
  }));

  return (
    <AppShell universe="school" title="Staff & Teachers" subtitle="Find staff, review teaching scope and manage access." active="Staff & Teachers" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="staff-simple">
        <section className="staff-simple-head">
          <div><h2>Staff directory</h2><p>Search people first. Open a profile for portrait, school ID, roles, contact and teaching scope.</p></div>
          <StaffCreateDialog classes={data.classes} subjects={data.subjects} />
        </section>

        {data.canManageCards ? <section className="staff-form-note wide"><strong>Staff identity cards</strong><span>Generate school-branded, QR-verifiable cards for the full staff team.</span><IdentityCardBatchActions mode="staff"/></section> : null}
        {pending.length ? <section className="staff-form-note wide"><strong>{pending.length} staff profile{pending.length === 1 ? " needs" : "s need"} login activation.</strong><span>Open the person and choose Activate login, or use <Link href="/school/settings/access">People & Access</Link>.</span></section> : null}

        <section className="staff-simple-metrics" aria-label="Staff summary">
          <div><span>Total staff</span><strong>{data.users.length}</strong></div>
          <div><span>Teachers</span><strong>{teachers.length}</strong></div>
          <div><span>Active login</span><strong>{active.length}</strong></div>
          <div><span>Needs login</span><strong>{pending.length}</strong></div>
        </section>

        <section className="staff-simple-panel">
          <div className="staff-simple-panel-head"><div><h3>People at this school</h3><p>Search by name, contact or role, then open the full staff profile.</p></div></div>
          <StaffDirectory people={people} />
        </section>

        <details className="sn-progressive">
          <summary>More workforce administration</summary>
          <div className="sn-progressive-body staff-simple-tools">
            {data.canManageCards ? <Link href="/school/id-cards"><strong>Identity cards</strong><span>Issue, reissue & verify →</span></Link> : null}
            <Link href="/school/settings/access"><strong>People & access</strong><span>Accounts and activation →</span></Link>
            <Link href="/school/settings/roles"><strong>Roles & permissions</strong><span>Access rules →</span></Link>
            <Link href="/school/attendance/staff"><strong>Staff attendance</strong><span>Attendance records →</span></Link>
            <Link href="/school/classes"><strong>Classes</strong><span>Class teachers →</span></Link>
            <Link href="/school/subjects"><strong>Subjects</strong><span>Teaching assignments →</span></Link>
            <Link href="/school/timetable"><strong>Timetable</strong><span>Teaching schedule →</span></Link>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
