export type ArcadeVariationQuestion = {
  id: string;
  prompt: string;
  answer: string;
  conceptKey?: string;
  presentationVariant?: string;
};

type HistoryRow = { questions: unknown };

const canonical = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export function arcadeQuestionSignature(question: Pick<ArcadeVariationQuestion, "prompt" | "answer"> & Partial<Pick<ArcadeVariationQuestion, "conceptKey">>) {
  if (question.conceptKey?.trim()) return question.conceptKey.trim();
  return canonical(`${question.prompt}¦${question.answer}`);
}

export function arcadeQuestionHistorySignatures(rows: HistoryRow[]) {
  const signatures = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row.questions)) continue;
    for (const candidate of row.questions) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const question = candidate as Record<string, unknown>;
      const prompt = typeof question.prompt === "string" ? question.prompt : "";
      const answer = typeof question.answer === "string" ? question.answer : "";
      const conceptKey = typeof question.conceptKey === "string" ? question.conceptKey : undefined;
      if (!prompt || !answer) continue;
      signatures.add(arcadeQuestionSignature({ prompt, answer, conceptKey }));
    }
  }
  return signatures;
}

export function buildVariedArcadeQuestionSet<T extends ArcadeVariationQuestion>(
  generator: () => T[],
  length: number,
  recentSignatures: ReadonlySet<string>,
  attempts = 12,
) {
  const desired = Math.max(1, Math.min(50, Math.trunc(length)));
  const safeAttempts = Math.max(1, Math.min(30, Math.trunc(attempts)));
  const fresh = new Map<string, T>();
  const reused = new Map<string, T>();

  for (let attempt = 0; attempt < safeAttempts && fresh.size < desired; attempt += 1) {
    const batch = generator();
    for (const question of batch) {
      const signature = arcadeQuestionSignature(question);
      if (fresh.has(signature) || reused.has(signature)) continue;
      if (recentSignatures.has(signature)) reused.set(signature, question);
      else fresh.set(signature, question);
    }
  }

  const selected: T[] = [...fresh.values()].slice(0, desired);
  if (selected.length < desired) selected.push(...[...reused.values()].slice(0, desired - selected.length));

  // Very small foundational banks can legitimately need spaced repetition. Keep the
  // requested round length, but only permit exact concept reuse after exhausting the
  // fresh and unique candidate pools above.
  let guard = 0;
  while (selected.length < desired && guard < safeAttempts * 3) {
    guard += 1;
    for (const question of generator()) {
      selected.push(question);
      if (selected.length >= desired) break;
    }
  }

  const questions = selected.slice(0, desired).map((question, index) => ({ ...question, id: String(index) } as T));
  const freshCount = questions.filter((question) => !recentSignatures.has(arcadeQuestionSignature(question))).length;
  return {
    questions,
    freshCount,
    reusedCount: questions.length - freshCount,
    uniqueConceptCount: new Set(questions.map(arcadeQuestionSignature)).size,
  };
}

const AGE_PRESENTATIONS = {
  age_4_5: ["Star mission", "Treasure stop", "Picture quest", "Super finder"],
  age_6_8: ["Rocket mission", "Skill island", "Power-up stop", "Explorer quest"],
  age_9_11: ["Challenge zone", "Discovery mission", "Skill sprint", "Quest checkpoint"],
  age_12_14: ["Mission brief", "Challenge lab", "Strategy checkpoint", "Skill trial"],
  age_15_18: ["Applied challenge", "Precision round", "Problem lab", "Mastery checkpoint"],
} as const;

export type ArcadeVariationAgeBand = keyof typeof AGE_PRESENTATIONS;
export type AgePresentedArcadeQuestion<T extends ArcadeVariationQuestion> = T & {
  conceptKey: string;
  presentationVariant: string;
};

function hash(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return output >>> 0;
}

export function presentArcadeQuestionForAge<T extends ArcadeVariationQuestion>(
  question: T,
  ageBand: ArcadeVariationAgeBand,
  missionId: string,
  index: number,
): AgePresentedArcadeQuestion<T> {
  const conceptKey = arcadeQuestionSignature(question);
  const frames = AGE_PRESENTATIONS[ageBand];
  const frame = frames[hash(`${missionId}:${conceptKey}:${index}`) % frames.length];
  return {
    ...question,
    conceptKey,
    presentationVariant: frame,
    prompt: `${frame} · ${question.prompt}`,
  };
}
