import {
  buildSession,
  catalogFor,
  isCorrectAnswer,
  type LearnQuestion,
  type SessionConfig,
} from "./learn-domain";
import { VERIFIED_STANDARD_QUESTIONS } from "./verified-content";
import { buildVariantQuestions } from "./variant-engine";

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
  return { subject: subject?.label, topic: topic?.label };
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

function adaptiveRank(left: LearnQuestion, right: LearnQuestion, seed: number) {
  return left.difficulty - right.difficulty || stableRank(seed, left.exposureKey) - stableRank(seed, right.exposureKey);
}

function orderPool(questions: LearnQuestion[], config: SessionConfig, seed: number, selection: SelectionLabels) {
  if (config.mode === "weakness") {
    return [...questions].sort((left, right) => {
      const leftTarget = starterMatches(left, config, false, selection) ? 0 : 1;
      const rightTarget = starterMatches(right, config, false, selection) ? 0 : 1;
      return leftTarget - rightTarget || adaptiveRank(left, right, seed);
    });
  }
  if (config.mode === "adaptive") {
    return [...questions].sort((left, right) => adaptiveRank(left, right, seed));
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
 * When the verified pack is still small, the engine broadens to generated
 * practice rather than cloning one concept under different question IDs.
 */
export function buildLearningSession(config: SessionConfig): LearnQuestion[] {
  const requested = clampRequestedCount(config.count);
  const seed = config.seed ?? Date.now();
  const recent = new Set(config.seen ?? []);
  const unique = new Set<string>();
  const fresh: LearnQuestion[] = [];
  const recycled: LearnQuestion[] = [];
  const selection = resolveSelectionLabels(config);

  function absorb(questions: LearnQuestion[]) {
    for (const question of questions) {
      if (unique.has(question.exposureKey)) continue;
      unique.add(question.exposureKey);
      if (recent.has(question.exposureKey)) recycled.push(question);
      else fresh.push(question);
    }
  }

  const strictTopic = config.mode === "topic" && config.subjectId !== "all" && config.topicId !== "all";

  absorb(VERIFIED_STANDARD_QUESTIONS.filter((question) => starterMatches(question, config, false, selection)));
  absorb(buildVariantQuestions(config, Math.max(requested * 2, MAX_SESSION_SIZE), seed));

  if (!strictTopic && fresh.length < requested) {
    absorb(VERIFIED_STANDARD_QUESTIONS.filter((question) => starterMatches(question, config, true, selection)));
  }

  absorb(
    buildSession({
      ...config,
      count: requested,
      seed,
    }).filter((question) => !strictTopic || starterMatches(question, config, false, selection)),
  );

  for (let attempt = 0; fresh.length < requested && attempt < BROADENING_ATTEMPTS; attempt += 1) {
    const nextSeed = derivedSeed(seed, attempt);
    absorb(buildVariantQuestions(config, MAX_SESSION_SIZE, nextSeed));
    if (!strictTopic) {
      absorb(
        buildSession({
          ...config,
          subjectId: "all",
          topicId: "all",
          count: MAX_SESSION_SIZE,
          seed: nextSeed,
        }),
      );
    }
  }

  const orderedFresh = orderPool(fresh, config, seed, selection);
  const orderedRecycled = orderPool(recycled, config, derivedSeed(seed, BROADENING_ATTEMPTS), selection);
  return [...orderedFresh, ...orderedRecycled].slice(0, requested);
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
