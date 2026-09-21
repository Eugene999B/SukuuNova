import type { LearnQuestion, SessionConfig } from "./learn-domain";
import { isAuthenticPastOrOfficialQuestion } from "./exam-question-bank";

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function normalizePromptPattern(prompt: string) {
  return prompt
    .toLowerCase()
    .replace(/[“”"'][^“”"']+[“”"']/g, "<quote>")
    .replace(/\b\d+(?:\.\d+)?\b/g, "<n>")
    .replace(/\b(?:ama|kojo|akosua|yaw|esi|kofi|abena|kwame|mansa|sena|amina|ibrahim)\b/g, "<name>")
    .replace(/[^a-z<> ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stimulusKind(question: LearnQuestion) {
  return question.stimulus?.kind ?? "none";
}

function cognitiveWeight(question: LearnQuestion) {
  if (question.challenge === "Transfer") return -14;
  if (question.challenge === "Evaluate") return -12;
  if (question.challenge === "Analyse") return -9;
  if (question.challenge === "Apply") return -4;
  return 0;
}

function formatWeight(question: LearnQuestion) {
  if (question.kind === "fill") return -12;
  if (question.kind === "short") return -11;
  if (question.kind === "multi") return -10;
  if (question.kind === "numeric") return -5;
  return 0;
}

function stimulusWeight(question: LearnQuestion) {
  if (question.stimulus?.kind === "diagram") return -18;
  if (question.stimulus?.kind === "passage") return -17;
  if (question.stimulus?.kind === "table") return -14;
  return 0;
}

export function questionPatternSignature(question: LearnQuestion) {
  return [
    question.subject,
    question.topic,
    question.generationFamily ?? "no-family",
    normalizePromptPattern(question.prompt),
    stimulusKind(question),
  ].join("|");
}

export function composeIntelligentOrder(
  questions: LearnQuestion[],
  config: SessionConfig,
  seed: number,
): LearnQuestion[] {
  const pending = [...questions];
  const output: LearnQuestion[] = [];
  const familyCount = new Map<string, number>();
  const kindCount = new Map<string, number>();
  const challengeCount = new Map<string, number>();
  const stimulusCount = new Map<string, number>();
  const patternCount = new Map<string, number>();

  while (pending.length) {
    const previous = output[output.length - 1];
    const beforePrevious = output[output.length - 2];
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    pending.forEach((candidate, index) => {
      const family = candidate.generationFamily ?? "no-family";
      const kind = candidate.kind;
      const challenge = candidate.challenge ?? "none";
      const stimulus = stimulusKind(candidate);
      const pattern = normalizePromptPattern(candidate.prompt);

      let score = index * 0.025;

      score += (familyCount.get(family) ?? 0) * 17;
      score += (kindCount.get(kind) ?? 0) * 7;
      score += (challengeCount.get(challenge) ?? 0) * 4;
      score += (stimulusCount.get(stimulus) ?? 0) * (stimulus === "none" ? 1.5 : 5);
      score += (patternCount.get(pattern) ?? 0) * 80;

      if (previous) {
        if (previous.generationFamily && previous.generationFamily === candidate.generationFamily) score += 120;
        if (previous.kind === candidate.kind) score += 24;
        if ((previous.challenge ?? "none") === challenge) score += 13;
        if (stimulusKind(previous) === stimulus && stimulus !== "none") score += 30;
        if (normalizePromptPattern(previous.prompt) === pattern) score += 220;
        if (previous.topic === candidate.topic) score += config.topicId === "all" ? 26 : 3;
      }

      if (beforePrevious) {
        if (
          candidate.generationFamily
          && candidate.generationFamily === previous?.generationFamily
          && candidate.generationFamily === beforePrevious.generationFamily
        ) score += 260;
        if (
          normalizePromptPattern(beforePrevious.prompt) === pattern
          && normalizePromptPattern(previous?.prompt ?? "") === pattern
        ) score += 360;
      }

      score += cognitiveWeight(candidate);
      score += formatWeight(candidate);
      score += stimulusWeight(candidate);

      if (config.lane === "exam" && isAuthenticPastOrOfficialQuestion(candidate)) score -= 90;
      if (config.mode === "adaptive") {
        const desired = Math.max(1, Math.min(5, 3 + ((config.streak ?? 0) >= 5 ? 1 : 0)));
        score += Math.abs(candidate.difficulty - desired) * 8;
      }

      score += (hash(`${seed}:${output.length}:${candidate.exposureKey}`) % 1000) / 1000;

      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    const selected = pending.splice(bestIndex, 1)[0];
    output.push(selected);

    const family = selected.generationFamily ?? "no-family";
    const kind = selected.kind;
    const challenge = selected.challenge ?? "none";
    const stimulus = stimulusKind(selected);
    const pattern = normalizePromptPattern(selected.prompt);

    familyCount.set(family, (familyCount.get(family) ?? 0) + 1);
    kindCount.set(kind, (kindCount.get(kind) ?? 0) + 1);
    challengeCount.set(challenge, (challengeCount.get(challenge) ?? 0) + 1);
    stimulusCount.set(stimulus, (stimulusCount.get(stimulus) ?? 0) + 1);
    patternCount.set(pattern, (patternCount.get(pattern) ?? 0) + 1);
  }

  return output;
}

export function sessionIntelligenceDiagnostics(questions: LearnQuestion[]) {
  const kinds = new Set(questions.map((question) => question.kind));
  const families = new Set(questions.map((question) => question.generationFamily ?? "no-family"));
  const challenges = new Set(questions.map((question) => question.challenge ?? "none"));
  const patterns = new Set(questions.map((question) => normalizePromptPattern(question.prompt)));
  const stimulusKinds = new Set(questions.map(stimulusKind));
  const richStimuli = questions.filter((question) => question.stimulus).length;
  const higherOrder = questions.filter((question) =>
    question.challenge === "Analyse" || question.challenge === "Evaluate" || question.challenge === "Transfer",
  ).length;
  const constructedResponse = questions.filter((question) =>
    question.kind === "fill" || question.kind === "short" || question.kind === "numeric",
  ).length;

  return {
    size: questions.length,
    kindCount: kinds.size,
    familyCount: families.size,
    challengeCount: challenges.size,
    promptPatternCount: patterns.size,
    stimulusKindCount: stimulusKinds.size,
    richStimulusCount: richStimuli,
    higherOrderCount: higherOrder,
    constructedResponseCount: constructedResponse,
    authenticExamCount: questions.filter(isAuthenticPastOrOfficialQuestion).length,
  };
}
