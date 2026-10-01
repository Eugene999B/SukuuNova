export type CityServiceId = "hospital" | "water" | "telecom" | "transport" | "market";
export type CrisisOutcome = "resilient-recovery" | "strained-recovery" | "system-cascade";

export type CityService = {
  id: CityServiceId;
  name: string;
  demandMw: number;
  criticality: 1 | 2 | 3;
  powered: boolean;
  networkIsolated: boolean;
  cyberAffected: boolean;
  health: number;
};

export type BlackoutProtocolState = {
  tick: number;
  maxTicks: number;
  baseCapacityMw: number;
  availableCapacityMw: number;
  repairTeams: number;
  cyberAnalysts: number;
  substationRepairTicksRemaining: number | null;
  cyberContained: boolean;
  publicTrust: number;
  services: CityService[];
  log: string[];
  outcome: CrisisOutcome | null;
};

export type CrisisStepReport = {
  state: BlackoutProtocolState;
  overloadMw: number;
  newlyCyberAffected: CityServiceId | null;
  substationRestored: boolean;
  trustDelta: number;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function serviceTemplate(): CityService[] {
  return [
    { id: "hospital", name: "Regional hospital", demandMw: 28, criticality: 3, powered: true, networkIsolated: false, cyberAffected: false, health: 100 },
    { id: "water", name: "Water treatment", demandMw: 22, criticality: 3, powered: true, networkIsolated: false, cyberAffected: false, health: 100 },
    { id: "telecom", name: "Telecom exchange", demandMw: 18, criticality: 2, powered: true, networkIsolated: false, cyberAffected: true, health: 100 },
    { id: "transport", name: "Transport signals", demandMw: 20, criticality: 2, powered: true, networkIsolated: false, cyberAffected: false, health: 100 },
    { id: "market", name: "Market district", demandMw: 16, criticality: 1, powered: true, networkIsolated: false, cyberAffected: false, health: 100 },
  ];
}

export function createBlackoutProtocolState(): BlackoutProtocolState {
  return {
    tick: 0,
    maxTicks: 12,
    baseCapacityMw: 104,
    availableCapacityMw: 72,
    repairTeams: 2,
    cyberAnalysts: 1,
    substationRepairTicksRemaining: null,
    cyberContained: false,
    publicTrust: 82,
    services: serviceTemplate(),
    log: [
      "17:40 · West substation trips. Available generation falls to 72 MW.",
      "17:41 · Telecom monitoring reports suspicious control traffic.",
    ],
    outcome: null,
  };
}

export function poweredDemandMw(state: BlackoutProtocolState) {
  return state.services.reduce((sum, service) => sum + (service.powered ? service.demandMw : 0), 0);
}

export function serviceById(state: BlackoutProtocolState, id: CityServiceId) {
  return state.services.find((service) => service.id === id) ?? null;
}

export function setServicePowered(state: BlackoutProtocolState, id: CityServiceId, powered: boolean) {
  if (state.outcome) return state;
  return {
    ...state,
    services: state.services.map((service) => service.id === id ? { ...service, powered } : service),
    log: [...state.log, `${powered ? "Restored" : "Shed"} power to ${serviceById(state, id)?.name ?? id}.`],
  };
}

export function setServiceNetworkIsolation(state: BlackoutProtocolState, id: CityServiceId, isolated: boolean) {
  if (state.outcome) return state;
  return {
    ...state,
    services: state.services.map((service) => service.id === id ? { ...service, networkIsolated: isolated } : service),
    log: [...state.log, `${isolated ? "Isolated" : "Reconnected"} ${serviceById(state, id)?.name ?? id} control network.`],
  };
}

export function dispatchSubstationRepair(state: BlackoutProtocolState) {
  if (state.outcome || state.substationRepairTicksRemaining !== null || state.availableCapacityMw >= state.baseCapacityMw || state.repairTeams <= 0) return state;
  return {
    ...state,
    repairTeams: state.repairTeams - 1,
    substationRepairTicksRemaining: 3,
    log: [...state.log, "Repair team dispatched to West substation. Estimated restoration: three crisis turns."],
  };
}

export function deployCyberAnalyst(state: BlackoutProtocolState) {
  if (state.outcome || state.cyberContained || state.cyberAnalysts <= 0) return state;
  return {
    ...state,
    cyberAnalysts: state.cyberAnalysts - 1,
    cyberContained: true,
    log: [...state.log, "Cyber analyst contains malicious control traffic. Existing affected systems still need isolation or time to stabilise."],
  };
}

function nextCyberTarget(services: CityService[]) {
  const spreadOrder: CityServiceId[] = ["water", "transport", "hospital", "market"];
  return spreadOrder.find((id) => {
    const service = services.find((candidate) => candidate.id === id);
    return Boolean(service && !service.cyberAffected && !service.networkIsolated);
  }) ?? null;
}

function calculateOutcome(state: BlackoutProtocolState): CrisisOutcome {
  const weightedHealth = state.services.reduce((sum, service) => sum + service.health * service.criticality, 0)
    / state.services.reduce((sum, service) => sum + service.criticality, 0);
  if (weightedHealth >= 78 && state.publicTrust >= 62) return "resilient-recovery";
  if (weightedHealth >= 48 && state.publicTrust >= 30) return "strained-recovery";
  return "system-cascade";
}

export function stepBlackoutProtocol(previous: BlackoutProtocolState): CrisisStepReport {
  if (previous.outcome) return { state: previous, overloadMw: 0, newlyCyberAffected: null, substationRestored: false, trustDelta: 0 };

  const tick = previous.tick + 1;
  let repairRemaining = previous.substationRepairTicksRemaining;
  let availableCapacityMw = previous.availableCapacityMw;
  let repairTeams = previous.repairTeams;
  let substationRestored = false;
  const log = [...previous.log];

  if (repairRemaining !== null) {
    repairRemaining -= 1;
    if (repairRemaining <= 0) {
      repairRemaining = null;
      availableCapacityMw = previous.baseCapacityMw;
      repairTeams += 1;
      substationRestored = true;
      log.push(`Turn ${tick} · West substation restored. Grid capacity returns to ${previous.baseCapacityMw} MW.`);
    }
  }

  const demand = previous.services.reduce((sum, service) => sum + (service.powered ? service.demandMw : 0), 0);
  const overloadMw = Math.max(0, demand - availableCapacityMw);
  let services = previous.services.map((service) => ({ ...service }));

  if (overloadMw > 0) {
    const overloadDamage = Math.min(24, 8 + overloadMw * 0.45);
    services = services.map((service) => service.powered ? { ...service, health: clamp(service.health - overloadDamage) } : service);
    log.push(`Turn ${tick} · Grid overloaded by ${overloadMw} MW. Powered services take ${Math.round(overloadDamage)}% stress damage.`);
  }

  let newlyCyberAffected: CityServiceId | null = null;
  if (!previous.cyberContained) {
    const activeUnisolated = services.some((service) => service.cyberAffected && !service.networkIsolated);
    if (activeUnisolated && tick % 2 === 0) {
      newlyCyberAffected = nextCyberTarget(services);
      if (newlyCyberAffected) {
        services = services.map((service) => service.id === newlyCyberAffected ? { ...service, cyberAffected: true } : service);
        log.push(`Turn ${tick} · Malicious control traffic reaches ${services.find((service) => service.id === newlyCyberAffected)?.name ?? newlyCyberAffected}.`);
      }
    }
  }

  services = services.map((service) => {
    let health = service.health;
    if (service.cyberAffected && !service.networkIsolated) health -= previous.cyberContained ? 2 : 7;
    if (!service.powered) health -= service.criticality === 3 ? 5 : service.criticality === 2 ? 3 : 1;
    return { ...service, health: clamp(health) };
  });

  const criticalOffline = services.reduce((sum, service) => sum + (!service.powered ? service.criticality : 0), 0);
  const damagedCritical = services.filter((service) => service.criticality === 3 && service.health < 55).length;
  const trustLoss = Math.min(15, criticalOffline * 1.25 + damagedCritical * 3 + (overloadMw > 0 ? 2 : 0));
  const trustGain = overloadMw === 0 && criticalOffline <= 1 ? 1 : 0;
  const publicTrust = clamp(previous.publicTrust - trustLoss + trustGain);
  const trustDelta = publicTrust - previous.publicTrust;

  const provisional: BlackoutProtocolState = {
    ...previous,
    tick,
    availableCapacityMw,
    repairTeams,
    substationRepairTicksRemaining: repairRemaining,
    publicTrust,
    services,
    log,
    outcome: null,
  };

  const criticalCollapse = services.filter((service) => service.criticality === 3).some((service) => service.health <= 0);
  const finished = tick >= previous.maxTicks || criticalCollapse;
  const outcome = finished ? calculateOutcome(provisional) : null;
  const state = outcome
    ? { ...provisional, outcome, log: [...provisional.log, `Crisis resolved: ${outcome.replaceAll("-", " ")}.`] }
    : provisional;

  return { state, overloadMw, newlyCyberAffected, substationRestored, trustDelta };
}
