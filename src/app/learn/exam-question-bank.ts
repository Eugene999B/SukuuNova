import { resolveCatalogSelection, type LearnQuestion, type SessionConfig } from "./learn-domain";

export type ClearedExamQuestion = LearnQuestion & {
  provenance: {
    sourceType: "official-sample" | "licensed-past" | "user-supplied-past";
    rightsStatus: "cleared";
    examBoard: string;
    exam: string;
    year?: number;
    paper?: string;
    sourceRef: string;
  };
};

/**
 * Only questions with explicit rights/provenance clearance belong here.
 *
 * Generated exam-style questions are intentionally NOT stored in this bank.
 * That prevents SukuuNova from presenting original/generated material as a
 * historical paper. Cleared official samples, licensed past questions, or
 * user-supplied past papers can be ingested into this registry later.
 */
export const CLEARED_EXAM_QUESTION_BANK: readonly ClearedExamQuestion[] = [];

function normalized(value: string) {
  return value
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isAuthenticPastOrOfficialQuestion(question: LearnQuestion) {
  const provenance = question.provenance;
  return Boolean(
    provenance
      && provenance.rightsStatus === "cleared"
      && provenance.sourceRef
      && ["official-sample", "licensed-past", "user-supplied-past"].includes(provenance.sourceType),
  );
}

export function examBankQuestionsForSelection(config: SessionConfig): ClearedExamQuestion[] {
  if (config.lane !== "exam") return [];
  const { subject, topic } = resolveCatalogSelection(config);
  const subjectLabel = subject?.contentLabel ?? subject?.label;
  const topicLabel = topic?.label;

  return CLEARED_EXAM_QUESTION_BANK.filter((question) => {
    if (!isAuthenticPastOrOfficialQuestion(question)) return false;

    const subjectMatches = config.subjectId === "all"
      || (subjectLabel ? normalized(question.subject) === normalized(subjectLabel) : false);
    const topicMatches = config.topicId === "all"
      || (topicLabel ? normalized(question.topic) === normalized(topicLabel) : false);

    const exam = normalized(question.provenance.exam);
    const program = normalized(config.programId);
    const examMatches = exam.includes(program) || program.includes(exam);

    return subjectMatches && topicMatches && examMatches;
  });
}

export function validateExamQuestionRecord(question: LearnQuestion) {
  if (!isAuthenticPastOrOfficialQuestion(question)) {
    return {
      valid: false,
      reason: "Past-paper questions require cleared provenance, an exam board, exam name and source reference.",
    } as const;
  }

  if (!question.provenance?.examBoard || !question.provenance.exam || !question.provenance.sourceRef) {
    return {
      valid: false,
      reason: "Exam provenance is incomplete.",
    } as const;
  }

  return { valid: true } as const;
}
