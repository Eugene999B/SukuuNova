import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const financeRoute = readFileSync(new URL("../src/app/school/finance/FinanceV2Route.tsx", import.meta.url), "utf8");
const financeTheme = readFileSync(new URL("../src/app/school/finance/finance-theme.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const mobileTheme = readFileSync(new URL("../src/app/theme-mobile-fixes.css", import.meta.url), "utf8");

describe("theme and finance responsive contract", () => {
  it("keeps Finance V2 on application theme surfaces instead of print-only white paper", () => {
    expect(financeRoute).toContain('import "./finance-theme.css"');
    expect(financeRoute).toContain('className="fv2-theme-scope"');
    expect(financeTheme).toContain("--identity-paper: var(--color-surface);");
  });

  it("loads the mobile theme viewport correction after the shared responsive hardening", () => {
    const responsiveIndex = layout.indexOf('import "./mobile-responsive-hardening.css"');
    const themeFixIndex = layout.indexOf('import "./theme-mobile-fixes.css"');

    expect(responsiveIndex).toBeGreaterThanOrEqual(0);
    expect(themeFixIndex).toBeGreaterThan(responsiveIndex);
  });

  it("prevents the sticky blurred topbar from becoming the theme sheet containing block on phones", () => {
    expect(mobileTheme).toContain(".app-topbar");
    expect(mobileTheme).toContain("backdrop-filter: none !important;");
    expect(mobileTheme).toContain("-webkit-backdrop-filter: none !important;");
  });

  it("pins the mobile theme chooser inside the real viewport and safe areas", () => {
    expect(mobileTheme).toContain(".sn-theme-popover");
    expect(mobileTheme).toContain("position: fixed !important;");
    expect(mobileTheme).toContain("env(safe-area-inset-left, 0px)");
    expect(mobileTheme).toContain("env(safe-area-inset-right, 0px)");
    expect(mobileTheme).toContain("100dvh");
    expect(mobileTheme).toContain("overflow-y: auto;");
  });

  it("allows Light and Dark option content to shrink instead of pushing sideways", () => {
    expect(mobileTheme).toContain("grid-template-columns: 48px minmax(0, 1fr) 24px !important;");
    expect(mobileTheme).toContain("overflow-wrap: anywhere;");
  });
});
