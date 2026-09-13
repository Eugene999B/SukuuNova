import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import type { GenderValue } from "@/lib/demographics";

export type StaffProfileRow = {
  id: string;
  schoolId: string;
  userId: string;
  staffNumber: string;
  gender: GenderValue | null;
  dob: Date | null;
  nationality: string | null;
  dateJoined: Date | null;
  staffType: "teaching" | "non-teaching" | null;
  staffCategory: string | null;
  jobTitle: string | null;
  department: string | null;
  employmentStatus: "active" | "on_leave" | "inactive" | "terminated";
  employmentType: "full_time" | "part_time" | "contract" | "temporary" | "intern" | "nss" | "other" | null;
  highestQualification: string | null;
  professionalQualification: string | null;
  residentialAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StaffProfileInput = {
  schoolId: string;
  userId: string;
  actorId: string;
  staffNumber?: string | null;
  gender?: GenderValue | null;
  dob?: Date | null;
  nationality?: string | null;
  dateJoined?: Date | null;
  staffType?: "teaching" | "non-teaching" | null;
  staffCategory?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  employmentStatus?: "active" | "on_leave" | "inactive" | "terminated";
  employmentType?: "full_time" | "part_time" | "contract" | "temporary" | "intern" | "nss" | "other" | null;
  highestQualification?: string | null;
  professionalQualification?: string | null;
  residentialAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  notes?: string | null;
};

function clean(value?: string | null, max = 240) {
  const next = value?.trim() || null;
  if (!next) return null;
  return next.slice(0, max);
}

function generatedStaffNumber() {
  const year = new Date().getUTCFullYear();
  return `STF-${year}-${createId().slice(0, 6).toUpperCase()}`;
}

export async function getStaffProfile(tx: TenantDb, schoolId: string, userId: string) {
  const rows = await tx.$queryRawUnsafe<StaffProfileRow[]>(
    `SELECT * FROM "StaffProfile" WHERE "schoolId"=$1 AND "userId"=$2 LIMIT 1`,
    schoolId,
    userId,
  );
  return rows[0] ?? null;
}

export async function listStaffProfiles(tx: TenantDb, schoolId: string) {
  return tx.$queryRawUnsafe<StaffProfileRow[]>(
    `SELECT * FROM "StaffProfile" WHERE "schoolId"=$1 ORDER BY "staffNumber" ASC`,
    schoolId,
  );
}

export async function upsertStaffProfile(tx: TenantDb, input: StaffProfileInput) {
  const existing = await getStaffProfile(tx, input.schoolId, input.userId);
  const staffNumber = clean(input.staffNumber, 48)?.toUpperCase() || existing?.staffNumber || generatedStaffNumber();
  const rows = await tx.$queryRawUnsafe<StaffProfileRow[]>(
    `INSERT INTO "StaffProfile" (
       "id","schoolId","userId","staffNumber","gender","dob","nationality","dateJoined",
       "staffType","staffCategory","jobTitle","department","employmentStatus","employmentType",
       "highestQualification","professionalQualification","residentialAddress","emergencyContactName",
       "emergencyContactPhone","emergencyContactRelationship","notes","createdBy"
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
     )
     ON CONFLICT ("schoolId","userId") DO UPDATE SET
       "staffNumber"=EXCLUDED."staffNumber",
       "gender"=EXCLUDED."gender",
       "dob"=EXCLUDED."dob",
       "nationality"=EXCLUDED."nationality",
       "dateJoined"=EXCLUDED."dateJoined",
       "staffType"=COALESCE(EXCLUDED."staffType","StaffProfile"."staffType"),
       "staffCategory"=EXCLUDED."staffCategory",
       "jobTitle"=EXCLUDED."jobTitle",
       "department"=EXCLUDED."department",
       "employmentStatus"=EXCLUDED."employmentStatus",
       "employmentType"=EXCLUDED."employmentType",
       "highestQualification"=EXCLUDED."highestQualification",
       "professionalQualification"=EXCLUDED."professionalQualification",
       "residentialAddress"=EXCLUDED."residentialAddress",
       "emergencyContactName"=EXCLUDED."emergencyContactName",
       "emergencyContactPhone"=EXCLUDED."emergencyContactPhone",
       "emergencyContactRelationship"=EXCLUDED."emergencyContactRelationship",
       "notes"=EXCLUDED."notes",
       "updatedAt"=CURRENT_TIMESTAMP
     RETURNING *`,
    existing?.id ?? createId(),
    input.schoolId,
    input.userId,
    staffNumber,
    input.gender ?? null,
    input.dob ?? null,
    clean(input.nationality, 120),
    input.dateJoined ?? null,
    input.staffType ?? existing?.staffType ?? null,
    clean(input.staffCategory, 160),
    clean(input.jobTitle, 160),
    clean(input.department, 160),
    input.employmentStatus ?? existing?.employmentStatus ?? "active",
    input.employmentType ?? null,
    clean(input.highestQualification, 240),
    clean(input.professionalQualification, 240),
    clean(input.residentialAddress, 600),
    clean(input.emergencyContactName, 180),
    clean(input.emergencyContactPhone, 40),
    clean(input.emergencyContactRelationship, 100),
    clean(input.notes, 1200),
    existing?.createdBy ?? input.actorId,
  );
  return rows[0];
}
