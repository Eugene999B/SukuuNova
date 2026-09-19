import { describe, expect, it } from "vitest";
import { catalogFor } from "./learn-domain";
import { learningCapabilityForSelection } from "./learning-capabilities";
import { buildLearningSession } from "./learning-engine";

function config(
  lane: "university" | "skills",
  programId: string,
  levelId: string,
  subjectId: string,
  topicId: string,
) {
  return {
    lane,
    programId,
    levelId,
    subjectId,
    topicId,
    mode: "topic" as const,
    count: 10,
    seed: 42,
  };
}

describe("usable university and skills practice", () => {
  it("uses a clear Level 100 university label instead of Foundation", () => {
    const university = catalogFor("university");
    for (const program of university.programs) {
      expect(program.levels[0]?.id).toBe("level-100");
      expect(program.levels[0]?.label).toBe("Level 100");
    }
  });

  it("publishes practice for every currently mapped university topic", () => {
    const university = catalogFor("university");
    for (const program of university.programs) {
      for (const level of program.levels) {
        for (const subject of level.subjects) {
          for (const topic of subject.topics) {
            const capability = learningCapabilityForSelection(
              config("university", program.id, level.id, subject.id, topic.id),
            );
            expect(capability.ready, `${program.id}/${subject.id}/${topic.id}`).toBe(true);
            const session = buildLearningSession(
              config("university", program.id, level.id, subject.id, topic.id),
            );
            expect(session.length, `${program.id}/${subject.id}/${topic.id}`).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });

  it("publishes practice for every currently mapped skills topic", () => {
    const skills = catalogFor("skills");
    for (const program of skills.programs) {
      for (const level of program.levels) {
        for (const subject of level.subjects) {
          for (const topic of subject.topics) {
            const capability = learningCapabilityForSelection(
              config("skills", program.id, level.id, subject.id, topic.id),
            );
            expect(capability.ready, `${program.id}/${subject.id}/${topic.id}`).toBe(true);
            const session = buildLearningSession(
              config("skills", program.id, level.id, subject.id, topic.id),
            );
            expect(session.length, `${program.id}/${subject.id}/${topic.id}`).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });

  it("builds mixed university sessions from the selected subject only", () => {
    const session = buildLearningSession({
      ...config("university", "computer-science", "level-100", "programming", "all"),
      mode: "random",
      count: 10,
    });
    expect(session.length).toBeGreaterThanOrEqual(9);
    expect(new Set(session.map((question) => question.subject))).toEqual(new Set(["Programming"]));
    expect(new Set(session.map((question) => question.topic)).size).toBeGreaterThanOrEqual(3);
  });
});
