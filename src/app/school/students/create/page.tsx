import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { ensureIdentityCardsForSchool } from "@/lib/identity-card-service";
import "@/app/school/students/students-workspace.css";
import "@/components/students/add-student-dialog.css";
import "@/app/school/students/students-light-overrides.css";

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
  const guardianRelationship = String(formData.get("guardianRelationship") ?? "Parent").trim() || "Parent";
  const photoData = String(formData.get("photoData") ?? "").trim();

  if (!name) throw new Error("Student name is required.");
  if (photoData && (!photoData.startsWith("data:image/") || photoData.length > 1_000_000)) throw new Error("Student photo is invalid or too large.");
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
      const exists = await tx.student.findFirst({ where: { schoolId: session.schoolId, admissionNo: indexNumber }, select: { id: true } });
      if (!exists) break;
      indexNumber = createIndexNumber();
    }

    const student = await tx.student.create({ data: { schoolId: session.schoolId, name, admissionNo: indexNumber, dob: dobRaw ? new Date(`${dobRaw}T00:00:00.000Z`) : null, classId: classId || null, status: "active", photoUrl: photoData || null } });

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

    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { uniqueCode: true } });
    if (!school?.uniqueCode) throw new Error("School identity configuration is incomplete.");
    await ensureIdentityCardsForSchool(tx, session.schoolId, school.uniqueCode, session.userId);

    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "student.created", entityType: "Student", entityId: student.id, after: { name, indexNumber, classId: classId || null, houseId: house?.id ?? null, houseName: house?.name ?? null, guardianLinked: Boolean(guardianName && guardianPhone), photoCaptured: Boolean(photoData) } } });
  });
  redirect("/school/students");
}

export default async function CreateStudentPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, classes] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
    ]);
    return { school, classes };
  });

  return <AppShell universe="school" title="Add student" subtitle="Guided learner admission" active="Students" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}><div style={{ minHeight: "calc(100vh - 120px)", display: "grid", placeItems: "center", padding: "24px" }}><AddStudentDialog classes={data.classes} action={createStudent} initialOpen /></div></AppShell>;
}
