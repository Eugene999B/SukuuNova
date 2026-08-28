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
        where: { status: "active" },
        orderBy: { name: "asc" },
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
    <AppShell universe="school" title="Staff & Teachers" subtitle="One workforce hub for teaching staff, leadership, finance, operations and every other person who keeps the school moving." active="Staff & Teachers" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="staff-workspace">
        <section className="staff-hero">
          <div>
            <span className="staff-eyebrow">PEOPLE · WORKFORCE</span>
            <h2>Build the team behind the school.</h2>
            <p>Teaching and non-teaching staff use the same secure school login. Their role determines what they can see and do. Teachers can be linked to classes and subjects; accountants, administrators, drivers, security and catering teams get focused operational access.</p>
            <div className="staff-hero-points"><span>✓ School-code login</span><span>✓ Role-based access</span><span>✓ Class & subject scope</span><span>✓ Staff attendance ready</span></div>
          </div>
          <StaffCreateDialog classes={data.classes} subjects={data.subjects} />
        </section>

        <section className="staff-metrics">
          <article><span>Total active staff</span><strong>{data.users.length}</strong><small>All school accounts</small></article>
          <article><span>Teaching staff</span><strong>{teachers.length}</strong><small>Teachers and assistants</small></article>
          <article><span>Non-teaching staff</span><strong>{nonTeaching.length}</strong><small>Operations and support</small></article>
          <article><span>Leadership</span><strong>{admins.length}</strong><small>Owner / administrator accounts</small></article>
        </section>

        <section className="staff-command-grid">
          <article className="staff-card staff-command-card">
            <div className="staff-card-head"><div><span>Teacher workspace</span><h3>Teach, assess, communicate.</h3><p>Give each teacher only the classes and subjects they are responsible for.</p></div><Link href="/teacher">Preview teacher portal →</Link></div>
            <div className="staff-capability-grid">
              <div><b>Attendance</b><small>Class registers, lateness and exceptions.</small></div>
              <div><b>Gradebook</b><small>Enter marks for assigned subjects and classes.</small></div>
              <div><b>Homework</b><small>Create work now; family submission and marking space is reserved for the next release.</small></div>
              <div><b>Messages</b><small>Parent concerns, replies and school announcements.</small></div>
              <div><b>Lesson planning</b><small>Plans, resources and completion tracking.</small></div>
              <div><b>Verification</b><small>Future face/time verification can connect to staff attendance.</small></div>
            </div>
          </article>
          <article className="staff-card">
            <div className="staff-card-head"><div><span>School operations</span><h3>Purpose-built access.</h3><p>Do not give every employee the full school dashboard.</p></div></div>
            <div className="staff-role-stack">
              <div><b>Accountant / Bursar</b><span>Finance, receipts, reconciliation, payroll and reports</span></div>
              <div><b>Administrator</b><span>Broad operations without Owner-level control</span></div>
              <div><b>Driver</b><span>Routes, trips, assigned learners and transport alerts</span></div>
              <div><b>Security / Front desk</b><span>Visitors, arrival verification and pickup safety</span></div>
              <div><b>Catering</b><span>Feeding schedules, meals and service records</span></div>
              <div><b>Assistant teacher</b><span>Assigned teacher + class support scope</span></div>
            </div>
          </article>
        </section>

        <section className="staff-card">
          <div className="staff-card-head"><div><span>Directory</span><h3>Your people</h3><p>Profile, login identity, role and teaching scope at a glance.</p></div><div className="staff-mini-actions"><Link href="/school/staff-attendance">Staff attendance →</Link><Link href="/school/settings/roles">Roles & permissions →</Link></div></div>
          {data.users.length === 0 ? <div className="staff-empty"><div className="staff-empty-icon">♙</div><strong>No staff accounts yet.</strong><p>Create your first staff account. The temporary password is <b>12345</b>; the staff member should change it immediately from Account Security.</p></div> : <div className="staff-table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Teaching scope</th><th>Login</th><th>Status</th></tr></thead><tbody>{data.users.map((u) => { const roles=u.userRoles.map((r)=>r.role.name); const assignments=u.subjectAssignments.map((a)=>`${a.class.level ?? ""} ${a.class.name} · ${a.subject.name}`.trim()); const classLead=u.classTeacherFor.map((c)=>`${c.level ?? ""} ${c.name}`.trim()); return <tr key={u.id}><td><div className="staff-person"><span>{u.name.split(/\s+/).map((x)=>x[0]).slice(0,2).join("").toUpperCase()}</span><div><b>{u.name}</b><small>{u.email ?? u.phone ?? "No contact credential"}</small></div></div></td><td><div className="staff-role-pills">{roles.length?roles.map((r)=><em key={r}>{r}</em>):<em>Unassigned</em>}</div></td><td><small>{[...classLead,...assignments].slice(0,3).join(" · ") || "Not assigned"}</small>{assignments.length>3?<small>+{assignments.length-3} more scopes</small>:null}</td><td><small>{u.email ? "Email" : "Phone"}</small><small>{u.phone ?? "—"}</small></td><td><span className="staff-status">{u.status}</span></td></tr>;})}</tbody></table></div>}
        </section>

        <section className="staff-bottom-grid">
          <article className="staff-card"><span>Connected workflows</span><h3>The teacher is not an island.</h3><p>Class assignment can feed timetable, attendance, gradebook, homework, report cards and future family communication.</p><div className="staff-link-grid"><Link href="/school/classes">Classes & sections <span>→</span></Link><Link href="/school/subjects">Subjects <span>→</span></Link><Link href="/school/timetable">Timetable <span>→</span></Link><Link href="/school/gradebook">Gradebook <span>→</span></Link><Link href="/school/homework">Homework <span>→</span></Link><Link href="/school/communications/messages">Messages <span>→</span></Link></div></article>
          <article className="staff-card"><span>Announcement centre</span><h3>One school message. Everyone sees it in-app.</h3><p>Reserve announcements for the Owner/authorised leadership team. This reduces unnecessary SMS usage and gives every staff member a searchable notice history.</p><Link className="staff-primary-link" href="/school/communications/announcements">Open announcements →</Link></article>
        </section>
      </div>
    </AppShell>
  );
}
