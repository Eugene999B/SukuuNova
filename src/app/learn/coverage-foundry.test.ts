import { describe, expect, it } from "vitest";
import { buildCoverageQuestions, coverageCapacityForSelection, coverageCapacityPerTarget, MINIMUM_TOPIC_GENERATED_CAPACITY } from "./coverage-foundry";
import { isCorrectAnswer, LEARNING_CATALOGS, type SessionConfig } from "./learn-domain";
import { learningCapabilityForSelection } from "./learning-capabilities";

function configFor(
  lane: SessionConfig["lane"],
  programId: string,
  levelId: string,
  subjectId: string,
  topicId: string,
  seed = 20260921,
): SessionConfig {
  return {
    lane,
    programId,
    levelId,
    subjectId,
    topicId,
    mode: "topic",
    count: 5,
    seed,
  };
}

describe("foundation question variety", () => {
  it("counts meaningful task families rather than names and decorative contexts", () => {
    expect(MINIMUM_TOPIC_GENERATED_CAPACITY).toBeGreaterThan(0);

    let publishedTopics = 0;
    for (const catalog of LEARNING_CATALOGS) {
      for (const program of catalog.programs) {
        expect(program.description.toLowerCase()).not.toMatch(/coming soon|coverage expanding|held back|not exposed as ready/);

        for (const level of program.levels) {
          for (const subject of level.subjects) {
            expect(subject.label.toLowerCase()).not.toMatch(/coming soon|coverage expanding/);
            expect(subject.availability).not.toBe("expanding");
            expect(subject.topics.length, `${catalog.id}/${program.id}/${level.id}/${subject.id}`).toBeGreaterThan(0);

            for (const topic of subject.topics) {
              publishedTopics += 1;
              const location = `${catalog.id}/${program.id}/${level.id}/${subject.id}/${topic.id}`;
              const config = configFor(catalog.id, program.id, level.id, subject.id, topic.id, publishedTopics);
              const capacity = coverageCapacityForSelection(config);
              const capability = learningCapabilityForSelection(config);

              expect(topic.label.toLowerCase(), location).not.toMatch(/coming soon|coverage expanding/);
              expect(topic.availability, location).not.toBe("expanding");
              expect(capacity, location).toBeGreaterThan(0);
              expect(capability.ready, location).toBe(true);
              expect(capacity, location).toBeLessThan(1000);
            }
          }
        }
      }
    }

    expect(publishedTopics).toBeGreaterThan(500);
  });

  it("can actually build valid questions for every published exact topic", () => {
    let seed = 7000;
    for (const catalog of LEARNING_CATALOGS) {
      for (const program of catalog.programs) {
        for (const level of program.levels) {
          for (const subject of level.subjects) {
            for (const topic of subject.topics) {
              const location = `${catalog.id}/${program.id}/${level.id}/${subject.id}/${topic.id}`;
              const config = configFor(catalog.id, program.id, level.id, subject.id, topic.id, seed++);
              const questions = buildCoverageQuestions(config, 3, config.seed);

              expect(questions, location).toHaveLength(3);
              expect(new Set(questions.map((question) => question.exposureKey)).size, location).toBe(3);
              expect(questions.every((question) => question.subject === (subject.contentLabel ?? subject.label)), location).toBe(true);
              expect(questions.every((question) => question.topic === topic.label), location).toBe(true);
              expect(questions.every((question) => isCorrectAnswer(question, question.answer)), location).toBe(true);
            }
          }
        }
      }
    }
  });

  it("spreads mixed-topic practice across the selected subject", () => {
    const config = configFor("university", "computer-science", "level-200", "operating-systems", "all", 42);
    const targets = coverageCapacityPerTarget(config);
    const questions = buildCoverageQuestions(config, 40, 42);

    expect(targets.length).toBeGreaterThanOrEqual(5);
    expect(targets.every((target) => target.capacity > 0 && target.capacity < 1000)).toBe(true);
    expect(new Set(questions.map((question) => question.topic)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(questions.map((question) => question.exposureKey)).size).toBe(questions.length);
  });
});

it("keeps foundation identities stable across cosmetic variations and aligns cognitive labels",()=>{
 const config=configFor("university","computer-science","level-200","operating-systems","all",42);
 const questions=Array.from({length:8},(_,seed)=>buildCoverageQuestions(config,40,seed)).flat();
 const definitions=questions.filter(q=>q.prompt.startsWith("Which term best matches"));
 expect(definitions.length).toBeGreaterThan(0);
 expect(definitions.every(q=>q.challenge==="Recall")).toBe(true);
 const byPrompt=new Map<string,string>();
 for(const q of definitions){const prior=byPrompt.get(q.prompt);if(prior)expect(q.exposureKey).toBe(prior);byPrompt.set(q.prompt,q.exposureKey);}
});
