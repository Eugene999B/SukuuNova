import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import "@/app/school/students/students-workspace.css";
import "@/components/students/add-student-dialog.css";
import "@/app/school/students/students-light-overrides.css";

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
  const guardianRelationship = String(formData.get("guardianRelationship") ?? "Parent").trim() || "Parent";
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
        const exists = await tx.student.findFirst({ where: { schoolId: session.schoolId, admissionNo: indexNumber }, select: { id: true } });
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

      const houses = await tx.house.findMany({ where: { schoolId: session.schoolId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
      let house = null as { id: string; name: string } | null;
      if (houses.length) {
        const grouped = await tx.student.groupBy({ by: ["houseId"], where: { schoolId: session.schoolId, status: "active", houseId: { not: null } }, _count: { _all: true } });
        const counts = new Map(houses.map((item) => [item.id, grouped.find((row) => row.houseId === item.id)?._count._all ?? 0]));
        house = [...houses].sort((a, b) => (counts.get(a.id)! - counts.get(b.id)!) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0] ?? null;
        if (house) await tx.student.update({ where: { id: student.id }, data: { houseId: house.id } });
      }

      await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "student.created", entityType: "Student", entityId: student.id, after: { name, indexNumber, classId: classId || null, houseId: house?.id ?? null, houseName: house?.name ?? null, intakeAcademicYearId, intakeAcademicYear: intakeYear.name, admissionDate: admissionDateRaw || null, entryType, guardianLinked: Boolean(guardianName && guardianPhone), photoCaptured: Boolean(photoData) } } });
    });
    revalidatePath("/school/students");
  } catch (error) {
    console.error("Student registration action failed", error);
    return { message: error instanceof Error && error.message ? error.message : "Student registration could not be completed. Nothing was saved. Please try again." };
  }
  redirect("/school/students");
}

export default async function CreateStudentPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, classes, academicYears] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.academicYear.findMany({ where: { schoolId: session.schoolId }, orderBy: { startDate: "desc" }, select: { id: true, name: true, startDate: true, endDate: true } }),
    ]);
    const now = new Date();
    return { school, classes, academicYears: academicYears.map((year) => ({ id: year.id, name: year.name, isCurrent: year.startDate <= now && year.endDate >= now })) };
  });

  return <AppShell universe="school" title="Add student" subtitle="Guided learner admission" active="Students" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}><div style={{ minHeight: "calc(100vh - 120px)", display: "grid", placeItems: "center", padding: "24px" }}><AddStudentDialog classes={data.classes} academicYears={data.academicYears} action={createStudent} initialOpen /></div></AppShell>;
}
