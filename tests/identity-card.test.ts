import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { withTenant } from "../src/lib/db";
import { ensureIdentityCardsForSchool, getIdentityCardsByScope, listIdentityCards, buildIdentityCardPdf, identityCardSignature, verifyIdentityCardSignature } from "../src/lib/identity-card-service";
import { createTenantFixture, type Fixture } from "./helpers";

describe("school identity cards", () => {
  let fixture: Fixture;
  let other: Fixture;
  let studentId = "";
  let staffId = "";
  let otherCardId = "";

  beforeAll(async () => {
    process.env.SCHOOL_AUTH_SECRET = "identity-card-test-secret-012345678901234567890123";
    fixture = await createTenantFixture();
    other = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.userPermissionOverride.create({ data: { schoolId: fixture.schoolId, userId: fixture.memberId, permissionId: fixture.permissionIds.get("identity_cards:manage")!, granted: true } });
      studentId = (await tx.student.create({ data: { schoolId: fixture.schoolId, admissionNo: `IC-${fixture.schoolId}`, name: "Identity Card Student" } })).id;
      staffId = (await tx.user.create({ data: { schoolId: fixture.schoolId, name: "Identity Card Staff", email: `id-card-staff-${fixture.schoolId}@test.invalid`, passwordHash: "test-only" } })).id;
      await tx.userRole.create({ data: { schoolId: fixture.schoolId, userId: staffId, roleId: fixture.testRoleId } });
      await tx.userPermissionOverride.create({ data: { schoolId: fixture.schoolId, userId: staffId, permissionId: fixture.permissionIds.get("identity_cards:manage")!, granted: true } });
    });
    await withTenant(other.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: other.schoolId }, select: { uniqueCode: true } });
      await ensureIdentityCardsForSchool(tx, other.schoolId, school!.uniqueCode, other.ownerId);
      otherCardId = (await listIdentityCards(tx, other.schoolId, school!.uniqueCode, other.ownerId))[0]?.id ?? "";
    });
  });

  it("creates one current card for each active student and non-family staff member", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: fixture.schoolId }, select: { uniqueCode: true } });
      const result = await ensureIdentityCardsForSchool(tx, fixture.schoolId, school!.uniqueCode, fixture.ownerId);
      expect(result.created).toBeGreaterThanOrEqual(2);
      const cards = await getIdentityCardsByScope(tx, fixture.schoolId, school!.uniqueCode, "all", [], fixture.ownerId);
      expect(cards.filter((card) => card.studentId === studentId)).toHaveLength(1);
      expect(cards.filter((card) => card.staffId === staffId)).toHaveLength(1);
    });
  });

  it("revokes a staff card when the staff member loses staff eligibility", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: fixture.schoolId }, select: { uniqueCode: true } });
      const current = await listIdentityCards(tx, fixture.schoolId, school!.uniqueCode, fixture.ownerId);
      expect(current.some((card) => card.staffId === staffId && card.status === "active")).toBe(true);
      await tx.userRole.deleteMany({ where: { schoolId: fixture.schoolId, userId: staffId } });
      const result = await ensureIdentityCardsForSchool(tx, fixture.schoolId, school!.uniqueCode, fixture.ownerId);
      expect(result.revokedStale).toBeGreaterThanOrEqual(1);
      const after = await listIdentityCards(tx, fixture.schoolId, school!.uniqueCode, fixture.ownerId);
      expect(after.filter((card) => card.staffId === staffId && card.status === "active")).toHaveLength(0);
      expect(after.filter((card) => card.staffId === staffId)).toHaveLength(1);
    });
  });

  it("rejects tampered signatures", () => {
    const now = new Date("2026-09-02T10:00:00.000Z");
    const card = { schoolId: "school-a", serial: "SNV-A-ST-123", personType: "student" as const, issuedAt: now, expiresAt: new Date("2028-09-02T10:00:00.000Z"), version: 1 };
    const signature = identityCardSignature(card);
    expect(verifyIdentityCardSignature(card, signature)).toBe(true);
    expect(verifyIdentityCardSignature({ ...card, serial: "SNV-A-ST-999" }, signature)).toBe(false);
  });

  it("keeps bulk selections inside the authenticated school", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: fixture.schoolId }, select: { uniqueCode: true } });
      const scoped = await getIdentityCardsByScope(tx, fixture.schoolId, school!.uniqueCode, "selected", [otherCardId], fixture.ownerId);
      expect(scoped).toHaveLength(0);
    });
  });

  it("produces an A4 print pack for selected current cards", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: fixture.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } });
      const cards = (await listIdentityCards(tx, fixture.schoolId, school!.uniqueCode, fixture.ownerId)).filter((card) => card.status === "active" && !card.isExpired);
      const selected = cards.slice(0, 2);
      const pdf = await buildIdentityCardPdf(selected, school!, "https://sukuunova.example");
      expect(Buffer.byteLength(pdf)).toBeGreaterThan(1000);
      const document = await PDFDocument.load(pdf);
      expect(document.getPageCount()).toBe(1);
    });
  });
});
