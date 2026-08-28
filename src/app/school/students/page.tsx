import Link from "next/link";
import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "./students-workspace.css";
import "./dark-students-theme.css";
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
  if (photoData && (!photoData.startsWith("data:image/") || photoData.length > 1_000_000)) {
    throw new Error("Student photo is invalid or too large. Capture a smaller photo and try again.");
  }
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
    <AppShell universe="school" title="Students" subtitle="A complete learner information centre — identity, placement, family, attendance, learning and fees." active="Students" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="students-workspace">
        <section className="students-hero students-hero-rich">
          <div>
            <div className="eyebrow">People · Student Information System</div>
            <h2>Your learner register, built for daily school work.</h2>
            <p>Keep the register focused while each learner record connects class placement, family, attendance, academics, assessments, finance and reports.</p>
            <div className="hero-statline"><span><b>{data.students.length}</b> total learners</span><span><b>{activeCount}</b> active</span><span><b>{data.classes.length}</b> class groups</span></div>
          </div>
          <div className="hero-actions"><Link href="/school/classes" className="button secondary">Manage classes</Link><AddStudentDialog classes={data.classes} action={createStudent} /></div>
        </section>

        <section className="student-metrics">
          <article><span>Total learners</span><strong>{data.students.length}</strong><small>Live records in this school</small></article>
          <article><span>Placed in classes</span><strong>{assignedCount}</strong><small>{data.students.length ? `${Math.round((assignedCount / data.students.length) * 100)}% placed` : "Create classes first"}</small></article>
          <article className={unassigned.length ? "attention" : "ok"}><span>Needs class placement</span><strong>{unassigned.length}</strong><small>{unassigned.length ? "Resolve before class-based workflows" : "Every learner is placed"}</small></article>
        </section>

        <section className="class-structure-card">
          <div className="section-head"><div><div className="eyebrow">Academic structure</div><h3>Grades, classes & streams</h3><p>Build the structure first: <b>Grade 5 → 5A, 5B, 5C</b>. Learners then inherit the correct class context.</p></div><Link href="/school/classes?action=create" className="button primary">+ Create class</Link></div>
          {data.classes.length === 0 ? <div className="structure-empty"><div className="empty-icon">◎</div><strong>No classes created yet</strong><p>Create your grades and streams before enrolling learners. That makes attendance, timetable, teaching and assessment grouping much simpler.</p><Link href="/school/classes?action=create" className="text-link">Create the first class →</Link></div> : <div className="grade-grid">{Object.entries(grouped).map(([level, sections]) => <article className="grade-card" key={level}><div className="grade-title"><div><span className="grade-kicker">Academic level</span><h4>{level}</h4></div><span className="grade-total">{sections.reduce((sum, item) => sum + item._count.students, 0)} learners</span></div><div className="section-list">{sections.map((schoolClass) => <Link href={`/school/classes?class=${schoolClass.id}`} className="section-row" key={schoolClass.id}><span className="section-badge">{schoolClass.name.slice(0, 2).toUpperCase()}</span><span className="section-main"><b>{schoolClass.name}</b><small>Open class roster and connected workflows</small></span><span className="section-count">{schoolClass._count.students}</span><span className="chevron">›</span></Link>)}</div></article>)}</div>}
        </section>

        <section className="student-register-card">
          <div className="section-head"><div><div className="eyebrow">Learner directory</div><h3>Students at a glance</h3><p>Photos, index numbers, placement and status are visible before opening a full Student 360 profile.</p></div><div className="head-actions"><Link href="/school/students?view=unassigned">Needs placement ({unassigned.length})</Link><Link href="/school/students?view=active">Active students</Link><AddStudentDialog classes={data.classes} action={createStudent} triggerLabel="+ New student" /></div></div>
          <div className="student-toolbar"><input aria-label="Search students" placeholder="Search name or index number"/><select aria-label="Filter by class" defaultValue="all"><option value="all">All classes</option>{data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}</select><select aria-label="Filter by status" defaultValue="active"><option value="active">Active</option><option value="all">All statuses</option><option value="inactive">Inactive</option></select><button type="button" className="button secondary">Filter</button></div>
          {data.students.length === 0 ? <div className="register-empty"><div className="empty-icon">◌</div><strong>Start your real student register</strong><p>No invented students are shown. Create a learner from the guided workflow and SukuuNova will generate the permanent Index Number and connect the learner to the chosen class and guardian.</p><AddStudentDialog classes={data.classes} action={createStudent} triggerLabel="Create first student →" /></div> : <div className="student-card-grid">{data.students.map((student) => <Link href={`/school/students/${student.id}`} className="student-card" key={student.id}><div className="student-card-photo">{student.photoUrl ? <img src={student.photoUrl} alt="" /> : <span>{student.name.slice(0, 2).toUpperCase()}</span>}</div><div className="student-card-main"><div className="student-card-top"><span className="student-index">{student.admissionNo}</span><span className={`pill ${student.status === "active" ? "success" : "muted"}`}>{student.status}</span></div><h4>{student.name}</h4><p>{student.class?.level ?? "No grade"} · {student.class?.name ?? "Needs placement"}</p><small>{student._count.reportCards} reports · {student._count.attendanceEvents} attendance events · {student._count.invoices} invoices</small></div><span className="student-card-arrow">→</span></Link>)}</div>}
        </section>

        <section className="student-workflow-band">
          <div><div className="eyebrow">Student journey</div><h3>Build once, use everywhere.</h3><p>A well-formed learner record becomes the common identity for class lists, attendance, assessments, family communication, fees and reports.</p></div>
          <div className="workflow-steps"><span><b>01</b> Admit</span><span><b>02</b> Place</span><span><b>03</b> Teach</span><span><b>04</b> Assess</span><span><b>05</b> Report</span></div>
        </section>
      </div>
    </AppShell>
  );
}
