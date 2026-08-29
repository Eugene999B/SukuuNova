import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "@/app/globals.css";
import "@/app/school/staff/staff-workspace.css";

export default async function TeacherStudentsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => tx.user.findUnique({
    where: { id: session.userId },
    select: {
      name: true,
      userRoles: { select: { role: { select: { name: true } } } },
      classTeacherFor: { select: { id: true, name: true, level: true } },
      subjectAssignments: { select: { class: { select: { id: true, name: true, level: true } }, subject: { select: { id: true, name: true } } } },
    },
  }));
  if (!data) redirect("/login/school");
  const roles = data.userRoles.map((entry) => entry.role.name);
  const isTeacher = roles.some((role) => /teacher|academic lead|head of department/i.test(role));
  const elevated = roles.some((role) => /owner|administrator|principal|vice principal/i.test(role));
  if (!isTeacher || elevated) redirect("/dashboard");

  const classIds = [...new Set([...data.classTeacherFor.map((item) => item.id), ...data.subjectAssignments.map((item) => item.class.id)])];
  const students = await withTenant(session.schoolId, (tx) => tx.student.findMany({
    where: { schoolId: session.schoolId, classId: { in: classIds } },
    orderBy: { name: "asc" },
    select: { id: true, admissionNo: true, name: true, dob: true, status: true, class: { select: { id: true, name: true, level: true } } },
  }));

  return (
    <AppShell universe="teacher" title="My Students" subtitle="Learners in the classes assigned to your teaching profile." active="My Students" schoolName="School Workspace" userName={data.name} role={roles[0] ?? "Teacher"}>
      <div className="staff-workspace">
        <section className="staff-header"><div><span className="staff-eyebrow">TEACHER PORTAL · MY STUDENTS</span><h2>My student roster</h2><p>This list is calculated from your assigned class relationships. Students outside those classes are not included.</p></div><Link className="staff-primary-cta" href="/teacher">← Teacher home</Link></section>
        <section className="staff-metrics"><article><span>Students in scope</span><strong>{students.length}</strong><small>Assigned classes only</small></article><article><span>Classes in scope</span><strong>{classIds.length}</strong><small>Class lead + subject assignments</small></article><article><span>Class lead</span><strong>{data.classTeacherFor.length}</strong><small>Primary class responsibility</small></article><article><span>Subjects</span><strong>{new Set(data.subjectAssignments.map((item) => item.subject.id)).size}</strong><small>Teaching assignments</small></article></section>
        <section className="staff-directory"><div className="staff-directory-head"><div><span>Roster</span><h3>Students you teach</h3><p>Use this roster as the base for attendance, assignments and assessment work.</p></div><div className="staff-tools"><Link href="/school/attendance">Attendance</Link><Link href="/school/homework">Homework</Link><Link href="/school/gradebook">Gradebook</Link></div></div>{students.length === 0?<div className="staff-empty"><strong>No students are currently in your teaching scope.</strong><p>Ask the school administrator to connect your staff profile to a class and/or subject.</p></div>:<div className="staff-table-wrap"><table><thead><tr><th>Student</th><th>Admission no.</th><th>Class</th><th>Status</th></tr></thead><tbody>{students.map((student)=><tr key={student.id}><td><div className="staff-person"><span>{student.name.split(/\s+/).map((part)=>part[0]).slice(0,2).join("").toUpperCase()}</span><div><b>{student.name}</b><small>{student.dob?`DOB · ${new Date(student.dob).toLocaleDateString("en-GB")}:"Learner profile"}</small></div></div></td><td><small>{student.admissionNo}</small></td><td><small>{student.class?`${student.class.level?`${student.class.level} · `:""}${student.class.name}`:"Unassigned"}</small></td><td><span className={`staff-status ${student.status}`}>{student.status}</span></td></tr>)}</tbody></table></div>}</section>
      </div>
    </AppShell>
  );
}
