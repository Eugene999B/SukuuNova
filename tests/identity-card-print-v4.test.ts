import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { IdentityCardView } from "../src/lib/identity-card-service";
import {
  IDENTITY_CARD_THEMES,
  IDENTITY_CARD_THEME_KEYS,
  identityCardTheme,
  identityCardThemeKeyFromBrandColors,
} from "../src/lib/identity-card-themes";
import {
  buildIdentityCardBulkPdfV4,
  buildIdentityCardSinglePdfV4,
  buildIdentityCardSvgV4,
  ID_CARD_PACK_LIMIT,
} from "../src/lib/identity-card-print-v4";

const baseSchool = {
  name: "Eugene Academy",
  uniqueCode: "EUG123",
  logoUrl: null,
  brandColors: { primary: "#0f766e", accent: "#2dd4bf", idCardTheme: "heritage-gold" },
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

function school(themeKey: string) {
  return {
    ...baseSchool,
    brandColors: { ...baseSchool.brandColors, idCardTheme: themeKey },
  };
}

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

describe("identity-card theme studio and print engine v4", () => {
  beforeAll(() => {
    process.env.SCHOOL_AUTH_SECRET = "identity-card-v4-test-secret-012345678901234567890123";
  });

  it("ships six distinct selectable themes and safely falls back to Heritage Gold", () => {
    expect(IDENTITY_CARD_THEME_KEYS).toHaveLength(6);
    expect(new Set(IDENTITY_CARD_THEME_KEYS).size).toBe(6);
    expect(IDENTITY_CARD_THEMES.map((item) => item.layout)).toEqual(["heritage", "dark", "crest", "split", "wave", "tech"]);
    expect(identityCardThemeKeyFromBrandColors({ idCardTheme: "graphite-pulse" })).toBe("graphite-pulse");
    expect(identityCardThemeKeyFromBrandColors({ idCardTheme: "not-real" })).toBe("heritage-gold");
    expect(identityCardTheme({ idCardTheme: "azure-wave" }).name).toBe("Azure Wave");
  });

  it("renders every theme as an exact two-page CR80 PDF", async () => {
    for (const themeKey of IDENTITY_CARD_THEME_KEYS) {
      const bytes = await buildIdentityCardSinglePdfV4(baseCard, school(themeKey), origin);
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(2);
      for (const page of pdf.getPages()) {
        expect(page.getWidth()).toBeCloseTo(85.6 * 72 / 25.4, 1);
        expect(page.getHeight()).toBeCloseTo(53.98 * 72 / 25.4, 1);
      }
    }
  });

  it("exports exact-size themed front/back SVG artwork with a large verification QR", () => {
    for (const themeKey of IDENTITY_CARD_THEME_KEYS) {
      const themedSchool = school(themeKey);
      const theme = identityCardTheme(themedSchool.brandColors);
      const front = buildIdentityCardSvgV4(baseCard, themedSchool, origin, "front");
      const back = buildIdentityCardSvgV4(baseCard, themedSchool, origin, "back");
      for (const svg of [front, back]) {
        expect(svg).toContain('width="85.6mm"');
        expect(svg).toContain('height="53.98mm"');
        expect(svg).toContain('viewBox="0 0 856 539.8"');
      }
      expect(front).toContain("Akosua Frimpong");
      expect(front).toContain(theme.frontBackground);
      expect(back).toContain("SCAN · VERIFY LIVE");
      expect(back).toContain("Official holder + live status");
      expect(back).toContain("<rect");
    }
  });

  it("keeps duplex bulk output paired and cut-ready", async () => {
    const bytes = await buildIdentityCardBulkPdfV4(Array.from({ length: 9 }, (_, index) => card(index + 1)), school("midnight-aurora"), origin);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(4);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(595.28, 1);
      expect(page.getHeight()).toBeCloseTo(841.89, 1);
    }
  });

  it("keeps server print packs bounded", async () => {
    const oversized = Array.from({ length: ID_CARD_PACK_LIMIT + 1 }, (_, index) => card(index + 1));
    await expect(buildIdentityCardBulkPdfV4(oversized, school("graphite-pulse"), origin)).rejects.toMatchObject({ code: "PRINT_PACK_TOO_LARGE" });
  });
});
