import { describe, expect, it } from "vitest";
import {
  wordKingdomFocusChain,
  wordKingdomGateDamage,
  wordKingdomManaReward,
  wordKingdomRegionForCheckpoint,
  wordKingdomThreatDurationMs,
  wordKingdomWardRecovery,
} from "../src/lib/word-kingdom-mission";

describe("Word Kingdom mission mechanics", () => {
  it("rotates ordinary regions and reserves Crown Citadel for a boss gate", () => {
    expect(wordKingdomRegionForCheckpoint(0)).toBe("whispering-woods");
    expect(wordKingdomRegionForCheckpoint(1)).toBe("lexicon-forge");
    expect(wordKingdomRegionForCheckpoint(2)).toBe("grammar-keep");
    expect(wordKingdomRegionForCheckpoint(3)).toBe("whispering-woods");
    expect(wordKingdomRegionForCheckpoint(2, true)).toBe("crown-citadel");
  });

  it("gives guided learners more decision time while keeping every timer bounded", () => {
    const guided = wordKingdomThreatDurationMs(4, 1.2, "guided");
    const challenge = wordKingdomThreatDurationMs(4, 1.2, "challenge");
    expect(guided).toBeGreaterThan(challenge);
    expect(wordKingdomThreatDurationMs(99, 99, "challenge")).toBeGreaterThanOrEqual(4600);
    expect(wordKingdomThreatDurationMs(-20, 0.01, "guided")).toBeLessThanOrEqual(15000);
  });

  it("increases castle pressure with threat and boss status but caps damage", () => {
    const calm = wordKingdomGateDamage(5, 0.8, false);
    const pressured = wordKingdomGateDamage(90, 1.2, false);
    const boss = wordKingdomGateDamage(90, 1.2, true);
    expect(pressured).toBeGreaterThan(calm);
    expect(boss).toBeGreaterThanOrEqual(pressured);
    expect(wordKingdomGateDamage(999, 99, true)).toBeLessThanOrEqual(16);
  });

  it("rewards fast focus without using academic correctness", () => {
    expect(wordKingdomFocusChain(2, 40)).toBe(3);
    expect(wordKingdomFocusChain(7, 90)).toBe(0);
    expect(wordKingdomManaReward(35, 3)).toBe(3);
    expect(wordKingdomManaReward(95, 0)).toBe(0);
  });

  it("casts a bounded ward that restores the gate and pushes back threat", () => {
    expect(wordKingdomWardRecovery(95, 20)).toEqual({ integrity: 100, threat: 0 });
    expect(wordKingdomWardRecovery(40, 80)).toEqual({ integrity: 48, threat: 48 });
  });
});
