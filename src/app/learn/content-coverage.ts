import { catalogFor } from "./learn-domain";
import { STANDARD_FOUNDRY_PACK } from "./verified-content";

export type StarterTopicCoverage = {
  subjectId: string;
  subject: string;
  topicId: string;
  topic: string;
  questionCount: number;
  covered: boolean;
};

const ghanaSchool = catalogFor("school").programs.find((program) => program.id === "ghana");
const representativeLevel = ghanaSchool?.levels.find((level) => level.id === "jhs-3") ?? ghanaSchool?.levels[0];

export const SCHOOL_STARTER_TOPIC_COVERAGE: StarterTopicCoverage[] = (representativeLevel?.subjects ?? [])
  .filter((subject) => subject.availability !== "expanding")
  .flatMap((subject) => subject.topics.filter((topic) => topic.availability !== "expanding").map((topic) => {
    const questionCount = STANDARD_FOUNDRY_PACK.filter(
      (question) => question.subject === subject.label && question.topic === topic.label,
    ).length;
    return {
      subjectId: subject.id,
      subject: subject.label,
      topicId: topic.id,
      topic: topic.label,
      questionCount,
      covered: questionCount > 0,
    };
  })),
);

export const SCHOOL_STARTER_COVERAGE_SUMMARY = {
  totalTopics: SCHOOL_STARTER_TOPIC_COVERAGE.length,
  coveredTopics: SCHOOL_STARTER_TOPIC_COVERAGE.filter((entry) => entry.covered).length,
  missingTopics: SCHOOL_STARTER_TOPIC_COVERAGE.filter((entry) => !entry.covered),
  totalQuestions: STANDARD_FOUNDRY_PACK.length,
};
