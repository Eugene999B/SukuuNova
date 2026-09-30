import { describe, expect, it } from "vitest";
import { markDraftKey, validMarkDraft } from "../src/lib/mark-draft";
describe("recoverable mark drafts", () => {
  it("rejects unversioned drafts that cannot prove the original server value", () => {
    expect(validMarkDraft({value:"40",status:"present"})).toBe(false);
    expect(validMarkDraft({version:2,value:"40",status:"present"})).toBe(false);
  });
  it("preserves the original expected version, including a previously blank mark", () => {
    expect(validMarkDraft({version:2,value:"40",status:"present",expected:null})).toBe(true);
    expect(validMarkDraft({version:2,value:"40",status:"present",expected:{id:"s",value:35,status:"present",enteredAt:"2026-09-01T00:00:00Z"}})).toBe(true);
  });
  it("separates schools, accounts and assessments on shared devices", () => {
    expect(new Set([markDraftKey("a","u","x"),markDraftKey("a","v","x"),markDraftKey("b","u","x"),markDraftKey("a","u","y")]).size).toBe(4);
  });
});
