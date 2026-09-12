import { describe, expect, it } from "vitest";
import { ARCADE_FLAGSHIP_QUALITY, ARCADE_LIVE_FLAGSHIP_COUNT } from "../src/lib/arcade-quality-contract";
import { ARCADE_V6_EXPERIENCES, arcadeUsesHardTimer } from "../src/lib/arcade-v6-experience";

describe("Learning Arcade flagship quality contract", () => {
  it("covers every live flagship rather than treating Nova Millionaire as a one-off", () => {
    expect(ARCADE_LIVE_FLAGSHIP_COUNT).toBe(18);
    expect(Object.keys(ARCADE_FLAGSHIP_QUALITY).sort()).toEqual(Object.keys(ARCADE_V6_EXPERIENCES).sort());
  });

  it("never turns learner thinking time into damage or a smaller reward", () => {
    for (const [game, contract] of Object.entries(ARCADE_FLAGSHIP_QUALITY)) {
      expect(contract.thinkingTimeMayDamageState, `${game} must not damage state while a learner thinks`).toBe(false);
      expect(contract.thinkingTimeMayReduceReward, `${game} must not reduce rewards while a learner thinks`).toBe(false);
    }
  });

  it("reserves hard timing for the typing skill itself", () => {
    const hardTimed = Object.keys(ARCADE_FLAGSHIP_QUALITY).filter((game) => arcadeUsesHardTimer(game));
    expect(hardTimed).toEqual(["keyboard-ninja"]);
    expect(ARCADE_FLAGSHIP_QUALITY["keyboard-ninja"].pace).toBe("skill-speed");
  });

  it("does not accept a generic four-choice grid as the identity of non-show flagships", () => {
    const choiceGridGames = Object.entries(ARCADE_FLAGSHIP_QUALITY)
      .filter(([, contract]) => contract.genericChoiceGridAllowed)
      .map(([game]) => game);
    expect(choiceGridGames).toEqual(["logic"]);
  });

  it("gives every flagship an explicit, non-generic primary interaction", () => {
    const interactions = Object.values(ARCADE_FLAGSHIP_QUALITY).map((contract) => contract.primaryInteraction);
    expect(new Set(interactions).size).toBe(ARCADE_LIVE_FLAGSHIP_COUNT);
    for (const interaction of interactions) {
      expect(interaction).not.toMatch(/^(choice|quiz|four-options|answer-cards)$/i);
      expect(interaction.length).toBeGreaterThan(8);
    }
  });

  it("keeps rebuild work visible instead of declaring the whole Arcade finished", () => {
    const statuses = Object.values(ARCADE_FLAGSHIP_QUALITY).map((contract) => contract.resetStatus);
    expect(statuses.filter((status) => status === "needs-core-rebuild").length).toBeGreaterThanOrEqual(9);
    expect(statuses).toContain("foundation-reset");
    expect(statuses).toContain("strong-base");
  });
});
