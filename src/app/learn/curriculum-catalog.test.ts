import { describe, expect, it } from "vitest";
import { catalogFor } from "./learn-domain";

function basicSchoolLevel(id: string) {
  const basic = catalogFor("school").programs.find((program) => program.id === "ghana");
  return basic?.levels.find((level) => level.id === id);
}

describe("SukuuNova curriculum-aware catalogue", () => {
  it("keeps Ghana basic-school phases distinct", () => {
    expect(basicSchoolLevel("kg-1")?.subjects.map((subject) => subject.label)).toEqual([
      "Numeracy",
      "Language & Literacy",
      "Creative Arts",
      "Our World & Our People",
    ]);
    expect(basicSchoolLevel("basic-1")?.subjects.some((subject) => subject.label === "Computing")).toBe(false);
    expect(basicSchoolLevel("basic-4")?.subjects.some((subject) => subject.label === "Computing")).toBe(true);
    expect(basicSchoolLevel("basic-4")?.subjects.some((subject) => subject.label === "French")).toBe(true);
    expect(basicSchoolLevel("jhs-3")?.subjects).toHaveLength(12);
    expect(basicSchoolLevel("shs-1")).toBeUndefined();
  });

  it("separates SHS into broad study pathways instead of one generic subject list", () => {
    const school = catalogFor("school");
    const shsPrograms = school.programs.filter((program) => program.id.startsWith("shs-"));
    expect(shsPrograms.length).toBeGreaterThanOrEqual(9);
    expect(shsPrograms.map((program) => program.label)).toEqual(expect.arrayContaining([
      "General Science",
      "General Arts",
      "Business",
      "Visual Arts",
      "Home Economics",
      "Agriculture",
      "Technical",
      "STEM / Engineering",
    ]));
    const science = shsPrograms.find((program) => program.id === "shs-general-science");
    expect(science?.levels.map((level) => level.label)).toEqual(["SHS 1", "SHS 2", "SHS 3"]);
    expect(science?.levels[0].subjects.map((subject) => subject.label)).toEqual(expect.arrayContaining([
      "Core Mathematics",
      "Integrated Science",
      "Elective Mathematics",
      "Physics",
      "Chemistry",
      "Biology",
    ]));
  });

  it("publishes every basic-school level without partial or expanding subjects", () => {
    for (const id of ["kg-1", "kg-2", "basic-1", "basic-2", "basic-3", "basic-4", "basic-5", "basic-6", "jhs-1", "jhs-2", "jhs-3"]) {
      const level = basicSchoolLevel(id);
      expect(level, id).toBeDefined();
      expect(level?.subjects.length, id).toBeGreaterThan(0);
      expect(level?.subjects.every((subject) => subject.availability !== "expanding"), id).toBe(true);
      expect(level?.subjects.every((subject) => subject.topics.length > 0), id).toBe(true);
      expect(level?.subjects.every((subject) => subject.topics.every((topic) => topic.availability !== "expanding")), id).toBe(true);
    }
  });

  it("maps all eleven current BECE subjects as published practice", () => {
    const bece = catalogFor("exam").programs.find((program) => program.id === "bece");
    const subjects = bece?.levels[0].subjects ?? [];
    expect(subjects.map((subject) => subject.label).sort()).toEqual([
      "Arabic",
      "Career Technology",
      "Computing",
      "Creative Art & Design",
      "English Language",
      "French",
      "Asante Twi (Ghanaian Language)",
      "Mathematics",
      "Religious and Moral Education",
      "Science",
      "Social Studies",
    ].sort());
    expect(subjects.every((subject) => subject.availability !== "expanding")).toBe(true);
    expect(subjects.every((subject) => subject.topics.length > 0)).toBe(true);
    expect(subjects.every((subject) => subject.topics.every((topic) => topic.availability !== "expanding"))).toBe(true);
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

  it("offers a broad university programme catalogue", () => {
    const university = catalogFor("university");
    expect(university.programs.length).toBeGreaterThanOrEqual(25);
    expect(university.programs.map((program) => program.label)).toEqual(expect.arrayContaining([
      "Computer Science",
      "Medicine (MBChB)",
      "Nursing — BSc degree (4 years)",
      "Nursing — RGN diploma (3 years)",
      "Pharmacy (PharmD)",
      "Law (LLB)",
      "Economics",
      "Business Administration",
      "Civil Engineering",
      "Psychology",
      "Public Health",
    ]));
    expect(university.programs.find((program) => program.id === "medicine")?.levels).toHaveLength(6);
  });
});
