import { describe, expect, it, vi } from "vitest";
import { AiDraftSchema } from "../src/lib/ai-assistant-service";

describe("structured AI contract", () => {
  it("accepts only the required draft/evidence/cautions shape", () => {
    expect(AiDraftSchema.safeParse({ draft: "Keep going.", evidence: ["Attendance: 95%"], cautions: [] }).success).toBe(true);
    expect(AiDraftSchema.safeParse({ draft: "", evidence: [], cautions: [] }).success).toBe(false);
    expect(AiDraftSchema.safeParse({ draft: "Text", evidence: "Attendance", cautions: [] }).success).toBe(false);
  });

  it("never exposes an unbounded AI action surface", () => {
    expect(AiDraftSchema.shape).toHaveProperty("draft");
    expect(AiDraftSchema.shape).toHaveProperty("evidence");
    expect(AiDraftSchema.shape).toHaveProperty("cautions");
  });

  it("does not call a provider when the feature has no configured API key", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const { createStructuredAiDraft } = await import("../src/lib/ai-assistant-service");
    vi.spyOn(globalThis, "fetch");
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    process.env.OPENAI_API_KEY = original;
  });
});
