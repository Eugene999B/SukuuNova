export type HarvestCropId = "maize" | "cowpea" | "cassava" | "fallow";
export type WeatherPatternId = "mixed" | "dry" | "stormy";
export type HarvestOutcome = "regenerative-harvest" | "profitable-but-fragile" | "survival-season" | "failed-harvest";

export type CropProfile = {
  id: HarvestCropId;
  name: string;
  seedCost: number;
  waterNeed: number;
  nutrientUse: number;
  fertilityRecovery: number;
  baseYieldCrates: number;
  pricePerCrate: number;
  resilience: number;
};

export type HarvestField = {
  id: "north" | "east" | "river";
  name: string;
  cropId: HarvestCropId | null;
  soilFertility: number;
  moisture: number;
  health: number;
  growth: number;
  irrigatedThisWeek: boolean;
  protectedThisWeek: boolean;
  compostedThisWeek: boolean;
};

export type LastHarvestState = {
  week: number;
  maxWeeks: number;
  budget: number;
  weatherPattern: WeatherPatternId;
  fields: HarvestField[];
  totalYieldCrates: number;
  harvestRevenue: number;
  log: string[];
  outcome: HarvestOutcome | null;
};

export type HarvestWeekReport = {
  state: LastHarvestState;
  rainfall: number;
  pestPressure: number;
  fieldNotes: Array<{ fieldId: HarvestField["id"]; healthDelta: number; moistureAfter: number; fertilityAfter: number }>;
};

export const HARVEST_CROPS: Record<HarvestCropId, CropProfile> = {
  maize: {
    id: "maize",
    name: "Maize",
    seedCost: 90,
    waterNeed: 0.68,
    nutrientUse: 12,
    fertilityRecovery: 0,
    baseYieldCrates: 38,
    pricePerCrate: 19,
    resilience: 0.52,
  },
  cowpea: {
    id: "cowpea",
    name: "Cowpea",
    seedCost: 72,
    waterNeed: 0.48,
    nutrientUse: 5,
    fertilityRecovery: 7,
    baseYieldCrates: 28,
    pricePerCrate: 24,
    resilience: 0.72,
  },
  cassava: {
    id: "cassava",
    name: "Cassava",
    seedCost: 105,
    waterNeed: 0.38,
    nutrientUse: 8,
    fertilityRecovery: 0,
    baseYieldCrates: 34,
    pricePerCrate: 22,
    resilience: 0.82,
  },
  fallow: {
    id: "fallow",
    name: "Fallow / cover crop",
    seedCost: 20,
    waterNeed: 0.2,
    nutrientUse: 0,
    fertilityRecovery: 14,
    baseYieldCrates: 0,
    pricePerCrate: 0,
    resilience: 1,
  },
};

const WEATHER: Record<WeatherPatternId, number[]> = {
  mixed: [0.35, 0.82, 0.25, 0.08, 0.58, 0.76, 0.3, 0.5],
  dry: [0.18, 0.32, 0.08, 0.04, 0.22, 0.38, 0.12, 0.26],
  stormy: [0.62, 1, 0.88, 0.72, 0.94, 0.48, 1, 0.8],
};

const PEST_PRESSURE = [0.08, 0.16, 0.2, 0.35, 0.78, 0.5, 0.24, 0.12];
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function fieldsTemplate(): HarvestField[] {
  return [
    { id: "north", name: "North field", cropId: null, soilFertility: 68, moisture: 54, health: 100, growth: 0, irrigatedThisWeek: false, protectedThisWeek: false, compostedThisWeek: false },
    { id: "east", name: "East field", cropId: null, soilFertility: 58, moisture: 48, health: 100, growth: 0, irrigatedThisWeek: false, protectedThisWeek: false, compostedThisWeek: false },
    { id: "river", name: "River field", cropId: null, soilFertility: 76, moisture: 70, health: 100, growth: 0, irrigatedThisWeek: false, protectedThisWeek: false, compostedThisWeek: false },
  ];
}

export function createLastHarvestState(weatherPattern: WeatherPatternId = "mixed"): LastHarvestState {
  return {
    week: 0,
    maxWeeks: 8,
    budget: 950,
    weatherPattern,
    fields: fieldsTemplate(),
    totalYieldCrates: 0,
    harvestRevenue: 0,
    log: ["Season begins. Plan all three fields before advancing the first week."],
    outcome: null,
  };
}

export function harvestFieldById(state: LastHarvestState, fieldId: HarvestField["id"]) {
  return state.fields.find((field) => field.id === fieldId) ?? null;
}

export function canAdvanceHarvestWeek(state: LastHarvestState) {
  return !state.outcome && state.week < state.maxWeeks && state.fields.every((field) => field.cropId !== null);
}

export function plantHarvestField(state: LastHarvestState, fieldId: HarvestField["id"], cropId: HarvestCropId) {
  if (state.outcome || state.week !== 0) return state;
  const field = harvestFieldById(state, fieldId);
  if (!field) return state;
  const previousCost = field.cropId ? HARVEST_CROPS[field.cropId].seedCost : 0;
  const nextCost = HARVEST_CROPS[cropId].seedCost;
  const nextBudget = state.budget + previousCost - nextCost;
  if (nextBudget < 0) return state;
  return {
    ...state,
    budget: nextBudget,
    fields: state.fields.map((candidate) => candidate.id === fieldId ? { ...candidate, cropId } : candidate),
    log: [...state.log, `${field.name} planned for ${HARVEST_CROPS[cropId].name}.`],
  };
}

export function irrigateHarvestField(state: LastHarvestState, fieldId: HarvestField["id"]) {
  if (state.outcome || state.budget < 32) return state;
  const field = harvestFieldById(state, fieldId);
  if (!field || !field.cropId || field.irrigatedThisWeek) return state;
  return {
    ...state,
    budget: state.budget - 32,
    fields: state.fields.map((candidate) => candidate.id === fieldId
      ? { ...candidate, moisture: clamp(candidate.moisture + 26), irrigatedThisWeek: true }
      : candidate),
    log: [...state.log, `Irrigated ${field.name} for 32 credits.`],
  };
}

export function compostHarvestField(state: LastHarvestState, fieldId: HarvestField["id"]) {
  if (state.outcome || state.budget < 44) return state;
  const field = harvestFieldById(state, fieldId);
  if (!field || !field.cropId || field.compostedThisWeek) return state;
  return {
    ...state,
    budget: state.budget - 44,
    fields: state.fields.map((candidate) => candidate.id === fieldId
      ? { ...candidate, soilFertility: clamp(candidate.soilFertility + 12), compostedThisWeek: true }
      : candidate),
    log: [...state.log, `Added compost to ${field.name} for 44 credits.`],
  };
}

export function protectHarvestField(state: LastHarvestState, fieldId: HarvestField["id"]) {
  if (state.outcome || state.budget < 28) return state;
  const field = harvestFieldById(state, fieldId);
  if (!field || !field.cropId || field.protectedThisWeek) return state;
  return {
    ...state,
    budget: state.budget - 28,
    fields: state.fields.map((candidate) => candidate.id === fieldId ? { ...candidate, protectedThisWeek: true } : candidate),
    log: [...state.log, `Protected ${field.name} against this week's pest pressure for 28 credits.`],
  };
}

function calculateHarvest(field: HarvestField) {
  if (!field.cropId) return { yieldCrates: 0, revenue: 0 };
  const crop = HARVEST_CROPS[field.cropId];
  if (crop.id === "fallow") return { yieldCrates: 0, revenue: 0 };
  const growthFactor = clamp(field.growth / 8, 0, 1);
  const healthFactor = clamp(field.health / 100, 0, 1);
  const fertilityFactor = 0.55 + clamp(field.soilFertility / 100, 0, 1) * 0.45;
  const yieldCrates = Math.max(0, Math.round(crop.baseYieldCrates * growthFactor * healthFactor * fertilityFactor));
  return { yieldCrates, revenue: yieldCrates * crop.pricePerCrate };
}

function calculateHarvestOutcome(fields: HarvestField[], totalYieldCrates: number, budget: number): HarvestOutcome {
  const averageFertility = fields.reduce((sum, field) => sum + field.soilFertility, 0) / fields.length;
  if (totalYieldCrates >= 68 && averageFertility >= 56 && budget >= 450) return "regenerative-harvest";
  if (totalYieldCrates >= 68 && budget >= 350) return "profitable-but-fragile";
  if (totalYieldCrates >= 38 && budget > 0) return "survival-season";
  return "failed-harvest";
}

export function stepLastHarvest(previous: LastHarvestState): HarvestWeekReport {
  if (!canAdvanceHarvestWeek(previous)) {
    return { state: previous, rainfall: 0, pestPressure: 0, fieldNotes: [] };
  }

  const weekIndex = previous.week;
  const rainfall = WEATHER[previous.weatherPattern][weekIndex] ?? 0;
  const pestPressure = PEST_PRESSURE[weekIndex] ?? 0;
  const notes: HarvestWeekReport["fieldNotes"] = [];

  const fields = previous.fields.map((field) => {
    const crop = HARVEST_CROPS[field.cropId as HarvestCropId];
    const healthBefore = field.health;
    let moisture = clamp(field.moisture + rainfall * 46);
    const fertility = clamp(field.soilFertility - crop.nutrientUse / 8 + crop.fertilityRecovery / 8);
    let health = field.health;

    const targetMoisture = crop.waterNeed * 100;
    const moistureShortfall = Math.max(0, targetMoisture - moisture);
    health -= moistureShortfall * (0.16 + (1 - crop.resilience) * 0.18);

    const waterlogging = Math.max(0, moisture - 92);
    health -= waterlogging * (1 - crop.resilience) * 0.3;

    if (fertility < 38 && crop.nutrientUse > 0) health -= (38 - fertility) * 0.16;

    if (!field.protectedThisWeek && crop.id !== "fallow") {
      health -= pestPressure * 13 * (1.15 - crop.resilience * 0.5);
    }

    health = clamp(health);
    const growth = field.growth + (crop.id === "fallow" ? 0 : 0.55 + health / 220);
    moisture = clamp(moisture - crop.waterNeed * 22);

    notes.push({
      fieldId: field.id,
      healthDelta: health - healthBefore,
      moistureAfter: moisture,
      fertilityAfter: fertility,
    });

    return {
      ...field,
      soilFertility: fertility,
      moisture,
      health,
      growth,
      irrigatedThisWeek: false,
      protectedThisWeek: false,
      compostedThisWeek: false,
    };
  });

  const week = previous.week + 1;
  const log = [
    ...previous.log,
    `Week ${week}: rainfall ${(rainfall * 100).toFixed(0)}%, pest pressure ${(pestPressure * 100).toFixed(0)}%.`,
  ];

  if (week < previous.maxWeeks) {
    return {
      state: { ...previous, week, fields, log },
      rainfall,
      pestPressure,
      fieldNotes: notes,
    };
  }

  let totalYieldCrates = 0;
  let harvestRevenue = 0;
  for (const field of fields) {
    const result = calculateHarvest(field);
    totalYieldCrates += result.yieldCrates;
    harvestRevenue += result.revenue;
  }
  const budget = previous.budget + harvestRevenue;
  const outcome = calculateHarvestOutcome(fields, totalYieldCrates, budget);
  const state: LastHarvestState = {
    ...previous,
    week,
    fields,
    totalYieldCrates,
    harvestRevenue,
    budget,
    outcome,
    log: [...log, `Harvest: ${totalYieldCrates} crates, ${harvestRevenue} credits revenue. Outcome: ${outcome.replaceAll("-", " ")}.`],
  };
  return { state, rainfall, pestPressure, fieldNotes: notes };
}
