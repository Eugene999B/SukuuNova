import { auditQuestionPack, releaseQuestion } from "./question-foundry";
import type { LearnQuestion, SessionConfig } from "./learn-domain";
import { DEPTH_FOUNDRY_PACK } from "./verified-depth-pack";
import { EXPANSION_FOUNDRY_PACK } from "./verified-expansion-pack";
import { STARTER_FOUNDRY_PACK } from "./verified-starter-pack";

export type LearningAudience = {
  schoolLevels: readonly string[];
  examPrograms: readonly string[];
};

export type ReleasedStandardQuestionEntry = {
  question: LearnQuestion;
  foundryLevel: string;
  audience: LearningAudience;
};

const EMPTY_AUDIENCE: LearningAudience = { schoolLevels: [], examPrograms: [] };

export function learningAudienceForFoundryLevel(level: string): LearningAudience {
  const normalized = level.trim().toLowerCase();

  if (normalized.includes("jhs")) {
    return { schoolLevels: ["jhs-1"], examPrograms: [] };
  }
  if (normalized.includes("shs") || normalized.includes("secondary")) {
    return { schoolLevels: ["shs-1", "shs-2", "shs-3"], examPrograms: ["wassce"] };
  }
  if (normalized.includes("upper primary")) {
    return { schoolLevels: ["basic-4", "basic-5", "basic-6"], examPrograms: [] };
  }
  if (normalized.includes("lower primary")) {
    return { schoolLevels: ["basic-1", "basic-2", "basic-3"], examPrograms: [] };
  }
  if (normalized.includes("primary")) {
    return { schoolLevels: ["basic-1", "basic-2", "basic-3", "basic-4", "basic-5", "basic-6"], examPrograms: [] };
  }
  if (normalized.includes("kg") || normalized.includes("kindergarten")) {
    return { schoolLevels: ["kg-1", "kg-2"], examPrograms: [] };
  }

  return EMPTY_AUDIENCE;
}

export function audienceMatchesSession(audience: LearningAudience, config: SessionConfig) {
  if (config.lane === "school") return audience.schoolLevels.includes(config.levelId);
  if (config.lane === "exam") return audience.examPrograms.includes(config.programId);
  return false;
}

export const STANDARD_FOUNDRY_PACK = [...STARTER_FOUNDRY_PACK, ...EXPANSION_FOUNDRY_PACK, ...DEPTH_FOUNDRY_PACK];

export const STANDARD_CONTENT_AUDIT = auditQuestionPack(STANDARD_FOUNDRY_PACK);

export const VERIFIED_STANDARD_ENTRIES: ReleasedStandardQuestionEntry[] = STANDARD_FOUNDRY_PACK.flatMap((foundryQuestion) => {
  const question = releaseQuestion(foundryQuestion);
  if (!question) return [];
  return [{
    question,
    foundryLevel: foundryQuestion.dna.level,
    audience: learningAudienceForFoundryLevel(foundryQuestion.dna.level),
  }];
});

export const VERIFIED_STANDARD_QUESTIONS: LearnQuestion[] = VERIFIED_STANDARD_ENTRIES.map((entry) => entry.question);

export function verifiedStandardEntriesForAudience(config: SessionConfig) {
  return VERIFIED_STANDARD_ENTRIES.filter((entry) => audienceMatchesSession(entry.audience, config));
}

export function verifiedStandardQuestionsForAudience(config: SessionConfig) {
  return verifiedStandardEntriesForAudience(config).map((entry) => entry.question);
}

export const STANDARD_CONTENT_COVERAGE = Array.from(
  STANDARD_FOUNDRY_PACK.reduce((subjects, question) => {
    const entry = subjects.get(question.subject) ?? { subject: question.subject, count: 0, topics: new Set<string>() };
    entry.count += 1;
    entry.topics.add(question.topic);
    subjects.set(question.subject, entry);
    return subjects;
  }, new Map<string, { subject: string; count: number; topics: Set<string> }>()),
)
  .map(([, entry]) => ({
    subject: entry.subject,
    count: entry.count,
    topics: Array.from(entry.topics).sort(),
  }))
  .sort((left, right) => left.subject.localeCompare(right.subject));
