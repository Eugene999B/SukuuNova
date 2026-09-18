import { describe, expect, it } from "vitest";
import { normalizeLearnerProgress } from "./learner-progress";
import { buildMasteryMap } from "./mastery-map";

describe("SukuuNova starter mastery map", () => {
  it("shows all twenty starter topics even before practice", () => {
    const map = buildMasteryMap(normalizeLearnerProgress(null));
    expect(map.totalTopics).toBe(20);
    expect(map.unseenTopics).toBe(20);
    expect(map.practicedTopics).toBe(0);
    expect(map.subjects).toHaveLength(5);
  });

  it("keeps unseen separate from repair", () => {
    const progress = normalizeLearnerProgress({
      mastery: { "Mathematics · Geometry": { answered: 5, correct: 1 } },
    });
    const map = buildMasteryMap(progress);
    const geometry = map.topics.find((topic) => topic.key === "Mathematics · Geometry");

    expect(geometry?.status).toBe("repair");
    expect(map.repairTopics).toBe(1);
    expect(map.unseenTopics).toBe(19);
  });

  it("requires evidence before secure mastery", () => {
    const progress = normalizeLearnerProgress({
      mastery: {
        "Science · Living things": { answered: 2, correct: 2 },
        "Science · Matter & materials": { answered: 5, correct: 4 },
      },
    });
    const map = buildMasteryMap(progress);
    expect(map.topics.find((topic) => topic.key === "Science · Living things")?.status).toBe("evidence");
    expect(map.topics.find((topic) => topic.key === "Science · Matter & materials")?.status).toBe("secure");
  });

  it("exposes the reviewed question depth for every starter topic", () => {
    const map = buildMasteryMap(normalizeLearnerProgress(null));
    expect(map.topics.every((topic) => topic.reviewedQuestions >= 2)).toBe(true);
    expect(map.reviewedQuestions).toBe(45);
  });

  it("calculates practiced coverage from topics with evidence only", () => {
    const progress = normalizeLearnerProgress({
      mastery: {
        "Mathematics · Algebra": { answered: 3, correct: 2 },
        "English Language · Reading comprehension": { answered: 1, correct: 1 },
      },
    });
    const map = buildMasteryMap(progress);
    expect(map.practicedTopics).toBe(2);
    expect(map.practicedCoveragePercent).toBe(10);
  });
});
