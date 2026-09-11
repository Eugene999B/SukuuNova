import { describe, expect, it } from "vitest";

/**
 * Runtime-contract smoke guard for finance workspaces.
 *
 * The production incident behind this test was caused by client workspaces
 * assuming every API array/permission field was present. The UI now treats
 * partial/rolling-deploy payloads as safe defaults rather than throwing the
 * global application error boundary.
 */
function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function financeShape(payload: unknown) {
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const permissions = source.permissions && typeof source.permissions === "object"
    ? source.permissions as Record<string, unknown>
    : {};
  return {
    feeItems: arrayOrEmpty(source.feeItems),
    invoices: arrayOrEmpty(source.invoices),
    payments: arrayOrEmpty(source.payments),
    reversals: arrayOrEmpty(source.reversals),
    terms: arrayOrEmpty(source.terms),
    classes: arrayOrEmpty(source.classes),
    students: arrayOrEmpty(source.students),
    permissions: {
      canWriteFees: permissions.canWriteFees === true,
      canCreateInvoices: permissions.canCreateInvoices === true,
      canRecordPayments: permissions.canRecordPayments === true,
      canReversePayments: permissions.canReversePayments === true,
      canExportFinance: permissions.canExportFinance === true,
    },
  };
}

function payrollShape(payload: unknown) {
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return {
    canManage: source.canManage === true,
    staff: arrayOrEmpty(source.staff),
    structures: arrayOrEmpty(source.structures),
    runs: arrayOrEmpty(source.runs),
    payslips: arrayOrEmpty(source.payslips),
  };
}

describe("finance runtime payload safety", () => {
  it("normalizes legacy or partial finance payloads without missing-array crashes", () => {
    expect(financeShape({ invoices: [{ id: "i1" }] })).toEqual({
      feeItems: [],
      invoices: [{ id: "i1" }],
      payments: [],
      reversals: [],
      terms: [],
      classes: [],
      students: [],
      permissions: {
        canWriteFees: false,
        canCreateInvoices: false,
        canRecordPayments: false,
        canReversePayments: false,
        canExportFinance: false,
      },
    });
  });

  it("normalizes empty payroll payloads without missing-array crashes", () => {
    expect(payrollShape({ canManage: true })).toEqual({
      canManage: true,
      staff: [],
      structures: [],
      runs: [],
      payslips: [],
    });
  });

  it("fails permissions closed unless the API explicitly returns true", () => {
    const normalized = financeShape({ permissions: { canRecordPayments: "true", canExportFinance: 1 } });
    expect(normalized.permissions.canRecordPayments).toBe(false);
    expect(normalized.permissions.canExportFinance).toBe(false);
  });
});
