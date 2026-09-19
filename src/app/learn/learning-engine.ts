import {
  catalogFor,
  isCorrectAnswer,
  type LearnQuestion,
  type SessionConfig,
} from "./learn-domain";
import { verifiedStandardQuestionsForAudience } from "./verified-content";
import { buildVariantQuestions } from "./variant-engine";
import { specializedQuestionsForSelection } from "./specialized-content";
import { broadPracticeQuestionsForSelection } from "./broad-practice";
import { buildIntelligentQuestions } from "./intelligent-foundry";

const MAX_SESSION_SIZE = 100;
const BROADENING_ATTEMPTS = 12;

type SelectionLabels = {
  subject?: string;
  topic?: string;
};

function clampRequestedCount(count: number) {
  if (!Number.isFinite(count)) return 10;
  return Math.max(1, Math.min(MAX_SESSION_SIZE, Math.floor(count)));
}

function derivedSeed(seed: number, attempt: number) {
  return (seed + Math.imul(attempt + 1, 0x9e3779b9)) >>> 0;
}

function stableRank(seed: number, value: string) {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizedLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function resolveSelectionLabels(config: SessionConfig): SelectionLabels {
  const catalog = catalogFor(config.lane);
  const program = catalog.programs.find((item) => item.id === config.programId);
  const level = program?.levels.find((item) => item.id === config.levelId);
  const subject = level?.subjects.find((item) => item.id === config.subjectId);
  const topic = subject?.topics.find((item) => item.id === config.topicId);
  return { subject: subject?.contentLabel ?? subject?.label, topic: topic?.label };
}

function selectionMatches(label: string, selection: string, resolvedLabel?: string) {
  if (selection === "all") return true;
  const candidate = normalizedLabel(label);
  if (resolvedLabel) return candidate === normalizedLabel(resolvedLabel);

  const selected = normalizedLabel(selection.replaceAll("-", " "));
  return candidate.includes(selected) || selected.includes(candidate.split(" ")[0]);
}

function starterMatches(
  question: LearnQuestion,
  config: SessionConfig,
  includeAnyTopic: boolean,
  selection = resolveSelectionLabels(config),
) {
  const subjectMatches = selectionMatches(question.subject, config.subjectId, selection.subject);
  const topicMatches = includeAnyTopic || selectionMatches(question.topic, config.topicId, selection.topic);
  return subjectMatches && topicMatches;
}

function adaptiveTargetDifficulty(config: SessionConfig, selection: SelectionLabels) {
  const mastery = config.mastery ?? {};
  let answered = 0;
  let correct = 0;
  for (const [key, stats] of Object.entries(mastery)) {
    const normalizedKey = normalizedLabel(key);
    const subjectMatches = selection.subject ? normalizedKey.includes(normalizedLabel(selection.subject)) : true;
    const topicMatches = config.topicId === "all" || !selection.topic || normalizedKey.includes(normalizedLabel(selection.topic));
    if (!subjectMatches || !topicMatches) continue;
    answered += stats.answered;
    correct += stats.correct;
  }

  if (answered < 3) return 2;
  const accuracy = correct / Math.max(1, answered);
  let target = accuracy < 0.5 ? 2 : accuracy < 0.75 ? 3 : accuracy < 0.9 ? 4 : 5;
  if ((config.streak ?? 0) >= 5) target = Math.min(5, target + 1);
  return target;
}

function adaptiveRank(left: LearnQuestion, right: LearnQuestion, seed: number, targetDifficulty = 2) {
  const leftDistance = Math.abs(left.difficulty - targetDifficulty);
  const rightDistance = Math.abs(right.difficulty - targetDifficulty);
  return leftDistance - rightDistance || stableRank(seed, left.exposureKey) - stableRank(seed, right.exposureKey);
}

function orderPool(questions: LearnQuestion[], config: SessionConfig, seed: number, selection: SelectionLabels) {
  if (config.mode === "weakness") {
    return [...questions].sort((left, right) => {
      const leftTarget = starterMatches(left, config, false, selection) ? 0 : 1;
      const rightTarget = starterMatches(right, config, false, selection) ? 0 : 1;
      return leftTarget - rightTarget || adaptiveRank(left, right, seed, adaptiveTargetDifficulty(config, selection));
    });
  }
  if (config.mode === "adaptive") {
    const target = adaptiveTargetDifficulty(config, selection);
    return [...questions].sort((left, right) => adaptiveRank(left, right, seed, target));
  }
  if (config.mode === "random" || config.mode === "timed") {
    return [...questions].sort((left, right) => stableRank(seed, left.exposureKey) - stableRank(seed, right.exposureKey));
  }
  return questions;
}

/**
 * Builds a learner session while enforcing two product-level guarantees that are
 * intentionally stricter than the starter question generator:
 *
 * 1. A concept/exposure key appears at most once inside a session.
 * 2. Recently seen concepts are placed behind fresh concepts whenever enough
 *    fresh material exists.
 *
 * Released Question Foundry content is preferred first. Catalog ids are resolved
 * to their human labels before matching, so ids such as `coding` correctly map
 * to labels such as `Computational thinking` without fragile string guessing.
 * Generated variants are capped per skill family inside a session so a huge
 * parameter space cannot masquerade as cognitive variety. When depth is small,
 * the session returns fewer questions and the UI reports the actual size.
 */
export function buildLearningSession(config: SessionConfig): LearnQuestion[] {
  const requested = clampRequestedCount(config.count);
  const seed = config.seed ?? Date.now();
  const recent = new Set(config.seen ?? []);
  const unique = new Set<string>();
  const generatedPerSkill = new Map<string, number>();
  const fresh: LearnQuestion[] = [];
  const recycled: LearnQuestion[] = [];
  const selection = resolveSelectionLabels(config);
  const reviewedQuestions = verifiedStandardQuestionsForAudience(config);
  const specializedQuestions = specializedQuestionsForSelection(config);
  const broadQuestions = broadPracticeQuestionsForSelection(config);
  const intelligentQuestions = buildIntelligentQuestions(config, Math.max(requested * 4, MAX_SESSION_SIZE * 2), seed);

  function absorb(questions: LearnQuestion[]) {
    for (const question of questions) {
      if (unique.has(question.exposureKey)) continue;
      if (question.exposureKey.startsWith("variant:")) {
        const family = `${question.subject}|${question.topic}|${question.skill}`;
        const familyCount = generatedPerSkill.get(family) ?? 0;
        if (familyCount >= 4) continue;
        generatedPerSkill.set(family, familyCount + 1);
      }
      unique.add(question.exposureKey);
      if (recent.has(question.exposureKey)) recycled.push(question);
      else fresh.push(question);
    }
  }

  const strictSelection = config.subjectId !== "all" || config.topicId !== "all";

  absorb(specializedQuestions);
  absorb(broadQuestions);
  absorb(reviewedQuestions.filter((question) => starterMatches(question, config, false, selection)));
  absorb(intelligentQuestions);
  absorb(buildVariantQuestions(config, Math.max(requested * 2, MAX_SESSION_SIZE), seed));

  if (!strictSelection && fresh.length < requested) {
    absorb(reviewedQuestions.filter((question) => starterMatches(question, config, true, selection)));
  }


  for (let attempt = 0; fresh.length < requested && attempt < BROADENING_ATTEMPTS; attempt += 1) {
    const nextSeed = derivedSeed(seed, attempt);
    absorb(buildVariantQuestions(config, MAX_SESSION_SIZE, nextSeed));
    absorb(buildIntelligentQuestions(config, MAX_SESSION_SIZE * 2, nextSeed));
  }

  const orderedFresh = orderPool(fresh, config, seed, selection);
  const orderedRecycled = orderPool(recycled, config, derivedSeed(seed, BROADENING_ATTEMPTS), selection);
  return [...orderedFresh, ...orderedRecycled].slice(0, requested);
}

export function rebalanceAdaptiveSession(
  questions: LearnQuestion[],
  currentIndex: number,
  correct: boolean,
  streak: number,
  seed = 1,
) {
  if (currentIndex < 0 || currentIndex >= questions.length - 1) return questions;
  const prefix = questions.slice(0, currentIndex + 1);
  const current = questions[currentIndex];
  const target = Math.max(1, Math.min(5, current.difficulty + (correct ? 1 : -1) + (correct && streak >= 4 ? 1 : 0)));
  const remaining = questions.slice(currentIndex + 1).sort((left, right) => {
    const leftTopicPenalty = !correct && left.topic === current.topic ? -35 : 0;
    const rightTopicPenalty = !correct && right.topic === current.topic ? -35 : 0;
    const leftFamilyPenalty = correct && current.generationFamily && left.generationFamily === current.generationFamily ? 18 : 0;
    const rightFamilyPenalty = correct && current.generationFamily && right.generationFamily === current.generationFamily ? 18 : 0;
    const leftScore = Math.abs(left.difficulty - target) * 100 + leftTopicPenalty + leftFamilyPenalty;
    const rightScore = Math.abs(right.difficulty - target) * 100 + rightTopicPenalty + rightFamilyPenalty;
    return leftScore - rightScore || stableRank(seed, left.exposureKey) - stableRank(seed, right.exposureKey);
  });
  return [...prefix, ...remaining];
}

export function sessionDiagnostics(questions: LearnQuestion[], seen: string[] = []) {
  const exposureKeys = questions.map((question) => question.exposureKey);
  const uniqueCount = new Set(exposureKeys).size;
  const recent = new Set(seen);
  const recycledCount = exposureKeys.filter((key) => recent.has(key)).length;
  const formats = Array.from(new Set(questions.map((question) => question.kind)));

  return {
    size: questions.length,
    uniqueExposureCount: uniqueCount,
    recycledCount,
    freshCount: questions.length - recycledCount,
    formats,
  };
}

export { isCorrectAnswer };
export type { LearnQuestion, SessionConfig };
