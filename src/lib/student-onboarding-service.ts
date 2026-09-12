import { randomInt } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { appendSchoolAudit } from "./audit";
import { withTenant, type TenantDb } from "./db";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";

export const STUDENT_ENTRY_TYPES = ["New enrollment", "Transfer in", "Re-enrollment", "Returning learner"] as const;
export type StudentEntryType = (typeof STUDENT_ENTRY_TYPES)[number];

type GuardianInput = {
  name: string;
  phone: string;
  relationship?: string;
};

type PlacementInput = {
  termId: string;
  classId: string;
  notes?: string | null;
};

export type StudentOnboardingInput = {
  schoolId: string;
  actorId: string;
  name: string;
  admissionNo?: string | null;
  dob?: Date | null;
  intakeAcademicYearId: string;
  admissionDate?: Date | null;
  entryType?: StudentEntryType;
  photoUrl?: string | null;
  guardian?: GuardianInput | null;
  placement?: PlacementInput | null;
  auditSource?: string | null;
};

function generatedAdmissionNo(referenceDate?: Date | null) {
  const year = (referenceDate ?? new Date()).getUTCFullYear();
  return `SN-${year}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
}

function enrollmentEntryType(entryType: StudentEntryType) {
  if (entryType === "Transfer in") return "transfer";
  if (entryType === "Re-enrollment" || entryType === "Returning learner") return "returning";
  return "new";
}

function validatePhoto(photoUrl?: string | null) {
  if (!photoUrl) return;
  if (photoUrl.startsWith("data:image/")) {
    if (photoUrl.length > 800_000) throw new AppError("Student photo is too large. Capture it again.", 400, "STUDENT_PHOTO_TOO_LARGE");
    return;
  }
  if (photoUrl.length > 2_000 || !/^https?:\/\//i.test(photoUrl)) {
    throw new AppError("Student photo must be a valid image capture or web URL.", 400, "STUDENT_PHOTO_INVALID");
  }
}

export async function onboardStudentInTransaction(tx: TenantDb, input: StudentOnboardingInput) {
  await requirePermission(tx, input.actorId, "students:write");
  const name = input.name.trim();
  if (!name) throw new AppError("Student name is required.", 400, "NAME_REQUIRED");
  if (!input.intakeAcademicYearId) throw new AppError("Choose the academic year in which the learner joined the school.", 400, "INTAKE_YEAR_REQUIRED");
  const entryType = input.entryType ?? "New enrollment";
  if (!(STUDENT_ENTRY_TYPES as readonly string[]).includes(entryType)) throw new AppError("Choose a valid student entry type.", 400, "ENTRY_TYPE_INVALID");
  validatePhoto(input.photoUrl);

  const intakeYear = await tx.academicYear.findFirst({
    where: { id: input.intakeAcademicYearId, schoolId: input.schoolId },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!intakeYear) throw new AppError("The selected intake academic year does not belong to this school.", 400, "INTAKE_YEAR_NOT_FOUND");
  if (input.admissionDate && (input.admissionDate < intakeYear.startDate || input.admissionDate > intakeYear.endDate)) {
    throw new AppError(`Admission date must fall inside ${intakeYear.name}.`, 400, "ADMISSION_DATE_OUTSIDE_INTAKE_YEAR");
  }

  let placementTerm: { id: string; academicYearId: string; name: string; isLocked: boolean } | null = null;
  let placementClass: { id: string; name: string } | null = null;
  if (input.placement?.termId || input.placement?.classId) {
    if (!input.placement?.termId || !input.placement?.classId) throw new AppError("Both placement term and class are required together.", 400, "PLACEMENT_INCOMPLETE");
    [placementTerm, placementClass] = await Promise.all([
      tx.term.findFirst({ where: { id: input.placement.termId, schoolId: input.schoolId }, select: { id: true, academicYearId: true, name: true, isLocked: true } }),
      tx.class.findFirst({ where: { id: input.placement.classId, schoolId: input.schoolId }, select: { id: true, name: true } }),
    ]);
    if (!placementTerm) throw new AppError("The selected placement term does not belong to this school.", 400, "PLACEMENT_TERM_NOT_FOUND");
    if (placementTerm.isLocked) throw new AppError("The selected placement term is locked.", 409, "PLACEMENT_TERM_LOCKED");
    if (!placementClass) throw new AppError("The selected class does not belong to this school.", 400, "PLACEMENT_CLASS_NOT_FOUND");
  }

  const guardian = input.guardian
    ? { name: input.guardian.name.trim(), phone: input.guardian.phone.trim(), relationship: input.guardian.relationship?.trim() || "Parent/Guardian" }
    : null;
  if (guardian && (!guardian.name || !guardian.phone)) throw new AppError("Guardian name and phone number are required together.", 400, "GUARDIAN_INCOMPLETE");

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-registration:${input.schoolId}`}))`;

  let admissionNo = input.admissionNo?.trim() || generatedAdmissionNo(input.admissionDate);
  if (!input.admissionNo) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const exists = await tx.student.findFirst({ where: { schoolId: input.schoolId, admissionNo }, select: { id: true } });
      if (!exists) break;
      admissionNo = generatedAdmissionNo(input.admissionDate);
    }
  }
  if (!admissionNo) throw new AppError("Admission number is required.", 400, "ADMISSION_NUMBER_REQUIRED");

  let student;
  try {
    student = await tx.student.create({
      data: {
        schoolId: input.schoolId,
        admissionNo,
        name,
        dob: input.dob ?? null,
        classId: placementClass?.id ?? null,
        status: "active",
        photoUrl: input.photoUrl || null,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new AppError("A learner with this admission number already exists in this school.", 409, "DUPLICATE_ADMISSION_NO");
    throw error;
  }

  await tx.$executeRaw`
    INSERT INTO "StudentAcademicIntake"
      ("schoolId","studentId","academicYearId","admissionDate","entryType","createdBy")
    VALUES
      (${input.schoolId},${student.id},${intakeYear.id},${input.admissionDate ?? null},${entryType},${input.actorId})
  `;

  let guardianId: string | null = null;
  if (guardian) {
    const guardianRow = await tx.guardian.upsert({
      where: { schoolId_phone: { schoolId: input.schoolId, phone: guardian.phone } },
      update: { name: guardian.name },
      create: { schoolId: input.schoolId, name: guardian.name, phone: guardian.phone },
    });
    guardianId = guardianRow.id;
    await tx.studentGuardian.create({ data: { schoolId: input.schoolId, studentId: student.id, guardianId: guardianRow.id, relationship: guardian.relationship, isPrimary: true } });
  }

  const houses = await tx.house.findMany({ where: { schoolId: input.schoolId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  let house: { id: string; name: string } | null = null;
  if (houses.length) {
    const grouped = await tx.student.groupBy({ by: ["houseId"], where: { schoolId: input.schoolId, status: "active", houseId: { not: null } }, _count: { _all: true } });
    const counts = new Map(houses.map((item) => [item.id, grouped.find((row) => row.houseId === item.id)?._count._all ?? 0]));
    house = [...houses].sort((a, b) => (counts.get(a.id)! - counts.get(b.id)!) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0] ?? null;
    if (house) await tx.student.update({ where: { id: student.id }, data: { houseId: house.id } });
  }

  let enrollmentId: string | null = null;
  if (placementTerm && placementClass && input.placement) {
    enrollmentId = createId();
    const notes = input.placement.notes?.trim() || "Confirmed automatically during learner registration.";
    await tx.$executeRaw`
      INSERT INTO "Enrollment"
        ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","startDate","guardianVerified","documentsReady","feeReady","notes","createdBy")
      VALUES
        (${enrollmentId},${input.schoolId},${student.id},${placementTerm.academicYearId},${placementTerm.id},${placementClass.id},'confirmed',${enrollmentEntryType(entryType)},${input.admissionDate ?? null},${Boolean(guardianId)},true,true,${notes},${input.actorId})
    `;
  }

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "student.created",
    entityType: "Student",
    entityId: student.id,
    after: {
      name,
      admissionNo,
      currentClassId: placementClass?.id ?? null,
      intakeAcademicYearId: intakeYear.id,
      intakeAcademicYear: intakeYear.name,
      admissionDate: input.admissionDate?.toISOString().slice(0, 10) ?? null,
      entryType,
      guardianId,
      photoCaptured: Boolean(input.photoUrl),
      houseId: house?.id ?? null,
      houseName: house?.name ?? null,
      placementEnrollmentId: enrollmentId,
      placementTermId: placementTerm?.id ?? null,
      placementTermName: placementTerm?.name ?? null,
      placementClassId: placementClass?.id ?? null,
      placementClassName: placementClass?.name ?? null,
      enrollmentStatus: enrollmentId ? "confirmed" : null,
      source: input.auditSource ?? "students",
    },
  });

  return { student: { ...student, houseId: house?.id ?? null }, intakeYear, guardianId, house, enrollmentId, placementTerm, placementClass };
}

export async function onboardStudent(input: StudentOnboardingInput) {
  return withTenant(input.schoolId, (tx) => onboardStudentInTransaction(tx, input));
}
