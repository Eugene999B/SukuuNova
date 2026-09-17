import { auditQuestionPack, releaseQuestion } from "./question-foundry";
import type { LearnQuestion } from "./learn-domain";
import { EXPANSION_FOUNDRY_PACK } from "./verified-expansion-pack";
import { STARTER_FOUNDRY_PACK } from "./verified-starter-pack";

export const STANDARD_FOUNDRY_PACK = [...STARTER_FOUNDRY_PACK, ...EXPANSION_FOUNDRY_PACK];

export const STANDARD_CONTENT_AUDIT = auditQuestionPack(STANDARD_FOUNDRY_PACK);

export const VERIFIED_STANDARD_QUESTIONS: LearnQuestion[] = STANDARD_FOUNDRY_PACK
  .map(releaseQuestion)
  .filter((question): question is LearnQuestion => question !== null);

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
