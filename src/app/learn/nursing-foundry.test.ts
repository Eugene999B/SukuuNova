import { describe, expect, it } from "vitest";
import { buildLearningSession, sessionDiagnostics } from "./learning-engine";
import {
  buildNursingQuestions,
  nursingCapacityForSelection,
} from "./nursing-foundry";
import type { SessionConfig } from "./learn-domain";

function nursingConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    lane: "university",
    programId: "nursing",
    levelId: "level-200",
    subjectId: "medical-surgical-nursing-i",
    topicId: "assessment-and-care-planning",
    mode: "topic",
    count: 48,
    seed: 20260921,
    ...overrides,
  };
}

describe("Nursing clinical assessment diversity", () => {
  it("does not reduce Nursing to repeated named-person vignettes", () => {
    const questions = buildNursingQuestions(nursingConfig(), 60, 711);

    expect(questions).toHaveLength(60);
    expect(new Set(questions.map((question) => question.prompt)).size).toBe(60);
    expect(new Set(questions.map((question) => question.generationFamily)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(questions.map((question) => question.kind)).size).toBeGreaterThanOrEqual(5);

    const named = questions.filter((question) => /\b(?:Adwoa|Yaw|Akosua|Kofi|Esi|Kwame|Abena|Sena)\b/.test(question.prompt));
    expect(named.length).toBeLessThanOrEqual(6);
    expect(questions.filter((question) => /^\w+, aged \d+/.test(question.prompt)).length).toBeLessThanOrEqual(6);
    expect(questions.some((question) => question.kind === "multi")).toBe(true);
    expect(questions.some((question) => question.kind === "fill")).toBe(true);
    expect(questions.some((question) => question.kind === "short")).toBe(true);
    expect(questions.some((question) => question.kind === "boolean")).toBe(true);
    expect(questions.some((question) => question.stimulus?.kind === "table")).toBe(true);
    expect(questions.some((question) => question.stimulus?.kind === "passage")).toBe(true);
  });

  it("does not rely on the same 'best describes' or disease-identification shell", () => {
    const questions = buildNursingQuestions(nursingConfig({ count: 72 }), 72, 812);
    const lower = questions.map((question) => question.prompt.toLowerCase());

    expect(lower.filter((prompt) => prompt.includes("best describes")).length).toBe(0);
    expect(lower.filter((prompt) => prompt.startsWith("which disease")).length).toBe(0);
    expect(new Set(lower.map((prompt) => prompt.split(/[?:.]/)[0])).size).toBeGreaterThanOrEqual(10);
  });

  it("uses clinically plausible competing actions instead of absurd off-topic distractors", () => {
    const questions = buildNursingQuestions(nursingConfig(), 60, 913)
      .filter((question) =>
        question.kind === "single"
        && question.options
        && !question.generationFamily?.endsWith("-recognition"),
      );

    expect(questions.length).toBeGreaterThan(12);
    for (const question of questions.slice(0, 16)) {
      expect(question.options?.length).toBeGreaterThanOrEqual(4);
      expect(question.options?.some((option) => /school timetable|company dividend|weather forecast|logo colour|court ruling/i.test(option.label))).toBe(false);
    }
  });

  it("adds numeric medication calculation as one of several Pharmacology formats", () => {
    const pharmacology = nursingConfig({
      subjectId: "pharmacology",
      topicId: "safe-prescribing",
      count: 60,
    });
    const questions = buildNursingQuestions(pharmacology, 60, 1014);

    expect(questions.some((question) => question.kind === "numeric")).toBe(true);
    expect(questions.some((question) => question.generationFamily === "nursing-dose-calculation")).toBe(true);
    expect(questions.some((question) => question.stimulus?.kind === "table")).toBe(true);
  });

  it("raises cognitive demand across programme levels", () => {
    const level100 = buildNursingQuestions(nursingConfig({
      levelId: "level-100",
      subjectId: "fundamentals",
      topicId: "patient-care",
      count: 24,
    }), 24, 1115);

    const level300 = buildNursingQuestions(nursingConfig({
      levelId: "level-300",
      subjectId: "mental-health-nursing",
      topicId: "assessment-and-care-planning",
      count: 24,
    }), 24, 1116);

    expect(level100.length).toBeGreaterThan(0);
    expect(level300.length).toBeGreaterThan(0);
    expect(level100.every((question) => question.difficulty === 3)).toBe(true);
    expect(level300.every((question) => question.difficulty === 5)).toBe(true);
    expect(level300.some((question) => ["Analyse", "Evaluate", "Transfer"].includes(question.challenge ?? ""))).toBe(true);
  });

  it("routes learner Nursing sessions through the clinical foundry instead of generic actor templates", () => {
    const session = buildLearningSession(nursingConfig({ count: 20, seed: 1217 }));

    expect(session).toHaveLength(20);
    expect(session.every((question) => question.exposureKey.startsWith("nursing:"))).toBe(true);
    expect(new Set(session.map((question) => question.generationFamily)).size).toBeGreaterThanOrEqual(8);

    const named = session.filter((question) => /\b(?:Adwoa|Yaw|Akosua|Kofi|Esi|Kwame|Abena|Sena)\b/.test(question.prompt));
    expect(named.length).toBeLessThanOrEqual(3);

    const diagnostics = sessionDiagnostics(session);
    expect(diagnostics.intelligence.kindCount).toBeGreaterThanOrEqual(5);
    expect(diagnostics.intelligence.familyCount).toBeGreaterThanOrEqual(8);
    expect(diagnostics.intelligence.higherOrderCount).toBeGreaterThanOrEqual(6);
  });

  it("gives Year 3 Midwifery Fundamentals a different opening experience across launches", () => {
    const config: SessionConfig = {
      lane: "university",
      programId: "midwifery-diploma",
      levelId: "level-300",
      subjectId: "fundamentals-of-nursing",
      topicId: "all",
      mode: "adaptive",
      count: 12,
    };
    const sessions = [31001, 31002, 31003, 31004, 31005, 31006, 31007, 31008]
      .map(seed => buildLearningSession({ ...config, seed }));

    expect(sessions.every(session => session.length === 12)).toBe(true);
    expect(new Set(sessions.map(session => session[0]?.prompt)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(sessions.map(session => session[0]?.generationFamily)).size).toBeGreaterThanOrEqual(4);

    const firstKeys = sessions.map(session => new Set(session.map(question => question.exposureKey)));
    for (let index = 1; index < firstKeys.length; index += 1) {
      const overlap = [...firstKeys[0]].filter(key => firstKeys[index].has(key)).length;
      expect(overlap).toBeLessThanOrEqual(2);
    }
  });

  it("reports a genuinely large rendered variant space without materialising it", () => {
    expect(nursingCapacityForSelection(nursingConfig())).toBeGreaterThan(1_000_000);
  });
});

it("tracks rendered nursing variants so new seeds produce mostly fresh exposures",()=>{
 const config=nursingConfig({count:100});
 const a=buildNursingQuestions(config,100,1),b=buildNursingQuestions(config,100,2);
 expect(new Set(a.map(q=>q.exposureKey)).size).toBe(a.length);
 const bKeys=new Set(b.map(q=>q.exposureKey));
 const overlap=a.filter(q=>bKeys.has(q.exposureKey)).length;
 expect(overlap).toBeLessThan(10);
});
it("provides a separate diploma route and rejects unsupported subject substitution",()=>{
 const diploma=buildNursingQuestions(nursingConfig({programId:"nursing-diploma"}),10,1);
 expect(diploma.length).toBeGreaterThan(0);
 expect(diploma.every(q=>q.exposureKey.startsWith("nursing:nursing-diploma:"))).toBe(true);
 expect(buildNursingQuestions(nursingConfig({levelId:"level-400",programId:"nursing-diploma"}),10,1)).toEqual([]);
 expect(buildNursingQuestions(nursingConfig({levelId:"level-100",subjectId:"biochemistry",topicId:"all"}),10,1)).toEqual([]);
});
it("does not fabricate a universal abnormal blood-pressure trend",()=>{
 const qs=buildNursingQuestions(nursingConfig({levelId:"level-300",subjectId:"maternal-and-child-health",topicId:"all"}),80,7);
 expect(qs.filter(q=>q.generationFamily==="nursing-chart-trend").every(q=>JSON.stringify(q.stimulus).includes("Systolic BP")===false)).toBe(true);
});

it("matches chart-review wording to the actual stimulus", () => {
  const questions=buildNursingQuestions(nursingConfig(),100,789).filter(q=>q.generationFamily==="nursing-chart-trend");
  expect(questions.length).toBeGreaterThan(0);
  for(const q of questions) {
    expect(q.prompt).toContain("documented action");
    expect(q.prompt).not.toContain("trend");
    expect(JSON.stringify(q.stimulus)).toContain("Documented action");
  }
});
it("retains distinct numeric exercises and their correct answer", () => {
  const questions=buildNursingQuestions(nursingConfig({subjectId:"pharmacology",topicId:"safe-prescribing"}),100,1014).filter(q=>q.kind==="numeric");
  expect(questions.length).toBeGreaterThan(1);
  for(const q of questions) {
    const rows=q.stimulus?.kind==="table"?q.stimulus.rows:[];
    const prescribed=Number.parseFloat(rows[0][1]);
    const stock=Number.parseFloat(rows[1][1]);
    expect(q.answer).toBe(prescribed/stock);
  }
});
