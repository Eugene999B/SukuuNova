import {
  buildSession,
  isCorrectAnswer,
  type LearnQuestion,
  type SessionConfig,
} from "./learn-domain";

const MAX_SESSION_SIZE = 100;
const BROADENING_ATTEMPTS = 12;

function clampRequestedCount(count: number) {
  if (!Number.isFinite(count)) return 10;
  return Math.max(1, Math.min(MAX_SESSION_SIZE, Math.floor(count)));
}

function derivedSeed(seed: number, attempt: number) {
  return (seed + Math.imul(attempt + 1, 0x9e3779b9)) >>> 0;
}

/**
 * Builds a learner session while enforcing two product-level guarantees that are
 * intentionally stricter than the starter question generator:
 *
 * 1. A concept/exposure key appears at most once inside a session.
 * 2. Recently seen concepts are placed behind fresh concepts whenever enough
 *    fresh material exists.
 *
 * When a selected topic pack is still small, the engine broadens to related
 * practice rather than cloning the same concept under different question IDs.
 */
export function buildLearningSession(config: SessionConfig): LearnQuestion[] {
  const requested = clampRequestedCount(config.count);
  const seed = config.seed ?? Date.now();
  const recent = new Set(config.seen ?? []);
  const unique = new Set<string>();
  const fresh: LearnQuestion[] = [];
  const recycled: LearnQuestion[] = [];

  function absorb(questions: LearnQuestion[]) {
    for (const question of questions) {
      if (unique.has(question.exposureKey)) continue;
      unique.add(question.exposureKey);
      if (recent.has(question.exposureKey)) recycled.push(question);
      else fresh.push(question);
    }
  }

  absorb(
    buildSession({
      ...config,
      count: requested,
      seed,
    }),
  );

  for (let attempt = 0; fresh.length < requested && attempt < BROADENING_ATTEMPTS; attempt += 1) {
    absorb(
      buildSession({
        ...config,
        subjectId: "all",
        topicId: "all",
        count: MAX_SESSION_SIZE,
        seed: derivedSeed(seed, attempt),
      }),
    );
  }

  return [...fresh, ...recycled].slice(0, requested);
}

export function sessionDiagnostics(questions: LearnQuestion[], seen: string[] = []) {
  const exposureKeys = questions.map((question) => question.exposureKey);
  const uniqueCount = new Set(exposureKeys).size;
  const recent = new Set(seen);
  const recycledCount = exposureKeys.filter((key) => recent.has(key)).length;
  const formats = Array.from(new Set(questions.map((question) => question.kind)));

  return {
    size: questions.length,
    uniqueExposureCount: uniqueCount,
    recycledCount,
    freshCount: questions.length - recycledCount,
    formats,
  };
}

export { isCorrectAnswer };
export type { LearnQuestion, SessionConfig };
