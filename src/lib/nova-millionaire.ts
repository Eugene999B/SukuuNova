export type MillionaireSupportMode = "guided" | "supported" | "independent" | "challenge";

export type MillionaireClueInput = {
  kind?: string;
  prompt: string;
  scene?: { mode?: string };
};

function normalise(value: string) {
  return value.trim().toLowerCase();
}

export function millionaireLifelineTokens(difficulty: number, supportMode: MillionaireSupportMode) {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  if (supportMode === "guided") return 3;
  if (supportMode === "supported") return 2;
  if (supportMode === "challenge" && safeDifficulty >= 4) return 1;
  return 2;
}

export function millionaireReasoningCategory(input: MillionaireClueInput) {
  const mode = input.scene?.mode;
  if (mode === "case-file") return "Deduction";
  if (mode === "code-vault") return "Symbol reasoning";
  if (mode === "analogy-bridge") return "Analogy";
  if (mode === "evidence-desk") return "Evidence reasoning";
  if (mode === "rule-gate") return "Rule testing";
  if (mode === "order-track") return "Ordering logic";
  if (mode === "logic-switch") return "Conditional logic";
  if (mode === "pattern-wall") return "Pattern reasoning";
  const source = `${input.kind ?? ""} ${input.prompt}`.toLowerCase();
  if (/sequence|next|pattern|series|continue/.test(source)) return "Pattern & sequence";
  if (/odd|different|does not belong|doesn't belong|classification|group/.test(source)) return "Classification";
  if (/true|false|must|only|if |therefore|deduc|logic/.test(source)) return "Deduction";
  if (/shape|angle|side|symmetr|geometry/.test(source)) return "Visual logic";
  if (/number|digit|sum|difference|multiply|divide|\d/.test(source)) return "Number reasoning";
  return "General reasoning";
}

export function millionaireReasoningCue(input: MillionaireClueInput) {
  const mode = input.scene?.mode;
  if (mode === "case-file") return "Turn each clue into a small fact, then combine the facts. Do not guess from names or order of presentation.";
  if (mode === "code-vault") return "Replace every symbol with its stated value first. Only then follow the operation signs in their normal order.";
  if (mode === "analogy-bridge") return "Describe the relationship in the first pair in a few words. Choose the option that creates the same relationship in the second pair.";
  if (mode === "evidence-desk") return "Separate what was actually observed from claims that add new assumptions. Prefer the conclusion supported directly by the evidence.";
  if (mode === "rule-gate") return "Test each option against every condition one by one. An option that fails even one condition cannot pass the gate.";
  if (mode === "order-track") return "Write the clues as a single chain in your head. Then check which position is forced by the whole chain.";
  if (mode === "logic-switch") return "Use only what the if-then rule guarantees. A possible story is not enough; the conclusion must follow from the rule.";
  if (mode === "pattern-wall") return "Compare the full pattern, not only the last two items. Find a rule that explains every step before choosing.";
  const source = normalise(`${input.kind ?? ""} ${input.prompt}`);
  if (/sequence|next|series|continue/.test(source)) return "Compare each step with the one before it. Look for one change that works all the way through.";
  if (/pattern/.test(source)) return "Name the repeating or changing feature first. Then test the same rule against every choice.";
  if (/odd|different|does not belong|doesn't belong|classification|group/.test(source)) return "Group the choices by what they share. The strongest answer is the one that breaks the clearest shared rule.";
  if (/true|false|must|only|if |therefore|deduc|logic/.test(source)) return "Separate what the prompt guarantees from what only seems possible. Choose only what the evidence forces to be true.";
  if (/shape|angle|side|symmetr|geometry/.test(source)) return "Track one visual property at a time: sides, turns, symmetry, position or size. Ignore decoration that does not change the rule.";
  if (/number|digit|sum|difference|multiply|divide|\d/.test(source)) return "Say the change between neighbouring values aloud or write it mentally. Check that the same relationship works more than once.";
  return "Eliminate choices that break the clearest rule in the prompt, then compare the remaining choices against every clue.";
}

export function millionaireStageLabel(index: number, total: number) {
  const safeTotal = Math.max(1, Math.trunc(total));
  const safeIndex = Math.max(0, Math.min(safeTotal - 1, Math.trunc(index)));
  const position = safeIndex + 1;
  if (position === safeTotal) return "Nova Crown";
  if (position >= Math.ceil(safeTotal * 0.8)) return "Mastermind Stage";
  if (position >= Math.ceil(safeTotal * 0.6)) return "Spotlight Stage";
  if (position >= Math.ceil(safeTotal * 0.4)) return "Reasoning Stage";
  return "First Light";
}

export function millionaireCheckpointReached(index: number, total: number) {
  const position = Math.max(1, Math.trunc(index) + 1);
  const safeTotal = Math.max(1, Math.trunc(total));
  return position === safeTotal || position === Math.ceil(safeTotal / 2);
}
