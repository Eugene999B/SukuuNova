import Link from "next/link";
import Image from "next/image";
import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { CircleCheckBig, GraduationCap, UserPlus, UsersRound } from "lucide-react";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { AppShell } from "@/components/AppShell";
import { DataCard } from "@/components/ui/DataCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "./students-workspace.css";
import "./students-light-theme.css";
import "./students-light-overrides.css";
import "@/components/students/add-student-dialog.css";

function createIndexNumber() {
  const year = new Date().getFullYear();
  return `SN-${year}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
}

async function createStudent(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const dobRaw = String(formData.get("dob") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  const guardianName = String(formData.get("guardianName") ?? "").trim();
  const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();
  const guardianRelationship = String(formData.get("guardianRelationship") ?? "Parent/Guardian").trim() || "Parent/Guardian";
  const photoData = String(formData.get("photoData") ?? "").trim();
  if (!name) throw new Error("Student name is required.");
  if (photoData && (!photoData.startsWith("data:image/") || photoData.length > 1_000_000)) throw new Error("Student photo is invalid or too large. Capture a smaller photo and try again.");
  if (guardianPhone && !guardianName) throw new Error("Enter the guardian name when providing a guardian phone number.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    if (classId) {
      const schoolClass = await tx.class.findUnique({ where: { id: classId }, select: { id: true } });
      if (!schoolClass) throw new Error("The selected class does not belong to this school.");
    }
    let indexNumber = createIndexNumber();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const exists = await tx.student.findUnique({ where: { schoolId_admissionNo: { schoolId: session.schoolId, admissionNo: indexNumber } }, select: { id: true } });
      if (!exists) break;
      indexNumber = createIndexNumber();
    }
    const student = await tx.student.create({ data: { schoolId: session.schoolId, name, admissionNo: indexNumber, dob: dobRaw ? new Date(`${dobRaw}T00:00:00.000Z`) : null, classId: classId || null, status: "active", photoUrl: photoData || null } });
    if (guardianName && guardianPhone) {
      const guardian = await tx.guardian.upsert({ where: { schoolId_phone: { schoolId: session.schoolId, phone: guardianPhone } }, update: { name: guardianName }, create: { schoolId: session.schoolId, name: guardianName, phone: guardianPhone } });
      await tx.studentGuardian.create({ data: { schoolId: session.schoolId, studentId: student.id, guardianId: guardian.id, relationship: guardianRelationship, isPrimary: true } }).catch(() => undefined);
    }
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "student.created", entityType: "Student", entityId: student.id, after: { name, indexNumber, classId: classId || null, guardianLinked: Boolean(guardianName && guardianPhone), photoCaptured: Boolean(photoData) } } });
  });
  redirect("/school/students");
}

export default async function StudentsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, classes, students] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.student.findMany({ orderBy: [{ name: "asc" }], take: 250, select: { id: true, name: true, admissionNo: true, dob: true, status: true, photoUrl: true, class: { select: { id: true, name: true, level: true } }, _count: { select: { attendanceEvents: true, reportCards: true, invoices: true } } } }),
    ]);
    return { school, classes, students };
  });
  const unassigned = data.students.filter((student) => !student.class);
  const assignedCount = data.students.length - unassigned.length;
  const activeCount = data.students.filter((student) => student.status === "active").length;
  const grouped = data.classes.reduce<Record<string, typeof data.classes>>((acc, item) => {
    const level = item.level?.trim() || "Other / ungraded";
    (acc[level] ??= []).push(item);
    return acc;
  }, {});
  return (
    <AppShell universe="school" title="Students" subtitle="Manage the learner register, placement, family links and connected school records." active="Students" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="students-workspace">
        <section className="students-hero students-hero-rich"><div><div className="eyebrow">People · Student register</div><h2>Every learner, clearly organised.</h2><p>Search and manage the school register, resolve placement issues and open the full learner record when you need the detail.</p><div className="hero-statline"><span><b>{data.students.length}</b> learners</span><span><b>{activeCount}</b> active</span><span><b>{data.classes.length}</b> class groups</span></div></div><div className="hero-actions"><Link href="/school/classes" className="button secondary"><GraduationCap size={15} aria-hidden="true" /> Manage classes</Link><AddStudentDialog classes={data.classes} action={createStudent} /></div></section>
        <section className="student-metrics"><DataCard label="Total learners" value={data.students.length} meta="Live records in this school" icon={UsersRound} /><DataCard label="Placed in classes" value={assignedCount} meta={data.students.length ? `${Math.round((assignedCount / data.students.length) * 100)}% placed` : "Create classes first"} icon={GraduationCap} tone="info" /><DataCard label="Needs class placement" value={unassigned.length} meta={unassigned.length ? "Open the filtered register to resolve" : "Every learner is placed"} icon={unassigned.length ? UserPlus : CircleCheckBig} tone={unassigned.length ? "warning" : "success"} /></section>
        <section className="class-structure-card"><div className="section-head"><div><div className="eyebrow">Academic structure</div><h3>Grades, classes & streams</h3><p>See learner distribution by academic level and jump straight into a class roster.</p></div><Link href="/school/classes?action=create" className="button primary"><GraduationCap size={15} aria-hidden="true" /> Create class</Link></div>{data.classes.length === 0 ? <EmptyState icon={GraduationCap} title="No classes created yet" description="Create your grades and streams before enrolling learners so class-based workflows stay organised." action={<Link href="/school/classes?action=create" className="text-link">Create the first class →</Link>} /> : <div className="grade-grid">{Object.entries(grouped).map(([level, sections]) => <article className="grade-card" key={level}><div className="grade-title"><div><span className="grade-kicker">Academic level</span><h4>{level}</h4></div><span className="grade-total">{sections.reduce((sum, item) => sum + item._count.students, 0)} learners</span></div><div className="section-list">{sections.map((schoolClass) => <Link href={`/school/classes?class=${schoolClass.id}`} className="section-row" key={schoolClass.id}><span className="section-badge"><GraduationCap size={14} aria-hidden="true" /></span><span className="section-main"><b>{schoolClass.name}</b><small>{schoolClass._count.students} learners in this class</small></span><span className="section-count">{schoolClass._count.students}</span><span className="chevron">›</span></Link>)}</div></article>)}</div>}</section>
        <section className="student-register-card"><div className="section-head"><div><div className="eyebrow">Learner directory</div><h3>Students at a glance</h3><p>Open any learner for their complete profile and connected records.</p></div><div className="head-actions"><Link href="/school/students?view=unassigned">Needs placement ({unassigned.length})</Link><Link href="/school/students?view=active">Active students</Link><AddStudentDialog classes={data.classes} action={createStudent} triggerLabel="+ New student" /></div></div><div className="student-toolbar"><input aria-label="Search students" placeholder="Search name or index number"/><select aria-label="Filter by class" defaultValue="all"><option value="all">All classes</option>{data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}</select><select aria-label="Filter by status" defaultValue="active"><option value="active">Active</option><option value="all">All statuses</option><option value="inactive">Inactive</option></select><button type="button" className="button secondary">Filter</button></div>{data.students.length === 0 ? <EmptyState icon={UsersRound} title="Start the student register" description="No invented students are shown. Create a learner and SukuuNova will generate the permanent Index Number and connect the learner to the chosen class and guardian." action={<AddStudentDialog classes={data.classes} action={createStudent} triggerLabel="Create first student →" />} /> : <div className="student-card-grid">{data.students.map((student) => <Link href={`/school/students/${student.id}`} className="student-card" key={student.id}><div className="student-card-photo">{student.photoUrl ? <Image src={student.photoUrl} alt="" width={56} height={56} unoptimized /> : <span>{student.name.slice(0, 2).toUpperCase()}</span>}</div><div className="student-card-main"><div className="student-card-top"><span className="student-index">{student.admissionNo}</span><span className={`pill ${student.status === "active" ? "success" : "muted"}`}>{student.status}</span></div><h4>{student.name}</h4><p>{student.class?.level ?? "No grade"} · {student.class?.name ?? "Needs placement"}</p><small>{student._count.reportCards} reports · {student._count.attendanceEvents} attendance events · {student._count.invoices} invoices</small></div><span className="student-card-arrow">→</span></Link>)}</div>}</section>
        <section className="student-actions-strip"><div><div className="eyebrow">Next actions</div><h3>Keep the register moving.</h3></div><div className="student-actions-grid"><Link href="/school/students?view=unassigned"><strong>{unassigned.length} learners</strong><span>Need class placement →</span></Link><Link href="/school/classes"><strong>{data.classes.length} class groups</strong><span>Manage class structure →</span></Link><Link href="/school/guardians"><strong>Family records</strong><span>Review guardian links →</span></Link><Link href="/school/attendance"><strong>Attendance</strong><span>Open student register →</span></Link></div></section>
      </div>
    </AppShell>
  );
}
