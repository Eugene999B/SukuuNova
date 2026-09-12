import { describe, expect, it } from "vitest";
import { createAnimationStoryLabQuestions } from "../src/lib/animation-story-lab-content";
import { storyLabFreeFrameNext, storyLabNextOption, storyLabProductionStage, storyLabSparkReward } from "../src/lib/animation-story-lab";

describe("Animation Story Lab creative helpers", () => {
  it("wraps storyboard and option navigation safely", () => {
    expect(storyLabNextOption(0, -1, 4)).toBe(3);
    expect(storyLabNextOption(3, 1, 4)).toBe(0);
    expect(storyLabFreeFrameNext(2, 3)).toBe(0);
  });

  it("maps production progress onto clear creation stages", () => {
    expect(storyLabProductionStage(0, 5)).toBe("sketch");
    expect(storyLabProductionStage(2, 5)).toBe("rough-cut");
    expect(storyLabProductionStage(4, 5)).toBe("scene-builder");
    expect(storyLabProductionStage(5, 5)).toBe("premiere");
  });

  it("keeps Frame Spark rewards positive while allowing revision", () => {
    expect(storyLabSparkReward(1, 0)).toBe(3);
    expect(storyLabSparkReward(5, 0)).toBeGreaterThan(storyLabSparkReward(1, 0));
    expect(storyLabSparkReward(1, 99)).toBeGreaterThanOrEqual(1);
  });
});

describe("Animation Story Lab director missions", () => {
  it("keeps introductory story craft concrete and answer-neutral in scene metadata", () => {
    const questions = createAnimationStoryLabQuestions(1, 24);
    const allowed = new Set(["sequence", "character", "cause-effect"]);
    expect(questions).toHaveLength(24);
    for (const question of questions) {
      expect(allowed.has(question.scene.storyMission)).toBe(true);
      expect(question.options).toHaveLength(4);
      expect(question.options).toContain(question.answer);
      expect(question.conceptKey).toMatch(/^animation-story-lab:/);
      expect(JSON.stringify(question.scene)).not.toContain(question.answer);
      expect(question.scene.cue?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it("expands into camera, revision, dialogue and transition craft at higher difficulty", () => {
    const questions = createAnimationStoryLabQuestions(5, 50);
    const missions = new Set(questions.map((question) => question.scene.storyMission));
    expect(missions.has("camera")).toBe(true);
    expect(missions.has("revision")).toBe(true);
    expect(missions.has("dialogue")).toBe(true);
    expect(missions.has("transition")).toBe(true);
    expect(missions.has("sequence")).toBe(true);
  });

  it("produces varied storyboard identifiers and meaningful beat strips", () => {
    const questions = createAnimationStoryLabQuestions(4, 12);
    expect(new Set(questions.map((question) => question.scene.storyboardId)).size).toBe(12);
    for (const question of questions) {
      expect(question.scene.beatStrip).toHaveLength(3);
      expect(question.scene.cast.length).toBeGreaterThan(0);
      expect(question.scene.directorBrief.length).toBeGreaterThan(20);
      expect(question.scene.constraint.length).toBeGreaterThan(20);
    }
  });
});
