import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { StaffCreateDialog } from "./StaffCreateDialog";
import "./staff-workspace.css";

export default async function StaffPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, users, classes, subjects] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.user.findMany({
        where: { status: "active" }, orderBy: { name: "asc" },
        select: {
          id: true, name: true, email: true, phone: true, status: true,
          userRoles: { select: { role: { select: { name: true, key: true } } } },
          classTeacherFor: { select: { id: true, name: true, level: true } },
          subjectAssignments: { select: { subject: { select: { id: true, name: true } }, class: { select: { id: true, name: true, level: true } } } }
        }
      }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
    ]);
    return { school, users, classes, subjects };
  });

  const teachers = data.users.filter((u) => u.userRoles.some((r) => /teacher/i.test(r.role.name)));
  const nonTeaching = data.users.filter((u) => !u.userRoles.some((r) => /teacher/i.test(r.role.name)));
  const admins = data.users.filter((u) => u.userRoles.some((r) => /owner|administrator/i.test(r.role.name)));

  return (
    <AppShell universe="school" title="Staff & Teachers" subtitle="Manage people, roles and teaching assignments from one focused workforce directory." active="Staff & Teachers" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="staff-workspace">
        <section className="staff-header">
          <div><span className="staff-eyebrow">PEOPLE · WORKFORCE</span><h2>Staff directory</h2><p>See who works at the school, their role, teaching scope and account contact.</p></div>
          <StaffCreateDialog classes={data.classes} subjects={data.subjects} />
        </section>

        <section className="staff-metrics" aria-label="Staff summary">
          <article><span>Total staff</span><strong>{data.users.length}</strong><small>Active accounts</small></article>
          <article><span>Teachers</span><strong>{teachers.length}</strong><small>Teaching accounts</small></article>
          <article><span>Other staff</span><strong>{nonTeaching.length}</strong><small>Operations and support</small></article>
          <article><span>Leadership</span><strong>{admins.length}</strong><small>Owner / administrator</small></article>
        </section>

        <section className="staff-directory">
          <div className="staff-directory-head">
            <div><span>Directory</span><h3>People at this school</h3><p>Role, teaching scope, contact and account status.</p></div>
            <div className="staff-tools"><Link href="/school/staff-attendance">Staff attendance</Link><Link href="/school/settings/roles">Roles & permissions</Link></div>
          </div>
          {data.users.length === 0 ? <div className="staff-empty"><strong>No staff accounts yet.</strong><p>Create the first staff account to begin assigning roles and teaching scope.</p></div> : <div className="staff-table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Teaching scope</th><th>Contact</th><th>Status</th></tr></thead><tbody>{data.users.map((u) => { const roles=u.userRoles.map((r)=>r.role.name); const assignments=u.subjectAssignments.map((a)=>`${a.class.level ?? ""} ${a.class.name} · ${a.subject.name}`.trim()); const classLead=u.classTeacherFor.map((c)=>`${c.level ?? ""} ${c.name}`.trim()); return <tr key={u.id}><td><div className="staff-person"><span>{u.name.split(/\s+/).map((x)=>x[0]).slice(0,2).join("").toUpperCase()}</span><div><b>{u.name}</b><small>{u.email ?? u.phone ?? "No sign-in contact"}</small></div></div></td><td><div className="staff-role-pills">{roles.length?roles.map((r)=><em key={r}>{r}</em>):<em>Unassigned</em>}</div></td><td><small>{[...classLead,...assignments].slice(0,3).join(" · ") || "Not assigned"}</small>{assignments.length>3?<small>+{assignments.length-3} more</small>:null}</td><td><small>{u.email ?? "—"}</small><small>{u.phone ?? "—"}</small></td><td><span className="staff-status">{u.status}</span></td></tr>;})}</tbody></table></div>}
        </section>

        <nav className="staff-shortcuts" aria-label="Staff management shortcuts"><span>Manage:</span><Link href="/school/classes">Classes</Link><Link href="/school/subjects">Subjects</Link><Link href="/school/timetable">Timetable</Link><Link href="/school/gradebook">Gradebook</Link></nav>
      </div>
    </AppShell>
  );
}
