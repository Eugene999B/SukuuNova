import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { createId } from "@paralleldrive/cuid2";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError, AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { assertPortraitVerificationToken } from "@/lib/portrait-verification";
import {
  addClinicMedication,
  adjustClinicMedicationStock,
  createClinicVisit,
  getClinicManagementSnapshot,
  getClinicNurseSnapshot,
  getClinicPatientRecord,
  listClinicMedications,
  saveClinicHealthProfile,
  searchClinicPatients,
  type ClinicPatientType,
} from "@/lib/clinic";

const patientType = z.enum(["student", "staff"]);
const disposition = z.enum(["returned_to_class", "resting_in_clinic", "sent_home", "referred", "emergency_transfer"]);

const createNurseSchema = z.object({
  action: z.literal("create_nurse"),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^\+?[0-9]{8,15}$/),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  title: z.string().trim().min(2).max(100).default("School Nurse"),
  qualification: z.string().trim().max(160).optional().or(z.literal("")),
  licenseNo: z.string().trim().max(100).optional().or(z.literal("")),
  photoUrl: z.string().max(800_000).optional().or(z.literal("")),
  verificationToken: z.string().max(4_000).optional().or(z.literal("")),
});

const visitSchema = z.object({
  action: z.literal("save_visit"),
  patientType,
  patientId: z.string().min(8).max(128),
  complaint: z.string().trim().min(2).max(1000),
  vitals: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  tests: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
  assessment: z.string().trim().max(1500).optional().nullable(),
  treatment: z.string().trim().max(2000).optional().nullable(),
  prescriptions: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  parentAdvice: z.string().trim().max(4000).optional().nullable(),
  disposition,
  referralFacility: z.string().trim().max(180).optional().nullable(),
  referralReason: z.string().trim().max(1500).optional().nullable(),
  followUpAt: z.string().datetime().optional().nullable(),
  dispensed: z.array(z.object({ medicationId: z.string().min(8).max(128), quantity: z.number().positive().max(100000), instruction: z.string().trim().max(500).optional().nullable() })).max(30).optional(),
});

const healthProfileSchema = z.object({
  action: z.literal("save_health_profile"),
  patientType,
  patientId: z.string().min(8).max(128),
  bloodGroup: z.string().trim().max(20).optional().nullable(),
  allergies: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  conditions: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
  currentMedications: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
  emergencyNotes: z.string().trim().max(3000).optional().nullable(),
});

const addMedicationSchema = z.object({
  action: z.literal("add_medication"),
  name: z.string().trim().min(2).max(160),
  strength: z.string().trim().max(80).optional().nullable(),
  form: z.string().trim().max(80).optional().nullable(),
  unit: z.string().trim().min(1).max(40).default("units"),
  quantity: z.number().min(0).max(10000000),
  minimumStock: z.number().min(0).max(10000000).default(0),
  batchNo: z.string().trim().max(100).optional().nullable(),
  expiryDate: z.string().date().optional().nullable(),
});

const stockSchema = z.object({
  action: z.literal("adjust_stock"),
  medicationId: z.string().min(8).max(128),
  type: z.enum(["received", "adjusted_in", "adjusted_out", "expired", "damaged", "returned"]),
  quantity: z.number().positive().max(10000000),
  note: z.string().trim().max(1000).optional().nullable(),
});

const nurseStatusSchema = z.object({
  action: z.literal("set_nurse_status"),
  nurseProfileId: z.string().min(8).max(128),
  status: z.enum(["active", "suspended"]),
});

const clinicSettingsSchema = z.object({
  action: z.literal("save_settings"),
  clinicName: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  room: z.string().trim().max(160).optional().nullable(),
  emergencyContact: z.string().trim().max(160).optional().nullable(),
  referralHospital: z.string().trim().max(200).optional().nullable(),
});

const actionSchema = z.discriminatedUnion("action", [createNurseSchema, visitSchema, healthProfileSchema, addMedicationSchema, stockSchema, nurseStatusSchema, clinicSettingsSchema]);

function normalizePhone(value: string) {
  return value.trim().replace(/[\s()-]+/g, "");
}

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") ?? "management";
    const result = await withTenant(session.schoolId, async (tx) => {
      if (mode === "management") {
        await requirePermission(tx, session.userId, "clinic:overview");
        const [snapshot, settings] = await Promise.all([
          getClinicManagementSnapshot(tx),
          tx.$queryRawUnsafe<Array<{ clinicName: string | null; phone: string | null; room: string | null; emergencyContact: string | null; referralHospital: string | null }>>(
            `SELECT "clinicName","phone","room","emergencyContact","referralHospital" FROM "ClinicSettings" LIMIT 1`,
          ),
        ]);
        const safeRecent = snapshot.recent.map(({ complaint: _complaint, assessment: _assessment, ...visit }) => visit);
        return { mode, ...snapshot, recent: safeRecent, settings: settings[0] ?? null };
      }
      if (mode === "nurse") {
        await requirePermission(tx, session.userId, "clinic:care");
        return { mode, ...(await getClinicNurseSnapshot(tx, session.userId)) };
      }
      if (mode === "search") {
        await requirePermission(tx, session.userId, "clinic:care");
        return { mode, patients: await searchClinicPatients(tx, url.searchParams.get("q") ?? "") };
      }
      if (mode === "patient") {
        await requirePermission(tx, session.userId, "clinic:records");
        const type = patientType.parse(url.searchParams.get("type")) as ClinicPatientType;
        const patientId = z.string().min(8).max(128).parse(url.searchParams.get("id"));
        return { mode, record: await getClinicPatientRecord(tx, type, patientId) };
      }
      if (mode === "medications") {
        await requirePermission(tx, session.userId, "clinic:inventory");
        return { mode, medicines: await listClinicMedications(tx, 250) };
      }
      throw new AppError("Unknown clinic view.", 400, "UNKNOWN_CLINIC_VIEW");
    });
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, actionSchema);
    const result = await withTenant(session.schoolId, async (tx) => {
      if (input.action === "create_nurse") {
        await requirePermission(tx, session.userId, "clinic:nurses_manage");
        const phone = normalizePhone(input.phone);
        const email = input.email?.trim().toLowerCase() || null;
        if (input.photoUrl) {
          if (!input.verificationToken) throw new AppError("Verify the nurse portrait before creating the profile.", 400, "NURSE_PORTRAIT_NOT_VERIFIED");
          assertPortraitVerificationToken({ token: input.verificationToken, schoolId: session.schoolId, target: "staff", image: input.photoUrl });
        }
        if (email) {
          const emailOwner = await tx.user.findFirst({ where: { email }, select: { id: true } });
          if (emailOwner) throw new AppError("That email is already used by a school account.", 409, "DUPLICATE_NURSE_EMAIL");
        }
        const phoneOwner = await tx.user.findFirst({ where: { phone }, select: { id: true } });
        if (phoneOwner) throw new AppError("That phone number is already used by a school account.", 409, "DUPLICATE_NURSE_PHONE");

        const permissionKeys = ["students:read", "clinic:care", "clinic:records", "clinic:inventory", "clinic:export", "payroll:view_own", "support:create", "support:view_own"];
        const permissions = await tx.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true, key: true } });
        if (permissions.length !== permissionKeys.length) throw new AppError("Clinic permissions are not fully installed. Apply the latest database migration first.", 503, "CLINIC_PERMISSIONS_MISSING");
        let role = await tx.role.findUnique({ where: { schoolId_name: { schoolId: session.schoolId, name: "School Nurse" } }, select: { id: true } });
        if (!role) role = await tx.role.create({ data: { schoolId: session.schoolId, name: "School Nurse", key: "school_nurse", isSystem: true }, select: { id: true } });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ schoolId: session.schoolId, roleId: role!.id, permissionId: permission.id })),
          skipDuplicates: true,
        });

        const user = await tx.user.create({
          data: {
            schoolId: session.schoolId,
            name: input.name,
            email,
            phone,
            passwordHash: await hash(phone, 12),
            status: "active",
            needsPasswordChange: true,
          },
          select: { id: true, name: true, email: true, phone: true },
        });
        await tx.userRole.create({ data: { schoolId: session.schoolId, userId: user.id, roleId: role.id } });
        const profileId = createId();
        await tx.$executeRawUnsafe(`
          INSERT INTO "ClinicNurseProfile" ("id","schoolId","userId","photoUrl","title","qualification","licenseNo","status")
          VALUES ($1,current_setting('app.current_school_id'),$2,$3,$4,$5,$6,'active')`,
          profileId,user.id,input.photoUrl || null,input.title,input.qualification || null,input.licenseNo || null);
        await tx.auditLogSchool.create({
          data: { schoolId: session.schoolId, actorId: session.userId, action: "clinic.nurse.created", entityType: "ClinicNurseProfile", entityId: profileId,
            after: { userId: user.id, name: user.name, email: user.email, phone: user.phone, title: input.title, qualification: input.qualification || null, licenseNo: input.licenseNo || null, portraitCaptured: Boolean(input.photoUrl), firstLoginPasswordSource: "phone" } },
        });
        return { ok: true, nurse: { id: profileId, ...user, title: input.title }, message: `${user.name} can now sign in under Staff using the phone number or email. The phone number is the first password and must be changed after first login.` };
      }

      if (input.action === "save_visit") {
        await requirePermission(tx, session.userId, "clinic:care");
        if ((input.dispensed?.length ?? 0) > 0) await requirePermission(tx, session.userId, "clinic:inventory");
        const visitId = await createClinicVisit(tx, {
          nurseId: session.userId,
          patientType: input.patientType,
          patientId: input.patientId,
          complaint: input.complaint,
          vitals: input.vitals,
          tests: input.tests,
          assessment: input.assessment,
          treatment: input.treatment,
          prescriptions: input.prescriptions,
          notes: input.notes,
          parentAdvice: input.parentAdvice,
          disposition: input.disposition,
          referralFacility: input.referralFacility,
          referralReason: input.referralReason,
          followUpAt: input.followUpAt ? new Date(input.followUpAt) : null,
          dispensed: input.dispensed,
        });
        await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "clinic.visit.created", entityType: "ClinicVisit", entityId: visitId, after: { patientType: input.patientType, patientId: input.patientId, disposition: input.disposition, dispensedItems: input.dispensed?.length ?? 0 } } });
        return { ok: true, visitId };
      }

      if (input.action === "save_health_profile") {
        await requirePermission(tx, session.userId, "clinic:records");
        const profileId = await saveClinicHealthProfile(tx, { ...input, actorId: session.userId });
        await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "clinic.health_profile.updated", entityType: "ClinicHealthProfile", entityId: profileId, after: { patientType: input.patientType, patientId: input.patientId } } });
        return { ok: true, profileId };
      }

      if (input.action === "add_medication") {
        await requirePermission(tx, session.userId, "clinic:inventory");
        const medicationId = await addClinicMedication(tx, { actorId: session.userId, name: input.name, strength: input.strength, form: input.form, unit: input.unit, quantity: input.quantity, minimumStock: input.minimumStock, batchNo: input.batchNo, expiryDate: input.expiryDate ? new Date(`${input.expiryDate}T00:00:00Z`) : null });
        await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "clinic.medication.created", entityType: "ClinicMedication", entityId: medicationId, after: { name: input.name, quantity: input.quantity, unit: input.unit } } });
        return { ok: true, medicationId };
      }

      if (input.action === "adjust_stock") {
        await requirePermission(tx, session.userId, "clinic:inventory");
        await adjustClinicMedicationStock(tx, { ...input, actorId: session.userId });
        await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "clinic.stock.adjusted", entityType: "ClinicMedication", entityId: input.medicationId, after: { type: input.type, quantity: input.quantity, note: input.note || null } } });
        return { ok: true };
      }

      if (input.action === "set_nurse_status") {
        await requirePermission(tx, session.userId, "clinic:nurses_manage");
        const rows = await tx.$queryRawUnsafe<Array<{ userId: string }>>(`UPDATE "ClinicNurseProfile" SET "status"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2 RETURNING "userId"`,input.status,input.nurseProfileId);
        if (!rows[0]) throw new AppError("Nurse profile not found.", 404, "NURSE_NOT_FOUND");
        await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "clinic.nurse.status_changed", entityType: "ClinicNurseProfile", entityId: input.nurseProfileId, after: { status: input.status, userId: rows[0].userId } } });
        return { ok: true };
      }

      if (input.action === "save_settings") {
        await requirePermission(tx, session.userId, "clinic:nurses_manage");
        await tx.$executeRawUnsafe(`
          INSERT INTO "ClinicSettings" ("schoolId","clinicName","phone","room","emergencyContact","referralHospital","updatedAt")
          VALUES (current_setting('app.current_school_id'),$1,$2,$3,$4,$5,CURRENT_TIMESTAMP)
          ON CONFLICT ("schoolId") DO UPDATE SET "clinicName"=EXCLUDED."clinicName","phone"=EXCLUDED."phone","room"=EXCLUDED."room","emergencyContact"=EXCLUDED."emergencyContact","referralHospital"=EXCLUDED."referralHospital","updatedAt"=CURRENT_TIMESTAMP`,
          input.clinicName || null,input.phone || null,input.room || null,input.emergencyContact || null,input.referralHospital || null);
        await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "clinic.settings.updated", entityType: "ClinicSettings", entityId: session.schoolId, after: { clinicName: input.clinicName || null, room: input.room || null, referralHospital: input.referralHospital || null } } });
        return { ok: true };
      }

      throw new AppError("Unknown clinic action.", 400, "UNKNOWN_CLINIC_ACTION");
    });
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
