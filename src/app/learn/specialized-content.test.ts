import { describe, expect, it } from "vitest";
import { catalogFor } from "./learn-domain";
import { learningCapabilityForSelection } from "./learning-capabilities";
import { buildLearningSession } from "./learning-engine";

function config(
  lane: "school" | "university" | "skills",
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

describe("broad usable learning practice", () => {
  it("uses clear university levels and gives every popular programme a starter practice path", () => {
    const university = catalogFor("university");
    expect(university.programs.length).toBeGreaterThanOrEqual(25);
    for (const program of university.programs) {
      expect(program.levels[0]?.id).toBe("level-100");
      expect(program.levels[0]?.label).toBe(program.id === "nursing" ? "Year 1 · BSc" : program.id === "nursing-diploma" ? "Year 1 · Diploma" : "Level 100");
      const firstLevel = program.levels[0];
      const readySubjects = firstLevel.subjects.filter((subject) =>
        learningCapabilityForSelection(config("university", program.id, firstLevel.id, subject.id, "all")).ready,
      );
      expect(readySubjects.length, program.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("publishes starter practice across popular SHS pathways", () => {
    const school = catalogFor("school");
    for (const program of school.programs.filter((item) => item.id.startsWith("shs-"))) {
      const level = program.levels[0];
      const readySubjects = level.subjects.filter((subject) =>
        learningCapabilityForSelection(config("school", program.id, level.id, subject.id, "all")).ready,
      );
      expect(readySubjects.length, program.id).toBeGreaterThanOrEqual(4);
      const sample = readySubjects[0];
      const session = buildLearningSession(config("school", program.id, level.id, sample.id, "all"));
      expect(session.length, `${program.id}/${sample.id}`).toBeGreaterThanOrEqual(3);
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
          }
        }
      }
    }
  });

  it("keeps mixed Computer Science sessions inside Programming", () => {
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
