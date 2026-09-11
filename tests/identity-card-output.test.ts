import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { addBulkIdentityCardCropMarks, buildIdentityCardSvg } from "../src/lib/identity-card-output";

const card = {
  personType: "student" as const,
  personName: "Akosua Frimpong",
  personNumber: "EUG-ST-0001",
  admissionNo: "EUG-ST-0001",
  className: "JHS 2 Gold",
  houseName: "Unity",
  roleName: null,
  guardianName: "Ama Frimpong",
  guardianPhone: "+233200000000",
  contactPhone: null,
  contactEmail: null,
  photoUrl: null,
  serial: "SNV-EUG-ST-ABC123",
  issuedAt: new Date("2026-09-11T00:00:00.000Z"),
  expiresAt: new Date("2031-09-11T00:00:00.000Z"),
  status: "active" as const,
};

const school = {
  name: "Eugene Academy",
  uniqueCode: "EUG123",
  logoUrl: null,
  brandColors: { primary: "#0f766e", accent: "#2dd4bf" },
};

describe("identity-card print outputs", () => {
  it("exports exact CR80 front and back vector artwork", () => {
    const verifyUrl = "https://sukuunova-production.up.railway.app/verify/id-card/EUG123/SNV-EUG-ST-ABC123?sig=test";
    const front = buildIdentityCardSvg(card, school, verifyUrl, "front");
    const back = buildIdentityCardSvg(card, school, verifyUrl, "back");

    for (const svg of [front, back]) {
      expect(svg).toContain('width="85.6mm"');
      expect(svg).toContain('height="53.98mm"');
      expect(svg).toContain('viewBox="0 0 856 539.8"');
    }
    expect(front).toContain("Akosua Frimpong");
    expect(front).toContain("EUG-ST-0001");
    expect(back).toContain("SCAN TO VERIFY");
    expect(back).toContain("School code: EUG123");
    expect(back).toContain("<path d=\"");
  });

  it("keeps paired A4 pages while adding bulk cutting and registration marks", async () => {
    const document = await PDFDocument.create();
    document.addPage([595.28, 841.89]);
    document.addPage([595.28, 841.89]);
    const original = Buffer.from(await document.save());
    const marked = await addBulkIdentityCardCropMarks(original, 3);
    const loaded = await PDFDocument.load(marked);

    expect(loaded.getPageCount()).toBe(2);
    expect(loaded.getPages()[0]?.getWidth()).toBeCloseTo(595.28, 1);
    expect(loaded.getPages()[1]?.getHeight()).toBeCloseTo(841.89, 1);
    expect(marked.byteLength).toBeGreaterThan(original.byteLength);
  });
});
