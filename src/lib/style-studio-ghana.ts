export type StudioLayer = "top" | "bottom" | "wrap" | "accessory";
export type FreeStyleItem = {
  id: string;
  label: string;
  layer: StudioLayer;
  pattern: "kente" | "stripe" | "check" | "solid" | "repeat" | "mirror" | "rework";
  swatch: "sun" | "forest" | "sky" | "berry" | "earth" | "night" | "coral" | "mint";
};

export const STYLE_STUDIO_FREE_WARDROBE: readonly FreeStyleItem[] = [
  { id: "top-kente", label: "Woven-inspired panel top", layer: "top", pattern: "kente", swatch: "sun" },
  { id: "top-sky", label: "Sky studio shirt", layer: "top", pattern: "stripe", swatch: "sky" },
  { id: "top-berry", label: "Berry stage blouse", layer: "top", pattern: "solid", swatch: "berry" },
  { id: "top-mint", label: "Mint maker tee", layer: "top", pattern: "check", swatch: "mint" },
  { id: "bottom-night", label: "Night runway trousers", layer: "bottom", pattern: "solid", swatch: "night" },
  { id: "bottom-earth", label: "Earth studio skirt", layer: "bottom", pattern: "repeat", swatch: "earth" },
  { id: "bottom-forest", label: "Forest movement shorts", layer: "bottom", pattern: "check", swatch: "forest" },
  { id: "bottom-coral", label: "Coral pleated bottom", layer: "bottom", pattern: "stripe", swatch: "coral" },
  { id: "wrap-gold", label: "Gold woven wrap", layer: "wrap", pattern: "kente", swatch: "sun" },
  { id: "wrap-sky", label: "Sky repeat sash", layer: "wrap", pattern: "repeat", swatch: "sky" },
  { id: "wrap-forest", label: "Forest mirror scarf", layer: "wrap", pattern: "mirror", swatch: "forest" },
  { id: "wrap-none", label: "No extra wrap", layer: "wrap", pattern: "solid", swatch: "night" },
  { id: "acc-band", label: "Reworked fabric headband", layer: "accessory", pattern: "rework", swatch: "berry" },
  { id: "acc-hat", label: "Sun shade hat", layer: "accessory", pattern: "solid", swatch: "earth" },
  { id: "acc-bag", label: "Pattern studio bag", layer: "accessory", pattern: "repeat", swatch: "mint" },
  { id: "acc-none", label: "No accessory", layer: "accessory", pattern: "solid", swatch: "night" },
] as const;

export function freeStyleItemsForLayer(layer: StudioLayer) {
  return STYLE_STUDIO_FREE_WARDROBE.filter((item) => item.layer === layer);
}

export function initialFreeStyleLook(): Record<StudioLayer, string> {
  return { top: "top-kente", bottom: "bottom-night", wrap: "wrap-sky", accessory: "acc-band" };
}

export function studioSparkReward(difficulty: number, revisionCount: number) {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const thoughtfulRevisionBonus = Math.min(4, Math.max(0, Math.trunc(revisionCount)));
  return 3 + safeDifficulty + thoughtfulRevisionBonus;
}

export function studioCollectionStage(checkpoint: number, total: number) {
  const safeTotal = Math.max(1, Math.trunc(total));
  const ratio = Math.max(0, Math.min(1, checkpoint / safeTotal));
  if (ratio >= 1) return "Collection complete";
  if (ratio >= 0.75) return "Final fittings";
  if (ratio >= 0.4) return "Collection taking shape";
  return "Moodboard phase";
}

export function nextWardrobeIndex(current: number, direction: number, count: number) {
  const safeCount = Math.max(1, Math.trunc(count));
  return (Math.trunc(current) + Math.trunc(direction) + safeCount) % safeCount;
}
