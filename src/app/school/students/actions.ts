"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchoolSession } from "@/lib/school-auth";
import { onboardStudent, STUDENT_ENTRY_TYPES, type StudentEntryType } from "@/lib/student-onboarding-service";

export type StudentActionState = { message: string | null };

function parseDateInput(value: string, label: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be a valid calendar date.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid calendar date.`);
  }
  return date;
}

export async function createStudentAction(_previousState: StudentActionState, formData: FormData): Promise<StudentActionState> {
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const dobRaw = String(formData.get("dob") ?? "").trim();
  const intakeAcademicYearId = String(formData.get("intakeAcademicYearId") ?? "").trim();
  const admissionDateRaw = String(formData.get("admissionDate") ?? "").trim();
  const entryTypeRaw = String(formData.get("entryType") ?? "New enrollment").trim() || "New enrollment";
  const placementTermId = String(formData.get("placementTermId") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  const guardianName = String(formData.get("guardianName") ?? "").trim();
  const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();
  const guardianRelationship = String(formData.get("guardianRelationship") ?? "Parent/Guardian").trim() || "Parent/Guardian";
  const photoData = String(formData.get("photoData") ?? "").trim();

  try {
    if (!name) throw new Error("Student name is required.");
    if (!intakeAcademicYearId) throw new Error("Choose the academic year in which the learner joined the school.");
    if (!(STUDENT_ENTRY_TYPES as readonly string[]).includes(entryTypeRaw)) throw new Error("Choose a valid student entry type.");
    if (guardianPhone && !guardianName) throw new Error("Enter the guardian name when providing a guardian phone number.");
    if (guardianName && !guardianPhone) throw new Error("Enter the guardian phone number when providing a guardian name.");
    if ((placementTermId && !classId) || (classId && !placementTermId)) {
      throw new Error("Choose both a placement term and intended class, or leave both unassigned.");
    }

    await onboardStudent({
      schoolId: session.schoolId,
      actorId: session.userId,
      name,
      dob: parseDateInput(dobRaw, "Date of birth"),
      intakeAcademicYearId,
      admissionDate: parseDateInput(admissionDateRaw, "Admission date"),
      entryType: entryTypeRaw as StudentEntryType,
      photoUrl: photoData || null,
      guardian: guardianName && guardianPhone ? { name: guardianName, phone: guardianPhone, relationship: guardianRelationship } : null,
      placement: placementTermId && classId ? { termId: placementTermId, classId } : null,
      auditSource: "students_workspace",
    });

    revalidatePath("/school/students");
    revalidatePath("/school/admissions/enrolment");
  } catch (error) {
    console.error("Student registration action failed", error);
    return { message: error instanceof Error && error.message ? error.message : "Student registration could not be completed. Nothing was saved. Please try again." };
  }

  redirect("/school/students");
}
