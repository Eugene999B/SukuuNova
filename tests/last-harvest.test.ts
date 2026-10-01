import { describe, expect, it } from "vitest";
import {
  canAdvanceHarvestWeek,
  compostHarvestField,
  createLastHarvestState,
  harvestFieldById,
  irrigateHarvestField,
  plantHarvestField,
  protectHarvestField,
  stepLastHarvest,
} from "../src/lib/game-engine/last-harvest";

function planSeason(weather: "mixed" | "dry" | "stormy" = "mixed") {
  let state = createLastHarvestState(weather);
  state = plantHarvestField(state, "north", "maize");
  state = plantHarvestField(state, "east", "cowpea");
  state = plantHarvestField(state, "river", "cassava");
  return state;
}

describe("The Last Harvest seasonal strategy", () => {
  it("requires a field plan before time advances", () => {
    const state = createLastHarvestState();
    expect(canAdvanceHarvestWeek(state)).toBe(false);
    expect(stepLastHarvest(state).state.week).toBe(0);

    const planned = planSeason();
    expect(canAdvanceHarvestWeek(planned)).toBe(true);
    expect(stepLastHarvest(planned).state.week).toBe(1);
  });

  it("charges crop-specific seed cost and allows replanning before week one", () => {
    let state = createLastHarvestState();
    state = plantHarvestField(state, "north", "maize");
    expect(state.budget).toBe(860);
    state = plantHarvestField(state, "north", "fallow");
    expect(state.budget).toBe(930);
    expect(harvestFieldById(state, "north")?.cropId).toBe("fallow");
  });

  it("makes irrigation and compost finite budget decisions that cannot be spammed within a week", () => {
    let state = planSeason("dry");
    const budgetBefore = state.budget;
    state = irrigateHarvestField(state, "north");
    const once = state.budget;
    state = irrigateHarvestField(state, "north");
    expect(once).toBe(budgetBefore - 32);
    expect(state.budget).toBe(once);

    state = compostHarvestField(state, "north");
    const composted = harvestFieldById(state, "north");
    expect(composted?.soilFertility).toBeGreaterThan(68);
  });

  it("lets crop biology create different soil consequences", () => {
    let maize = createLastHarvestState();
    maize = plantHarvestField(maize, "north", "maize");
    maize = plantHarvestField(maize, "east", "fallow");
    maize = plantHarvestField(maize, "river", "fallow");

    let cowpea = createLastHarvestState();
    cowpea = plantHarvestField(cowpea, "north", "cowpea");
    cowpea = plantHarvestField(cowpea, "east", "fallow");
    cowpea = plantHarvestField(cowpea, "river", "fallow");

    const maizeAfter = stepLastHarvest(maize).state;
    const cowpeaAfter = stepLastHarvest(cowpea).state;
    expect(harvestFieldById(cowpeaAfter, "north")?.soilFertility).toBeGreaterThan(harvestFieldById(maizeAfter, "north")?.soilFertility ?? 0);
  });

  it("turns pest protection into reduced field damage during the high-pressure week", () => {
    let exposed = planSeason();
    let protectedState = planSeason();
    for (let i = 0; i < 4; i += 1) {
      exposed = stepLastHarvest(exposed).state;
      protectedState = stepLastHarvest(protectedState).state;
    }
    protectedState = protectHarvestField(protectedState, "north");
    const exposedAfter = stepLastHarvest(exposed).state;
    const protectedAfter = stepLastHarvest(protectedState).state;
    expect(harvestFieldById(protectedAfter, "north")?.health).toBeGreaterThan(harvestFieldById(exposedAfter, "north")?.health ?? 0);
  });

  it("finishes a full season with an economic and ecological outcome", () => {
    let state = planSeason();
    while (!state.outcome) {
      if (state.week === 3 || state.week === 4) state = irrigateHarvestField(state, "north");
      if (state.week === 4) state = protectHarvestField(state, "north");
      state = stepLastHarvest(state).state;
    }
    expect(state.week).toBe(8);
    expect(state.totalYieldCrates).toBeGreaterThan(0);
    expect(state.harvestRevenue).toBeGreaterThan(0);
    expect(state.outcome).toBeTruthy();
  });
});
