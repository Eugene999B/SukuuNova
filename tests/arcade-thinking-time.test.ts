import { describe, expect, it } from "vitest";
import { astroPowerReward, astroSystemDrain } from "../src/lib/astrolab-mission";
import { bioComboGain, bioInsightReward, bioStrainDamage, bioSystemGain, bioVitalityReward } from "../src/lib/bioquest";
import { marketComboGain, marketQueueTrustLoss, marketRestockGain, marketTillReward } from "../src/lib/cedi-city-market";
import { circuitForgeChargeGain, circuitForgeComboGain, circuitForgeFaultDamage, circuitForgeStabilityGain } from "../src/lib/circuit-forge";
import { codeBotsEfficiencyChain, codeBotsOverheatDamage, codeBotsPowerReward } from "../src/lib/codebots-mission";
import { chronicleChainGain, chronicleInsightReward, chronicleIntegrityReward, chronicleParadoxDamage } from "../src/lib/chronicle-vault";
import { ecoChainGain, ecoResourceGain, ecoResilienceReward, ecoSeedReward, ecoStressDamage } from "../src/lib/ecogrid";
import { geoQuestCompassReward, geoQuestStormDamage } from "../src/lib/geoquest-mission";
import { readingQuestLanternReward, readingQuestTrailDamage } from "../src/lib/reading-quest-mission";
import { signalBreachDamage, signalChainGain, signalIntegrityReward, signalIntelReward } from "../src/lib/signal-shield";
import { solarDriftDamage, solarFuelReward, solarOrbitChain } from "../src/lib/solar-navigator";
import { wordKingdomFocusChain, wordKingdomGateDamage, wordKingdomManaReward } from "../src/lib/word-kingdom-mission";

describe("Learning Arcade thinking-time neutrality", () => {
  it("never converts elapsed thinking time into world damage", () => {
    expect(astroSystemDrain(100, 1.2, true)).toBe(0);
    expect(circuitForgeFaultDamage(100, 1.5, true)).toBe(0);
    expect(wordKingdomGateDamage(100, 1.5, true)).toBe(0);
    expect(codeBotsOverheatDamage(100, 1.5, true)).toBe(0);
    expect(readingQuestTrailDamage(100, 1.5, true)).toBe(0);
    expect(geoQuestStormDamage(100, 1.5, true)).toBe(0);
    expect(marketQueueTrustLoss(100, 1.5, true)).toBe(0);
    expect(signalBreachDamage(100, 1.5, true)).toBe(0);
    expect(ecoStressDamage(100, 1.5, true)).toBe(0);
    expect(bioStrainDamage(100, 1.5, true)).toBe(0);
    expect(chronicleParadoxDamage(100, 1.5, true)).toBe(0);
    expect(solarDriftDamage(1, 1.8, 5)).toBe(0);
  });

  it("does not shrink rewards because a learner took longer", () => {
    expect(astroPowerReward(0)).toBe(astroPowerReward(100));
    expect(circuitForgeStabilityGain(0, 4)).toBe(circuitForgeStabilityGain(100, 4));
    expect(circuitForgeChargeGain(4, 0)).toBe(circuitForgeChargeGain(4, 100));
    expect(circuitForgeComboGain(0)).toBe(circuitForgeComboGain(100));
    expect(wordKingdomManaReward(0, 2)).toBe(wordKingdomManaReward(100, 2));
    expect(wordKingdomFocusChain(3, 0)).toBe(wordKingdomFocusChain(3, 100));
    expect(codeBotsPowerReward(0, 5)).toBe(codeBotsPowerReward(100, 5));
    expect(codeBotsEfficiencyChain(3, 0)).toBe(codeBotsEfficiencyChain(3, 100));
    expect(readingQuestLanternReward(0)).toBe(readingQuestLanternReward(100));
    expect(geoQuestCompassReward(0)).toBe(geoQuestCompassReward(100));
    expect(marketTillReward(0, 4)).toBe(marketTillReward(100, 4));
    expect(marketComboGain(0)).toBe(marketComboGain(100));
    expect(marketRestockGain(0)).toBe(marketRestockGain(100));
    expect(signalIntegrityReward(0, 4)).toBe(signalIntegrityReward(100, 4));
    expect(signalIntelReward(4, 0)).toBe(signalIntelReward(4, 100));
    expect(signalChainGain(0)).toBe(signalChainGain(100));
    expect(ecoResilienceReward(0, 4)).toBe(ecoResilienceReward(100, 4));
    expect(ecoSeedReward(4, 0)).toBe(ecoSeedReward(4, 100));
    expect(ecoResourceGain(4, 0)).toBe(ecoResourceGain(4, 100));
    expect(ecoChainGain(0)).toBe(ecoChainGain(100));
    expect(bioVitalityReward(0, 4)).toBe(bioVitalityReward(100, 4));
    expect(bioInsightReward(4, 0)).toBe(bioInsightReward(4, 100));
    expect(bioSystemGain(4, 0)).toBe(bioSystemGain(4, 100));
    expect(bioComboGain(0)).toBe(bioComboGain(100));
    expect(chronicleIntegrityReward(0, 4)).toBe(chronicleIntegrityReward(100, 4));
    expect(chronicleInsightReward(4, 0)).toBe(chronicleInsightReward(4, 100));
    expect(chronicleChainGain(0)).toBe(chronicleChainGain(100));
  });

  it("does not punish experimentation in Solar Navigator", () => {
    expect(solarFuelReward(4, 0, 4)).toBe(solarFuelReward(4, 4, 4));
    expect(solarOrbitChain(3, 0)).toBe(solarOrbitChain(3, 4));
  });
});
