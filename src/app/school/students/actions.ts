"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchoolSession } from "@/lib/school-auth";
import { onboardStudent } from "@/lib/student-onboarding-service";
import { assertPortraitVerificationToken } from "@/lib/portrait-verification";

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
  const placementTermId = String(formData.get("placementTermId") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  const guardianName = String(formData.get("guardianName") ?? "").trim();
  const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();
  const guardianRelationship = String(formData.get("guardianRelationship") ?? "Parent/Guardian").trim() || "Parent/Guardian";
  const photoData = String(formData.get("photoData") ?? "").trim();
  const photoVerificationToken = String(formData.get("photoVerificationToken") ?? "").trim();

  try {
    if (!name) throw new Error("Student name is required.");
    if (!intakeAcademicYearId || !placementTermId) throw new Error("The school needs a current academic year and open term before students can be registered.");
    if (!classId) throw new Error("Choose the student's class. Registration places the student into that class immediately.");
    if (guardianPhone && !guardianName) throw new Error("Enter the guardian name when providing a guardian phone number.");
    if (guardianName && !guardianPhone) throw new Error("Enter the guardian phone number when providing a guardian name.");
    if (photoData) {
      assertPortraitVerificationToken({ token: photoVerificationToken, schoolId: session.schoolId, target: "student", image: photoData });
    }

    await onboardStudent({
      schoolId: session.schoolId,
      actorId: session.userId,
      name,
      dob: parseDateInput(dobRaw, "Date of birth"),
      intakeAcademicYearId,
      admissionDate: parseDateInput(admissionDateRaw, "Admission date"),
      entryType: "New enrollment",
      photoUrl: photoData || null,
      guardian: guardianName && guardianPhone ? { name: guardianName, phone: guardianPhone, relationship: guardianRelationship } : null,
      placement: { termId: placementTermId, classId },
      auditSource: "students_workspace",
    });

    revalidatePath("/school/students");
    revalidatePath("/school/classes");
  } catch (error) {
    console.error("Student registration action failed", error);
    return { message: error instanceof Error && error.message ? error.message : "Student registration could not be completed. Nothing was saved. Please try again." };
  }

  redirect("/school/students");
}
