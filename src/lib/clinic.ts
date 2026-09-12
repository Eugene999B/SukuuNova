import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "./db";
import { ForbiddenError, NotFoundError } from "./errors";

export type ClinicPatientType = "student" | "staff";
export type ClinicDisposition = "returned_to_class" | "resting_in_clinic" | "sent_home" | "referred" | "emergency_transfer";

export type ClinicPatientSearchResult = {
  id: string;
  type: ClinicPatientType;
  name: string;
  identifier: string;
  secondary: string | null;
  photoUrl: string | null;
};

export type ClinicMedicationRow = {
  id: string;
  name: string;
  strength: string | null;
  form: string | null;
  unit: string;
  quantity: string;
  minimumStock: string;
  batchNo: string | null;
  expiryDate: Date | null;
  isLow: boolean;
  isExpiring: boolean;
};

export type ClinicVisitSummary = {
  id: string;
  patientType: ClinicPatientType;
  patientId: string;
  patientName: string;
  patientMeta: string | null;
  complaint: string;
  assessment: string | null;
  disposition: ClinicDisposition;
  status: string;
  startedAt: Date;
  followUpAt: Date | null;
  nurseName: string;
};

function plainJson(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return JSON.stringify(value);
}

export async function getClinicManagementSnapshot(tx: TenantDb) {
  const [metrics] = await tx.$queryRawUnsafe<Array<{
    visitsToday: bigint;
    restingNow: bigint;
    sentHomeToday: bigint;
    referredToday: bigint;
    followUpsToday: bigint;
    visitsSevenDays: bigint;
    visitsPreviousSevenDays: bigint;
  }>>(`
    SELECT
      COUNT(*) FILTER (WHERE (v."startedAt" AT TIME ZONE 'Africa/Accra')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date) AS "visitsToday",
      COUNT(*) FILTER (WHERE v."disposition"='resting_in_clinic' AND (v."startedAt" AT TIME ZONE 'Africa/Accra')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date) AS "restingNow",
      COUNT(*) FILTER (WHERE v."disposition"='sent_home' AND (v."startedAt" AT TIME ZONE 'Africa/Accra')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date) AS "sentHomeToday",
      COUNT(*) FILTER (WHERE v."disposition" IN ('referred','emergency_transfer') AND (v."startedAt" AT TIME ZONE 'Africa/Accra')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date) AS "referredToday",
      COUNT(*) FILTER (WHERE v."followUpAt" IS NOT NULL AND (v."followUpAt" AT TIME ZONE 'Africa/Accra')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date) AS "followUpsToday",
      COUNT(*) FILTER (WHERE v."startedAt" >= CURRENT_TIMESTAMP - INTERVAL '7 days') AS "visitsSevenDays",
      COUNT(*) FILTER (WHERE v."startedAt" < CURRENT_TIMESTAMP - INTERVAL '7 days' AND v."startedAt" >= CURRENT_TIMESTAMP - INTERVAL '14 days') AS "visitsPreviousSevenDays"
    FROM "ClinicVisit" v
  `);

  const [stock] = await tx.$queryRawUnsafe<Array<{
    medicinesAvailable: bigint;
    lowStock: bigint;
    expiringSoon: bigint;
    outOfStock: bigint;
  }>>(`
    SELECT
      COUNT(*) FILTER (WHERE m."isActive"=true AND m."quantity">0) AS "medicinesAvailable",
      COUNT(*) FILTER (WHERE m."isActive"=true AND m."quantity"<=m."minimumStock") AS "lowStock",
      COUNT(*) FILTER (WHERE m."isActive"=true AND m."expiryDate" IS NOT NULL AND m."expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') AS "expiringSoon",
      COUNT(*) FILTER (WHERE m."isActive"=true AND m."quantity"=0) AS "outOfStock"
    FROM "ClinicMedication" m
  `);

  const nurses = await tx.$queryRawUnsafe<Array<{
    id: string;
    userId: string;
    name: string;
    email: string | null;
    phone: string | null;
    accountStatus: string;
    profileStatus: string;
    title: string;
    qualification: string | null;
    licenseNo: string | null;
    photoUrl: string | null;
  }>>(`
    SELECT p."id",p."userId",u."name",u."email",u."phone",u."status" AS "accountStatus",
           p."status" AS "profileStatus",p."title",p."qualification",p."licenseNo",p."photoUrl"
    FROM "ClinicNurseProfile" p
    JOIN "User" u ON u."id"=p."userId" AND u."schoolId"=p."schoolId"
    ORDER BY (p."status"='active') DESC,u."name" ASC
  `);

  const recent = await tx.$queryRawUnsafe<Array<ClinicVisitSummary>>(`
    SELECT v."id",v."patientType",
           COALESCE(v."studentId",v."staffId") AS "patientId",
           COALESCE(s."name",staff."name",'Unknown') AS "patientName",
           CASE WHEN v."studentId" IS NOT NULL THEN COALESCE(c."name",s."admissionNo") ELSE 'Staff' END AS "patientMeta",
           v."complaint",v."assessment",v."disposition",v."status",v."startedAt",v."followUpAt",
           nurse."name" AS "nurseName"
    FROM "ClinicVisit" v
    LEFT JOIN "Student" s ON s."id"=v."studentId" AND s."schoolId"=v."schoolId"
    LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=v."schoolId"
    LEFT JOIN "User" staff ON staff."id"=v."staffId" AND staff."schoolId"=v."schoolId"
    JOIN "User" nurse ON nurse."id"=v."nurseId" AND nurse."schoolId"=v."schoolId"
    WHERE (v."startedAt" AT TIME ZONE 'Africa/Accra')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date
    ORDER BY v."startedAt" DESC
    LIMIT 12
  `);

  const medicines = await listClinicMedications(tx, 8);
  const weekNow = Number(metrics?.visitsSevenDays ?? 0);
  const weekBefore = Number(metrics?.visitsPreviousSevenDays ?? 0);
  const trendDelta = weekNow - weekBefore;
  const insights: string[] = [];
  if (trendDelta >= 3) insights.push(`Clinic visits are up by ${trendDelta} compared with the previous 7 days.`);
  else if (trendDelta <= -3) insights.push(`Clinic visits are down by ${Math.abs(trendDelta)} compared with the previous 7 days.`);
  else insights.push("Clinic visit volume is broadly stable compared with the previous 7 days.");
  if (Number(stock?.lowStock ?? 0) > 0) insights.push(`${Number(stock?.lowStock ?? 0)} medicine item${Number(stock?.lowStock ?? 0) === 1 ? " is" : "s are"} at or below the minimum stock level.`);
  if (Number(stock?.expiringSoon ?? 0) > 0) insights.push(`${Number(stock?.expiringSoon ?? 0)} medicine item${Number(stock?.expiringSoon ?? 0) === 1 ? " expires" : "s expire"} within 30 days.`);
  if (Number(metrics?.referredToday ?? 0) > 0) insights.push(`${Number(metrics?.referredToday ?? 0)} patient${Number(metrics?.referredToday ?? 0) === 1 ? " has" : "s have"} been referred or transferred today.`);

  return {
    metrics: {
      visitsToday: Number(metrics?.visitsToday ?? 0),
      restingNow: Number(metrics?.restingNow ?? 0),
      sentHomeToday: Number(metrics?.sentHomeToday ?? 0),
      referredToday: Number(metrics?.referredToday ?? 0),
      followUpsToday: Number(metrics?.followUpsToday ?? 0),
      medicinesAvailable: Number(stock?.medicinesAvailable ?? 0),
      lowStock: Number(stock?.lowStock ?? 0),
      expiringSoon: Number(stock?.expiringSoon ?? 0),
      outOfStock: Number(stock?.outOfStock ?? 0),
      visitsSevenDays: weekNow,
      visitsPreviousSevenDays: weekBefore,
    },
    nurses,
    recent,
    medicines,
    insights,
  };
}

export async function getClinicNurseSnapshot(tx: TenantDb, userId: string) {
  const profile = await tx.$queryRawUnsafe<Array<{ id: string; status: string; title: string; photoUrl: string | null }>>(
    `SELECT "id","status","title","photoUrl" FROM "ClinicNurseProfile" WHERE "userId"=$1 LIMIT 1`,
    userId,
  );
  if (!profile[0] || profile[0].status !== "active") throw new ForbiddenError("This nurse profile is not active.");

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
    profile: profile[0],
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

export async function getRecentClinicVisits(tx: TenantDb, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return tx.$queryRawUnsafe<Array<ClinicVisitSummary>>(`
    SELECT v."id",v."patientType",
           COALESCE(v."studentId",v."staffId") AS "patientId",
           COALESCE(s."name",staff."name",'Unknown') AS "patientName",
           CASE WHEN v."studentId" IS NOT NULL THEN COALESCE(c."name",s."admissionNo") ELSE 'Staff' END AS "patientMeta",
           v."complaint",v."assessment",v."disposition",v."status",v."startedAt",v."followUpAt",
           nurse."name" AS "nurseName"
    FROM "ClinicVisit" v
    LEFT JOIN "Student" s ON s."id"=v."studentId" AND s."schoolId"=v."schoolId"
    LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=v."schoolId"
    LEFT JOIN "User" staff ON staff."id"=v."staffId" AND staff."schoolId"=v."schoolId"
    JOIN "User" nurse ON nurse."id"=v."nurseId" AND nurse."schoolId"=v."schoolId"
    ORDER BY v."startedAt" DESC
    LIMIT ${safeLimit}
  `);
}

export async function searchClinicPatients(tx: TenantDb, query: string): Promise<ClinicPatientSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const needle = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const students = await tx.$queryRawUnsafe<Array<ClinicPatientSearchResult>>(`
    SELECT s."id",'student'::text AS "type",s."name",s."admissionNo" AS "identifier",
           COALESCE(c."name",'Student') AS "secondary",s."photoUrl"
    FROM "Student" s
    LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=s."schoolId"
    WHERE s."status"='active' AND (s."name" ILIKE $1 ESCAPE '\\' OR s."admissionNo" ILIKE $1 ESCAPE '\\')
    ORDER BY s."name" ASC LIMIT 10
  `, needle);
  const staff = await tx.$queryRawUnsafe<Array<ClinicPatientSearchResult>>(`
    SELECT u."id",'staff'::text AS "type",u."name",COALESCE(u."phone",u."email",'Staff') AS "identifier",
           'Staff'::text AS "secondary",NULL::text AS "photoUrl"
    FROM "User" u
    WHERE u."status"='active'
      AND (u."name" ILIKE $1 ESCAPE '\\' OR COALESCE(u."phone",'') ILIKE $1 ESCAPE '\\' OR COALESCE(u."email",'') ILIKE $1 ESCAPE '\\')
      AND EXISTS (
        SELECT 1 FROM "UserRole" ur JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
        WHERE ur."userId"=u."id" AND ur."schoolId"=u."schoolId"
          AND COALESCE(r."key",lower(replace(r."name",' ','_'))) NOT IN ('parent','guardian','student')
      )
    ORDER BY u."name" ASC LIMIT 10
  `, needle);
  return [...students, ...staff].slice(0, 16);
}

export async function getClinicPatientRecord(tx: TenantDb, type: ClinicPatientType, patientId: string) {
  const identity = type === "student"
    ? (await tx.$queryRawUnsafe<Array<{ id: string; name: string; identifier: string; secondary: string | null; photoUrl: string | null }>>(`
        SELECT s."id",s."name",s."admissionNo" AS "identifier",COALESCE(c."name",'Student') AS "secondary",s."photoUrl"
        FROM "Student" s LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=s."schoolId"
        WHERE s."id"=$1 LIMIT 1`, patientId))[0]
    : (await tx.$queryRawUnsafe<Array<{ id: string; name: string; identifier: string; secondary: string | null; photoUrl: string | null }>>(`
        SELECT u."id",u."name",COALESCE(u."phone",u."email",'Staff') AS "identifier",'Staff'::text AS "secondary",NULL::text AS "photoUrl"
        FROM "User" u WHERE u."id"=$1 AND u."status"='active' LIMIT 1`, patientId))[0];
  if (!identity) throw new NotFoundError("Patient record not found.");

  const profiles = await tx.$queryRawUnsafe<Array<{
    id: string;
    bloodGroup: string | null;
    allergies: unknown;
    conditions: unknown;
    currentMedications: unknown;
    emergencyNotes: string | null;
    updatedAt: Date;
  }>>(`SELECT "id","bloodGroup","allergies","conditions","currentMedications","emergencyNotes","updatedAt"
      FROM "ClinicHealthProfile" WHERE ${type === "student" ? '"studentId"' : '"staffId"'}=$1 LIMIT 1`, patientId);

  const visits = await tx.$queryRawUnsafe<Array<{
    id: string;
    complaint: string;
    vitals: unknown;
    tests: unknown;
    assessment: string | null;
    treatment: string | null;
    prescriptions: unknown;
    notes: string | null;
    parentAdvice: string | null;
    disposition: ClinicDisposition;
    referralFacility: string | null;
    referralReason: string | null;
    followUpAt: Date | null;
    startedAt: Date;
    nurseName: string;
  }>>(`
    SELECT v."id",v."complaint",v."vitals",v."tests",v."assessment",v."treatment",v."prescriptions",v."notes",v."parentAdvice",
           v."disposition",v."referralFacility",v."referralReason",v."followUpAt",v."startedAt",u."name" AS "nurseName"
    FROM "ClinicVisit" v JOIN "User" u ON u."id"=v."nurseId" AND u."schoolId"=v."schoolId"
    WHERE ${type === "student" ? 'v."studentId"' : 'v."staffId"'}=$1
    ORDER BY v."startedAt" DESC LIMIT 100
  `, patientId);
  return { identity: { ...identity, type }, profile: profiles[0] ?? null, visits };
}

export async function saveClinicHealthProfile(tx: TenantDb, input: {
  actorId: string;
  patientType: ClinicPatientType;
  patientId: string;
  bloodGroup?: string | null;
  allergies?: string[];
  conditions?: string[];
  currentMedications?: string[];
  emergencyNotes?: string | null;
}) {
  await assertClinicPatientExists(tx, input.patientType, input.patientId);
  const id = createId();
  const studentId = input.patientType === "student" ? input.patientId : null;
  const staffId = input.patientType === "staff" ? input.patientId : null;
  const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "ClinicHealthProfile" WHERE ${input.patientType === "student" ? '"studentId"' : '"staffId"'}=$1 LIMIT 1`,
    input.patientId,
  );
  if (existing[0]) {
    await tx.$executeRawUnsafe(`
      UPDATE "ClinicHealthProfile" SET "bloodGroup"=$1,"allergies"=$2::jsonb,"conditions"=$3::jsonb,
        "currentMedications"=$4::jsonb,"emergencyNotes"=$5,"updatedBy"=$6,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=$7`, input.bloodGroup || null, plainJson(input.allergies) ?? "[]", plainJson(input.conditions) ?? "[]",
      plainJson(input.currentMedications) ?? "[]", input.emergencyNotes || null, input.actorId, existing[0].id);
    return existing[0].id;
  }
  await tx.$executeRawUnsafe(`
    INSERT INTO "ClinicHealthProfile" ("id","schoolId","patientType","studentId","staffId","bloodGroup","allergies","conditions","currentMedications","emergencyNotes","updatedBy")
    VALUES ($1,current_setting('app.current_school_id'),$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)`,
    id,input.patientType,studentId,staffId,input.bloodGroup || null,plainJson(input.allergies) ?? "[]",plainJson(input.conditions) ?? "[]",
    plainJson(input.currentMedications) ?? "[]",input.emergencyNotes || null,input.actorId);
  return id;
}

export async function createClinicVisit(tx: TenantDb, input: {
  nurseId: string;
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
  await assertClinicPatientExists(tx, input.patientType, input.patientId);
  const activeNurse = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "ClinicNurseProfile" WHERE "userId"=$1 AND "status"='active' LIMIT 1`, input.nurseId,
  );
  if (!activeNurse[0]) throw new ForbiddenError("An active nurse profile is required to record a consultation.");
  const id = createId();
  const studentId = input.patientType === "student" ? input.patientId : null;
  const staffId = input.patientType === "staff" ? input.patientId : null;
  await tx.$executeRawUnsafe(`
    INSERT INTO "ClinicVisit" ("id","schoolId","patientType","studentId","staffId","nurseId","complaint","vitals","tests","assessment","treatment","prescriptions","notes","parentAdvice","disposition","status","referralFacility","referralReason","followUpAt","completedAt")
    VALUES ($1,current_setting('app.current_school_id'),$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb,$12,$13,$14,'completed',$15,$16,$17,CURRENT_TIMESTAMP)`,
    id,input.patientType,studentId,staffId,input.nurseId,input.complaint,plainJson(input.vitals) ?? "{}",plainJson(input.tests) ?? "[]",
    input.assessment || null,input.treatment || null,plainJson(input.prescriptions) ?? "[]",input.notes || null,input.parentAdvice || null,input.disposition,
    input.referralFacility || null,input.referralReason || null,input.followUpAt ?? null);

  for (const item of input.dispensed ?? []) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) continue;
    const rows = await tx.$queryRawUnsafe<Array<{ id: string; name: string }>>(`
      UPDATE "ClinicMedication" SET "quantity"="quantity"-$1,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=$2 AND "isActive"=true AND "quantity">=$1 RETURNING "id","name"`, item.quantity, item.medicationId);
    if (!rows[0]) throw new ForbiddenError("A selected medicine is unavailable or does not have enough stock.");
    await tx.$executeRawUnsafe(`
      INSERT INTO "ClinicStockMovement" ("id","schoolId","medicationId","visitId","type","quantity","note","recordedBy")
      VALUES ($1,current_setting('app.current_school_id'),$2,$3,'dispensed',$4,$5,$6)`,
      createId(),item.medicationId,id,item.quantity,item.instruction || null,input.nurseId);
  }
  return id;
}

export async function listClinicMedications(tx: TenantDb, limit = 100): Promise<ClinicMedicationRow[]> {
  const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  return tx.$queryRawUnsafe<Array<ClinicMedicationRow>>(`
    SELECT "id","name","strength","form","unit","quantity"::text AS "quantity","minimumStock"::text AS "minimumStock","batchNo","expiryDate",
      ("quantity"<="minimumStock") AS "isLow",
      ("expiryDate" IS NOT NULL AND "expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') AS "isExpiring"
    FROM "ClinicMedication" WHERE "isActive"=true
    ORDER BY ("quantity"<="minimumStock") DESC,"expiryDate" ASC NULLS LAST,"name" ASC LIMIT ${safeLimit}
  `);
}

export async function addClinicMedication(tx: TenantDb, input: {
  actorId: string;
  name: string;
  strength?: string | null;
  form?: string | null;
  unit: string;
  quantity: number;
  minimumStock: number;
  batchNo?: string | null;
  expiryDate?: Date | null;
}) {
  const id = createId();
  await tx.$executeRawUnsafe(`
    INSERT INTO "ClinicMedication" ("id","schoolId","name","strength","form","unit","quantity","minimumStock","batchNo","expiryDate")
    VALUES ($1,current_setting('app.current_school_id'),$2,$3,$4,$5,$6,$7,$8,$9)`,
    id,input.name,input.strength || null,input.form || null,input.unit,input.quantity,input.minimumStock,input.batchNo || null,input.expiryDate ?? null);
  if (input.quantity > 0) {
    await tx.$executeRawUnsafe(`
      INSERT INTO "ClinicStockMovement" ("id","schoolId","medicationId","type","quantity","note","recordedBy")
      VALUES ($1,current_setting('app.current_school_id'),$2,'received',$3,'Opening clinic stock',$4)`,createId(),id,input.quantity,input.actorId);
  }
  return id;
}

export async function adjustClinicMedicationStock(tx: TenantDb, input: {
  actorId: string;
  medicationId: string;
  type: "received" | "adjusted_in" | "adjusted_out" | "expired" | "damaged" | "returned";
  quantity: number;
  note?: string | null;
}) {
  const subtract = ["adjusted_out","expired","damaged"].includes(input.type);
  const delta = subtract ? -input.quantity : input.quantity;
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`
    UPDATE "ClinicMedication" SET "quantity"="quantity"+$1,"updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=$2 AND "isActive"=true AND "quantity"+$1>=0 RETURNING "id"`,delta,input.medicationId);
  if (!rows[0]) throw new ForbiddenError("The stock adjustment would make the medicine quantity invalid.");
  await tx.$executeRawUnsafe(`
    INSERT INTO "ClinicStockMovement" ("id","schoolId","medicationId","type","quantity","note","recordedBy")
    VALUES ($1,current_setting('app.current_school_id'),$2,$3,$4,$5,$6)`,createId(),input.medicationId,input.type,input.quantity,input.note || null,input.actorId);
}

async function assertClinicPatientExists(tx: TenantDb, type: ClinicPatientType, patientId: string) {
  if (type === "student") {
    const row = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "Student" WHERE "id"=$1 AND "status"='active' LIMIT 1`,patientId);
    if (!row[0]) throw new NotFoundError("Student not found.");
    return;
  }
  const row = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "User" WHERE "id"=$1 AND "status"='active' LIMIT 1`,patientId);
  if (!row[0]) throw new NotFoundError("Staff member not found.");
}
