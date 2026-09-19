import { describe, expect, it } from "vitest";
import { catalogFor } from "./learn-domain";

function schoolLevel(id: string) {
  const ghana = catalogFor("school").programs.find((program) => program.id === "ghana");
  return ghana?.levels.find((level) => level.id === id);
}

describe("SukuuNova curriculum-aware catalogue", () => {
  it("keeps Ghana school phases distinct instead of repeating one subject list", () => {
    expect(schoolLevel("kg-1")?.subjects.map((subject) => subject.label)).toEqual([
      "Numeracy",
      "Language & Literacy",
      "Creative Arts",
      "Our World & Our People",
    ]);
    expect(schoolLevel("basic-1")?.subjects.some((subject) => subject.label === "Computing")).toBe(false);
    expect(schoolLevel("basic-4")?.subjects.some((subject) => subject.label === "Computing")).toBe(true);
    expect(schoolLevel("basic-4")?.subjects.some((subject) => subject.label === "French")).toBe(true);
    expect(schoolLevel("jhs-3")?.subjects).toHaveLength(12);
    expect(schoolLevel("shs-1")?.subjects.some((subject) => subject.label === "Engineering")).toBe(true);
    expect(schoolLevel("shs-1")?.subjects.some((subject) => subject.label === "Robotics")).toBe(true);
  });

  it("keeps honest practice-ready paths only where current content supports them", () => {
    for (const id of [
      "kg-1", "kg-2",
      "basic-1", "basic-2", "basic-3", "basic-4",
      "jhs-1",
    ]) {
      const level = schoolLevel(id);
      expect(level, id).toBeDefined();
      expect(
        level?.subjects.some(
          (subject) =>
            subject.availability !== "expanding" &&
            subject.topics.some((topic) => topic.availability !== "expanding"),
        ),
        id,
      ).toBe(true);
    }

    for (const id of ["basic-5", "basic-6", "jhs-2", "jhs-3", "shs-1", "shs-2", "shs-3"]) {
      const level = schoolLevel(id);
      expect(level, id).toBeDefined();
      expect(level?.subjects.every((subject) => subject.availability === "expanding"), id).toBe(true);
    }
  });

  it("maps all eleven current BECE subjects while distinguishing expanding coverage", () => {
    const bece = catalogFor("exam").programs.find((program) => program.id === "bece");
    const subjects = bece?.levels[0].subjects ?? [];
    expect(subjects.map((subject) => subject.label).sort()).toEqual([
      "Arabic",
      "Career Technology",
      "Computing",
      "Creative Art & Design",
      "English Language",
      "French",
      "Ghanaian Language",
      "Mathematics",
      "Religious and Moral Education",
      "Science",
      "Social Studies",
    ].sort());
    expect(subjects.filter((subject) => subject.availability !== "expanding")).toHaveLength(0);
  });

  it("models WASSCE core separately from its growing elective catalogue", () => {
    const wassce = catalogFor("exam").programs.find((program) => program.id === "wassce");
    const subjects = wassce?.levels[0].subjects ?? [];
    expect(subjects.slice(0, 4).map((subject) => subject.label)).toEqual([
      "Mathematics (Core)",
      "English Language",
      "Integrated Science",
      "Social Studies",
    ]);
    expect(subjects.some((subject) => subject.label === "Financial Accounting")).toBe(true);
    expect(subjects.some((subject) => subject.label === "Engineering")).toBe(true);
  });
});
