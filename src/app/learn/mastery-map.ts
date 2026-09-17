import { SCHOOL_STARTER_TOPIC_COVERAGE } from "./content-coverage";
import { masteryBand, percentage, type LearnerProgress, type MasteryBand } from "./learner-progress";

export type MasteryMapStatus = "unseen" | MasteryBand;

export type MasteryMapTopic = {
  key: string;
  subjectId: string;
  subject: string;
  topicId: string;
  topic: string;
  reviewedQuestions: number;
  answered: number;
  correct: number;
  accuracy: number;
  status: MasteryMapStatus;
};

export type MasteryMapSubject = {
  id: string;
  label: string;
  topics: MasteryMapTopic[];
};

export type MasteryMap = {
  subjects: MasteryMapSubject[];
  topics: MasteryMapTopic[];
  totalTopics: number;
  practicedTopics: number;
  unseenTopics: number;
  secureTopics: number;
  repairTopics: number;
  developingTopics: number;
  evidenceTopics: number;
  reviewedQuestions: number;
  practicedCoveragePercent: number;
};

export function buildMasteryMap(progress: LearnerProgress): MasteryMap {
  const topics: MasteryMapTopic[] = SCHOOL_STARTER_TOPIC_COVERAGE.map((entry) => {
    const key = `${entry.subject} · ${entry.topic}`;
    const record = progress.mastery[key];
    const answered = record?.answered ?? 0;
    const correct = record?.correct ?? 0;
    const accuracy = percentage(correct, answered);
    const status: MasteryMapStatus = answered ? masteryBand(answered, accuracy) : "unseen";
    return {
      key,
      subjectId: entry.subjectId,
      subject: entry.subject,
      topicId: entry.topicId,
      topic: entry.topic,
      reviewedQuestions: entry.questionCount,
      answered,
      correct,
      accuracy,
      status,
    };
  });

  const subjects: MasteryMapSubject[] = [];
  for (const topic of topics) {
    let subject = subjects.find((item) => item.id === topic.subjectId);
    if (!subject) {
      subject = { id: topic.subjectId, label: topic.subject, topics: [] };
      subjects.push(subject);
    }
    subject.topics.push(topic);
  }

  const practicedTopics = topics.filter((topic) => topic.status !== "unseen").length;
  return {
    subjects,
    topics,
    totalTopics: topics.length,
    practicedTopics,
    unseenTopics: topics.filter((topic) => topic.status === "unseen").length,
    secureTopics: topics.filter((topic) => topic.status === "secure").length,
    repairTopics: topics.filter((topic) => topic.status === "repair").length,
    developingTopics: topics.filter((topic) => topic.status === "developing").length,
    evidenceTopics: topics.filter((topic) => topic.status === "evidence").length,
    reviewedQuestions: topics.reduce((total, topic) => total + topic.reviewedQuestions, 0),
    practicedCoveragePercent: topics.length ? Math.round((practicedTopics / topics.length) * 100) : 0,
  };
}
