import { describe, expect, it } from "vitest";
import { GEOQUEST_CONTROLLED_CONCEPT_COUNT, GEOQUEST_REGION_COUNT, createGeoQuestQuestions } from "../src/lib/geoquest-content";
import { geoQuestCompassReward, geoQuestDistance, geoQuestRouteWeatherRelief, geoQuestScanRecovery, geoQuestStormDamage, geoQuestTravelCost, geoQuestWeatherDurationMs } from "../src/lib/geoquest-mission";

describe("GeoQuest controlled Ghana content", () => {
  it("covers all 16 Ghana regions with a broad controlled concept pool", () => {
    expect(GEOQUEST_REGION_COUNT).toBe(16);
    expect(GEOQUEST_CONTROLLED_CONCEPT_COUNT).toBeGreaterThanOrEqual(60);
  });

  it("creates secure map questions with bounded schematic coordinates", () => {
    const questions = createGeoQuestQuestions(5, 30);
    expect(questions).toHaveLength(30);
    for (const question of questions) {
      expect(question.kind).toBe("map");
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options).toContain(question.answer);
      expect(question.scene.x).toBeGreaterThanOrEqual(0);
      expect(question.scene.x).toBeLessThanOrEqual(100);
      expect(question.scene.y).toBeGreaterThanOrEqual(0);
      expect(question.scene.y).toBeLessThanOrEqual(100);
      expect(question.scene.boardTitle).toBe("Ghana Expedition Atlas");
    }
  });

  it("keeps first-tier play focused on region recognition", () => {
    const questions = createGeoQuestQuestions(1, 16);
    expect(questions.every((question) => question.conceptKey.startsWith("geo-region:"))).toBe(true);
  });
});

describe("GeoQuest expedition mechanics", () => {
  it("gives supported learners more survey time and bounds weather cycles", () => {
    expect(geoQuestWeatherDurationMs(4, 1.2, "guided")).toBeGreaterThan(geoQuestWeatherDurationMs(4, 1.2, "challenge"));
    expect(geoQuestWeatherDurationMs(99, 99, "challenge")).toBeGreaterThanOrEqual(6500);
    expect(geoQuestWeatherDurationMs(-9, 0.01, "guided")).toBeLessThanOrEqual(19000);
  });

  it("uses real map distance to vary route energy while keeping choices bounded", () => {
    const distance = geoQuestDistance({ x: 68, y: 84 }, { x: 28, y: 14 });
    expect(distance).toBeGreaterThan(70);
    expect(geoQuestTravelCost(distance, "trail", 3)).toBeLessThan(geoQuestTravelCost(distance, "drone", 3));
    expect(geoQuestRouteWeatherRelief("drone")).toBeGreaterThan(geoQuestRouteWeatherRelief("road"));
  });

  it("caps storm damage and keeps scans/rewards non-answer-bearing", () => {
    expect(geoQuestStormDamage(40, 1, false)).toBe(0);
    expect(geoQuestStormDamage(100, 99, true)).toBeLessThanOrEqual(14);
    expect(geoQuestScanRecovery(20, 2)).toBe(0);
    expect(geoQuestScanRecovery(90, 0)).toBe(66);
    expect(geoQuestCompassReward(20)).toBe(2);
    expect(geoQuestCompassReward(90)).toBe(0);
  });
});
