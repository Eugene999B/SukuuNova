import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { IdentityCardView } from "../src/lib/identity-card-service";
import {
  buildIdentityCardBulkPdfV2,
  buildIdentityCardSinglePdfV2,
  buildIdentityCardSvgV2,
  ID_CARD_PACK_LIMIT,
} from "../src/lib/identity-card-print-v2";

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
  serial: "EUG-ST-0001",
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
    serial: `EUG-ST-${String(index).padStart(4, "0")}`,
    personName: `Student ${index}`,
    personNumber: `EUG-${String(index).padStart(4, "0")}`,
    admissionNo: `EUG-${String(index).padStart(4, "0")}`,
  };
}

describe("premium identity-card print engine v2", () => {
  beforeAll(() => {
    process.env.SCHOOL_AUTH_SECRET = "identity-card-v2-test-secret-012345678901234567890123";
  });

  it("creates an exact two-page CR80 PDF for one person", async () => {
    const bytes = await buildIdentityCardSinglePdfV2(baseCard, school, origin);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    const [front, back] = pdf.getPages();
    expect(front.getWidth()).toBeCloseTo(85.6 * 72 / 25.4, 1);
    expect(front.getHeight()).toBeCloseTo(53.98 * 72 / 25.4, 1);
    expect(back.getWidth()).toBeCloseTo(front.getWidth(), 4);
    expect(back.getHeight()).toBeCloseTo(front.getHeight(), 4);
  });

  it("creates paired A4 front/back sheets for bulk printing", async () => {
    const bytes = await buildIdentityCardBulkPdfV2(Array.from({ length: 9 }, (_, index) => card(index + 1)), school, origin);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(4);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(595.28, 1);
      expect(page.getHeight()).toBeCloseTo(841.89, 1);
    }
  });

  it("exports matching exact-size front/back SVG artwork with live QR verification", () => {
    const front = buildIdentityCardSvgV2(baseCard, school, origin, "front");
    const back = buildIdentityCardSvgV2(baseCard, school, origin, "back");
    for (const svg of [front, back]) {
      expect(svg).toContain('width="85.6mm"');
      expect(svg).toContain('height="53.98mm"');
      expect(svg).toContain('viewBox="0 0 856 539.8"');
    }
    expect(front).toContain("Akosua Frimpong");
    expect(front).toContain("OFFICIAL SCHOOL CREDENTIAL");
    expect(back).toContain("SCAN TO VERIFY");
    expect(back).toContain("Signed live credential");
    expect(back).toContain("<rect");
  });

  it("forces very large schools through bounded print packs", async () => {
    const oversized = Array.from({ length: ID_CARD_PACK_LIMIT + 1 }, (_, index) => card(index + 1));
    await expect(buildIdentityCardBulkPdfV2(oversized, school, origin)).rejects.toMatchObject({ code: "PRINT_PACK_TOO_LARGE" });
  });
});
