import Link from "next/link";
import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StudentPhotoCapture } from "@/components/students/StudentPhotoCapture";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "./students-workspace.css";

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
  if (dobRaw) {
    const parsedDob = new Date(`${dobRaw}T00:00:00.000Z`);
    if (Number.isNaN(parsedDob.getTime())) throw new Error("Please enter a valid date of birth.");
  }
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

    const student = await tx.student.create({
      data: {
        schoolId: session.schoolId,
        name,
        admissionNo: indexNumber,
        dob: dobRaw ? new Date(`${dobRaw}T00:00:00.000Z`) : null,
        classId: classId || null,
        status: "active",
        photoUrl: photoData || null
      }
    });

    if (guardianName && guardianPhone) {
      const guardian = await tx.guardian.upsert({
        where: { schoolId_phone: { schoolId: session.schoolId, phone: guardianPhone } },
        update: { name: guardianName },
        create: { schoolId: session.schoolId, name: guardianName, phone: guardianPhone }
      });
      const existingLink = await tx.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } }, select: { studentId: true } });
      if (!existingLink) {
        await tx.studentGuardian.create({ data: { schoolId: session.schoolId, studentId: student.id, guardianId: guardian.id, relationship: guardianRelationship, isPrimary: true } });
      }
    }

    await tx.auditLogSchool.create({
      data: {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "student.created",
        entityType: "Student",
        entityId: student.id,
        after: { name, indexNumber, classId: classId || null, guardianLinked: Boolean(guardianName && guardianPhone), photoCaptured: Boolean(photoData) }
      }
    });
  });
  redirect("/school/students");
}

export default async function StudentsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, classes, students] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, classTeacher: { select: { name: true } }, _count: { select: { students: true } } } }),
      tx.student.findMany({
        orderBy: [{ name: "asc" }],
        take: 250,
        select: { id: true, name: true, admissionNo: true, dob: true, status: true, photoUrl: true, class: { select: { id: true, name: true, level: true } }, guardians: { select: { isPrimary: true, guardian: { select: { name: true, phone: true } } } }, _count: { select: { attendanceEvents: true, reportCards: true, invoices: true } } }
      )
    ]);
    const [scores, attendance] = await Promise.all([
      tx.score.groupBy({ by: ["studentId"], _avg: { value: true }, where: {} }),
      tx.attendanceEvent.groupBy({ by: ["studentId"], _count: { _all: true }, where: { studentId: { not: null } } })
    ]);
    return { school, classes, students, scores, attendance };
  });

  const performance = new Map(data.scores.map((row) => [row.studentId, row._avg.value == null ? null : Number(row._avg.value)]));
  const attendanceCounts = new Map(data.attendance.map((row) => [row.studentId ?? "", row._count._all]));
  const grouped = data.classes.reduce<Record<string, typeof data.classes>>((acc, item) => {
    const level = item.level?.trim() || "Unassigned grade";
    (acc[level] ??= []).push(item);
    return acc;
  }, {});
  const unassigned = data.students.filter((student) => !student.class);
  const assignedCount = data.students.length - unassigned.length;
  const scored = data.students.map((s) => performance.get(s.id)).filter((v): v is number => typeof v === "number");
  const averageSchoolPerformance = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;

  return (
    <AppShell universe="school" title="Students" subtitle="A complete learner information centre — from first admission and class placement to attendance, performance, fees and graduation." active="Students" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="students-workspace">
        <section className="students-hero students-hero-rich"><div><div className="eyebrow">People · Student Information System</div><h2>One living record for every learner.</h2><p>Create a student once and let SukuuNova connect their class, family, attendance, learning, assessments, fees and reports throughout the school journey.</p><div className="hero-statline"><span><b>{data.students.length}</b> learners</span><span><b>{data.classes.length}</b> class groups</span><span><b>{averageSchoolPerformance ? `${averageSchoolPerformance.toFixed(1)}%` : "—"}</b> avg. score</span></div></div><div className="hero-actions"><Link href="/school/classes" className="button secondary">Manage classes</Link><a href="#add-student" className="button primary">+ Add student</a></div></section>

        <section className="student-metrics"><article><span>Total learners</span><strong>{data.students.length}</strong><small>Live records in this school</small></article><article><span>Placed in classes</span><strong>{assignedCount}</strong><small>{data.students.length ? `${Math.round((assignedCount / data.students.length) * 100)}% placed` : "Create classes first"}</small></article><article className={unassigned.length ? "attention" : "ok"}><span>Needs class placement</span><strong>{unassigned.length}</strong><small>{unassigned.length ? "Resolve before class-based workflows" : "Every learner is placed"}</small></article></section>

        <section className="class-structure-card"><div className="section-head"><div><div className="eyebrow">Academic structure</div><h3>Grades, classes & streams</h3><p>Build the structure first: for example <b>Grade 5 → 5A, 5B, 5C</b>. Learners can then be placed in the correct group.</p></div><Link href="/school/classes?action=create" className="button primary">+ Create class</Link></div>{data.classes.length === 0 ? <div className="structure-empty"><div className="empty-icon">◎</div><strong>No classes created yet</strong><p>Start with your grade levels and streams. Every class can later carry a teacher, subjects, timetable, attendance register and assessment context.</p><Link href="/school/classes?action=create" className="text-link">Create the first class →</Link></div> : <div className="grade-grid">{Object.entries(grouped).map(([level, sections]) => <article className="grade-card" key={level}><div className="grade-title"><div><span className="grade-kicker">Academic level</span><h4>{level}</h4></div><span className="grade-total">{sections.reduce((sum, item) => sum + item._count.students, 0)} learners</span></div><div className="section-list">{sections.map((schoolClass) => <Link href={`/school/classes?class=${schoolClass.id}`} className="section-row" key={schoolClass.id}><span className="section-badge">{schoolClass.name.replace(/^Grade\s*\d+\s*/i, "").replace(/^Class\s*/i, "") || schoolClass.name.slice(0, 2)}</span><span className="section-main"><b>{schoolClass.name}</b><small>{schoolClass.classTeacher?.name ?? "No class teacher assigned"}</small></span><span className="section-count">{schoolClass._count.students}</span><span className="chevron">›</span></Link>)}</div></article>)}</div>}</section>

        <section className="student-register-card"><div className="section-head"><div><div className="eyebrow">Learner directory</div><h3>Students at a glance</h3><p>Every learner shows their photo, system-generated index number, class and performance before opening the profile.</p></div><div className="head-links"><Link href="/school/students?view=unassigned">Needs placement ({unassigned.length})</Link><Link href="/school/students?view=active">Active students</Link></div></div><div className="student-toolbar"><input aria-label="Search students" placeholder="Search name or index number"/><select aria-label="Filter by class" defaultValue="all"><option value="all">All classes</option>{data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}</select><select aria-label="Filter by status" defaultValue="active"><option value="active">Active</option><option value="all">All statuses</option><option value="inactive">Inactive</option></select><button type="button" className="button secondary">Filter</button></div>{data.students.length === 0 ? <div className="register-empty"><strong>Your student register is empty.</strong><p>Once you create a class, add the first learner and capture their photo, SukuuNova will build the directory automatically.</p><a href="#add-student" className="text-link">Add first student →</a></div> : <div className="student-card-grid">{data.students.map((student) => { const avg = performance.get(student.id); const primaryGuardian = student.guardians.find((g) => g.isPrimary) ?? student.guardians[0]; return <Link href={`/school/students/${student.id}`} className="student-card" key={student.id}><div className="student-card-photo">{student.photoUrl ? <img src={student.photoUrl} alt="" /> : <span>{student.name.slice(0, 2).toUpperCase()}</span>}</div><div className="student-card-main"><div className="student-card-top"><span className="student-index">{student.admissionNo}</span><span className={`pill ${student.status === "active" ? "success" : "muted"}`}>{student.status}</span></div><h4>{student.name}</h4><p>{student.class?.level ?? "No grade"} · {student.class?.name ?? "Needs placement"}</p><div className="student-mini-stats"><span><b>{avg == null ? "—" : `${avg.toFixed(1)}%`}</b><small>Average</small></span><span><b>{attendanceCounts.get(student.id) ?? 0}</b><small>Attendance</small></span><span><b>{primaryGuardian?.guardian.name ?? "—"}</b><small>Primary contact</small></span></div></div><span className="student-card-arrow">→</span></Link>; })}</div>}</section>

        <section className="student-lower-grid"><article className="setup-card"><div className="eyebrow">Complete learner onboarding</div><h3>Capture what matters without overwhelming the operator.</h3><div className="onboarding-flow"><div><span>01</span><b>Identity</b><small>Full name and date of birth</small></div><div><span>02</span><b>Photo</b><small>Live camera or upload</small></div><div><span>03</span><b>Placement</b><small>Grade and class group</small></div><div><span>04</span><b>Family</b><small>Primary guardian contact</small></div><div><span>05</span><b>Connected records</b><small>Attendance, results and fees</small></div></div></article><article className="insight-card"><div className="eyebrow">Learner intelligence</div><h3>Performance should be visible before you open the profile.</h3><p>As assessments and attendance are entered, the directory can surface each learner's average score, attendance activity, fee state and alerts so staff can spot students who need attention quickly.</p><div className="insight-links"><Link href="/school/attendance">Attendance <span>→</span></Link><Link href="/school/gradebook">Academic results <span>→</span></Link><Link href="/school/fees">Fees & balances <span>→</span></Link><Link href="/school/report-cards">Report cards <span>→</span></Link></div></article></section>

        <section id="add-student" className="student-onboarding-card"><div className="onboarding-header"><div><div className="eyebrow">New learner</div><h3>Add a student</h3><p>The system generates the Index Number automatically. Staff should not type or edit it.</p></div><span className="index-badge">AUTO INDEX</span></div><form action={createStudent} className="student-onboarding-form"><div className="form-column"><div className="form-section-title"><span>1</span><div><b>Identity & placement</b><small>Enough information to establish the learner record.</small></div></div><div className="field-grid"><label>Student full name *<input name="name" required placeholder="e.g. Ama Mensah" /></label><label>Date of birth<input name="dob" type="date" /></label><label>Class group<select name="classId" defaultValue=""><option value="">Leave unassigned</option>{data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}</select></label><div className="generated-index"><span>System-generated index number</span><strong>Created automatically</strong><small>Format: SN-{new Date().getFullYear()}-######</small></div></div></div><div className="form-column"><div className="form-section-title"><span>2</span><div><b>Student photo</b><small>Take it directly on a phone or laptop, or upload an existing passport photo.</small></div></div><StudentPhotoCapture /></div><div className="form-column"><div className="form-section-title"><span>3</span><div><b>Primary parent / guardian</b><small>Used later for alerts, receipts, communication and parent access.</small></div></div><div className="field-grid"><label>Guardian name<input name="guardianName" placeholder="e.g. Akosua Mensah" /></label><label>Guardian phone / WhatsApp<input name="guardianPhone" inputMode="tel" placeholder="024 000 0000" /></label><label>Relationship<select name="guardianRelationship" defaultValue="Parent"><option>Parent</option><option>Mother</option><option>Father</option><option>Guardian</option><option>Other</option></select></label></div></div><div className="form-submit"><div><b>Ready to create</b><small>The photo and details become part of the learner's permanent school record.</small></div><button className="button primary" type="submit">Create student & generate index →</button></div></form></section>
      </div>
    </AppShell>
  );
}
