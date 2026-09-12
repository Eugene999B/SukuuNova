import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const termRoute = readFileSync(new URL("../src/app/api/school/terms/[id]/route.ts", import.meta.url), "utf8");
const releaseService = readFileSync(new URL("../src/lib/report-card-release-service.ts", import.meta.url), "utf8");

describe("academic term and report-card release boundary", () => {
  it("does not mark approved reports as sent when a term is locked", () => {
    expect(termRoute).not.toContain('data: { status: "sent" }');
    expect(termRoute).toContain("approvedReportCardsAwaitingRelease");
    expect(termRoute).toContain("reportReleaseStatusPreserved: true");
  });

  it("keeps the sent transition inside the audited report-card release service", () => {
    expect(releaseService).toContain("sendApprovedReportCardPublic");
    expect(releaseService).toContain('data: { status: "sent", sentAt: claimedAt }');
    expect(releaseService).toContain('action: "report_card.released"');
  });
});
