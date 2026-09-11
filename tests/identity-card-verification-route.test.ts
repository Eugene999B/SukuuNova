import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  directoryFindUnique: vi.fn(),
  withTenant: vi.fn(),
  identityCardSignature: vi.fn(),
  publicIdentityCardBySerial: vi.fn(),
  isIdentityCardCompactToken: vi.fn(),
  verifyIdentityCardCompactToken: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  rawDb: { schoolLoginDirectory: { findUnique: mocks.directoryFindUnique } },
  withTenant: mocks.withTenant,
}));

vi.mock("@/lib/identity-card-service", () => ({
  identityCardSignature: mocks.identityCardSignature,
  publicIdentityCardBySerial: mocks.publicIdentityCardBySerial,
}));

vi.mock("@/lib/identity-card-compact-verification", () => ({
  isIdentityCardCompactToken: mocks.isIdentityCardCompactToken,
  verifyIdentityCardCompactToken: mocks.verifyIdentityCardCompactToken,
}));

import CompactIdentityCardVerificationPage from "../src/app/v/[schoolCode]/[serial]/[token]/page";

const school = {
  name: "Eugene Academy",
  uniqueCode: "EUG123",
  logoUrl: null,
  brandColors: { primary: "#0f766e", accent: "#2dd4bf" },
};

const canonicalCard = {
  schoolId: "school-1",
  serial: "SNV-EUG123-ST-0123456789ABCDEF",
  personType: "student" as const,
  issuedAt: new Date("2026-09-11T00:00:00.000Z"),
  expiresAt: new Date("2031-09-11T00:00:00.000Z"),
  version: 1,
};

const publicCard = {
  ...canonicalCard,
  id: "card-1",
  studentId: "student-1",
  staffId: null,
  status: "active" as const,
  personName: "Akosua Frimpong",
  personNumber: "EUG-STUDENT-0001",
  admissionNo: "EUG-STUDENT-0001",
  classId: "class-1",
  className: "JHS 2 Gold",
  roleName: null,
  photoUrl: null,
  houseName: "Unity",
  guardianName: null,
  guardianPhone: null,
  contactPhone: null,
  contactEmail: null,
};

const params = Promise.resolve({
  schoolCode: "EUG123",
  serial: canonicalCard.serial,
  token: "abcdefghijklmnopqrstuv",
});

describe("compact public identity-card verification route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isIdentityCardCompactToken.mockReturnValue(true);
    mocks.directoryFindUnique.mockResolvedValue({ schoolId: "school-1", status: "active" });
    mocks.withTenant.mockResolvedValue({ card: canonicalCard, school });
    mocks.verifyIdentityCardCompactToken.mockReturnValue(true);
    mocks.identityCardSignature.mockReturnValue("legacy-signature");
    mocks.publicIdentityCardBySerial.mockResolvedValue({ card: publicCard, school: { name: school.name, uniqueCode: school.uniqueCode }, state: "verified" });
  });

  it("renders a valid credential page instead of an empty result for a valid signed QR", async () => {
    const page = await CompactIdentityCardVerificationPage({ params });
    const html = renderToStaticMarkup(page);
    expect(html.length).toBeGreaterThan(2_000);
    expect(html).toContain("VALID — VERIFIED CURRENT CREDENTIAL");
    expect(html).toContain("Akosua Frimpong");
    expect(html).toContain(canonicalCard.serial);
  });

  it("fails closed to a visible UNVERIFIED page when server lookup throws", async () => {
    mocks.directoryFindUnique.mockRejectedValueOnce(new Error("database unavailable"));
    const page = await CompactIdentityCardVerificationPage({ params });
    const html = renderToStaticMarkup(page);
    expect(html.length).toBeGreaterThan(1_000);
    expect(html).toContain("INVALID / UNVERIFIED CREDENTIAL");
    expect(html).toContain("could not complete the live credential check safely");
  });

  it("rejects malformed tokens visibly before any database lookup", async () => {
    mocks.isIdentityCardCompactToken.mockReturnValueOnce(false);
    const page = await CompactIdentityCardVerificationPage({
      params: Promise.resolve({ schoolCode: "EUG123", serial: canonicalCard.serial, token: "bad" }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("INVALID / UNVERIFIED CREDENTIAL");
    expect(html).toContain("malformed or incomplete");
    expect(mocks.directoryFindUnique).not.toHaveBeenCalled();
  });
});
