import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PublicIdentityCardVerification,
  PublicIdentityCardVerificationFailure,
} from "../src/components/PublicIdentityCardVerification";

const school = {
  name: "Eugene Academy",
  uniqueCode: "EUG123",
  logoUrl: null,
  brandColors: { primary: "#0f766e", accent: "#2dd4bf" },
};

const student = {
  personType: "student" as const,
  personName: "Akosua Frimpong",
  personNumber: "EUG-STUDENT-0001",
  admissionNo: "EUG-STUDENT-0001",
  className: "JHS 2 Gold",
  roleName: null,
  photoUrl: null,
  serial: "SNV-EUG123-ST-0123456789ABCDEF",
  issuedAt: new Date("2026-09-11T00:00:00.000Z"),
  expiresAt: new Date("2031-09-11T00:00:00.000Z"),
};

const staff = {
  ...student,
  personType: "staff" as const,
  personName: "Kwame Mensah",
  personNumber: "STF-76543210",
  admissionNo: null,
  className: null,
  roleName: "Teacher",
  serial: "SNV-EUG123-SF-FEDCBA9876543210",
};

function render(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(element);
}

describe("public identity-card verification rendering", () => {
  it("renders a non-empty polished VALID page for a student credential", () => {
    const html = render(createElement(PublicIdentityCardVerification, { school, card: student, state: "verified" }));
    expect(html.length).toBeGreaterThan(2_000);
    expect(html).toContain("VALID — VERIFIED CURRENT CREDENTIAL");
    expect(html).toContain("Eugene Academy");
    expect(html).toContain("Akosua Frimpong");
    expect(html).toContain("JHS 2 Gold");
    expect(html).toContain("EUG-STUDENT-0001");
  });

  it("renders a non-empty polished VALID page for a staff credential", () => {
    const html = render(createElement(PublicIdentityCardVerification, { school, card: staff, state: "verified" }));
    expect(html.length).toBeGreaterThan(2_000);
    expect(html).toContain("VALID — VERIFIED CURRENT CREDENTIAL");
    expect(html).toContain("Kwame Mensah");
    expect(html).toContain("Teacher");
    expect(html).toContain("Staff credential");
  });

  it.each([
    ["revoked", "INVALID — CREDENTIAL REVOKED"],
    ["expired", "INVALID — CREDENTIAL EXPIRED"],
    ["inactive", "INVALID — HOLDER INACTIVE"],
  ] as const)("renders %s as an explicit non-valid state", (state, expected) => {
    const html = render(createElement(PublicIdentityCardVerification, { school, card: student, state }));
    expect(html.length).toBeGreaterThan(2_000);
    expect(html).toContain(expected);
    expect(html).toContain("NOT VALID · SIGNED QR · LIVE RECORD");
  });

  it("renders malformed, unknown, or server-failure outcomes as explicit INVALID / UNVERIFIED instead of blank", () => {
    const html = render(createElement(PublicIdentityCardVerificationFailure, {
      school,
      serial: student.serial,
      reason: "The signed QR token does not match this credential.",
    }));
    expect(html.length).toBeGreaterThan(1_000);
    expect(html).toContain("INVALID / UNVERIFIED CREDENTIAL");
    expect(html).toContain(student.serial);
    expect(html).toContain("must not be accepted").or.toContain("Do not rely");
  });

  it("cannot crash into a blank page when a stale holder name is missing", () => {
    const html = render(createElement(PublicIdentityCardVerification, {
      school,
      card: { ...student, personName: null },
      state: "inactive",
    }));
    expect(html.length).toBeGreaterThan(2_000);
    expect(html).toContain("Credential holder");
    expect(html).toContain("INVALID — HOLDER INACTIVE");
  });
});
