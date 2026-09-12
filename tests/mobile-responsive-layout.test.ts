import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootLayout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const hardening = readFileSync(new URL("../src/app/mobile-responsive-hardening.css", import.meta.url), "utf8");
const guardianDirectory = readFileSync(new URL("../src/components/product/GuardianDirectory.tsx", import.meta.url), "utf8");

describe("mobile responsive layout contract", () => {
  it("loads the mobile hardening layer after the product simplification styles", () => {
    const simplificationIndex = rootLayout.indexOf('import "./ux-simplification.css"');
    const mobileIndex = rootLayout.indexOf('import "./mobile-responsive-hardening.css"');

    expect(simplificationIndex).toBeGreaterThanOrEqual(0);
    expect(mobileIndex).toBeGreaterThan(simplificationIndex);
  });

  it("allows phone form controls to shrink inside the viewport", () => {
    expect(hardening).toContain("select {\n    min-width: 0 !important;");
    expect(hardening).toContain("grid-template-columns: minmax(0, 1fr) !important;");
    expect(hardening).toContain(".sn-page-body :where(input, select, textarea)");
  });

  it("keeps dense tables locally scrollable instead of widening the whole page", () => {
    expect(hardening).toContain(".module-responsive");
    expect(hardening).toContain("overflow-x: auto !important;");
    expect(hardening).toContain("overscroll-behavior-inline: contain;");
  });

  it("protects attendance workflow copy from concatenating on narrow screens", () => {
    expect(hardening).toContain(".module-workflow-step");
    expect(hardening).toContain("grid-template-columns: auto minmax(0, 1fr) auto;");
    expect(hardening).toContain("overflow-wrap: anywhere;");
  });

  it("prevents floating quick actions from covering primary phone content", () => {
    expect(hardening).toContain("@media (max-width: 520px)");
    expect(hardening).toContain(".sn-speed-dial {\n    display: none !important;");
  });

  it("uses the compact phone header for search plus notifications", () => {
    expect(hardening).toContain("grid-template-columns: minmax(0, 1fr) 38px !important;");
    expect(hardening).toContain(".sn-theme-switcher");
    expect(hardening).toContain(".app-icon-button {\n    display: flex !important;");
  });

  it("uses mobile family cards instead of forcing guardians through a wide table", () => {
    expect(guardianDirectory).toContain('className="guardian-directory-cards"');
    expect(guardianDirectory).toContain('className="guardian-directory-table"');
    expect(hardening).toContain(".guardian-directory-table {\n    display: none !important;");
    expect(hardening).toContain(".guardian-directory-cards {\n    display: grid;");
  });
});
