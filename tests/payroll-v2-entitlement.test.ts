import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ feature: vi.fn(), snapshot: vi.fn(), save: vi.fn(), run: vi.fn(), paid: vi.fn() }));
vi.mock("../src/lib/auth", () => ({ requireSchoolSession: async () => ({ schoolId: "school", userId: "user" }) }));
vi.mock("../src/lib/db", () => ({ withTenant: async (_id: string, work: (tx: object) => unknown) => work({}) }));
vi.mock("../src/lib/feature-flags", () => ({ requireSchoolFeatureInTransaction: mocks.feature }));
vi.mock("../src/lib/payroll-v2-service", () => ({ payrollV2Snapshot: mocks.snapshot, saveSalaryStructureV2: mocks.save, markPayrollPaidV2: mocks.paid }));
vi.mock("../src/lib/payroll-v2-run-guard", () => ({ runPayrollV2ForEffectiveStaff: mocks.run }));
import { AppError } from "../src/lib/errors";
import { GET, POST } from "../src/app/api/school/payroll-v2/route";
describe("payroll subscription boundary", () => {
  it("blocks reads and writes before touching payroll when the plan excludes it", async () => {
    mocks.feature.mockRejectedValue(new AppError("Not included", 403, "FEATURE_NOT_INCLUDED"));
    expect((await GET()).status).toBe(403);
    const response = await POST(new Request("https://example.test/api/school/payroll-v2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run.process", period: "2026-09" }) }));
    expect(response.status).toBe(403);
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
