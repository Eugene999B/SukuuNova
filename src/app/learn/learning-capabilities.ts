import { resolveCatalogSelection, reviewedTopicLabelsForSelection, type SessionConfig } from "./learn-domain";
import { richInteractionEntriesForAudience } from "./rich-starter-pack";
import { variantCapacityForSelection } from "./variant-engine";
import { specializedQuestionsForSelection } from "./specialized-content";
import { broadPracticeQuestionsForSelection } from "./broad-practice";
import { intelligentCapacityForSelection } from "./intelligent-foundry";
import { coverageCapacityForSelection } from "./coverage-foundry";
import { primaryMathCapacityForSelection } from "./primary-math-foundry";
import { languageCapacityForSelection } from "./school-language-foundry";
import { richStimulusCapacityForSelection } from "./rich-stimulus-foundry";
import { examBankQuestionsForSelection } from "./exam-question-bank";
import { nursingCapacityForSelection } from "./nursing-foundry";
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
  languageCapacity: number;
  richStimulusCapacity: number;
  authenticExamQuestions: number;
  nursingCapacity: number;
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
  const { subject, topic } = resolveCatalogSelection(config);
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

  const reviewedTopicLabels = reviewedTopicLabelsForSelection(config);
  const standardEntries = verifiedStandardEntriesForAudience(config).filter((entry) => {
    const topicMatches = matchesLabel(entry.question.topic, config.topicId, selection.topicLabel)
      || reviewedTopicLabels.some((label) => normalized(entry.question.topic) === normalized(label));
    return matchesLabel(entry.question.subject, config.subjectId, selection.subjectLabel) && topicMatches;
  });

  const richEntries = richInteractionEntriesForAudience(config).filter((entry) => {
    return matchesLabel(entry.question.subject, config.subjectId, selection.subjectLabel)
      && matchesLabel(entry.question.topic, config.topicId, selection.topicLabel);
  });

  const variantCapacity = variantCapacityForSelection(config);
  const intelligentCapacity = intelligentCapacityForSelection(config);
  const coverageCapacity = coverageCapacityForSelection(config);
  const primaryMathCapacity = primaryMathCapacityForSelection(config);
  const languageCapacity = languageCapacityForSelection(config);
  const richStimulusCapacity = richStimulusCapacityForSelection(config);
  const authenticExamQuestions = examBankQuestionsForSelection(config).length;
  const nursingCapacity = nursingCapacityForSelection(config);
  const specializedQuestions = specializedQuestionsForSelection(config);
  const broadQuestions = broadPracticeQuestionsForSelection(config);
  const reviewedStandardQuestions = standardEntries.length + specializedQuestions.length + broadQuestions.length;
  const richInteractions = richEntries.length;
  const ready = reviewedStandardQuestions > 0 || variantCapacity > 0 || intelligentCapacity > 0 || coverageCapacity > 0 || primaryMathCapacity > 0 || languageCapacity > 0 || richStimulusCapacity > 0 || authenticExamQuestions > 0 || nursingCapacity > 0;
  const evidenceDepth = reviewedStandardQuestions + richInteractions;

  let stage: LearningCapabilityStage = "mapped";
  if (variantCapacity + intelligentCapacity + coverageCapacity + primaryMathCapacity + languageCapacity + richStimulusCapacity + nursingCapacity >= 1_000_000) stage = "massive";
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
    languageCapacity,
    richStimulusCapacity,
    authenticExamQuestions,
    nursingCapacity,
    estimatedStandardSupply: variantCapacity + intelligentCapacity + coverageCapacity + primaryMathCapacity + languageCapacity + richStimulusCapacity + nursingCapacity + reviewedStandardQuestions + authenticExamQuestions,
  };
}

export function selectionHasPractice(config: SessionConfig) {
  return learningCapabilityForSelection(config).ready;
}
