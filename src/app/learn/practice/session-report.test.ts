import { describe, expect, it } from "vitest";
import type { LearnQuestion } from "../learn-domain";
import { buildPracticeReport, buildPracticeReportHtml } from "./session-report";

const question: LearnQuestion = {
  id: "q-1",
  exposureKey: "algebra-1",
  kind: "single",
  subject: "Mathematics",
  topic: "Algebra",
  skill: "Solve equations",
  difficulty: 2,
  prompt: "Solve <x> + 2 = 4",
  options: [
    { id: "a", label: "1" },
    { id: "b", label: "2" },
  ],
  answer: "b",
  explanation: "Subtract 2 from both sides.",
};

describe("practice session report", () => {
  it("summarises attempts without requiring learner identity", () => {
    const report = buildPracticeReport({
      title: "Algebra sprint",
      mode: "adaptive",
      questions: [question],
      attempts: [{ questionId: "q-1", response: "b", correct: true }],
      completedAt: "2026-09-18T08:00:00.000Z",
    });
    expect(report.accuracy).toBe(100);
    expect(report.correct).toBe(1);
    expect(report.rows[0].learnerAnswer).toBe("2");
    expect(report.rows[0].correctAnswer).toBe("2");
    expect(report).not.toHaveProperty("learnerName");
    expect(report).not.toHaveProperty("userId");
  });

  it("escapes question content in printable HTML", () => {
    const html = buildPracticeReportHtml({
      title: "Algebra <script>",
      mode: "adaptive",
      questions: [question],
      attempts: [{ questionId: "q-1", response: "a", correct: false }],
      completedAt: "2026-09-18T08:00:00.000Z",
    });
    expect(html).toContain("Algebra &lt;script&gt;");
    expect(html).toContain("Solve &lt;x&gt; + 2 = 4");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Incorrect");
  });
});
