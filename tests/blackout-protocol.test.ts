import { describe, expect, it } from "vitest";
import {
  createBlackoutProtocolState,
  deployCyberAnalyst,
  dispatchSubstationRepair,
  poweredDemandMw,
  serviceById,
  setServiceNetworkIsolation,
  setServicePowered,
  stepBlackoutProtocol,
} from "../src/lib/game-engine/blackout-protocol";

describe("Blackout Protocol crisis simulation", () => {
  it("starts with more demand than damaged-grid capacity", () => {
    const state = createBlackoutProtocolState();
    expect(poweredDemandMw(state)).toBe(104);
    expect(state.availableCapacityMw).toBe(72);
  });

  it("rewards deliberate load shedding by avoiding overload damage", () => {
    let state = createBlackoutProtocolState();
    state = setServicePowered(state, "market", false);
    state = setServicePowered(state, "transport", false);
    const beforeHospital = serviceById(state, "hospital")?.health;
    const step = stepBlackoutProtocol(state);
    expect(poweredDemandMw(state)).toBe(68);
    expect(step.overloadMw).toBe(0);
    expect(serviceById(step.state, "hospital")?.health).toBe(beforeHospital);
  });

  it("turns unmanaged excess demand into system stress instead of a quiz penalty", () => {
    const state = createBlackoutProtocolState();
    const step = stepBlackoutProtocol(state);
    expect(step.overloadMw).toBe(32);
    expect(serviceById(step.state, "hospital")?.health).toBeLessThan(100);
    expect(step.state.publicTrust).toBeLessThan(state.publicTrust);
  });

  it("restores grid capacity after a repair team completes three crisis turns", () => {
    let state = dispatchSubstationRepair(createBlackoutProtocolState());
    expect(state.repairTeams).toBe(1);
    expect(state.substationRepairTicksRemaining).toBe(3);
    state = stepBlackoutProtocol(state).state;
    state = stepBlackoutProtocol(state).state;
    const finalStep = stepBlackoutProtocol(state);
    expect(finalStep.substationRestored).toBe(true);
    expect(finalStep.state.availableCapacityMw).toBe(finalStep.state.baseCapacityMw);
    expect(finalStep.state.repairTeams).toBe(2);
  });

  it("lets cyber risk spread through connected services but isolation blocks a target", () => {
    let state = createBlackoutProtocolState();
    state = setServiceNetworkIsolation(state, "water", true);
    state = stepBlackoutProtocol(state).state;
    const second = stepBlackoutProtocol(state);
    expect(second.newlyCyberAffected).toBe("transport");
    expect(serviceById(second.state, "water")?.cyberAffected).toBe(false);
  });

  it("lets the limited cyber analyst contain further spread", () => {
    let state = deployCyberAnalyst(createBlackoutProtocolState());
    expect(state.cyberAnalysts).toBe(0);
    state = stepBlackoutProtocol(state).state;
    const second = stepBlackoutProtocol(state);
    expect(second.newlyCyberAffected).toBeNull();
  });
});
