import { catalogFor, type SessionConfig } from "./learn-domain";
import { richInteractionEntriesForAudience } from "./rich-starter-pack";
import { variantCapacityForSelection } from "./variant-engine";
import { specializedQuestionsForSelection } from "./specialized-content";
import { broadPracticeQuestionsForSelection } from "./broad-practice";
import { intelligentCapacityForSelection } from "./intelligent-foundry";
import { coverageCapacityForSelection } from "./coverage-foundry";
import { primaryMathCapacityForSelection } from "./primary-math-foundry";
import { verifiedStandardEntriesForAudience } from "./verified-content";

export type LearningCapabilityStage = "mapped" | "starter" | "deep" | "massive";

export type LearningCapability = {
  ready: boolean;
  stage: LearningCapabilityStage;
  reviewedStandardQuestions: number;
  richInteractions: number;
  variantCapacity: number;
  intelligentCapacity: number;
  coverageCapacity: number;
  primaryMathCapacity: number;
  estimatedStandardSupply: number;
};

function normalized(value: string) {
  return value
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function resolveSelection(config: SessionConfig) {
  const catalog = catalogFor(config.lane);
  const program = catalog.programs.find((item) => item.id === config.programId);
  const level = program?.levels.find((item) => item.id === config.levelId);
  const subject = level?.subjects.find((item) => item.id === config.subjectId);
  const topic = subject?.topics.find((item) => item.id === config.topicId);
  return {
    subjectLabel: subject?.contentLabel ?? subject?.label,
    topicLabel: topic?.label,
  };
}

function matchesLabel(value: string, selectedId: string, resolvedLabel?: string) {
  if (selectedId === "all") return true;
  if (resolvedLabel) return normalized(value) === normalized(resolvedLabel);
  return normalized(value) === normalized(selectedId.replaceAll("-", " "));
}

export function learningCapabilityForSelection(config: SessionConfig): LearningCapability {
  const selection = resolveSelection(config);

  const standardEntries = verifiedStandardEntriesForAudience(config).filter((entry) => {
    return matchesLabel(entry.question.subject, config.subjectId, selection.subjectLabel)
      && matchesLabel(entry.question.topic, config.topicId, selection.topicLabel);
  });

  const richEntries = richInteractionEntriesForAudience(config).filter((entry) => {
    return matchesLabel(entry.question.subject, config.subjectId, selection.subjectLabel)
      && matchesLabel(entry.question.topic, config.topicId, selection.topicLabel);
  });

  const variantCapacity = variantCapacityForSelection(config);
  const intelligentCapacity = intelligentCapacityForSelection(config);
  const coverageCapacity = coverageCapacityForSelection(config);
  const primaryMathCapacity = primaryMathCapacityForSelection(config);
  const specializedQuestions = specializedQuestionsForSelection(config);
  const broadQuestions = broadPracticeQuestionsForSelection(config);
  const reviewedStandardQuestions = standardEntries.length + specializedQuestions.length + broadQuestions.length;
  const richInteractions = richEntries.length;
  const ready = reviewedStandardQuestions > 0 || variantCapacity > 0 || intelligentCapacity > 0 || coverageCapacity > 0 || primaryMathCapacity > 0;
  const evidenceDepth = reviewedStandardQuestions + richInteractions;

  let stage: LearningCapabilityStage = "mapped";
  if (variantCapacity + intelligentCapacity + coverageCapacity + primaryMathCapacity >= 1_000_000) stage = "massive";
  else if (ready && (variantCapacity >= 10_000 || evidenceDepth >= 10)) stage = "deep";
  else if (ready) stage = "starter";

  return {
    ready,
    stage,
    reviewedStandardQuestions,
    richInteractions,
    variantCapacity,
    intelligentCapacity,
    coverageCapacity,
    primaryMathCapacity,
    estimatedStandardSupply: variantCapacity + intelligentCapacity + coverageCapacity + primaryMathCapacity + reviewedStandardQuestions,
  };
}

export function selectionHasPractice(config: SessionConfig) {
  return learningCapabilityForSelection(config).ready;
}
