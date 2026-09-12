type CopyQuestion = {
  prompt: string;
  explanation?: string;
};

const EXACT_REPLACEMENTS = new Map<string, string>([
  ["They takes are in the present tense.", "Use ‘are’ with the plural subject ‘they’ in the present tense."],
  ["I takes have, not has.", "Use ‘have’ with the subject ‘I’, not ‘has’."],
  ["Children is plural, so use are.", "‘Children’ is plural, so use ‘are’."],
  ["Neither answer is singular.", "The subject ‘neither answer’ is singular, so use ‘is’."],
  ["Who refers to the plural students, so use arrive.", "Here, ‘who’ refers to the plural noun ‘students’, so use ‘arrive’."],
]);

function clean(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return EXACT_REPLACEMENTS.get(normalized) ?? normalized;
}

export function polishArcadeQuestionCopy<T extends CopyQuestion>(question: T): T {
  return {
    ...question,
    prompt: clean(question.prompt),
    ...(typeof question.explanation === "string" ? { explanation: clean(question.explanation) } : {}),
  };
}

export function arcadeCopyLooksBroken(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return true;
  return [
    /\bthey takes\b/i,
    /\bi takes\b/i,
    /\bchildren is plural\b/i,
    /\bneither answer is singular\b/i,
    /\bhas arrives\b/i,
    /\bwould stayed\b/i,
  ].some((pattern) => pattern.test(text));
}
