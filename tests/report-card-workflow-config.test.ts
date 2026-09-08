import { describe, expect, it } from "vitest";
import { mergeReportWorkflowConfig, readReportWorkflowConfig } from "../src/lib/report-card-workflow-config";

describe("report workflow configuration", () => {
  it("preserves advanced and legacy keys while updating workflow controls", () => {
    const current = {
      includeSchoolContacts: true,
      rankMethod: "weighted_total",
      showGrades: true,
      customFutureSetting: { enabled: true },
      themeId: "preset-scholar-blue",
      showStudentPhoto: false,
    };
    const parsed = readReportWorkflowConfig(current, null);
    const next = {
      ...parsed,
      themeId: "preset-ghana-classic",
      showStudentPhoto: true,
      showOverallPosition: false,
      showSubjectPosition: false,
      showAttendance: false,
      showPromotion: true,
      showClassTeacherRemark: false,
      showHeadteacherRemark: true,
      signatureSlots: [{ userId: "teacher-1", role: "Class Teacher" }],
      signatureProfiles: {
        "teacher-1": { dataUrl: "data:image/png;base64,QUJD", updatedAt: "2026-09-08T12:00:00.000Z" },
      },
      finalTermNumber: 3,
      autoApplyPromotion: true,
      classProgression: { basic6: "jhs1" },
    };

    const merged = mergeReportWorkflowConfig(current, next);

    expect(merged.includeSchoolContacts).toBe(true);
    expect(merged.rankMethod).toBe("weighted_total");
    expect(merged.showGrades).toBe(true);
    expect(merged.customFutureSetting).toEqual({ enabled: true });
    expect(merged.themeId).toBe("preset-ghana-classic");
    expect(merged.showStudentPhoto).toBe(true);
    expect(merged.includePosition).toBe(false);
    expect(merged.includeSubjectPosition).toBe(false);
    expect(merged.includeAttendance).toBe(false);
    expect(merged.includeTeacherRemark).toBe(false);
    expect(merged.includeHeadRemark).toBe(true);
    expect(merged.includeSignatures).toBe(true);
    expect(merged.classProgression).toEqual({ basic6: "jhs1" });
  });

  it("normalizes unsafe or incomplete workflow values to stable defaults", () => {
    const parsed = readReportWorkflowConfig({
      themeId: "does-not-exist",
      finalTermNumber: 99,
      signatureSlots: [
        { userId: "teacher-1", role: "Class Teacher" },
        { userId: "", role: "Invalid" },
      ],
      signatureProfiles: {
        "teacher-1": { dataUrl: "data:image/jpeg;base64,QUJD", updatedAt: "2026-09-08T12:00:00.000Z" },
      },
      classProgression: { basic6: "jhs1", broken: "" },
    }, null);

    expect(parsed.themeId).toBe("preset-ghana-classic");
    expect(parsed.finalTermNumber).toBe(3);
    expect(parsed.autoApplyPromotion).toBe(true);
    expect(parsed.showStudentPhoto).toBe(true);
    expect(parsed.signatureSlots).toEqual([{ userId: "teacher-1", role: "Class Teacher" }]);
    expect(parsed.signatureProfiles).toEqual({});
    expect(parsed.classProgression).toEqual({ basic6: "jhs1" });
  });
});
