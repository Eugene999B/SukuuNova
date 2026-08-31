import { Prisma, PrismaClient } from "@prisma/client";
import { TenantScopeError } from "./errors";
import {
  currentSchoolId,
  tenantContext,
  validateSchoolId
} from "./tenant-context";

const TENANT_MODELS = new Set([
  "School",
  "SchoolSettings",
  "User",
  "Role",
  "RolePermission",
  "UserRole",
  "UserPermissionOverride",
  "SchoolPasswordResetToken",
  "AuditLogSchool",
  "AcademicYear",
  "CalendarEvent",
  "Term",
  "Student",
  "Guardian",
  "StudentGuardian",
  "Class",
  "Subject",
  "ClassSubjectTeacher",
  "AttendanceEvent",
  "Assessment",
  "Score",
  "ReportCard",
  "FeeItem",
  "Invoice",
  "InvoiceLine",
  "Payment",
  "PaymentReversal",
  "Message",
  "TimetableSlot",
  "SubstituteAssignment",
  "FaceEnrollment",
  "FaceMatchReview",
  "ApprovedPickup",
  "PickupApprovalRequest",
  "PickupEvent",
  "SalaryStructure",
  "PayrollRun",
  "Payslip",
  "VisitorLog",
  "ReportCardTemplate",
  "Device",
  "DeviceIdentity",
  "DeviceAttendanceReceipt"
]);

const AUDIT_MODELS = new Set(["AuditLogSchool", "AuditLogPlatform"]);
const APPEND_ONLY_MODELS = new Set([
  "InvoiceLine",
  "Payment",
  "PaymentReversal",
  "Payslip",
  "PickupEvent"
]);
const DELETE_PROTECTED_MODELS = new Set(["Invoice"]);
const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy"
]);
const UPDATE_OPERATIONS = new Set(["update", "updateMany", "updateManyAndReturn"]);
const DELETE_OPERATIONS = new Set(["delete", "deleteMany"]);

// Prisma exposes heterogeneous per-model argument shapes in this dynamic extension.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutableArgs = Record<string, any>;

function assertNoContradictoryWhere(
  model: string,
  where: MutableArgs,
  schoolId: string
) {
  if (
    model === "School" &&
    typeof where.id === "string" &&
    where.id !== schoolId
  ) {
    throw new TenantScopeError();
  }

  if (
    model !== "School" &&
    typeof where.schoolId === "string" &&
    where.schoolId !== schoolId
  ) {
    throw new TenantScopeError();
  }
}

function tenantWhere(
  model: string,
  where: MutableArgs | undefined,
  schoolId: string
): MutableArgs {
  const original = where ?? {};
  assertNoContradictoryWhere(model, original, schoolId);
  if (model === "School") return { ...original, id: schoolId };
  if (model === "ReportCardTemplate") {
    return {
      AND: [
        original,
        { OR: [{ schoolId }, { schoolId: null }] }
      ]
    };
  }
  return { ...original, schoolId };
}

function tenantData(
  model: string,
  data: MutableArgs | MutableArgs[],
  schoolId: string
): MutableArgs | MutableArgs[] {
  if (Array.isArray(data)) {
    return data.map((entry) => tenantData(model, entry, schoolId) as MutableArgs);
  }

  const tenantKey = model === "School" ? "id" : "schoolId";
  const supplied = data?.[tenantKey];
  if (typeof supplied === "string" && supplied !== schoolId) {
    throw new TenantScopeError("A cross-tenant write was rejected.");
  }
  return { ...data, [tenantKey]: schoolId };
}

function rejectTenantKeyMutation(
  model: string,
  data: MutableArgs | undefined,
  schoolId: string
) {
  if (!data) return;
  const tenantKey = model === "School" ? "id" : "schoolId";
  if (
    Object.prototype.hasOwnProperty.call(data, tenantKey) &&
    data[tenantKey] !== schoolId
  ) {
    throw new TenantScopeError("Tenant ownership cannot be changed.");
  }
}

const globalForPrisma = globalThis as unknown as {
  sukuunovaPrisma?: PrismaClient;
};

const basePrisma =
  globalForPrisma.sukuunovaPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.sukuunovaPrisma = basePrisma;
}

// Unextended client for authentication/bootstrap operations that must establish
// the PostgreSQL tenant GUC explicitly before touching FORCE RLS tables.
export const rawDb = basePrisma;

export const db = basePrisma.$extends({
  name: "sukuunova-tenant-and-audit-guard",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (
          AUDIT_MODELS.has(model) &&
          (UPDATE_OPERATIONS.has(operation) ||
            DELETE_OPERATIONS.has(operation) ||
            operation === "upsert")
        ) {
          throw new TenantScopeError("Audit logs are append-only.");
        }

        if (
          APPEND_ONLY_MODELS.has(model) &&
          (UPDATE_OPERATIONS.has(operation) || DELETE_OPERATIONS.has(operation) || operation === "upsert")
        ) {
          throw new TenantScopeError("Financial ledger records are append-only.");
        }

        if (DELETE_PROTECTED_MODELS.has(model) && DELETE_OPERATIONS.has(operation)) {
          throw new TenantScopeError("Invoices cannot be deleted.");
        }

        if (!TENANT_MODELS.has(model)) {
          return query(args);
        }

        const schoolId = currentSchoolId();
        const next = { ...(args as MutableArgs) };

        if (READ_OPERATIONS.has(operation)) {
          next.where = tenantWhere(model, next.where, schoolId);
        } else if (operation === "create") {
          next.data = tenantData(model, next.data, schoolId);
        } else if (
          operation === "createMany" ||
          operation === "createManyAndReturn"
        ) {
          next.data = tenantData(model, next.data, schoolId);
        } else if (UPDATE_OPERATIONS.has(operation)) {
          next.where = tenantWhere(model, next.where, schoolId);
          rejectTenantKeyMutation(model, next.data, schoolId);
        } else if (DELETE_OPERATIONS.has(operation)) {
          next.where = tenantWhere(model, next.where, schoolId);
        } else if (operation === "upsert") {
          next.where = tenantWhere(model, next.where, schoolId);
          next.create = tenantData(model, next.create, schoolId);
          rejectTenantKeyMutation(model, next.update, schoolId);
        } else {
          throw new TenantScopeError(
            "Unsupported tenant-scoped Prisma operation: " + operation
          );
        }

        return query(next as typeof args);
      }
    }
  }
});

export type TenantDb = Prisma.TransactionClient;

export async function withTenant<T>(
  schoolIdInput: string,
  work: (tx: TenantDb) => Promise<T>
): Promise<T> {
  const schoolId = validateSchoolId(schoolIdInput);

  return tenantContext.run({ schoolId }, async () =>
    db.$transaction(async (extendedTx) => {
      const tx = extendedTx as unknown as TenantDb;
      await tx.$queryRawUnsafe(
        "SELECT set_config('app.current_school_id', $1, true)",
        schoolId
      );
      return work(tx);
    })
  );
}
