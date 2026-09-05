import { Prisma, PrismaClient } from "@prisma/client";
import { TenantScopeError } from "./errors";
import { currentSchoolId, tenantContext, validateSchoolId } from "./tenant-context";
import { runtimeEnv } from "./env";

void runtimeEnv;

const TENANT_MODELS = new Set([
  "School", "SchoolSettings", "User", "Role", "RolePermission", "UserRole", "UserPermissionOverride",
  "SchoolPasswordResetToken", "AuditLogSchool", "AcademicYear", "CalendarEvent", "Term", "Student",
  "Guardian", "StudentGuardian", "Class", "Subject", "ClassSubjectTeacher", "AttendanceEvent", "Assessment",
  "Score", "ReportCard", "FeeItem", "Invoice", "InvoiceLine", "Payment", "PaymentReversal", "Message",
  "TimetableSlot", "SubstituteAssignment", "FaceEnrollment", "FaceMatchReview", "ApprovedPickup",
  "PickupApprovalRequest", "PickupEvent", "SalaryStructure", "PayrollRun", "Payslip", "VisitorLog",
  "ReportCardTemplate", "House", "Device", "DeviceIdentity", "DeviceAttendanceReceipt",
  "SyncOperation", "AttendanceRecord", "StudentRiskFlag", "IdentityCard"
]);

const AUDIT_MODELS = new Set(["AuditLogSchool", "AuditLogPlatform"]);
const APPEND_ONLY_MODELS = new Set(["InvoiceLine", "Payment", "PaymentReversal", "Payslip", "PickupEvent"]);
const DELETE_PROTECTED_MODELS = new Set(["Invoice"]);
const READ_OPERATIONS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"]);
const UNIQUE_READ_OPERATIONS = new Set(["findUnique", "findUniqueOrThrow"]);
const UNIQUE_WRITE_OPERATIONS = new Set(["update", "delete"]);
const UPDATE_OPERATIONS = new Set(["update", "updateMany", "updateManyAndReturn"]);
const DELETE_OPERATIONS = new Set(["delete", "deleteMany"]);
// Models that declare @@unique([id, schoolId]) alongside @id(id). For these,
// a singular lookup by id must be rewritten to the compound id_schoolId key:
// Prisma findUnique/update/delete reject a flat { id, schoolId } filter.
const COMPOUND_ID_MODELS = new Set([
  "User", "Role", "SchoolPasswordResetToken", "AuditLogSchool", "AcademicYear", "CalendarEvent", "Term",
  "Student", "Guardian", "House", "Class", "Subject", "AttendanceEvent", "Assessment", "Score",
  "ReportCard", "FeeItem", "Invoice", "Payment", "PaymentReversal", "Message", "TimetableSlot",
  "SubstituteAssignment", "FaceEnrollment", "FaceMatchReview", "ApprovedPickup", "PickupApprovalRequest",
  "PickupEvent", "SalaryStructure", "PayrollRun", "Payslip", "VisitorLog", "Device", "DeviceIdentity",
  "DeviceAttendanceReceipt", "IdentityCard"
]);

type MutableArgs = Record<string, unknown>;

function assertNoContradictoryWhere(model: string, where: MutableArgs, schoolId: string) {
  if (model === "School" && typeof where.id === "string" && where.id !== schoolId) throw new TenantScopeError();
  if (model !== "School" && typeof where.schoolId === "string" && where.schoolId !== schoolId) throw new TenantScopeError();
  // Validate nested compound unique keys that embed schoolId (e.g. id_schoolId, schoolId_staffId).
  for (const value of Object.values(where)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as MutableArgs;
      if (typeof nested.schoolId === "string" && nested.schoolId !== schoolId) throw new TenantScopeError();
    }
  }
}

function tenantUniqueWhere(model: string, where: MutableArgs | undefined, schoolId: string): MutableArgs {
  const original = where ?? {};
  assertNoContradictoryWhere(model, original, schoolId);
  if (model === "School") return { id: schoolId };
  // ReportCardTemplate supports global presets (schoolId null); RLS enforces
  // (schoolId IS NULL OR schoolId = current). Keep the caller's unique filter.
  if (model === "ReportCardTemplate") return original;
  const compound = (original as MutableArgs).id_schoolId as MutableArgs | undefined;
  if (compound && typeof compound === "object") {
    if (typeof compound.schoolId === "string" && compound.schoolId !== schoolId) throw new TenantScopeError();
    return { id_schoolId: { ...(compound as object), schoolId } };
  }
  if (typeof original.id === "string" && COMPOUND_ID_MODELS.has(model)) {
    return { id_schoolId: { id: original.id, schoolId } };
  }
  if (typeof original.schoolId === "string") return original;
  // Composite-PK models (RolePermission, UserRole, ...) and global lookups:
  // Prisma findUnique cannot accept an extra schoolId filter, so rely on RLS
  // (set_config + FORCE RLS) which already scopes these reads. Do not inject
  // an invalid flat { ..., schoolId } filter that would throw P2023.
  return original;
}

function tenantWhere(model: string, where: MutableArgs | undefined, schoolId: string): MutableArgs {
  const original = where ?? {};
  assertNoContradictoryWhere(model, original, schoolId);
  if (model === "School") return { ...original, id: schoolId };
  if (model === "ReportCardTemplate") return { AND: [original, { OR: [{ schoolId }, { schoolId: null }] }] };
  return { ...original, schoolId };
}

function tenantData(model: string, data: MutableArgs | MutableArgs[], schoolId: string): MutableArgs | MutableArgs[] {
  if (Array.isArray(data)) return data.map((entry) => tenantData(model, entry, schoolId) as MutableArgs);
  const tenantKey = model === "School" ? "id" : "schoolId";
  const supplied = data?.[tenantKey];
  if (typeof supplied === "string" && supplied !== schoolId) throw new TenantScopeError("A cross-tenant write was rejected.");
  return { ...data, [tenantKey]: schoolId };
}

function rejectTenantKeyMutation(model: string, data: MutableArgs | undefined, schoolId: string) {
  if (!data) return;
  const tenantKey = model === "School" ? "id" : "schoolId";
  if (Object.prototype.hasOwnProperty.call(data, tenantKey) && data[tenantKey] !== schoolId) throw new TenantScopeError("Tenant ownership cannot be changed.");
}

const globalForPrisma = globalThis as unknown as { sukuunovaPrisma?: PrismaClient };
const basePrisma = globalForPrisma.sukuunovaPrisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.sukuunovaPrisma = basePrisma;
export const rawDb = basePrisma;
export const db = basePrisma.$extends({
  name: "sukuunova-tenant-and-audit-guard",
  query: {
    $allModels: {
      $allOperations: async ({ model, operation, args, query }) => {
        if (AUDIT_MODELS.has(model) && (UPDATE_OPERATIONS.has(operation) || DELETE_OPERATIONS.has(operation) || operation === "upsert")) throw new TenantScopeError("Audit logs are append-only.");
        if (APPEND_ONLY_MODELS.has(model) && (UPDATE_OPERATIONS.has(operation) || DELETE_OPERATIONS.has(operation) || operation === "upsert")) throw new TenantScopeError("Financial ledger records are append-only.");
        if (DELETE_PROTECTED_MODELS.has(model) && DELETE_OPERATIONS.has(operation)) throw new TenantScopeError("Invoices cannot be deleted.");
        if (!TENANT_MODELS.has(model)) return query(args);
        const schoolId = currentSchoolId();
        const next = { ...(args as MutableArgs) };
        if (UNIQUE_READ_OPERATIONS.has(operation)) next.where = tenantUniqueWhere(model, next.where as MutableArgs | undefined, schoolId);
        else if (READ_OPERATIONS.has(operation)) next.where = tenantWhere(model, next.where as MutableArgs | undefined, schoolId);
        else if (operation === "create") next.data = tenantData(model, next.data as MutableArgs, schoolId);
        else if (operation === "createMany" || operation === "createManyAndReturn") next.data = tenantData(model, next.data as MutableArgs | MutableArgs[], schoolId);
        else if (UPDATE_OPERATIONS.has(operation)) {
          next.where = UNIQUE_WRITE_OPERATIONS.has(operation)
            ? tenantUniqueWhere(model, next.where as MutableArgs | undefined, schoolId)
            : tenantWhere(model, next.where as MutableArgs | undefined, schoolId);
          rejectTenantKeyMutation(model, next.data as MutableArgs | undefined, schoolId);
        } else if (DELETE_OPERATIONS.has(operation)) next.where = UNIQUE_WRITE_OPERATIONS.has(operation)
          ? tenantUniqueWhere(model, next.where as MutableArgs | undefined, schoolId)
          : tenantWhere(model, next.where as MutableArgs | undefined, schoolId);
        else if (operation === "upsert") {
          next.where = tenantUniqueWhere(model, next.where as MutableArgs | undefined, schoolId);
          next.create = tenantData(model, next.create as MutableArgs, schoolId);
          rejectTenantKeyMutation(model, next.update as MutableArgs | undefined, schoolId);
        } else throw new TenantScopeError("Unsupported tenant-scoped Prisma operation: " + operation);
        return query(next as typeof args);
      },
    },
  },
});

export type TenantDb = Prisma.TransactionClient;
export async function withTenant<T>(schoolIdInput: string, work: (tx: TenantDb) => Promise<T>): Promise<T> {
  const schoolId = validateSchoolId(schoolIdInput);
  return tenantContext.run({ schoolId }, async () => db.$transaction(async (extendedTx) => {
    const tx = extendedTx as unknown as TenantDb;
    await tx.$queryRawUnsafe("SELECT set_config('app.current_school_id', $1, true)", schoolId);
    return work(tx);
  }));
}
