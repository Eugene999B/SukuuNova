import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "./db";
import { ForbiddenError, NotFoundError } from "./errors";
import {
  getRecentClinicVisits,
  listClinicMedications,
  type ClinicDisposition,
  type ClinicPatientType,
} from "./clinic";

type ClinicActorProfile = {
  id: string;
  status: string;
  title: string;
  photoUrl: string | null;
};

function plainJson(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return JSON.stringify(value);
}

/**
 * A staff member may work in Clinic when RBAC grants the required clinic permission.
 * Nurse profiles add management metadata and an explicit suspension switch. If a
 * profile exists and is suspended, that suspension wins over inherited permissions.
 */
export async function assertClinicClinicalActor(tx: TenantDb, userId: string): Promise<ClinicActorProfile | null> {
  const profiles = await tx.$queryRawUnsafe<ClinicActorProfile[]>(
    `SELECT "id","status","title","photoUrl" FROM "ClinicNurseProfile" WHERE "userId"=$1 LIMIT 1`,
    userId,
  );
  const profile = profiles[0] ?? null;
  if (profile && profile.status !== "active") {
    throw new ForbiddenError("This nurse profile is suspended from clinical work.");
  }
  return profile;
}

export async function getClinicClinicalSnapshot(tx: TenantDb, userId: string) {
  const profile = await assertClinicClinicalActor(tx, userId);
  const [metrics] = await tx.$queryRawUnsafe<Array<{ visitsToday: bigint; followUpsToday: bigint; restingNow: bigint }>>(`
    SELECT
      COUNT(*) FILTER (WHERE ("startedAt" AT TIME ZONE 'Africa/Accra')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date) AS "visitsToday",
      COUNT(*) FILTER (WHERE "followUpAt" IS NOT NULL AND ("followUpAt" AT TIME ZONE 'Africa/Accra')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date) AS "followUpsToday",
      COUNT(*) FILTER (WHERE "disposition"='resting_in_clinic' AND ("startedAt" AT TIME ZONE 'Africa/Accra')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date) AS "restingNow"
    FROM "ClinicVisit"
  `);
  const recent = await getRecentClinicVisits(tx, 20);
  const medicines = await listClinicMedications(tx, 100);
  return {
    profile,
    metrics: {
      visitsToday: Number(metrics?.visitsToday ?? 0),
      followUpsToday: Number(metrics?.followUpsToday ?? 0),
      restingNow: Number(metrics?.restingNow ?? 0),
      lowStock: medicines.filter((item) => item.isLow).length,
    },
    recent,
    medicines,
  };
}

export async function createAuthorizedClinicVisit(tx: TenantDb, input: {
  actorId: string;
  patientType: ClinicPatientType;
  patientId: string;
  complaint: string;
  vitals?: Record<string, string | number | null>;
  tests?: Array<Record<string, unknown>>;
  assessment?: string | null;
  treatment?: string | null;
  prescriptions?: Array<Record<string, unknown>>;
  notes?: string | null;
  parentAdvice?: string | null;
  disposition: ClinicDisposition;
  referralFacility?: string | null;
  referralReason?: string | null;
  followUpAt?: Date | null;
  dispensed?: Array<{ medicationId: string; quantity: number; instruction?: string | null }>;
}) {
  await assertClinicClinicalActor(tx, input.actorId);

  if (input.patientType === "student") {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "Student" WHERE "id"=$1 AND "status"='active' LIMIT 1`,
      input.patientId,
    );
    if (!rows[0]) throw new NotFoundError("Student not found.");
  } else {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "User" WHERE "id"=$1 AND "status"='active' LIMIT 1`,
      input.patientId,
    );
    if (!rows[0]) throw new NotFoundError("Staff member not found.");
  }

  const id = createId();
  const studentId = input.patientType === "student" ? input.patientId : null;
  const staffId = input.patientType === "staff" ? input.patientId : null;
  await tx.$executeRawUnsafe(`
    INSERT INTO "ClinicVisit" ("id","schoolId","patientType","studentId","staffId","nurseId","complaint","vitals","tests","assessment","treatment","prescriptions","notes","parentAdvice","disposition","status","referralFacility","referralReason","followUpAt","completedAt")
    VALUES ($1,current_setting('app.current_school_id'),$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb,$12,$13,$14,'completed',$15,$16,$17,CURRENT_TIMESTAMP)`,
    id,
    input.patientType,
    studentId,
    staffId,
    input.actorId,
    input.complaint,
    plainJson(input.vitals) ?? "{}",
    plainJson(input.tests) ?? "[]",
    input.assessment || null,
    input.treatment || null,
    plainJson(input.prescriptions) ?? "[]",
    input.notes || null,
    input.parentAdvice || null,
    input.disposition,
    input.referralFacility || null,
    input.referralReason || null,
    input.followUpAt ?? null,
  );

  for (const item of input.dispensed ?? []) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) continue;
    const rows = await tx.$queryRawUnsafe<Array<{ id: string; name: string }>>(`
      UPDATE "ClinicMedication" SET "quantity"="quantity"-$1,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=$2 AND "isActive"=true AND "quantity">=$1 RETURNING "id","name"`, item.quantity, item.medicationId);
    if (!rows[0]) throw new ForbiddenError("A selected medicine is unavailable or does not have enough stock.");
    await tx.$executeRawUnsafe(`
      INSERT INTO "ClinicStockMovement" ("id","schoolId","medicationId","visitId","type","quantity","note","recordedBy")
      VALUES ($1,current_setting('app.current_school_id'),$2,$3,'dispensed',$4,$5,$6)`,
      createId(), item.medicationId, id, item.quantity, item.instruction || null, input.actorId);
  }

  return id;
}
