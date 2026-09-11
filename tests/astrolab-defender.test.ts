import { describe, expect, it } from "vitest";
import { astroPowerReward, astroSystemDrain, astroSystemForCheckpoint, astroThreatDurationMs } from "../src/lib/astrolab-mission";

describe("AstroLab Defender mission mechanics", () => {
  it("rotates anomalies across the three station systems deterministically", () => {
    expect([0, 1, 2, 3, 4, 5].map(astroSystemForCheckpoint)).toEqual([
      "shields", "reactor", "navigation", "shields", "reactor", "navigation",
    ]);
  });

  it("gives guided learners more decision time than challenge learners", () => {
    const guided = astroThreatDurationMs(3, 1, "guided");
    const independent = astroThreatDurationMs(3, 1, "independent");
    const challenge = astroThreatDurationMs(3, 1, "challenge");
    expect(guided).toBeGreaterThan(independent);
    expect(independent).toBeGreaterThan(challenge);
  });

  it("raises system pressure with threat, hazard density and boss encounters but keeps it bounded", () => {
    const calm = astroSystemDrain(10, 0.55, false);
    const danger = astroSystemDrain(90, 1, false);
    const boss = astroSystemDrain(90, 1, true);
    expect(calm).toBeGreaterThanOrEqual(3);
    expect(danger).toBeGreaterThan(calm);
    expect(boss).toBeGreaterThanOrEqual(danger);
    expect(boss).toBeLessThanOrEqual(18);
  });

  it("rewards faster defensive decisions with more repair power without changing academic grading", () => {
    expect(astroPowerReward(15)).toBe(3);
    expect(astroPowerReward(50)).toBe(2);
    expect(astroPowerReward(90)).toBe(1);
  });
});
