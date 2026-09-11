import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { IdentityCardView } from "../src/lib/identity-card-service";
import { identityCardVerificationUrl } from "../src/lib/identity-card-service";
import {
  identityCardCompactToken,
  identityCardCompactVerificationUrl,
  verifyIdentityCardCompactToken,
} from "../src/lib/identity-card-compact-verification";
import {
  buildIdentityCardBulkPdfV3,
  buildIdentityCardSinglePdfV3,
  buildIdentityCardSvgV3,
  ID_CARD_PACK_LIMIT,
} from "../src/lib/identity-card-print-v3";

const school = {
  name: "Eugene Academy",
  uniqueCode: "EUG123",
  logoUrl: null,
  brandColors: { primary: "#0f766e", accent: "#2dd4bf" },
};

const baseCard: IdentityCardView = {
  id: "card-1",
  schoolId: "school-1",
  personType: "student",
  studentId: "student-1",
  staffId: null,
  serial: "SNV-EUG123-ST-0123456789ABCDEF",
  issuedAt: new Date("2026-09-11T00:00:00.000Z"),
  expiresAt: new Date("2031-09-11T00:00:00.000Z"),
  status: "active",
  version: 1,
  personName: "Akosua Frimpong",
  personNumber: "EUG-STUDENT-0001",
  admissionNo: "EUG-STUDENT-0001",
  classId: "class-1",
  className: "JHS 2 Gold",
  roleName: null,
  photoUrl: null,
  houseName: "Unity",
  guardianName: "Ama Frimpong",
  guardianPhone: "+233200000000",
  contactPhone: null,
  contactEmail: null,
  isExpired: false,
  photoReady: false,
};

const origin = "https://sukuunova-production.up.railway.app";

function card(index: number): IdentityCardView {
  return {
    ...baseCard,
    id: `card-${index}`,
    studentId: `student-${index}`,
    serial: `SNV-EUG123-ST-${String(index).padStart(16, "0")}`,
    personName: `Student ${index}`,
    personNumber: `EUG-${String(index).padStart(4, "0")}`,
    admissionNo: `EUG-${String(index).padStart(4, "0")}`,
  };
}

describe("premium identity-card print engine v3", () => {
  beforeAll(() => {
    process.env.SCHOOL_AUTH_SECRET = "identity-card-v3-test-secret-012345678901234567890123";
  });

  it("uses a compact stable signed URL that materially reduces QR payload", () => {
    const token = identityCardCompactToken(baseCard);
    const compact = identityCardCompactVerificationUrl(origin, school.uniqueCode, baseCard);
    const legacy = identityCardVerificationUrl(origin, school.uniqueCode, baseCard);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(verifyIdentityCardCompactToken(baseCard, token)).toBe(true);
    expect(compact).toContain("/v/EUG123/");
    expect(compact.length).toBeLessThan(legacy.length);
    // Live status/version updates must not invalidate the physical card's QR.
    expect(verifyIdentityCardCompactToken({ ...baseCard, version: 2, status: "revoked" }, token)).toBe(true);
    // A different issued credential must never inherit the old token.
    expect(verifyIdentityCardCompactToken({ ...baseCard, serial: `${baseCard.serial}-NEW` }, token)).toBe(false);
  });

  it("creates an exact two-page CR80 front/back PDF", async () => {
    const bytes = await buildIdentityCardSinglePdfV3(baseCard, school, origin);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    const [front, back] = pdf.getPages();
    expect(front.getWidth()).toBeCloseTo(85.6 * 72 / 25.4, 1);
    expect(front.getHeight()).toBeCloseTo(53.98 * 72 / 25.4, 1);
    expect(back.getWidth()).toBeCloseTo(front.getWidth(), 4);
    expect(back.getHeight()).toBeCloseTo(front.getHeight(), 4);
  });

  it("creates paired mirrored A4 front/back sheets for print shops", async () => {
    const bytes = await buildIdentityCardBulkPdfV3(Array.from({ length: 9 }, (_, index) => card(index + 1)), school, origin);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(4);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(595.28, 1);
      expect(page.getHeight()).toBeCloseTo(841.89, 1);
    }
  });

  it("exports exact-size premium SVG artwork and a live-verification QR", () => {
    const front = buildIdentityCardSvgV3(baseCard, school, origin, "front");
    const back = buildIdentityCardSvgV3(baseCard, school, origin, "back");
    for (const svg of [front, back]) {
      expect(svg).toContain('width="85.6mm"');
      expect(svg).toContain('height="53.98mm"');
      expect(svg).toContain('viewBox="0 0 856 539.8"');
    }
    expect(front).toContain("Akosua Frimpong");
    expect(front).toContain("IDENTITY CARD");
    expect(back).toContain("SCAN · VERIFY LIVE");
    expect(back).toContain("Authenticity + current status");
    expect(back).toContain("<rect");
  });

  it("keeps server print packs bounded", async () => {
    const oversized = Array.from({ length: ID_CARD_PACK_LIMIT + 1 }, (_, index) => card(index + 1));
    await expect(buildIdentityCardBulkPdfV3(oversized, school, origin)).rejects.toMatchObject({ code: "PRINT_PACK_TOO_LARGE" });
  });
});
