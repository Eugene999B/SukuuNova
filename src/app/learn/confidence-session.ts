import { dailySeed } from "./daily-challenge";
import { buildLearningSession, type LearnQuestion } from "./learning-engine";

export const CONFIDENCE_CHECK_SIZE = 8;

export function buildConfidenceSession(dateKey: string): LearnQuestion[] {
  return buildLearningSession({
    lane: "school",
    programId: "ghana",
    levelId: "jhs-3",
    subjectId: "all",
    topicId: "all",
    mode: "adaptive",
    count: CONFIDENCE_CHECK_SIZE,
    seen: [],
    seed: dailySeed(`confidence:${dateKey}`),
  });
}
