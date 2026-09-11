import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { withTenant } from "../src/lib/db";
import {
  ensureIdentityCardsForSchool,
  getIdentityCardSettings,
  getIdentityCardsByScope,
  listIdentityCards,
  buildIdentityCardPdf,
  buildSingleIdentityCardPdf,
  identityCardSignature,
  updateIdentityCardSettings,
  verifyIdentityCardSignature,
} from "../src/lib/identity-card-service";
import { createTenantFixture, type Fixture } from "./helpers";

const PORTRAIT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlKj7sAAAAASUVORK5CYII=";

describe("school identity cards", () => {
  let fixture: Fixture;
  let other: Fixture;
  let studentId = "";
  let secondStudentId = "";
  let staffId = "";
  let classId = "";
  let secondClassId = "";
  let otherClassId = "";
  let otherCardId = "";

  beforeAll(async () => {
    process.env.SCHOOL_AUTH_SECRET = "identity-card-test-secret-012345678901234567890123";
    fixture = await createTenantFixture();
    other = await createTenantFixture();

    await withTenant(fixture.schoolId, async (tx) => {
      await tx.userPermissionOverride.create({ data: { schoolId: fixture.schoolId, userId: fixture.memberId, permissionId: fixture.permissionIds.get("identity_cards:manage")!, granted: true } });
      const firstClass = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Blue", level: "JHS 1" } });
      const secondClass = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Gold", level: "JHS 2" } });
      classId = firstClass.id;
      secondClassId = secondClass.id;
      studentId = (await tx.student.create({ data: { schoolId: fixture.schoolId, admissionNo: `IC-${fixture.schoolId}`, name: "Identity Card Student", classId, photoUrl: PORTRAIT } })).id;
      secondStudentId = (await tx.student.create({ data: { schoolId: fixture.schoolId, admissionNo: `IC-2-${fixture.schoolId}`, name: "Second Card Student", classId: secondClassId } })).id;
      staffId = (await tx.user.create({ data: { schoolId: fixture.schoolId, name: "Identity Card Staff", email: `id-card-staff-${fixture.schoolId}@test.invalid`, passwordHash: "test-only" } })).id;
      await tx.userRole.create({ data: { schoolId: fixture.schoolId, userId: staffId, roleId: fixture.testRoleId } });
      await tx.userPermissionOverride.create({ data: { schoolId: fixture.schoolId, userId: staffId, permissionId: fixture.permissionIds.get("identity_cards:manage")!, granted: true } });
      await tx.$executeRawUnsafe(`UPDATE "User" SET "photoUrl"=$3 WHERE "schoolId"=$1 AND "id"=$2`, fixture.schoolId, staffId, PORTRAIT);
    });

    await withTenant(other.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: other.schoolId }, select: { uniqueCode: true } });
      const schoolClass = await tx.class.create({ data: { schoolId: other.schoolId, name: "Other", level: "JHS 1" } });
      otherClassId = schoolClass.id;
      await ensureIdentityCardsForSchool(tx, other.schoolId, school!.uniqueCode, other.ownerId);
      otherCardId = (await listIdentityCards(tx, other.schoolId, school!.uniqueCode, other.ownerId))[0]?.id ?? "";
    });
  });

  it("creates one current card for each active student and non-family staff member", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: fixture.schoolId }, select: { uniqueCode: true } });
      const result = await ensureIdentityCardsForSchool(tx, fixture.schoolId, school!.uniqueCode, fixture.ownerId);
      expect(result.created).toBeGreaterThanOrEqual(3);
      const cards = await getIdentityCardsByScope(tx, fixture.schoolId, school!.uniqueCode, "all", [], fixture.ownerId);
      expect(cards.filter((card) => card.studentId === studentId && card.status === "active")).toHaveLength(1);
      expect(cards.filter((card) => card.studentId === secondStudentId && card.status === "active")).toHaveLength(1);
      expect(cards.filter((card) => card.staffId === staffId && card.status === "active")).toHaveLength(1);
      expect(cards.find((card) => card.studentId === studentId)?.personNumber).toBe(`IC-${fixture.schoolId}`);
      expect(cards.find((card) => card.staffId === staffId)?.personNumber).toMatch(/^STF-[A-Z0-9]{8}$/);
    });
  });

  it("uses five years by default and lets the school change the validity for every active card", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const settings = await getIdentityCardSettings(tx, fixture.schoolId);
      expect(settings.validityMonths).toBe(60);
      const before = await tx.$queryRawUnsafe<Array<{ version: number; issuedAt: Date; expiresAt: Date }>>(`SELECT "version","issuedAt","expiresAt" FROM "IdentityCard" WHERE "schoolId"=$1 AND "status"='active' ORDER BY "createdAt" ASC`, fixture.schoolId);
      const result = await updateIdentityCardSettings(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId, validityMonths: 36 });
      expect(result.validityMonths).toBe(36);
      expect(result.updatedCards).toBeGreaterThan(0);
      const after = await tx.$queryRawUnsafe<Array<{ version: number; issuedAt: Date; expiresAt: Date }>>(`SELECT "version","issuedAt","expiresAt" FROM "IdentityCard" WHERE "schoolId"=$1 AND "status"='active' ORDER BY "createdAt" ASC`, fixture.schoolId);
      expect(after[0]?.version).toBe((before[0]?.version ?? 0) + 1);
      const expected = new Date(after[0]!.issuedAt);
      expected.setUTCMonth(expected.getUTCMonth() + 36);
      expect(after[0]!.expiresAt.toISOString()).toBe(expected.toISOString());
      await updateIdentityCardSettings(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId, validityMonths: 60 });
    });
  });

  it("returns only the requested class and rejects a class from another tenant", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: fixture.schoolId }, select: { uniqueCode: true } });
      const firstClassCards = await getIdentityCardsByScope(tx, fixture.schoolId, school!.uniqueCode, "class", [], fixture.ownerId, classId);
      expect(firstClassCards.some((card) => card.studentId === studentId)).toBe(true);
      expect(firstClassCards.some((card) => card.studentId === secondStudentId)).toBe(false);
      expect(firstClassCards.every((card) => card.personType === "student" && card.classId === classId)).toBe(true);
      await expect(getIdentityCardsByScope(tx, fixture.schoolId, school!.uniqueCode, "class", [], fixture.ownerId, otherClassId)).rejects.toMatchObject({ code: "CLASS_NOT_FOUND" });
    });
  });

  it("returns the canonical staff portrait for printed cards", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: fixture.schoolId }, select: { uniqueCode: true } });
      const cards = await listIdentityCards(tx, fixture.schoolId, school!.uniqueCode, fixture.ownerId);
      const staffCard = cards.find((card) => card.staffId === staffId && card.status === "active");
      expect(staffCard?.photoUrl).toBe(PORTRAIT);
      expect(staffCard?.photoReady).toBe(true);
    });
  });

  it("produces two-sided wallet cards and paired A4 front/back print sheets", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: fixture.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } });
      const cards = (await listIdentityCards(tx, fixture.schoolId, school!.uniqueCode, fixture.ownerId)).filter((card) => card.status === "active" && !card.isExpired);
      const studentCard = cards.find((card) => card.studentId === studentId)!;
      const singlePdf = await buildSingleIdentityCardPdf(studentCard, school!, "https://sukuunova.example");
      expect(Buffer.byteLength(singlePdf)).toBeGreaterThan(1000);
      const singleDocument = await PDFDocument.load(singlePdf);
      expect(singleDocument.getPageCount()).toBe(2);
      const [front, back] = singleDocument.getPages();
      for (const page of [front, back]) {
        expect(page.getWidth()).toBeGreaterThan(240);
        expect(page.getWidth()).toBeLessThan(245);
        expect(page.getHeight()).toBeGreaterThan(150);
        expect(page.getHeight()).toBeLessThan(155);
      }

      const classCards = await getIdentityCardsByScope(tx, fixture.schoolId, school!.uniqueCode, "class", [], fixture.ownerId, classId);
      const packPdf = await buildIdentityCardPdf(classCards, school!, "https://sukuunova.example");
      expect(Buffer.byteLength(packPdf)).toBeGreaterThan(1000);
      const packDocument = await PDFDocument.load(packPdf);
      expect(packDocument.getPageCount()).toBe(2);
      expect(packDocument.getPages()[0]!.getWidth()).toBeCloseTo(595.28, 1);
      expect(packDocument.getPages()[1]!.getWidth()).toBeCloseTo(595.28, 1);
    });
  });

  it("rejects tampered signatures", () => {
    const now = new Date("2026-09-02T10:00:00.000Z");
    const card = { schoolId: "school-a", serial: "SNV-A-ST-123", personType: "student" as const, issuedAt: now, expiresAt: new Date("2031-09-02T10:00:00.000Z"), version: 1 };
    const signature = identityCardSignature(card);
    expect(verifyIdentityCardSignature(card, signature)).toBe(true);
    expect(verifyIdentityCardSignature({ ...card, serial: "SNV-A-ST-999" }, signature)).toBe(false);
  });

  it("keeps selected-card downloads inside the authenticated school", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: fixture.schoolId }, select: { uniqueCode: true } });
      const scoped = await getIdentityCardsByScope(tx, fixture.schoolId, school!.uniqueCode, "selected", [otherCardId], fixture.ownerId);
      expect(scoped).toHaveLength(0);
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
});