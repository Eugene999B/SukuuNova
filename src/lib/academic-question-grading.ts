export type AcademicGradingQuestion = {
  id: string;
  type: string;
  points: number;
  acceptedAnswers?: unknown;
};

export type AcademicGradingAnswer = { responseText?: string | null; responseData?: unknown };
export type AcademicGradeResult = {
  questionId: string;
  score: number;
  markingMode: "auto" | "manual" | "suggested";
  reason: string;
  suggestedScore?: number;
  confidence?: number;
};

const canonical = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
function normalizedWords(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function asStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function exactScore(response: string, accepted: string[], points: number) {
  const value = canonical(response);
  return value && accepted.some(answer => canonical(answer) === value) ? points : 0;
}
function setScore(response: unknown, accepted: string[], points: number) {
  const values = asStrings(response).map(canonical);
  const expected = accepted.map(canonical);
  if (values.length !== expected.length || new Set(values).size !== values.length) return 0;
  const wanted = new Set(expected);
  return values.every(value => wanted.has(value)) ? points : 0;
}
function orderingScore(response: unknown, accepted: string[], points: number) {
  const values = asStrings(response).map(canonical);
  const expected = accepted.map(canonical);
  return values.length === expected.length && values.every((value, index) => value === expected[index]) ? points : 0;
}
function numericScore(response: unknown, accepted: string[], points: number) {
  const raw = typeof response === "number" || typeof response === "string" ? response : "";
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return accepted.some(answer => {
    const expected = Number(answer);
    if (!Number.isFinite(expected)) return false;
    const scale = Math.max(1, Math.abs(value), Math.abs(expected));
    return Math.abs(value - expected) <= Number.EPSILON * scale * 8;
  }) ? points : 0;
}
function suggestedWrittenScore(response: string, guide: string[], points: number) {
  if (!response.trim() || guide.length === 0) return { score: 0, confidence: 0, reason: "No answer guidance is available for semantic review." };
  const responseTokens = new Set(normalizedWords(response).split(" ").filter(word => word.length > 2));
  const guideTokens = new Set(normalizedWords(guide.join(" ")).split(" ").filter(word => word.length > 2));
  if (!responseTokens.size || !guideTokens.size) return { score: 0, confidence: 0, reason: "The response or answer guide has no usable key terms." };
  let overlap = 0;
  for (const token of responseTokens) if (guideTokens.has(token)) overlap += 1;
  const precision = overlap / responseTokens.size;
  const recall = overlap / guideTokens.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    score: Math.round(points * Math.min(1, f1 * 1.2) * 100) / 100,
    confidence: Math.round(Math.min(1, f1 * 1.35) * 100),
    reason: `${overlap} key terms matched across the submitted response and teacher guidance.`
  };
}

export function gradeAcademicQuestions(
  questions: AcademicGradingQuestion[],
  answers: Map<string, AcademicGradingAnswer>,
  guide: unknown,
  mode: string
): AcademicGradeResult[] {
  const answerGuide = asStrings(guide);
  return questions.map(question => {
    const response = answers.get(question.id) ?? {};
    const responseText = String(response.responseText ?? "");
    const accepted = asStrings(question.acceptedAnswers);
    const points = Number(question.points);
    if (question.type === "multiple_choice" || question.type === "true_false" || question.type === "fill_blank") {
      const selected = typeof response.responseData === "string" ? response.responseData : responseText;
      const score = exactScore(selected, accepted, points);
      return { questionId: question.id, score, markingMode: "auto", reason: score > 0 ? "Matched a teacher-supplied accepted answer." : "Did not match a teacher-supplied accepted answer." };
    }
    if (question.type === "multiple_select") {
      const score = setScore(response.responseData, accepted, points);
      return { questionId: question.id, score, markingMode: "auto", reason: score > 0 ? "Selected the complete accepted answer set." : "Selected answer set did not match the accepted set." };
    }
    if (question.type === "ordering") {
      const score = orderingScore(response.responseData, accepted, points);
      return { questionId: question.id, score, markingMode: "auto", reason: score > 0 ? "Submitted the accepted order." : "Submitted order did not match the accepted order." };
    }
    if (question.type === "numeric") {
      const selected = response.responseData ?? responseText;
      const score = numericScore(selected, accepted, points);
      return { questionId: question.id, score, markingMode: "auto", reason: score > 0 ? "Numeric answer matched." : "Numeric answer did not match an accepted value." };
    }
    if (question.type === "short_answer") {
      const score = exactScore(responseText, accepted, points);
      if (score > 0 || mode === "auto") return { questionId: question.id, score, markingMode: "auto", reason: score > 0 ? "Normalized answer matched." : "No accepted normalized answer matched." };
    }
    const suggested = suggestedWrittenScore(responseText, answerGuide, points);
    return {
      questionId: question.id,
      score: 0,
      suggestedScore: suggested.score,
      confidence: suggested.confidence,
      markingMode: mode === "review" ? "suggested" : "manual",
      reason: suggested.reason
    };
  });
}
