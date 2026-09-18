import { buildLearningSession, type LearnQuestion } from "./learning-engine";
import { buildProgressSnapshot, type LearnerProgress, type MasteryBand, type TopicProgress } from "./learner-progress";

export type RepairPlan = {
  kind: "targeted" | "baseline";
  band: MasteryBand | "baseline";
  title: string;
  subject: string;
  topic: string;
  reason: string;
  evidence: string;
  alternatives: TopicProgress[];
};

function selectionId(label: string) {
  return label
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildRepairPlan(progress: LearnerProgress): RepairPlan {
  const snapshot = buildProgressSnapshot(progress);
  const candidates = [...snapshot.repair, ...snapshot.developing, ...snapshot.evidence];
  const priority = candidates[0];

  if (!priority) {
    return {
      kind: "baseline",
      band: "baseline",
      title: "Build your learning baseline",
      subject: "Mixed practice",
      topic: "Starter diagnostic",
      reason: "SukuuNova needs a little practice evidence before it can target a repair area responsibly.",
      evidence: "No topic has enough saved evidence yet.",
      alternatives: [],
    };
  }

  const copy: Record<MasteryBand, string> = {
    repair: "This topic has enough attempts to show a clear repair opportunity.",
    developing: "This topic is progressing, but another focused session can help make it secure.",
    evidence: "There is not enough evidence to judge mastery yet, so the next goal is to learn more about this topic.",
    secure: "Current evidence is strong; keep it secure with spaced review.",
  };

  return {
    kind: "targeted",
    band: priority.band,
    title: priority.band === "repair" ? "Fix this first" : priority.band === "developing" ? "Strengthen this next" : "Gather more evidence",
    subject: priority.subject,
    topic: priority.topic,
    reason: copy[priority.band],
    evidence: `${priority.correct}/${priority.answered} correct · ${priority.accuracy}% accuracy`,
    alternatives: candidates.slice(1, 4),
  };
}

export function buildRepairSession(progress: LearnerProgress, count = 10, seed?: number): LearnQuestion[] {
  const plan = buildRepairPlan(progress);
  const requested = Math.max(5, Math.min(30, Math.floor(Number.isFinite(count) ? count : 10)));

  if (plan.kind === "baseline") {
    return buildLearningSession({
      lane: "school",
      programId: "ghana",
      levelId: "jhs-3",
      subjectId: "all",
      topicId: "all",
      mode: "adaptive",
      count: requested,
      seen: progress.exposures,
      seed,
    });
  }

  return buildLearningSession({
    lane: "school",
    programId: "ghana",
    levelId: "jhs-3",
    subjectId: selectionId(plan.subject),
    topicId: selectionId(plan.topic),
    mode: "weakness",
    count: requested,
    seen: progress.exposures,
    seed,
  });
}
