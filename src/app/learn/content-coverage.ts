import { STANDARD_FOUNDRY_PACK } from "./verified-content";

export type StarterTopicCoverage = {
  subjectId: string;
  subject: string;
  topicId: string;
  topic: string;
  questionCount: number;
  covered: boolean;
};

/**
 * The starter mastery map is a stable 20-topic diagnostic taxonomy.
 * It must not grow every time the full class curriculum becomes richer;
 * otherwise historical learner mastery/readiness would change underneath them.
 */
const STARTER_TAXONOMY = [
  ["mathematics", "Mathematics", [
    ["number", "Number & operations"],
    ["algebra", "Algebra"],
    ["geometry", "Geometry"],
    ["statistics", "Statistics & probability"],
  ]],
  ["english", "English Language", [
    ["grammar", "Grammar & concord"],
    ["vocabulary", "Vocabulary"],
    ["reading", "Reading comprehension"],
    ["writing", "Writing"],
  ]],
  ["science", "Science", [
    ["living", "Living things"],
    ["matter", "Matter & materials"],
    ["energy", "Force & energy"],
    ["environment", "Environment"],
  ]],
  ["social", "Social Studies", [
    ["governance", "Governance"],
    ["citizenship", "Citizenship"],
    ["environment", "People & environment"],
    ["development", "National development"],
  ]],
  ["computing", "Computing", [
    ["digital-safety", "Digital safety"],
    ["systems", "Computer systems"],
    ["internet", "Internet & networks"],
    ["coding", "Computational thinking"],
  ]],
] as const;

export const SCHOOL_STARTER_TOPIC_COVERAGE: StarterTopicCoverage[] = STARTER_TAXONOMY.flatMap(
  ([subjectId, subject, topics]) => topics.map(([topicId, topic]) => {
    const questionCount = STANDARD_FOUNDRY_PACK.filter(
      (question) => question.subject === subject && question.topic === topic,
    ).length;
    return {
      subjectId,
      subject,
      topicId,
      topic,
      questionCount,
      covered: questionCount > 0,
    };
  }),
);

export const SCHOOL_STARTER_COVERAGE_SUMMARY = {
  totalTopics: SCHOOL_STARTER_TOPIC_COVERAGE.length,
  coveredTopics: SCHOOL_STARTER_TOPIC_COVERAGE.filter((entry) => entry.covered).length,
  missingTopics: SCHOOL_STARTER_TOPIC_COVERAGE.filter((entry) => !entry.covered),
  totalQuestions: STANDARD_FOUNDRY_PACK.length,
};
