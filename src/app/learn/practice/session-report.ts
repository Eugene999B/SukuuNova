import type { LearnQuestion } from "../learn-domain";

export type PracticeResponse = string | string[] | number | boolean;

export type PracticeAttempt = {
  questionId: string;
  response: PracticeResponse;
  correct: boolean;
};

export type PracticeReportInput = {
  title: string;
  mode: string;
  questions: LearnQuestion[];
  attempts: PracticeAttempt[];
  completedAt: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function answerLabel(question: LearnQuestion, value: PracticeResponse | undefined) {
  if (value === undefined) return "—";
  if (Array.isArray(value)) {
    return value
      .map((item) => question.options?.find((option) => option.id === item)?.label ?? item)
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "True" : "False";
  const raw = String(value);
  return question.options?.find((option) => option.id === raw)?.label ?? raw;
}

export function buildPracticeReport(input: PracticeReportInput) {
  const attempts = new Map(input.attempts.map((attempt) => [attempt.questionId, attempt]));
  const rows = input.questions.map((question, index) => {
    const attempt = attempts.get(question.id);
    return {
      number: index + 1,
      id: question.id,
      subject: question.subject,
      topic: question.topic,
      skill: question.skill,
      kind: question.kind,
      prompt: question.prompt,
      learnerAnswer: answerLabel(question, attempt?.response),
      correctAnswer: answerLabel(question, question.answer),
      correct: attempt?.correct ?? false,
      explanation: question.explanation,
    };
  });
  const correct = rows.filter((row) => row.correct).length;
  return {
    kind: "sukuunova-practice-report" as const,
    version: 1 as const,
    generatedAt: input.completedAt,
    title: input.title,
    mode: input.mode,
    total: rows.length,
    correct,
    accuracy: rows.length ? Math.round((correct / rows.length) * 100) : 0,
    rows,
  };
}

export function buildPracticeReportJson(input: PracticeReportInput) {
  return JSON.stringify(buildPracticeReport(input), null, 2);
}

export function buildPracticeReportHtml(input: PracticeReportInput) {
  const report = buildPracticeReport(input);
  const rows = report.rows
    .map(
      (row) => `
        <article class="question">
          <div class="meta"><span>#${row.number}</span><span>${escapeHtml(row.subject)}</span><span>${escapeHtml(row.topic)}</span><span>${escapeHtml(row.kind)}</span></div>
          <h2>${escapeHtml(row.prompt)}</h2>
          <div class="answer-grid">
            <div><small>Your answer</small><strong>${escapeHtml(row.learnerAnswer)}</strong></div>
            <div><small>Correct answer</small><strong>${escapeHtml(row.correctAnswer)}</strong></div>
          </div>
          <p class="${row.correct ? "correct" : "wrong"}">${row.correct ? "Correct" : "Incorrect"}</p>
          <div class="explanation"><small>Explanation</small><p>${escapeHtml(row.explanation)}</p></div>
        </article>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SukuuNova Practice Report</title>
<style>
  *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#111827;background:#fff}
  main{max-width:900px;margin:0 auto;padding:38px 28px 56px}
  header{display:flex;justify-content:space-between;gap:22px;align-items:flex-start;padding-bottom:22px;border-bottom:2px solid #111827}
  h1{margin:4px 0 8px;font-size:30px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
  .score{text-align:right}.score strong{display:block;font-size:34px}.score span{font-size:12px;color:#4b5563}
  .summary{margin:20px 0 28px;padding:14px 16px;border:1px solid #d1d5db;border-radius:12px;background:#f9fafb;font-size:13px;line-height:1.6}
  .question{page-break-inside:avoid;margin:0 0 18px;padding:18px;border:1px solid #d1d5db;border-radius:12px}
  .meta{display:flex;gap:7px;flex-wrap:wrap}.meta span{padding:4px 7px;border-radius:999px;background:#f3f4f6;font-size:10px}
  .question h2{margin:14px 0;font-size:17px;line-height:1.45}
  .answer-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.answer-grid>div,.explanation{padding:11px;border-radius:9px;background:#f9fafb}
  small{display:block;margin-bottom:4px;color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:.07em}
  .correct,.wrong{display:inline-block;margin:12px 0 0;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:800}
  .correct{background:#dcfce7;color:#166534}.wrong{background:#fee2e2;color:#991b1b}.explanation{margin-top:10px}.explanation p{margin:0;line-height:1.55;font-size:12px}
  footer{margin-top:24px;color:#6b7280;font-size:10px;line-height:1.5}
  @media print{main{max-width:none;padding:16mm 12mm}.question{break-inside:avoid}}
  @media(max-width:620px){header{display:block}.score{text-align:left;margin-top:14px}.answer-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
<header>
  <div><div class="eyebrow">SukuuNova Learn · Anonymous practice report</div><h1>${escapeHtml(report.title)}</h1><div>${escapeHtml(report.mode)} mode</div></div>
  <div class="score"><strong>${report.accuracy}%</strong><span>${report.correct} correct of ${report.total}</span></div>
</header>
<div class="summary">Generated in your browser on ${escapeHtml(new Date(report.generatedAt).toLocaleString("en-GB"))}. No learner account, name or school record is required for this report.</div>
${rows}
<footer>SukuuNova Learn · This report is a local learning record. It is not an official examination result or school transcript.</footer>
</main>
</body>
</html>`;
}
