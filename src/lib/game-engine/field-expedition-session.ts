export type FieldTool = "notebook" | "sample-kit" | "camera" | "meter";

export type FieldSite = {
  id: string;
  name: string;
  domain: "science" | "geography" | "agriculture" | "social-studies";
  x: number;
  z: number;
  requiredTool: FieldTool;
  action: string;
  discoveryText: string;
  score: number;
};

export type FieldExpeditionEvent =
  | { type: "site-completed"; site: FieldSite; scoreDelta: number }
  | { type: "wrong-tool"; site: FieldSite; attemptedTool: FieldTool; suggestedTool: FieldTool }
  | { type: "already-completed"; site: FieldSite };

export type FieldExpeditionSession = {
  completedSiteIds: string[];
  score: number;
  streak: number;
  discoveries: string[];
};

export const FIELD_EXPEDITION_SITES: FieldSite[] = [
  {
    id: "river-quality",
    name: "River monitoring point",
    domain: "science",
    x: -7,
    z: 5,
    requiredTool: "sample-kit",
    action: "Collect and label a water sample",
    discoveryText: "A valid field sample records where and how the evidence was collected before laboratory analysis.",
    score: 140,
  },
  {
    id: "soil-plot",
    name: "Farm soil plot",
    domain: "agriculture",
    x: 7,
    z: 7,
    requiredTool: "meter",
    action: "Measure the soil condition",
    discoveryText: "Field measurements let the learner compare growing conditions before deciding how a plot should be managed.",
    score: 140,
  },
  {
    id: "market-interview",
    name: "Market trader",
    domain: "social-studies",
    x: 8,
    z: -5,
    requiredTool: "notebook",
    action: "Record a short field interview",
    discoveryText: "First-hand testimony is useful evidence, but it should be compared with other sources before drawing conclusions.",
    score: 160,
  },
  {
    id: "erosion-bank",
    name: "Eroded river bank",
    domain: "geography",
    x: -8,
    z: -6,
    requiredTool: "camera",
    action: "Photograph visible erosion evidence",
    discoveryText: "Photographs preserve spatial evidence that can later be compared with maps, measurements and earlier observations.",
    score: 160,
  },
];

export function createFieldExpeditionSession(): FieldExpeditionSession {
  return { completedSiteIds: [], score: 0, streak: 0, discoveries: [] };
}

export function fieldSiteById(id: string) {
  return FIELD_EXPEDITION_SITES.find((site) => site.id === id) ?? null;
}

/**
 * Field learning happens through selecting and using an appropriate world tool,
 * not by pausing exploration for a multiple-choice screen.
 */
export function attemptFieldInteraction(
  previous: FieldExpeditionSession,
  siteId: string,
  tool: FieldTool,
): { session: FieldExpeditionSession; event: FieldExpeditionEvent | null } {
  const site = fieldSiteById(siteId);
  if (!site) return { session: previous, event: null };

  if (previous.completedSiteIds.includes(site.id)) {
    return { session: previous, event: { type: "already-completed", site } };
  }

  if (tool !== site.requiredTool) {
    return {
      session: { ...previous, streak: 0 },
      event: { type: "wrong-tool", site, attemptedTool: tool, suggestedTool: site.requiredTool },
    };
  }

  const streak = previous.streak + 1;
  const bonus = Math.min(100, (streak - 1) * 20);
  const scoreDelta = site.score + bonus;
  return {
    session: {
      completedSiteIds: [...previous.completedSiteIds, site.id],
      score: previous.score + scoreDelta,
      streak,
      discoveries: [...previous.discoveries, site.discoveryText],
    },
    event: { type: "site-completed", site, scoreDelta },
  };
}
