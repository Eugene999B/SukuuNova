#!/usr/bin/env node
/*
 * Add the current School Nurse / Clinic workspace to Eugene Academy.
 * This fixture is tenant-locked, idempotent and intentionally uses no external providers.
 */
const { PrismaClient } = require("@prisma/client");

const TARGET = String(process.env.EUGENE_ACADEMY_CLINIC_TARGET || "trial").trim().toLowerCase();
const SCHOOL_CODE = "eug123";
const SCHOOL_NAME = "Eugene Academy";
const PRODUCTION_ACK = "EUGENE_ACADEMY_ONLY";
const NURSE_EMAIL = "nurse@eugeneacademy.edu.gh";
const NURSE_NAME = "Nana Ama Mensah";
const NURSE_PROFILE_ID = "eug-clinic-nurse-profile-001";
const HEALTH_PROFILE_ID = "eug-clinic-health-profile-001";
const VISIT_ID = "eug-clinic-visit-001";
const PARACETAMOL_ID = "eug-clinic-med-paracetamol";
const ORS_ID = "eug-clinic-med-ors";
const STOCK_RECEIPT_ID = "eug-clinic-stock-received-001";
const STOCK_DISPENSE_ID = "eug-clinic-stock-dispensed-001";
const NURSE_PERMISSIONS = [
  "students:read",
  "clinic:care",
  "clinic:records",
  "clinic:inventory",
  "clinic:export",
  "payroll:view_own",
  "support:create",
  "support:view_own",
];

if (!new Set(["trial", "production"]).has(TARGET)) {
  throw new Error("EUGENE_ACADEMY_CLINIC_TARGET must be 'trial' or 'production'.");
}

const trialUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const productionUrl = String(process.env.DATABASE_URL || "").trim();
const databaseUrl = TARGET === "production" ? productionUrl : trialUrl;
if (!databaseUrl) throw new Error(`${TARGET === "production" ? "DATABASE_URL" : "TEST_DATABASE_URL"} is required.`);

if (TARGET === "trial") {
  if (String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim() !== "YES") {
    throw new Error("Refusing Eugene Academy clinic refresh: trial acknowledgement is missing.");
  }
  if (productionUrl && productionUrl === trialUrl) {
    throw new Error("Refusing Eugene Academy clinic refresh: TEST_DATABASE_URL must differ from DATABASE_URL.");
  }
} else {
  if (String(process.env.ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED || "").trim() !== PRODUCTION_ACK) {
    throw new Error(`Refusing Eugene Academy production clinic refresh: set ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED=${PRODUCTION_ACK}.`);
  }
  const railwayEnvironment = String(process.env.RAILWAY_ENVIRONMENT_NAME || "").trim().toLowerCase();
  if (railwayEnvironment && railwayEnvironment !== "production") {
    throw new Error(`Refusing Eugene Academy production clinic refresh in Railway environment '${railwayEnvironment}'. Expected 'production'.`);
  }
}

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
  transactionOptions: { maxWait: 15000, timeout: 300000 },
});

async function main() {
  const directory = await prisma.schoolLoginDirectory.findUnique({
    where: { uniqueCode: SCHOOL_CODE },
    select: { schoolId: true },
  });
  if (!directory) throw new Error("Eugene Academy directory eug123 does not exist.");
  const schoolId = directory.schoolId;

  const summary = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);
    const school = await tx.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, uniqueCode: true },
    });
    if (!school || school.name !== SCHOOL_NAME || school.uniqueCode !== SCHOOL_CODE) {
      throw new Error(`Refusing clinic refresh: expected ${SCHOOL_NAME} (${SCHOOL_CODE}).`);
    }

    const owner = await tx.user.findFirst({
      where: { schoolId, status: "active", userRoles: { some: { role: { name: "Owner" } } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, passwordHash: true },
    });
    if (!owner) throw new Error("Eugene Academy Owner account is required before seeding the clinic.");

    const permissions = [];
    for (const key of NURSE_PERMISSIONS) {
      permissions.push(await tx.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: key },
      }));
    }

    let role = await tx.role.findUnique({
      where: { schoolId_name: { schoolId, name: "School Nurse" } },
      select: { id: true, key: true, isSystem: true },
    });
    if (!role) {
      role = await tx.role.create({
        data: { schoolId, name: "School Nurse", key: "school_nurse", isSystem: true },
        select: { id: true, key: true, isSystem: true },
      });
    } else if (role.key !== "school_nurse" || !role.isSystem) {
      role = await tx.role.update({
        where: { id: role.id },
        data: { key: "school_nurse", isSystem: true },
        select: { id: true, key: true, isSystem: true },
      });
    }
    const permissionIds = permissions.map((permission) => permission.id);
    await tx.rolePermission.deleteMany({
      where: { schoolId, roleId: role.id, permissionId: { notIn: permissionIds } },
    });
    for (const permission of permissions) {
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: { schoolId },
        create: { schoolId, roleId: role.id, permissionId: permission.id },
      });
    }

    let nurse = await tx.user.findFirst({ where: { schoolId, email: NURSE_EMAIL } });
    if (!nurse) {
      nurse = await tx.user.create({
        data: {
          schoolId,
          name: NURSE_NAME,
          email: NURSE_EMAIL,
          passwordHash: owner.passwordHash,
          status: "active",
          needsPasswordChange: true,
        },
      });
    } else {
      nurse = await tx.user.update({
        where: { id: nurse.id },
        data: { name: NURSE_NAME, status: "active" },
      });
    }
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: nurse.id, roleId: role.id } },
      update: { schoolId },
      create: { schoolId, userId: nurse.id, roleId: role.id },
    });

    await tx.$executeRawUnsafe(
      `INSERT INTO "ClinicSettings" ("schoolId","clinicName","phone","room","emergencyContact","referralHospital","updatedAt")
       VALUES ($1,'Eugene Academy Health Centre','+233302555019','Health Room A','+233302555000','Komfo Anokye Teaching Hospital',NOW())
       ON CONFLICT ("schoolId") DO UPDATE SET
         "clinicName"=EXCLUDED."clinicName", "phone"=EXCLUDED."phone", "room"=EXCLUDED."room",
         "emergencyContact"=EXCLUDED."emergencyContact", "referralHospital"=EXCLUDED."referralHospital", "updatedAt"=NOW()`,
      schoolId,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "ClinicNurseProfile" ("id","schoolId","userId","title","qualification","licenseNo","status","createdAt","updatedAt")
       VALUES ($1,$2,$3,'Senior School Nurse','Registered General Nurse','EUG-DEMO-RGN-001','active',NOW(),NOW())
       ON CONFLICT ("schoolId","userId") DO UPDATE SET
         "title"=EXCLUDED."title", "qualification"=EXCLUDED."qualification", "licenseNo"=EXCLUDED."licenseNo",
         "status"='active', "updatedAt"=NOW()`,
      NURSE_PROFILE_ID, schoolId, nurse.id,
    );

    const student = await tx.student.findFirst({
      where: { schoolId, status: "active" },
      orderBy: [{ admissionNo: "asc" }],
      select: { id: true, name: true, admissionNo: true },
    });
    if (!student) throw new Error("Eugene Academy needs at least one active student for the clinic showcase.");

    const existingHealth = await tx.$queryRawUnsafe(
      `SELECT "id" FROM "ClinicHealthProfile" WHERE "schoolId"=$1 AND "studentId"=$2 LIMIT 1`,
      schoolId, student.id,
    );
    if (existingHealth.length) {
      await tx.$executeRawUnsafe(
        `UPDATE "ClinicHealthProfile" SET "bloodGroup"='O+', "allergies"=$3::jsonb, "conditions"=$4::jsonb,
         "currentMedications"=$5::jsonb, "emergencyNotes"=$6, "updatedBy"=$7, "updatedAt"=NOW()
         WHERE "schoolId"=$1 AND "studentId"=$2`,
        schoolId, student.id, JSON.stringify(["Peanuts"]), JSON.stringify([]), JSON.stringify([]),
        "Guardian reports a mild peanut allergy; monitor for rash or breathing difficulty.", nurse.id,
      );
    } else {
      await tx.$executeRawUnsafe(
        `INSERT INTO "ClinicHealthProfile" ("id","schoolId","patientType","studentId","bloodGroup","allergies","conditions","currentMedications","emergencyNotes","updatedBy","updatedAt")
         VALUES ($1,$2,'student',$3,'O+',$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,NOW())`,
        HEALTH_PROFILE_ID, schoolId, student.id, JSON.stringify(["Peanuts"]), JSON.stringify([]), JSON.stringify([]),
        "Guardian reports a mild peanut allergy; monitor for rash or breathing difficulty.", nurse.id,
      );
    }

    await tx.$executeRawUnsafe(
      `INSERT INTO "ClinicMedication" ("id","schoolId","name","strength","form","unit","quantity","minimumStock","batchNo","expiryDate","isActive","createdAt","updatedAt")
       VALUES ($1,$2,'Paracetamol','500 mg','tablet','tablets',46,20,'EUG-PARA-26A','2027-08-31',true,NOW(),NOW())
       ON CONFLICT ("id") DO UPDATE SET "quantity"=46,"minimumStock"=20,"batchNo"='EUG-PARA-26A',"expiryDate"='2027-08-31',"isActive"=true,"updatedAt"=NOW()`,
      PARACETAMOL_ID, schoolId,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "ClinicMedication" ("id","schoolId","name","strength","form","unit","quantity","minimumStock","batchNo","expiryDate","isActive","createdAt","updatedAt")
       VALUES ($1,$2,'Oral Rehydration Salts','WHO formula','sachet','sachets',12,10,'EUG-ORS-26B','2027-05-31',true,NOW(),NOW())
       ON CONFLICT ("id") DO UPDATE SET "quantity"=12,"minimumStock"=10,"batchNo"='EUG-ORS-26B',"expiryDate"='2027-05-31',"isActive"=true,"updatedAt"=NOW()`,
      ORS_ID, schoolId,
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO "ClinicVisit" ("id","schoolId","patientType","studentId","nurseId","complaint","vitals","tests","assessment","treatment","prescriptions","notes","parentAdvice","disposition","status","followUpAt","startedAt","completedAt","createdAt","updatedAt")
       VALUES ($1,$2,'student',$3,$4,'Headache after morning assembly',$5::jsonb,$6::jsonb,'Likely mild dehydration','Rest, oral fluids and observation',$7::jsonb,
         'Student improved after rest and hydration. No red-flag symptoms observed.','Encourage breakfast and a filled water bottle before school.','returned_to_class','completed',
         '2026-09-17T09:00:00Z','2026-09-15T09:10:00Z','2026-09-15T09:35:00Z','2026-09-15T09:10:00Z',NOW())
       ON CONFLICT ("id") DO UPDATE SET
         "nurseId"=EXCLUDED."nurseId", "complaint"=EXCLUDED."complaint", "vitals"=EXCLUDED."vitals", "tests"=EXCLUDED."tests",
         "assessment"=EXCLUDED."assessment", "treatment"=EXCLUDED."treatment", "prescriptions"=EXCLUDED."prescriptions",
         "notes"=EXCLUDED."notes", "parentAdvice"=EXCLUDED."parentAdvice", "disposition"=EXCLUDED."disposition", "status"='completed',
         "followUpAt"=EXCLUDED."followUpAt", "updatedAt"=NOW()`,
      VISIT_ID, schoolId, student.id, nurse.id,
      JSON.stringify({ temperatureC: 36.7, pulseBpm: 82, bloodPressure: "108/68" }),
      JSON.stringify([{ name: "Observation", result: "No fever or neurological warning signs" }]),
      JSON.stringify([{ medication: "Paracetamol 500 mg", instruction: "1 tablet after food if headache persists" }]),
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO "ClinicStockMovement" ("id","schoolId","medicationId","type","quantity","note","recordedBy","createdAt")
       VALUES ($1,$2,$3,'received',50,'Opening Eugene Academy clinic showcase stock',$4,'2026-09-01T08:00:00Z')
       ON CONFLICT ("id") DO NOTHING`,
      STOCK_RECEIPT_ID, schoolId, PARACETAMOL_ID, nurse.id,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "ClinicStockMovement" ("id","schoolId","medicationId","visitId","type","quantity","note","recordedBy","createdAt")
       VALUES ($1,$2,$3,$4,'dispensed',4,'Showcase dispensing linked to a documented clinic encounter',$5,'2026-09-15T09:30:00Z')
       ON CONFLICT ("id") DO NOTHING`,
      STOCK_DISPENSE_ID, schoolId, PARACETAMOL_ID, VISIT_ID, nurse.id,
    );

    const [rolePermissions, profileRows, visitRows, medicationRows, healthRows, stockRows] = await Promise.all([
      tx.rolePermission.findMany({ where: { schoolId, roleId: role.id }, select: { permission: { select: { key: true } } } }),
      tx.$queryRawUnsafe(`SELECT "id" FROM "ClinicNurseProfile" WHERE "schoolId"=$1 AND "userId"=$2 AND "status"='active'`, schoolId, nurse.id),
      tx.$queryRawUnsafe(`SELECT "id" FROM "ClinicVisit" WHERE "schoolId"=$1`, schoolId),
      tx.$queryRawUnsafe(`SELECT "id" FROM "ClinicMedication" WHERE "schoolId"=$1 AND "isActive"=true`, schoolId),
      tx.$queryRawUnsafe(`SELECT "id" FROM "ClinicHealthProfile" WHERE "schoolId"=$1`, schoolId),
      tx.$queryRawUnsafe(`SELECT "id" FROM "ClinicStockMovement" WHERE "schoolId"=$1`, schoolId),
    ]);
    const actualPermissions = new Set(rolePermissions.map((row) => row.permission.key));
    for (const key of NURSE_PERMISSIONS) {
      if (!actualPermissions.has(key)) throw new Error(`School Nurse is missing required permission ${key}.`);
    }
    if (profileRows.length < 1 || visitRows.length < 1 || medicationRows.length < 2 || healthRows.length < 1 || stockRows.length < 2) {
      throw new Error(`Clinic fixture is incomplete: ${JSON.stringify({ profiles: profileRows.length, visits: visitRows.length, medications: medicationRows.length, healthProfiles: healthRows.length, stockMovements: stockRows.length })}`);
    }

    await tx.auditLogSchool.create({
      data: {
        schoolId,
        actorId: owner.id,
        action: "eugene_academy.clinic_showcase_refreshed",
        entityType: "School",
        entityId: schoolId,
        after: {
          fixture: true,
          nurseUserId: nurse.id,
          nurseRole: "school_nurse",
          studentId: student.id,
          clinic: {
            profiles: profileRows.length,
            visits: visitRows.length,
            medications: medicationRows.length,
            healthProfiles: healthRows.length,
            stockMovements: stockRows.length,
          },
        },
      },
    });

    return {
      school: `${school.name} (${school.uniqueCode})`,
      nurse: { name: nurse.name, email: nurse.email, role: "school_nurse" },
      patient: { name: student.name, admissionNo: student.admissionNo },
      clinic: {
        profiles: profileRows.length,
        visits: visitRows.length,
        medications: medicationRows.length,
        healthProfiles: healthRows.length,
        stockMovements: stockRows.length,
      },
    };
  });

  console.log("[eugene-clinic] verified", JSON.stringify(summary));
}

main().catch((error) => {
  console.error("[eugene-clinic] failed:", error instanceof Error ? (error.stack || error.message) : String(error));
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
