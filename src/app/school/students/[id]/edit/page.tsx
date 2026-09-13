import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { normalizeGender } from "@/lib/demographics";
import { ProductPageHeader } from "@/components/product/ProductWorkspace";
import { StudentEditForm } from "@/components/product/StudentEditForm";
import "@/components/product/product-workspace.css";

const STATUSES = ["active", "pending", "graduated", "withdrawn", "archived"] as const;

async function saveStudent(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const dob = String(formData.get("dob") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  const houseId = String(formData.get("houseId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const genderRaw = String(formData.get("gender") ?? "").trim();
  const gender = normalizeGender(genderRaw);
  if (!id || !name) throw new Error("Student name is required.");
  if (name.length > 120) throw new Error("Student name is too long.");
  if (genderRaw && !gender) throw new Error("Choose a valid gender.");
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) throw new Error("Invalid status.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    const [before, beforeGender] = await Promise.all([
      tx.student.findFirst({ where: { id, schoolId: session.schoolId }, select: { id: true, name: true, dob: true, classId: true, houseId: true, status: true } }),
      tx.$queryRawUnsafe<Array<{ gender: string | null }>>(`SELECT "gender" FROM "Student" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, id, session.schoolId),
    ]);
    if (!before) throw new Error("Student not found.");
    if (classId && !(await tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true } }))) {
      throw new Error("Selected class does not belong to this school.");
    }
    if (houseId && !(await tx.house.findFirst({ where: { id: houseId, schoolId: session.schoolId }, select: { id: true } }))) {
      throw new Error("Selected house does not belong to this school.");
    }
    const after = await tx.student.update({
      where: { id },
      data: { name, dob: dob ? new Date(`${dob}T00:00:00.000Z`) : null, classId: classId || null, houseId: houseId || null, status },
      select: { id: true, name: true, dob: true, classId: true, houseId: true, status: true },
    });
    await tx.$executeRawUnsafe(`UPDATE "Student" SET "gender"=$3 WHERE "id"=$1 AND "schoolId"=$2`, id, session.schoolId, gender);
    await tx.auditLogSchool.create({
      data: {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "student.updated",
        entityType: "Student",
        entityId: id,
        before: { ...before, gender: beforeGender[0]?.gender ?? null },
        after: { ...after, gender },
      },
    });
  });
  redirect(`/school/students/${encodeURIComponent(id)}`);
}

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, student, genderRows, classes, houses] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.student.findFirst({ where: { id, schoolId: session.schoolId }, select: { id: true, name: true, admissionNo: true, dob: true, status: true, classId: true, houseId: true } }),
      tx.$queryRawUnsafe<Array<{ gender: string | null }>>(`SELECT "gender" FROM "Student" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, id, session.schoolId),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.house.findMany({ where: { schoolId: session.schoolId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    ]);
    return { school, student, gender: genderRows[0]?.gender ?? null, classes, houses };
  });
  if (!data.student || !data.school) notFound();

  return (
    <AppShell
      universe="school"
      title={`Edit ${data.student.name}`}
      subtitle="Structured learner record — identity, demographics, placement and enrolment. History is preserved."
      active="Students"
      schoolName={data.school.name}
      schoolCode={data.school.uniqueCode}
      userName={session.name}
    >
      <div className="product-workspace">
        <ProductPageHeader
          eyebrow={`Student record · ${data.student.admissionNo}`}
          title={`Edit ${data.student.name}`}
          description="Change only what needs to change. Demographic corrections and class/house moves keep academic history connected."
          backHref={`/school/students/${data.student.id}`}
          backLabel="Learner workspace"
          actions={<Link className="button secondary" href={`/school/students/${data.student.id}`}>Cancel</Link>}
        />
        <StudentEditForm
          studentId={data.student.id}
          admissionNo={data.student.admissionNo}
          initial={{
            name: data.student.name,
            gender: data.gender ?? "",
            dob: data.student.dob ? new Date(data.student.dob).toISOString().slice(0, 10) : "",
            classId: data.student.classId ?? "",
            houseId: data.student.houseId ?? "",
            status: data.student.status,
          }}
          classes={data.classes}
          houses={data.houses}
          action={saveStudent}
        />
      </div>
    </AppShell>
  );
}
