import {
  catalogFor,
  isCorrectAnswer,
  resolveCatalogSelection,
  reviewedTopicLabelsForSelection,
  type LearnQuestion,
  type SessionConfig,
} from "./learn-domain";
import { verifiedStandardQuestionsForAudience } from "./verified-content";
import { buildVariantQuestions } from "./variant-engine";
import { specializedQuestionsForSelection } from "./specialized-content";
import { broadPracticeQuestionsForSelection } from "./broad-practice";
import { buildIntelligentQuestions } from "./intelligent-foundry";
import { buildCoverageQuestions } from "./coverage-foundry";
import { buildPrimaryMathQuestions } from "./primary-math-foundry";
import { buildSchoolLanguageQuestions, isNativeLanguageQuestion } from "./school-language-foundry";
import { buildRichStimulusQuestions } from "./rich-stimulus-foundry";
import { examBankQuestionsForSelection } from "./exam-question-bank";
import { composeIntelligentOrder, sessionIntelligenceDiagnostics } from "./intelligence-core";

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

function candidateCount(requested: number, factor = 4, floor = 24) {
  return Math.min(MAX_SESSION_SIZE * 2, Math.max(floor, requested * factor));
}

function composeCandidateWindow(
  questions: LearnQuestion[],
  config: SessionConfig,
  seed: number,
  requested: number,
) {
  if (config.mode === "weakness" || questions.length <= 1) return questions;
  const windowSize = Math.min(
    questions.length,
    Math.max(24, Math.min(MAX_SESSION_SIZE, requested * 8)),
  );
  if (windowSize >= questions.length) return composeIntelligentOrder(questions, config, seed);
  const head = composeIntelligentOrder(questions.slice(0, windowSize), config, seed);
  return [...head, ...questions.slice(windowSize)];
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
  const { subject, topic } = resolveCatalogSelection(config);
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
  const reviewedLabels = reviewedTopicLabelsForSelection(config);
  const topicMatches = includeAnyTopic
    || selectionMatches(question.topic, config.topicId, selection.topic)
    || reviewedLabels.some((label) => normalizedLabel(question.topic) === normalizedLabel(label));
  return subjectMatches && topicMatches;
}

function baselineDifficultyForLevel(levelId: string) {
  if (levelId === "kg-1" || levelId === "kg-2" || levelId === "basic-1") return 1;
  if (levelId === "basic-2" || levelId === "basic-3") return 2;
  if (levelId === "basic-4" || levelId === "basic-5" || levelId === "jhs-1" || levelId === "shs-1" || levelId === "level-100") return 3;
  if (levelId === "basic-6" || levelId === "jhs-2" || levelId === "jhs-3" || levelId === "shs-2" || levelId === "level-200" || levelId === "level-300") return 4;
  if (levelId === "shs-3" || /^level-[456]00$/.test(levelId)) return 5;
  return 3;
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

  const baseline = baselineDifficultyForLevel(config.levelId);
  if (answered < 3) return baseline;
  const accuracy = correct / Math.max(1, answered);
  let target = accuracy < 0.5 ? Math.max(1, baseline - 1) : accuracy < 0.85 ? baseline : Math.min(5, baseline + 1);
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

function diversifyPool(questions: LearnQuestion[], config: SessionConfig, seed: number, requested: number) {
  return composeCandidateWindow(questions, config, seed, requested);
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
  const sourcePriority = new Map<string, number>();
  const sourceOrdinal = new Map<string, number>();
  let nextSourceOrdinal = 0;
  const fresh: LearnQuestion[] = [];
  const recycled: LearnQuestion[] = [];
  const selection = resolveSelectionLabels(config);
  const reviewedQuestions = verifiedStandardQuestionsForAudience(config);
  const specializedQuestions = specializedQuestionsForSelection(config);
  const broadQuestions = broadPracticeQuestionsForSelection(config);
  const intelligentQuestions = buildIntelligentQuestions(config, candidateCount(requested, 4), seed);
  const primaryMathQuestions = buildPrimaryMathQuestions(config, candidateCount(requested, 5), seed);
  const languageQuestions = buildSchoolLanguageQuestions(config, candidateCount(requested, 6), seed);
  const richStimulusQuestions = buildRichStimulusQuestions(config, candidateCount(requested, 5), seed);
  const examBankQuestions = examBankQuestionsForSelection(config);
  const coverageQuestions = buildCoverageQuestions(config, candidateCount(requested, 4), seed);

  function absorb(questions: LearnQuestion[], priority = 2) {
    for (const sourceQuestion of questions) {
      const isLanguageSubject = /french|twi|ghanaian language/i.test(sourceQuestion.subject);
      if (isLanguageSubject && !sourceQuestion.exposureKey.startsWith("language:")) continue;
      if (sourceQuestion.exposureKey.startsWith("language:") && !isNativeLanguageQuestion(sourceQuestion)) continue;

      const question: LearnQuestion = {
        ...sourceQuestion,
        ...(config.subjectId !== "all" && selection.subject ? { subject: selection.subject } : {}),
        ...(config.topicId !== "all" && selection.topic ? { topic: selection.topic } : {}),
      };
      if (unique.has(question.exposureKey)) continue;
      if (question.exposureKey.startsWith("variant:")) {
        const family = `${question.subject}|${question.topic}|${question.skill}`;
        const familyCount = generatedPerSkill.get(family) ?? 0;
        if (familyCount >= 4) continue;
        generatedPerSkill.set(family, familyCount + 1);
      }
      unique.add(question.exposureKey);
      sourcePriority.set(question.exposureKey, priority);
      sourceOrdinal.set(question.exposureKey, nextSourceOrdinal++);
      if (recent.has(question.exposureKey)) recycled.push(question);
      else fresh.push(question);
    }
  }

  const strictSelection = config.subjectId !== "all" || config.topicId !== "all";

  // Released Question Foundry content is the canonical first choice for exact
  // topic practice. Preserve its reviewed pack order before specialized/broad
  // material, then use generated families only to expand depth.
  absorb(examBankQuestions, -1);
  absorb(reviewedQuestions.filter((question) => starterMatches(question, config, false, selection)), 0);
  absorb(specializedQuestions, 1);
  absorb(broadQuestions, 1);
  absorb(primaryMathQuestions, 1);
  absorb(languageQuestions, 1);
  absorb(richStimulusQuestions, 1);
  absorb(intelligentQuestions, 2);
  absorb(buildVariantQuestions(config, candidateCount(requested, 2), seed), 3);
  absorb(coverageQuestions, 4);

  if (!strictSelection && fresh.length < requested) {
    absorb(reviewedQuestions.filter((question) => starterMatches(question, config, true, selection)), 0);
  }


  for (let attempt = 0; fresh.length < requested && attempt < BROADENING_ATTEMPTS; attempt += 1) {
    const nextSeed = derivedSeed(seed, attempt);
    const expandedCount = candidateCount(requested, 3);
    absorb(buildPrimaryMathQuestions(config, expandedCount, nextSeed), 1);
    absorb(buildSchoolLanguageQuestions(config, expandedCount, nextSeed), 1);
    absorb(buildRichStimulusQuestions(config, expandedCount, nextSeed), 1);
    absorb(buildVariantQuestions(config, expandedCount, nextSeed), 3);
    absorb(buildIntelligentQuestions(config, expandedCount, nextSeed), 2);
    absorb(buildCoverageQuestions(config, expandedCount, nextSeed), 4);
  }

  const orderedFresh = config.mode === "topic"
    ? orderPool(fresh, config, seed, selection)
    : diversifyPool(orderPool(fresh, config, seed, selection), config, seed, requested);
  const orderedRecycled = config.mode === "topic"
    ? orderPool(recycled, config, derivedSeed(seed, BROADENING_ATTEMPTS), selection)
    : diversifyPool(
        orderPool(recycled, config, derivedSeed(seed, BROADENING_ATTEMPTS), selection),
        config,
        derivedSeed(seed, BROADENING_ATTEMPTS),
        requested,
      );

  const evidenceFirst = (questions: LearnQuestion[]) => {
    if (config.mode !== "topic") return questions;

    const priorities = Array.from(new Set(
      questions.map((question) => sourcePriority.get(question.exposureKey) ?? 9),
    )).sort((left, right) => left - right);

    return priorities.flatMap((priority) => {
      const bucket = questions.filter(
        (question) => (sourcePriority.get(question.exposureKey) ?? 9) === priority,
      );

      // Cleared exam material and reviewed packs preserve canonical evidence
      // order. Generated/specialized buckets are composed for maximum cognitive
      // and format variety instead of exposing generator order to learners.
      if (priority <= 0) {
        return [...bucket].sort(
          (left, right) =>
            (sourceOrdinal.get(left.exposureKey) ?? Number.MAX_SAFE_INTEGER)
            - (sourceOrdinal.get(right.exposureKey) ?? Number.MAX_SAFE_INTEGER),
        );
      }

      return composeCandidateWindow(bucket, config, seed + priority * 97, requested);
    });
  };

  return [...evidenceFirst(orderedFresh), ...evidenceFirst(orderedRecycled)].slice(0, requested);
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
    intelligence: sessionIntelligenceDiagnostics(questions),
  };
}

export { isCorrectAnswer };
export type { LearnQuestion, SessionConfig };
