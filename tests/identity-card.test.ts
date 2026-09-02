import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { withTenant } from "../src/lib/db";
import { ensureIdentityCardsForSchool, getIdentityCardsByScope, buildIdentityCardPdf, identityCardSignature, verifyIdentityCardSignature } from "../src/lib/identity-card-service";
import { createTenantFixture, type Fixture } from "./helpers";

describe("school identity cards", () => {
  let fixture: Fixture;
  let other: Fixture;
  let studentId = "";
  let staffId = "";

  beforeAll(async () => {
    process.env.SCHOOL_AUTH_SECRET = "identity-card-test-secret-012345678901234567890123";
    fixture = await createTenantFixture();
    other = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.userPermissionOverride.create({
        data: {
          schoolId: fixture.schoolId,
          userId: fixture.memberId,
          permissionId: fixture.permissionIds.get("identity_cards:manage")!,
          granted: true
        }
      });
      const student = await tx.student.create({
        data: { schoolId: fixture.schoolId, admissionNo: `IC-${fixture.schoolId}`, name: "Identity Card Student" }
      });
      studentId = student.id;
      staffId = (await tx.user.create({
        data: { schoolId: fixture.schoolId, name: "Identity Card Staff", email: `id-card-staff-${fixture.schoolId}@test.invalid`, passwordHash: "test-only" }
      })).id;
      await tx.userPermissionOverride.create({
        data: { schoolId: fixture.schoolId, userId: staffId, permissionId: fixture.permissionIds.get("identity_cards:manage")!, granted: true }
      });
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

  it("rejects tampered signatures", () => {
    const now = new Date("2026-09-02T10:00:00.000Z");
    const card = { schoolId: "school-a", serial: "SNV-A-ST-123", personType: "student" as const, issuedAt: now, expiresAt: new Date("2028-09-02T10:00:00.000Z"), version: 1 };
    const signature = identityCardSignature(card);
    expect(verifyIdentityCardSignature(card, signature)).toBe(true);
    expect(verifyIdentityCardSignature({ ...card, serial: "SNV-A-ST-999" }, signature)).toBe(false);
  });

  it("keeps bulk selections inside the authenticated school", async () => {
    await withTenant(other.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: other.schoolId }, select: { uniqueCode: true } });
      await ensureIdentityCardsForSchool(tx, other.schoolId, school!.uniqueCode, other.ownerId);
      const otherCards = await getIdentityCardsByScope(tx, other.schoolId, school!.uniqueCode, "all", [], other.ownerId);
      await withTenant(fixture.schoolId, async (inner) => {
        const fixtureSchool = await inner.school.findUnique({ where: { id: fixture.schoolId }, select: { uniqueCode: true } });
        const scoped = await getIdentityCardsByScope(inner, fixture.schoolId, fixtureSchool!.uniqueCode, "selected", [otherCards[0]?.id ?? "missing"], fixture.ownerId);
        expect(scoped).toHaveLength(0);
      });
    });
  });

  it("produces a readable A4 print pack containing the requested cards", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: fixture.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } });
      const cards = await getIdentityCardsByScope(tx, fixture.schoolId, school!.uniqueCode, "selected", [], fixture.ownerId);
      const selected = cards.slice(0, 2);
      const pdf = await buildIdentityCardPdf(selected, school!, "https://sukuunova.example");
      expect(Buffer.byteLength(pdf)).toBeGreaterThan(1000);
      const document = await PDFDocument.load(pdf);
      expect(document.getPageCount()).toBe(1);
    });
  });
});
