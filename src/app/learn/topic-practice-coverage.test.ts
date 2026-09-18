import { describe, expect, it } from "vitest";
import { catalogFor } from "./learn-domain";
import { buildLearningSession } from "./learning-engine";

describe("SukuuNova reviewed topic-practice coverage", () => {
  it("can build two-question reviewed topic sessions across every starter topic without broadening", () => {
    const ghana = catalogFor("school").programs.find((program) => program.id === "ghana");
    const level = ghana?.levels.find((item) => item.id === "jhs-3");
    expect(level).toBeDefined();

    for (const subject of (level?.subjects ?? []).filter((item) => item.availability !== "expanding")) {
      for (const topic of subject.topics.filter((item) => item.availability !== "expanding")) {
        const session = buildLearningSession({
          lane: "school",
          programId: "ghana",
          levelId: "jhs-3",
          subjectId: subject.id,
          topicId: topic.id,
          mode: "topic",
          count: 2,
          seen: [],
          seed: 20260917,
        });

        expect(session, `${subject.label} · ${topic.label}`).toHaveLength(2);
        expect(session.every((question) => question.subject === subject.label && question.topic === topic.label), `${subject.label} · ${topic.label}`).toBe(true);
      }
    }
  });
});
