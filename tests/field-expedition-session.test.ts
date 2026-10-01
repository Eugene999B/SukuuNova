import { describe, expect, it } from "vitest";
import {
  attemptFieldInteraction,
  createFieldExpeditionSession,
  FIELD_EXPEDITION_SITES,
} from "../src/lib/game-engine/field-expedition-session";

describe("Field Expedition session", () => {
  it("requires an appropriate world tool instead of a quiz answer", () => {
    const start = createFieldExpeditionSession();
    const failed = attemptFieldInteraction(start, "river-quality", "camera");
    expect(failed.event).toMatchObject({
      type: "wrong-tool",
      attemptedTool: "camera",
      suggestedTool: "sample-kit",
    });
    expect(failed.session.score).toBe(0);
    expect(failed.session.completedSiteIds).toHaveLength(0);
  });

  it("completes a site, stores the discovery and awards score when the correct tool is used", () => {
    const start = createFieldExpeditionSession();
    const result = attemptFieldInteraction(start, "river-quality", "sample-kit");
    expect(result.event?.type).toBe("site-completed");
    expect(result.session.completedSiteIds).toContain("river-quality");
    expect(result.session.score).toBeGreaterThan(0);
    expect(result.session.discoveries).toHaveLength(1);
  });

  it("rewards a clean sequence without double-scoring completed sites", () => {
    let session = createFieldExpeditionSession();
    session = attemptFieldInteraction(session, "river-quality", "sample-kit").session;
    const firstScore = session.score;
    session = attemptFieldInteraction(session, "soil-plot", "meter").session;
    expect(session.score - firstScore).toBeGreaterThan(FIELD_EXPEDITION_SITES.find((site) => site.id === "soil-plot")!.score);

    const repeat = attemptFieldInteraction(session, "river-quality", "sample-kit");
    expect(repeat.event?.type).toBe("already-completed");
    expect(repeat.session.score).toBe(session.score);
  });

  it("resets the streak after an inappropriate field tool is attempted", () => {
    let session = createFieldExpeditionSession();
    session = attemptFieldInteraction(session, "river-quality", "sample-kit").session;
    expect(session.streak).toBe(1);
    session = attemptFieldInteraction(session, "soil-plot", "camera").session;
    expect(session.streak).toBe(0);
  });
});
