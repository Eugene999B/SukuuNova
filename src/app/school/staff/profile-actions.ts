"use server";

import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { isSchoolStaffAccount } from "@/lib/authorization";
import { normalizeGender } from "@/lib/demographics";
import { getStaffProfile, upsertStaffProfile, type StaffProfileInput } from "@/lib/staff-profile-service";
import { createStaff, type StaffCreateResult } from "./actions";

export type StaffProfileSaveResult = { ok: true; message: string } | { ok: false; message: string };

const EMPLOYMENT_STATUSES = new Set(["active", "on_leave", "inactive", "terminated"]);
const EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "temporary", "intern", "nss", "other"]);

function normalizePhone(value: unknown) {
  return String(value ?? "").trim().replace(/[\s()-]+/g, "");
}

function clean(value: unknown, max: number) {
  const next = String(value ?? "").trim();
  return next ? next.slice(0, max) : null;
}

function staffNumber(value: unknown) {
  const next = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  if (!next) return null;
  if (!/^[A-Z0-9][A-Z0-9/_-]{1,47}$/.test(next)) throw new Error("Staff number may contain letters, numbers, hyphens, slashes and underscores only.");
  return next;
}

function optionalDate(value: unknown, label: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${label} must be a valid date.`);
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new Error(`${label} must be a valid date.`);
  return parsed;
}

function profileInput(formData: FormData, schoolId: string, userId: string, actorId: string, requireGender: boolean): StaffProfileInput {
  const gender = normalizeGender(formData.get("gender"));
  if (requireGender && !gender) throw new Error("Choose the staff member's gender.");
  const dob = optionalDate(formData.get("dob"), "Date of birth");
  const dateJoined = optionalDate(formData.get("dateJoined"), "Date joined");
  if (dob && dob > new Date()) throw new Error("Date of birth cannot be in the future.");
  if (dateJoined && dateJoined > new Date(Date.now() + 24 * 60 * 60 * 1000)) throw new Error("Date joined cannot be in the future.");

  const emergencyContactName = clean(formData.get("emergencyContactName"), 180);
  const emergencyContactPhone = normalizePhone(formData.get("emergencyContactPhone")) || null;
  if ((emergencyContactName && !emergencyContactPhone) || (!emergencyContactName && emergencyContactPhone)) {
    throw new Error("Emergency contact name and phone number must be provided together.");
  }
  if (emergencyContactPhone && !/^\+?[0-9]{8,15}$/.test(emergencyContactPhone)) throw new Error("Enter a valid emergency contact phone number.");

  const employmentStatusRaw = String(formData.get("employmentStatus") ?? "active").trim();
  const employmentStatus = EMPLOYMENT_STATUSES.has(employmentStatusRaw) ? employmentStatusRaw as StaffProfileInput["employmentStatus"] : "active";
  const employmentTypeRaw = String(formData.get("employmentType") ?? "").trim();
  const employmentType = EMPLOYMENT_TYPES.has(employmentTypeRaw) ? employmentTypeRaw as StaffProfileInput["employmentType"] : null;
  const staffTypeRaw = String(formData.get("staffType") ?? "").trim();
  const staffType = staffTypeRaw === "teaching" || staffTypeRaw === "non-teaching" ? staffTypeRaw : null;

  return {
    schoolId,
    userId,
    actorId,
    staffNumber: staffNumber(formData.get("staffNumber")),
    gender,
    dob,
    nationality: clean(formData.get("nationality"), 120),
    dateJoined,
    staffType,
    staffCategory: clean(formData.get("staffCategory"), 160),
    jobTitle: clean(formData.get("jobTitle"), 160) || clean(formData.get("role"), 160),
    department: clean(formData.get("department"), 160),
    employmentStatus,
    employmentType,
    highestQualification: clean(formData.get("highestQualification"), 240),
    professionalQualification: clean(formData.get("professionalQualification"), 240),
    residentialAddress: clean(formData.get("residentialAddress"), 600),
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelationship: clean(formData.get("emergencyContactRelationship"), 100),
    notes: clean(formData.get("notes"), 1200),
  };
}

export async function createStaffWithProfile(formData: FormData): Promise<StaffCreateResult> {
  const gender = normalizeGender(formData.get("gender"));
  if (!gender) return { ok: false, message: "Choose the staff member's gender." };
  try {
    optionalDate(formData.get("dob"), "Date of birth");
    optionalDate(formData.get("dateJoined"), "Date joined");
    staffNumber(formData.get("staffNumber"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Check the personnel details." };
  }

  const result = await createStaff(formData);
  if (!result.ok) return result;

  const session = await requireSchoolSession();
  const phone = normalizePhone(formData.get("phone"));
  try {
    await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "users:write");
      const user = await tx.user.findFirst({
        where: { schoolId: session.schoolId, phone },
        select: { id: true, userRoles: { select: { role: { select: { name: true, key: true } } } } },
      });
      if (!user || !isSchoolStaffAccount(user.userRoles.map(({ role }) => role))) throw new Error("The new staff account could not be resolved for its personnel profile.");
      const before = await getStaffProfile(tx, session.schoolId, user.id);
      const after = await upsertStaffProfile(tx, profileInput(formData, session.schoolId, user.id, session.userId, true));
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "staff_profile.initialized",
        entityType: "StaffProfile",
        entityId: after.id,
        before,
        after,
      });
    });
    return { ...result, message: `${result.message} Personnel and demographic details were saved too.` };
  } catch (error) {
    console.error("Staff personnel profile initialization failed after account creation", error);
    return {
      ...result,
      message: `${result.message} The login was created, but some personnel details could not be saved. Open the staff member's Personnel page to complete them.`,
    };
  }
}

export async function updateStaffProfile(formData: FormData): Promise<StaffProfileSaveResult> {
  const session = await requireSchoolSession();
  const userId = String(formData.get("staffId") ?? "").trim();
  if (!userId) return { ok: false, message: "Staff member is required." };
  try {
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "users:write");
      const user = await tx.user.findFirst({
        where: { id: userId, schoolId: session.schoolId },
        select: { id: true, name: true, userRoles: { select: { role: { select: { name: true, key: true } } } } },
      });
      if (!user || !isSchoolStaffAccount(user.userRoles.map(({ role }) => role))) return { ok: false as const, message: "Staff member not found." };
      const before = await getStaffProfile(tx, session.schoolId, userId);
      const after = await upsertStaffProfile(tx, profileInput(formData, session.schoolId, userId, session.userId, false));
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "staff_profile.updated",
        entityType: "StaffProfile",
        entityId: after.id,
        before,
        after,
      });
      return { ok: true as const, message: `${user.name}'s personnel profile was updated.` };
    });
  } catch (error) {
    const dbCode = (error as { code?: string }).code;
    if (dbCode === "23505") return { ok: false, message: "That staff number is already assigned to another staff member." };
    return { ok: false, message: error instanceof Error && error.message ? error.message : "The personnel profile could not be saved." };
  }
}
