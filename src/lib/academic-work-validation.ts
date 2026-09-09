import { AppError } from "./errors";

export type AcademicQuestionInput = { type: string; prompt: string; points: number; options?: string[]; acceptedAnswers?: string[] };
export function validateAcademicQuestions(questions: AcademicQuestionInput[], maxScore: number, mode: string) {
  const fail = (message: string): never => { throw new AppError(message, 400, "INVALID_QUESTIONS"); };
  if (!["manual", "auto", "review"].includes(mode)) fail("Choose a supported marking mode.");
  if (questions.length > 100) fail("An activity can contain at most 100 questions.");
  if (!questions.length) {
    if (mode !== "manual") fail("Automatic and assisted activities need questions.");
    return;
  }
  let total = 0;
  for (const [index, q] of questions.entries()) {
    const label = `Question ${index + 1}`;
    if (!["multiple_choice", "true_false", "short_answer", "long_answer"].includes(q.type)) fail(`${label}: unsupported question type.`);
    if (!q.prompt.trim() || q.prompt.length > 4000 || !Number.isFinite(q.points) || q.points <= 0 || q.points > 1000) fail(`${label}: supply a prompt and positive points (up to 1000).`);
    const options = (q.options ?? []).map(value => value.trim());
    const answers = (q.acceptedAnswers ?? []).map(value => value.trim());
    if ([...options, ...answers].some(value => !value || value.length > 500) || options.length > 20 || answers.length > 20) fail(`${label}: answer choices must be nonempty and at most 500 characters.`);
    if (q.type === "multiple_choice") {
      if (options.length < 2 || new Set(options.map(value => value.normalize("NFKC").toLowerCase())).size !== options.length) fail(`${label}: provide at least two distinct choices.`);
      if (answers.length !== 1 || !options.includes(answers[0])) fail(`${label}: choose exactly one accepted answer from the choices.`);
    }
    if (q.type === "true_false" && (answers.length !== 1 || !["true", "false"].includes(answers[0].toLowerCase()))) fail(`${label}: the accepted answer must be true or false.`);
    if (mode === "auto" && (q.type === "long_answer" || (q.type === "short_answer" && !answers.length))) fail(`${label}: automatic marking requires objective questions with accepted answers.`);
    total += q.points;
  }
  if (Math.abs(total - maxScore) > 0.000001) fail(`Question points total ${total}; they must equal the maximum mark of ${maxScore}.`);
}
