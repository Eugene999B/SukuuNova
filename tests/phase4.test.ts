import { describe, expect, it } from "vitest";
import { requireSchoolFeatureInTransaction, featureFlagsContain } from "@/lib/feature-flags";
import { platformHasPermission, groupReportAllowed, aiDraftAffectsRealRecord, emergencyRequiresConfirmation } from "@/lib/phase4-policy";
import { classifyParentIntent } from "@/lib/phase4-service";

type FeatureTx = Parameters<typeof requireSchoolFeatureInTransaction>[0];

describe("SukuuNova Phase 4 invariants",()=>{
  it("blocks a school without the requested feature flag",async()=>{
    const tx={school:{findUnique:async()=>({subscriptionPlan:{name:"Starter",featureFlags:[]}})}} as unknown as FeatureTx;
    await expect(requireSchoolFeatureInTransaction(tx,"school-a","payroll")).rejects.toMatchObject({code:"FEATURE_NOT_INCLUDED"});
    expect(featureFlagsContain(["payroll"],"payroll")).toBe(true);
  });
  it("separates impersonation permission from broader school management",()=>{expect(platformHasPermission("support_admin","schools:impersonate")).toBe(true);expect(platformHasPermission("support_admin","schools:manage")).toBe(false);expect(platformHasPermission("super_admin","schools:impersonate")).toBe(true);});
  it("allows cross-branch reporting only to the owning Owner identity",()=>{expect(groupReportAllowed("owner-a","owner-a")).toBe(true);expect(groupReportAllowed("teacher-a","owner-a")).toBe(false);});
  it("refuses WhatsApp questions outside the predefined intent set",()=>{expect(classifyParentIntent("What is the best football team?")).toBe("unsupported");expect(classifyParentIntent("Has my child arrived?")).toBe("arrival");expect(classifyParentIntent("How much are my fees?")).toBe("fee_balance");expect(classifyParentIntent("When is the next holiday?")).toBe("next_event");});
  it("keeps an AI report-card draft ineffective until explicitly accepted",()=>{expect(aiDraftAffectsRealRecord("report_card_remark","suggested")).toBe(false);expect(aiDraftAffectsRealRecord("report_card_remark","accepted")).toBe(true);expect(aiDraftAffectsRealRecord("report_card_remark","discarded")).toBe(false);});
  it("requires explicit confirmation before an emergency broadcast",()=>{expect(emergencyRequiresConfirmation("prepare")).toBe(true);expect(emergencyRequiresConfirmation("confirm")).toBe(false);});
});
