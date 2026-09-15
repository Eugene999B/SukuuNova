import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { chromium } from "playwright";
import { createTenantFixture, rawDb } from "../tests/helpers";
import { withTenant } from "../src/lib/db";
import { resolveStudentTermClass } from "../src/lib/student-term-context";

async function main() {
  const baseURL = "http://localhost:3000";
  const f = await createTenantFixture();
  const password = randomBytes(24).toString("base64url");
  const setup = await withTenant(f.schoolId, async (tx) => {
    await tx.user.update({ where: { id: f.ownerId }, data: { passwordHash: await hash(password, 4) } });
    await tx.role.update({ where: { id: f.ownerRoleId }, data: { key: "owner", name: "Owner" } });
    const year = await tx.academicYear.create({ data: { schoolId: f.schoolId, name: "2026/27", startDate: new Date("2026-09-01"), endDate: new Date("2027-08-31") } });
    const term = await tx.term.create({ data: { schoolId: f.schoolId, academicYearId: year.id, name: "Term 1", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31") } });
    await tx.class.create({ data: { schoolId: f.schoolId, name: "Basic 1" } });
    return { year, term };
  });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
    const login = await context.request.post("/api/auth/school/login", { data: { uniqueCode: f.uniqueCode, identifier: f.ownerId + "@test.invalid", password } });
    assert.equal(login.status(), 200, "Owner login failed: " + await login.text());
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(`${page.url()}: ${error.message}`));
    await page.goto("/dashboard");
    await page.getByText("Setup completion", { exact: true }).waitFor();
    assert.ok(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth + 1), "Mobile dashboard overflows horizontally");
    await page.goto("/school/devices");
    await page.getByRole("button", { name: "Rules & times", exact: true }).waitFor();
    await page.getByRole("button", { name: "Rules & times", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Rules & times", exact: true }).getAttribute("aria-pressed"), "true");
    const uploaded = await context.request.post("/api/school/import", { multipart: {
      action: "upload", kind: "students",
      file: { name: "browser-learners.csv", mimeType: "text/csv", buffer: Buffer.from("Student Name,Admission No,Class\nƐsi Ɔpoku,BROWSER-001,Basic 1\n") },
    } });
    assert.equal(uploaded.status(), 201, await uploaded.text());
    const { batch } = await uploaded.json();
    const validated = await context.request.post("/api/school/import", { data: { action: "validate", batchId: batch.id, columnMapping: batch.columnMapping } });
    assert.equal(validated.status(), 200, await validated.text());
    const applied = await context.request.post("/api/school/import", { data: { action: "apply", batchId: batch.id, confirmation: "APPLY", intakeAcademicYearId: setup.year.id, placementTermId: setup.term.id } });
    assert.equal(applied.status(), 200, await applied.text());
    const student = await withTenant(f.schoolId, (tx) => tx.student.findFirstOrThrow({ where: { admissionNo: "BROWSER-001" } }));
    const placement = await withTenant(f.schoolId, (tx) => resolveStudentTermClass(tx, { schoolId: f.schoolId, studentId: student.id, termId: setup.term.id }));
    assert.equal(placement.enrollmentStatus, "confirmed");
    assert.equal((await context.request.get("/api/school/payroll-v2")).status(), 403, "Payroll must be unavailable without an entitlement");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/school/students");
    await page.getByText("Ɛsi Ɔpoku", { exact: true }).first().waitFor();
    assert.deepEqual(pageErrors, [], "Browser emitted JavaScript errors");
    console.log("Browser smoke passed: login, mobile dashboard, labeled device tabs, Unicode learner import, confirmed enrollment, payroll plan denial and desktop learner directory.");
  } finally { await browser.close(); await rawDb.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
