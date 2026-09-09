import Link from "next/link";
import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { IdCard } from "lucide-react";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { StudentDirectory } from "@/components/students/StudentDirectory";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { cachedSchoolRead } from "@/lib/school-cache";
import { requirePermission } from "@/lib/rbac";
import "./students-simple.css";
import "@/components/students/add-student-dialog.css";

type StudentActionState = { message: string | null };

function createIndexNumber() {
  const year = new Date().getFullYear();
  return `SN-${year}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
}

async function getStudentsPageData(schoolId: string) {
  return cachedSchoolRead(schoolId, "students-page", () => withTenant(schoolId, async (tx) => {
    const [school, classes, students] = await Promise.all([
      tx.school.findUnique({ where: { id: schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.student.findMany({ orderBy: [{ name: "asc" }], take: 250, select: { id: true, name: true, admissionNo: true, dob: true, status: true, photoUrl: true, class: { select: { id: true, name: true, level: true } }, _count: { select: { attendanceEvents: true, reportCards: true, invoices: true } } } }),
    ]);
    return { school, classes, students };
  }), 30);
}

async function createStudent(_previousState: StudentActionState, formData: FormData): Promise<StudentActionState> {
  "use server";
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const dobRaw = String(formData.get("dob") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  const guardianName = String(formData.get("guardianName") ?? "").trim();
  const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();
  const guardianRelationship = String(formData.get("guardianRelationship") ?? "Parent/Guardian").trim() || "Parent/Guardian";
  const photoData = String(formData.get("photoData") ?? "").trim();
  try {
    if (!name) throw new Error("Student name is required.");
    if (photoData && (!photoData.startsWith("data:image/") || photoData.length > 800_000)) throw new Error("Student photo is invalid or too large. Capture a smaller photo and try again.");
    if (guardianPhone && !guardianName) throw new Error("Enter the guardian name when providing a guardian phone number.");
    await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "students:write");
      if (classId) {
        const schoolClass = await tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true } });
        if (!schoolClass) throw new Error("The selected class does not belong to this school.");
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
      if (guardianName && guardianPhone) {
        const guardian = await tx.guardian.upsert({ where: { schoolId_phone: { schoolId: session.schoolId, phone: guardianPhone } }, update: { name: guardianName }, create: { schoolId: session.schoolId, name: guardianName, phone: guardianPhone } });
        await tx.studentGuardian.create({ data: { schoolId: session.schoolId, studentId: student.id, guardianId: guardian.id, relationship: guardianRelationship, isPrimary: true } });
      }
      await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "student.created", entityType: "Student", entityId: student.id, after: { name, indexNumber, classId: classId || null, guardianLinked: Boolean(guardianName && guardianPhone), photoCaptured: Boolean(photoData) } } });
    });
    revalidatePath("/school/students");
  } catch (error) {
    console.error("Student registration action failed", error);
    return { message: error instanceof Error && error.message ? error.message : "Student registration could not be completed. Nothing was saved. Please try again." };
  }
  redirect("/school/students");
}

export default async function StudentsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    return getStudentsPageData(session.schoolId);
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
    <AppShell universe="school" title="Students" subtitle="Find a learner, open their record or add a new student." active="Students" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="students-simple">
        <section className="students-simple-head">
          <div>
            <h2>Student register</h2>
            <p>Search the register first. Open a learner only when you need the full record.</p>
          </div>
          <div className="students-simple-actions">
            <Link href="/school/id-cards" className="button secondary"><IdCard size={15} aria-hidden="true" /> ID cards</Link>
            <AddStudentDialog classes={data.classes} action={createStudent} />
          </div>
        </section>

        <section className="students-simple-stats" aria-label="Student register summary">
          <div className="students-simple-stat"><span>Active learners</span><strong>{activeCount}</strong></div>
          <div className="students-simple-stat"><span>In a class</span><strong>{assignedCount}</strong></div>
          <div className="students-simple-stat"><span>Needs placement</span><strong>{unassigned.length}</strong></div>
        </section>

        <section className="students-simple-section">
          <div className="students-simple-section-head">
            <div><h3>Learners</h3><p>Search by name or index number, then narrow by class or status.</p></div>
          </div>
          <StudentDirectory students={data.students} classes={data.classes} />
        </section>

        <details className="sn-progressive">
          <summary>Classes and placement</summary>
          <div className="sn-progressive-body">
            {data.classes.length ? (
              <div className="students-class-grid">
                {Object.entries(grouped).map(([level, sections]) => (
                  <div className="students-class-card" key={level}>
                    <div className="students-class-card-head"><strong>{level}</strong><span>{sections.reduce((sum, item) => sum + item._count.students, 0)} learners</span></div>
                    <div className="students-class-links">
                      {sections.map((schoolClass) => <Link href={`/school/classes?class=${schoolClass.id}`} key={schoolClass.id}><span>{schoolClass.name}</span><strong>{schoolClass._count.students} →</strong></Link>)}
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="student-directory-empty"><strong>No classes created yet.</strong><span>Create the academic class structure before placing learners.</span></div>}
          </div>
        </details>

        <details className="sn-progressive">
          <summary>More student administration</summary>
          <div className="sn-progressive-body students-tools">
            <Link href="/school/classes"><strong>Classes & houses</strong><span>Manage class structure →</span></Link>
            <Link href="/school/guardians"><strong>Guardians</strong><span>Review family links →</span></Link>
            <Link href="/school/id-cards"><strong>School ID cards</strong><span>Issue and print credentials →</span></Link>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
