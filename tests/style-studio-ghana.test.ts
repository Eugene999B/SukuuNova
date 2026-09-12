import { describe, expect, it } from "vitest";
import { createStyleStudioQuestions } from "../src/lib/style-studio-ghana-content";
import { freeStyleItemsForLayer, initialFreeStyleLook, nextWardrobeIndex, studioCollectionStage, studioSparkReward, STYLE_STUDIO_FREE_WARDROBE } from "../src/lib/style-studio-ghana";

describe("Style Studio Ghana controlled learning missions", () => {
  it("creates four-piece visual wardrobes with a server-gradeable target", () => {
    const questions = createStyleStudioQuestions(5, 32);
    expect(questions).toHaveLength(32);
    for (const question of questions) {
      expect(question.kind).toBe("simulation");
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options).toContain(question.answer);
      expect(question.scene.wardrobe).toHaveLength(4);
      expect(question.scene.wardrobe.map((item) => item.label)).toEqual(expect.arrayContaining(question.options));
      expect(question.conceptKey.startsWith("style-studio:")).toBe(true);
      expect(question.scene.boardTitle).toBe("Style Studio Ghana");
      expect(question.scene.brief.length).toBeGreaterThan(10);
      expect(question.scene.constraint.length).toBeGreaterThan(10);
      expect(question.scene.studioId.startsWith("STYLE-")).toBe(true);
    }
  });

  it("keeps beginner missions concrete and expands into deeper cultural/design reasoning", () => {
    const beginner = createStyleStudioQuestions(1, 30);
    const beginnerMissions = new Set(beginner.map((question) => question.scene.studioMission));
    expect(beginnerMissions.has("weaving")).toBe(true);
    expect(beginnerMissions.has("pattern")).toBe(true);
    expect(beginnerMissions.has("function")).toBe(true);
    expect(beginnerMissions.has("repair")).toBe(true);
    expect(beginnerMissions.has("heritage")).toBe(false);

    const advanced = createStyleStudioQuestions(5, 48);
    const concepts = new Set(advanced.map((question) => question.conceptKey));
    expect([...concepts].some((key) => key.includes("heritage:kpetoe"))).toBe(true);
    expect([...concepts].some((key) => key.includes("heritage:bonwire"))).toBe(true);
    expect([...concepts].some((key) => key.includes("heritage:source-respect"))).toBe(true);
    expect([...concepts].some((key) => key.includes("pattern:motif-scale"))).toBe(true);
  });

  it("never labels free-style wardrobe pieces as correct or incorrect", () => {
    expect(STYLE_STUDIO_FREE_WARDROBE.length).toBeGreaterThanOrEqual(16);
    for (const item of STYLE_STUDIO_FREE_WARDROBE) {
      expect("correct" in item).toBe(false);
      expect("answer" in item).toBe(false);
    }
    expect(freeStyleItemsForLayer("top")).toHaveLength(4);
    expect(freeStyleItemsForLayer("bottom")).toHaveLength(4);
    expect(freeStyleItemsForLayer("wrap")).toHaveLength(4);
    expect(freeStyleItemsForLayer("accessory")).toHaveLength(4);
  });
});

describe("Style Studio Ghana creative mechanics", () => {
  it("builds a complete saved look without assigning a taste score", () => {
    const look = initialFreeStyleLook();
    expect(Object.keys(look).sort()).toEqual(["accessory", "bottom", "top", "wrap"]);
    for (const [layer, id] of Object.entries(look)) {
      expect(STYLE_STUDIO_FREE_WARDROBE.some((item) => item.layer === layer && item.id === id)).toBe(true);
    }
  });

  it("wraps keyboard wardrobe navigation safely", () => {
    expect(nextWardrobeIndex(0, -1, 4)).toBe(3);
    expect(nextWardrobeIndex(3, 1, 4)).toBe(0);
    expect(nextWardrobeIndex(1, 1, 4)).toBe(2);
  });

  it("rewards thoughtful iteration without making rapid choices mandatory", () => {
    expect(studioSparkReward(5, 3)).toBeGreaterThan(studioSparkReward(1, 0));
    expect(studioSparkReward(5, 999)).toBeLessThanOrEqual(12);
    expect(studioCollectionStage(0, 5)).toBe("Moodboard phase");
    expect(studioCollectionStage(5, 5)).toBe("Collection complete");
  });
});
