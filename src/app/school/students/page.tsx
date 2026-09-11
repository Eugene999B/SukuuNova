import Link from "next/link";
import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { IdCard } from "lucide-react";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { StudentDirectory } from "@/components/students/StudentDirectory";
import { IdentityCardBatchActions } from "@/components/IdentityCardBatchActions";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { cachedSchoolRead } from "@/lib/school-cache";
import { hasPermission, requirePermission } from "@/lib/rbac";
import "./students-simple.css";
import "@/components/students/add-student-dialog.css";

type StudentActionState = { message: string | null };
const ENTRY_TYPES = new Set(["New enrollment", "Transfer in", "Re-enrollment", "Returning learner"]);

function createIndexNumber() {
  const year = new Date().getFullYear();
  return `SN-${year}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
}

function parseAdmissionDate(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Admission date must be a valid calendar date.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Admission date must be a valid calendar date.");
  return date;
}

async function getStudentsPageData(schoolId: string) {
  return cachedSchoolRead(schoolId, "students-page-v2", () => withTenant(schoolId, async (tx) => {
    const [school, classes, students, academicYears] = await Promise.all([
      tx.school.findUnique({ where: { id: schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.student.findMany({ orderBy: [{ name: "asc" }], take: 250, select: { id: true, name: true, admissionNo: true, dob: true, status: true, photoUrl: true, class: { select: { id: true, name: true, level: true } }, _count: { select: { attendanceEvents: true, reportCards: true, invoices: true } } } }),
      tx.academicYear.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, startDate: true, endDate: true } }),
    ]);
    const now = new Date();
    return { school, classes, students, academicYears: academicYears.map((year) => ({ id: year.id, name: year.name, isCurrent: year.startDate <= now && year.endDate >= now })) };
  }), 30);
}

async function createStudent(_previousState: StudentActionState, formData: FormData): Promise<StudentActionState> {
  "use server";
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const dobRaw = String(formData.get("dob") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  const intakeAcademicYearId = String(formData.get("intakeAcademicYearId") ?? "").trim();
  const admissionDateRaw = String(formData.get("admissionDate") ?? "").trim();
  const entryType = String(formData.get("entryType") ?? "New enrollment").trim() || "New enrollment";
  const guardianName = String(formData.get("guardianName") ?? "").trim();
  const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();
  const guardianRelationship = String(formData.get("guardianRelationship") ?? "Parent/Guardian").trim() || "Parent/Guardian";
  const photoData = String(formData.get("photoData") ?? "").trim();
  try {
    if (!name) throw new Error("Student name is required.");
    if (!intakeAcademicYearId) throw new Error("Choose the academic year in which the learner joined the school.");
    if (!ENTRY_TYPES.has(entryType)) throw new Error("Choose a valid student entry type.");
    if (photoData && (!photoData.startsWith("data:image/") || photoData.length > 800_000)) throw new Error("Student photo is invalid or too large. Capture the live photo again.");
    if (guardianPhone && !guardianName) throw new Error("Enter the guardian name when providing a guardian phone number.");
    const admissionDate = parseAdmissionDate(admissionDateRaw);
    await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "students:write");
      const [schoolClass, intakeYear] = await Promise.all([
        classId ? tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true } }) : Promise.resolve(null),
        tx.academicYear.findFirst({ where: { id: intakeAcademicYearId, schoolId: session.schoolId }, select: { id: true, name: true, startDate: true, endDate: true } }),
      ]);
      if (classId && !schoolClass) throw new Error("The selected class does not belong to this school.");
      if (!intakeYear) throw new Error("The selected intake academic year does not belong to this school.");
      if (admissionDate && (admissionDate < intakeYear.startDate || admissionDate > intakeYear.endDate)) {
        throw new Error(`Admission date must fall inside ${intakeYear.name}.`);
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-registration:${session.schoolId}`}))`;
      let indexNumber = createIndexNumber();
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const exists = await tx.student.findUnique({ where: { schoolId_admissionNo: { schoolId: session.schoolId, admissionNo: indexNumber } }, select: { id: true } });
        if (!exists) break;
        indexNumber = createIndexNumber();
      }
      let student;
      try {
        student = await tx.student.create({ data: { schoolId: session.schoolId, name, admissionNo: indexNumber, dob: dobRaw ? new Date(`${dobRaw}T00:00:00.000Z`) : null, classId: classId || null, status: "active", photoUrl: photoData || null } });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") throw new Error("A learner with this index number was just created. Try again.");
        throw error;
      }
      await tx.$executeRaw`INSERT INTO "StudentAcademicIntake" ("schoolId","studentId","academicYearId","admissionDate","entryType","createdBy") VALUES (${session.schoolId},${student.id},${intakeAcademicYearId},${admissionDate},${entryType},${session.userId})`;
      if (guardianName && guardianPhone) {
        const guardian = await tx.guardian.upsert({ where: { schoolId_phone: { schoolId: session.schoolId, phone: guardianPhone } }, update: { name: guardianName }, create: { schoolId: session.schoolId, name: guardianName, phone: guardianPhone } });
        await tx.studentGuardian.create({ data: { schoolId: session.schoolId, studentId: student.id, guardianId: guardian.id, relationship: guardianRelationship, isPrimary: true } });
      }
      await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "student.created", entityType: "Student", entityId: student.id, after: { name, indexNumber, classId: classId || null, intakeAcademicYearId, intakeAcademicYear: intakeYear.name, admissionDate: admissionDateRaw || null, entryType, guardianLinked: Boolean(guardianName && guardianPhone), photoCaptured: Boolean(photoData) } } });
    });
    revalidatePath("/school/students");
  } catch (error) {
    console.error("Student registration action failed", error);
    return { message: error instanceof Error && error.message ? error.message : "Student registration could not be completed. Nothing was saved. Please try again." };
  }
  redirect("/school/students");
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    return getStudentsPageData(session.schoolId);
  });
  const canManageCards = await withTenant(session.schoolId, (tx) => hasPermission(tx, session.userId, "identity_cards:manage").catch(() => false));
  const unassigned = data.students.filter((student) => !student.class);
  const assignedCount = data.students.length - unassigned.length;
  const activeCount = data.students.filter((student) => student.status === "active").length;
  const grouped = data.classes.reduce<Record<string, typeof data.classes>>((acc, item) => {
    const level = item.level?.trim() || "Other / ungraded";
    (acc[level] ??= []).push(item);
    return acc;
  }, {});
  const cardClasses = data.classes.map((schoolClass) => ({ id: schoolClass.id, name: `${schoolClass.level ?? ""} ${schoolClass.name}`.trim() }));

  return (
    <AppShell universe="school" title="Students" subtitle="Find a learner, open their record or add a new student." active="Students" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="students-simple">
        <section className="students-simple-head">
          <div><h2>Student register</h2><p>Search the register first. Open a learner for their full record and printable school ID.</p></div>
          <div className="students-simple-actions"><Link href="/school/id-cards" className="button secondary"><IdCard size={15} aria-hidden="true" /> ID cards</Link><AddStudentDialog classes={data.classes} academicYears={data.academicYears} action={createStudent} /></div>
        </section>
        {canManageCards ? <section className="students-simple-section"><div className="students-simple-section-head"><div><h3>Student identity cards</h3><p>Download the whole student body or choose one class for an A4 print pack. Every card includes the school brand and signed verification QR.</p></div></div><IdentityCardBatchActions mode="students" classes={cardClasses}/></section> : null}
        <section className="students-simple-stats" aria-label="Student register summary"><div className="students-simple-stat"><span>Active learners</span><strong>{activeCount}</strong></div><div className="students-simple-stat"><span>In a class</span><strong>{assignedCount}</strong></div><div className="students-simple-stat"><span>Needs placement</span><strong>{unassigned.length}</strong></div></section>
        <section className="students-simple-section"><div className="students-simple-section-head"><div><h3>Learners</h3><p>Search by name or index number, then narrow by class or status.</p></div></div><StudentDirectory students={data.students} classes={data.classes} initialClassId={params.classId} /></section>
        <details className="sn-progressive"><summary>Classes and placement</summary><div className="sn-progressive-body">{data.classes.length ? <div className="students-class-grid">{Object.entries(grouped).map(([level, sections]) => <div className="students-class-card" key={level}><div className="students-class-card-head"><strong>{level}</strong><span>{sections.reduce((sum, item) => sum + item._count.students, 0)} learners</span></div><div className="students-class-links">{sections.map((schoolClass) => <Link href={`/school/students?classId=${schoolClass.id}`} key={schoolClass.id}><span>{schoolClass.name}</span><strong>{schoolClass._count.students} →</strong></Link>)}</div></div>)}</div> : <div className="student-directory-empty"><strong>No classes created yet.</strong><span>Create the academic class structure before placing learners.</span></div>}</div></details>
        <details className="sn-progressive"><summary>More student administration</summary><div className="sn-progressive-body students-tools"><Link href="/school/classes"><strong>Classes & houses</strong><span>Manage class structure →</span></Link><Link href="/school/guardians"><strong>Guardians</strong><span>Review family links →</span></Link><Link href="/school/id-cards"><strong>School ID cards</strong><span>Issue and print credentials →</span></Link></div></details>
      </div>
    </AppShell>
  );
}
