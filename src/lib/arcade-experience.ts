export type ArcadeExperienceAgeBand = "age_4_5" | "age_6_8" | "age_9_11" | "age_12_14" | "age_15_18";
export type ArcadeExperienceIcon = "rocket" | "book" | "atom" | "map" | "keyboard" | "brain" | "heart" | "coins" | "compass" | "gamepad";
export type ArcadeMotionStyle = "race" | "float" | "orbit" | "city" | "lab" | "map" | "build" | "pulse";

export type ArcadeExperience = {
  key: string;
  label: string;
  motion: ArcadeMotionStyle;
  icon: ArcadeExperienceIcon;
  objects: string[];
};

const EXPERIENCES: Array<{ test: RegExp; experience: ArcadeExperience }> = [
  { test: /^(math|addition-dash|times-table-turbo|division-quest|decimal-defender|percentage-power|ratio-race)$/, experience: { key: "speedway", label: "Equation Speedway", motion: "race", icon: "rocket", objects: ["+10", "×4", "÷2", "½", "%", "=", "7", "24", "100"] } },
  { test: /^(number-pop|count-match|measurement-master)$/, experience: { key: "number-park", label: "Number Adventure Park", motion: "float", icon: "rocket", objects: ["1", "2", "3", "●●", "10", "cm", "kg", "L", "★"] } },
  { test: /^(fraction-forge|geometry-builder|data-detective)$/, experience: { key: "math-forge", label: "Math Builder Forge", motion: "build", icon: "brain", objects: ["½", "¾", "△", "□", "∠", "▥", "π", "x", "✓"] } },
  { test: /^(money-math-market|budget-boss|entrepreneurship-simulator)$/, experience: { key: "market", label: "Nova Market District", motion: "city", icon: "coins", objects: ["GH₵5", "GH₵20", "SALE", "SAVE", "BUDGET", "SHOP", "+", "−", "✓"] } },
  { test: /^(word|vocabulary-vault|synonym-switch|antonym-arena|grammar-fix|tense-trek|reading-detective|comprehension-quest)$/, experience: { key: "word-forest", label: "Word Quest Forest", motion: "float", icon: "book", objects: ["Aa", "verb", "noun", "?", "!", "read", "story", "word", "ABC"] } },
  { test: /^(sentence-scramble|punctuation-patrol|essay-planner)$/, experience: { key: "story-studio", label: "Story Builder Studio", motion: "build", icon: "book", objects: ["¶", ".", "?", "!", ",", "idea", "claim", "evidence", "→"] } },
  { test: /^(spelling-sprint|keyboard-ninja)$/, experience: { key: "typing-runway", label: "Kinetic Typing Runway", motion: "race", icon: "keyboard", objects: ["Q", "W", "E", "R", "T", "A", "S", "D", "↵"] } },
  { test: /^(hardware-match|file-folder-quest|coding-sequence|binary-basics|cyber-safety)$/, experience: { key: "digital-city", label: "Digital Skills City", motion: "city", icon: "keyboard", objects: ["01", "CPU", "RAM", "</>", "{ }", "FILE", "SAFE", "#", "↵"] } },
  { test: /^(force-motion-lab|energy-quest|circuit-logic|chemistry-symbol-match|matter-sort)$/, experience: { key: "science-lab", label: "Motion & Matter Laboratory", motion: "lab", icon: "atom", objects: ["⚡", "F", "m/s", "Fe", "H₂O", "O₂", "e⁻", "→", "△"] } },
  { test: /^(body-explorer|living-nonliving|food-chain-builder|healthy-choices)$/, experience: { key: "life-lab", label: "Living World Lab", motion: "pulse", icon: "heart", objects: ["♥", "O₂", "DNA", "leaf", "food", "cell", "→", "✓", "★"] } },
  { test: /^(earth-weather|space-explorer)$/, experience: { key: "space-weather", label: "Earth & Space Observatory", motion: "orbit", icon: "atom", objects: ["☁", "☀", "★", "Moon", "Earth", "Mars", "N", "°C", "↗"] } },
  { test: /^(ghana-map-master|regions-capitals|africa-explorer|world-flags-capitals)$/, experience: { key: "map-expedition", label: "Explorer Map Expedition", motion: "map", icon: "map", objects: ["GH", "AF", "N", "S", "E", "W", "⚑", "◎", "⌖"] } },
  { test: /^(history-timeline|civic-duty|culture-heritage)$/, experience: { key: "heritage-trail", label: "Heritage & Civic Trail", motion: "map", icon: "compass", objects: ["⌛", "⚖", "GH", "◆", "RIGHT", "DUTY", "PAST", "NOW", "→"] } },
  { test: /^(environment-guardian|road-safety)$/, experience: { key: "safe-town", label: "Smart & Safe Town", motion: "city", icon: "heart", objects: ["♻", "BUS", "STOP", "GO", "⚠", "WATER", "TREE", "SAFE", "✓"] } },
  { test: /^(logic|memory-matrix|odd-one-out|sequence-lab|logic-grid-lite|puzzle-path)$/, experience: { key: "puzzle-orbit", label: "Puzzle Orbit", motion: "orbit", icon: "brain", objects: ["◇", "#", "↗", "?", "○", "▦", "1→2", "…", "✓"] } },
];

const SUBJECT_FALLBACKS: Array<{ test: RegExp; experience: ArcadeExperience }> = [
  { test: /math|numeracy/i, experience: { key: "math", label: "Nova Number City", motion: "race", icon: "rocket", objects: ["7", "+", "×", "½", "%", "₵", "π", "=", "△"] } },
  { test: /literacy|english|language/i, experience: { key: "words", label: "Word Forest", motion: "float", icon: "book", objects: ["A", "B", "?", "!", "Aa", "read", "word", "story", "ABC"] } },
  { test: /science|chemistry|physics/i, experience: { key: "science", label: "Discovery Lab", motion: "lab", icon: "atom", objects: ["H₂O", "Fe", "⚡", "☁", "DNA", "O₂", "★", "F", "m/s"] } },
  { test: /social|geography|history|civic/i, experience: { key: "world", label: "Explorer World", motion: "map", icon: "map", objects: ["GH", "AF", "⚑", "N", "S", "◎", "⌛", "⚖", "◆"] } },
  { test: /ict|computing/i, experience: { key: "code", label: "Digital Grid", motion: "city", icon: "keyboard", objects: ["01", "⌨", "</>", "{ }", "CPU", "RAM", "#", "_", "↵"] } },
  { test: /logic|reasoning|memory/i, experience: { key: "logic", label: "Puzzle Orbit", motion: "orbit", icon: "brain", objects: ["◇", "#", "↗", "?", "○", "▦", "1→2", "…", "✓"] } },
];

export const ARCADE_AGE_MOTION: Record<ArcadeExperienceAgeBand, { label: string; pace: string; scale: number; density: number; duration: number }> = {
  age_4_5: { label: "Little explorer mode", pace: "gentle", scale: 1.2, density: 5, duration: 14 },
  age_6_8: { label: "Explorer mode", pace: "steady", scale: 1.1, density: 6, duration: 12 },
  age_9_11: { label: "Adventure mode", pace: "active", scale: 1, density: 7, duration: 10 },
  age_12_14: { label: "Challenge mode", pace: "focused", scale: .96, density: 8, duration: 8.8 },
  age_15_18: { label: "Mastery mode", pace: "precision", scale: .92, density: 9, duration: 7.8 },
};

export function arcadeExperienceForGame(gameKey: string, category = "", subject = ""): ArcadeExperience {
  const key = gameKey.trim().toLowerCase();
  const direct = EXPERIENCES.find((entry) => entry.test.test(key));
  if (direct) return direct.experience;
  const haystack = `${category} ${subject}`;
  return SUBJECT_FALLBACKS.find((entry) => entry.test.test(haystack))?.experience ?? {
    key: "nova",
    label: "Nova Universe",
    motion: "float",
    icon: "gamepad",
    objects: ["✦", "★", "✓", "?", "+", "→", "∞", "N", "S"],
  };
}
