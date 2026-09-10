import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { withTenant } from "../src/lib/db";
import {
  ensureIdentityCardsForSchool,
  getIdentityCardsByScope,
  listIdentityCards,
  buildIdentityCardPdf,
  buildSingleIdentityCardPdf,
  identityCardSignature,
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

  it("produces wallet-size single-card PDFs and A4 class/school packs", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: fixture.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } });
      const cards = (await listIdentityCards(tx, fixture.schoolId, school!.uniqueCode, fixture.ownerId)).filter((card) => card.status === "active" && !card.isExpired);
      const studentCard = cards.find((card) => card.studentId === studentId)!;
      const singlePdf = await buildSingleIdentityCardPdf(studentCard, school!, "https://sukuunova.example");
      expect(Buffer.byteLength(singlePdf)).toBeGreaterThan(1000);
      const singleDocument = await PDFDocument.load(singlePdf);
      expect(singleDocument.getPageCount()).toBe(1);
      const [singlePage] = singleDocument.getPages();
      expect(singlePage.getWidth()).toBeGreaterThan(240);
      expect(singlePage.getWidth()).toBeLessThan(245);
      expect(singlePage.getHeight()).toBeGreaterThan(150);
      expect(singlePage.getHeight()).toBeLessThan(155);

      const classCards = await getIdentityCardsByScope(tx, fixture.schoolId, school!.uniqueCode, "class", [], fixture.ownerId, classId);
      const packPdf = await buildIdentityCardPdf(classCards, school!, "https://sukuunova.example");
      expect(Buffer.byteLength(packPdf)).toBeGreaterThan(1000);
      const packDocument = await PDFDocument.load(packPdf);
      expect(packDocument.getPageCount()).toBe(1);
    });
  });

  it("rejects tampered signatures", () => {
    const now = new Date("2026-09-02T10:00:00.000Z");
    const card = { schoolId: "school-a", serial: "SNV-A-ST-123", personType: "student" as const, issuedAt: now, expiresAt: new Date("2028-09-02T10:00:00.000Z"), version: 1 };
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