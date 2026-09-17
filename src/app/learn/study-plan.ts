import { buildProgressSnapshot, type LearnerProgress, type TopicProgress } from "./learner-progress";

export type StudyTaskKind = "repair" | "strengthen" | "evidence" | "review" | "baseline" | "recovery";
export type StudyDayTone = "focus" | "build" | "light" | "check";

export type StudyTask = {
  kind: StudyTaskKind;
  subject: string;
  topic: string;
  questions: number;
  reason: string;
  href: string;
  actionLabel: string;
};

export type StudyPlanDay = {
  day: number;
  label: string;
  tone: StudyDayTone;
  task: StudyTask;
  totalQuestions: number;
};

export type StudyPlan = {
  kind: "personalized" | "maintenance" | "baseline";
  headline: string;
  reason: string;
  primaryTopic: string | null;
  maxDailyQuestions: number;
  totalQuestions: number;
  days: StudyPlanDay[];
};

function dailyCap(value: number) {
  if (!Number.isFinite(value)) return 20;
  return Math.max(5, Math.min(20, Math.floor(value)));
}

function topicTask(topic: TopicProgress, questions: number, reason?: string): StudyTask {
  if (topic.band === "repair") {
    return {
      kind: "repair",
      subject: topic.subject,
      topic: topic.topic,
      questions,
      reason: reason ?? "Enough evidence exists to justify a focused repair session.",
      href: "/learn/repair",
      actionLabel: "Open repair coach",
    };
  }

  if (topic.band === "developing") {
    return {
      kind: "strengthen",
      subject: topic.subject,
      topic: topic.topic,
      questions,
      reason: reason ?? "This topic is progressing; another focused session can help make it secure.",
      href: "/learn/repair",
      actionLabel: "Strengthen this",
    };
  }

  if (topic.band === "evidence") {
    return {
      kind: "evidence",
      subject: topic.subject,
      topic: topic.topic,
      questions,
      reason: reason ?? "There is not enough evidence to judge mastery yet, so gather more signal before labelling it weak or secure.",
      href: "/learn/practice",
      actionLabel: "Gather evidence",
    };
  }

  return {
    kind: "review",
    subject: topic.subject,
    topic: topic.topic,
    questions,
    reason: reason ?? "Current evidence is strong. A short spaced review helps keep it available without unnecessary drilling.",
    href: "/learn/practice",
    actionLabel: "Review briefly",
  };
}

function mixedTask(questions: number, reason: string): StudyTask {
  return {
    kind: "baseline",
    subject: "Mixed foundations",
    topic: "Adaptive practice",
    questions,
    reason,
    href: "/learn/practice",
    actionLabel: "Start mixed practice",
  };
}

function recoveryTask(): StudyTask {
  return {
    kind: "recovery",
    subject: "Recovery",
    topic: "Rest, reflect, or optional recall",
    questions: 0,
    reason: "A lighter day protects consistency. Rest is allowed; optional recall should stay brief and low pressure.",
    href: "/learn/progress",
    actionLabel: "Review progress",
  };
}

function day(dayNumber: number, label: string, tone: StudyDayTone, task: StudyTask, cap: number): StudyPlanDay {
  const questions = Math.min(cap, Math.max(0, Math.floor(task.questions)));
  const clippedTask = { ...task, questions };
  return { day: dayNumber, label, tone, task: clippedTask, totalQuestions: questions };
}

function summarize(kind: StudyPlan["kind"], primary: TopicProgress | null) {
  if (kind === "baseline") {
    return {
      headline: "Build a trustworthy learning baseline",
      reason: "SukuuNova does not have enough topic evidence yet, so this week gathers signal without inventing weaknesses.",
    };
  }

  if (kind === "maintenance") {
    return {
      headline: "Protect what you already know",
      reason: "Your saved topics are currently secure, so the week uses spaced review and mixed practice instead of needless remediation.",
    };
  }

  return {
    headline: primary?.band === "repair" ? "Repair first. Revisit later. Check again." : primary?.band === "developing" ? "Turn developing knowledge into secure mastery" : "Gather enough evidence to learn what comes next",
    reason: primary ? `${primary.subject} · ${primary.topic} is the strongest current signal, so the plan revisits it with spacing instead of drilling it every day.` : "The week balances focus, spacing and recovery.",
  };
}

export function buildStudyPlan(progress: LearnerProgress, requestedDailyCap = 20): StudyPlan {
  const cap = dailyCap(requestedDailyCap);
  const snapshot = buildProgressSnapshot(progress);
  const targets = [...snapshot.repair, ...snapshot.developing, ...snapshot.evidence];
  const primary = targets[0] ?? null;
  const secondary = targets[1] ?? null;
  const tertiary = targets[2] ?? null;
  const secure = snapshot.secure[0] ?? null;
  const secondSecure = snapshot.secure[1] ?? secure;

  let kind: StudyPlan["kind"];
  let days: StudyPlanDay[];

  if (primary) {
    kind = "personalized";
    days = [
      day(1, "Focus", "focus", topicTask(primary, 10, "Start with the clearest current learning signal while attention is fresh."), cap),
      day(2, "Build", "build", secondary ? topicTask(secondary, 10) : secure ? topicTask(secure, 8) : mixedTask(8, "Broaden the evidence base instead of repeating yesterday immediately."), cap),
      day(3, "Spaced revisit", "focus", topicTask(primary, 8, "Return after a gap. Spacing gives a better mastery signal than back-to-back drilling."), cap),
      day(4, "Recovery", "light", recoveryTask(), cap),
      day(5, "Second focus", "build", tertiary ? topicTask(tertiary, 10) : secondary ? topicTask(secondary, 10) : secure ? topicTask(secure, 8) : mixedTask(10, "Use a fresh mixed set to keep the week broad."), cap),
      day(6, "Checkpoint", "check", topicTask(primary, 10, "Check the priority topic again after spacing. Improvement matters more than a perfect score."), cap),
      day(7, "Weekly review", "light", secure ? topicTask(secure, 8) : mixedTask(10, "Finish with mixed retrieval so next week starts with better evidence."), cap),
    ];
  } else if (secure) {
    kind = "maintenance";
    days = [
      day(1, "Spaced review", "focus", topicTask(secure, 8), cap),
      day(2, "Mixed practice", "build", mixedTask(8, "Keep the evidence base broad while secure topics stay warm."), cap),
      day(3, "Recovery", "light", recoveryTask(), cap),
      day(4, "Second review", "focus", topicTask(secondSecure, 8), cap),
      day(5, "Mixed challenge", "build", mixedTask(10, "Use mixed retrieval to detect any new developing areas early."), cap),
      day(6, "Recovery", "light", recoveryTask(), cap),
      day(7, "Weekly check", "check", topicTask(secure, 8, "A short weekly check is enough when the saved evidence is already secure."), cap),
    ];
  } else {
    kind = "baseline";
    days = [
      day(1, "Baseline", "focus", mixedTask(10, "Start with a mixed diagnostic set so SukuuNova can learn where to focus next."), cap),
      day(2, "Explore", "build", mixedTask(10, "A second mixed set gives the first result more context."), cap),
      day(3, "Recovery", "light", recoveryTask(), cap),
      day(4, "Baseline revisit", "focus", mixedTask(10, "Return after a gap so early evidence is not based on one sitting."), cap),
      day(5, "Explore", "build", mixedTask(10, "Keep gathering signal across the starter curriculum."), cap),
      day(6, "Recovery", "light", recoveryTask(), cap),
      day(7, "Weekly check", "check", mixedTask(10, "Finish with a mixed set and use the resulting evidence to personalize next week."), cap),
    ];
  }

  const summary = summarize(kind, primary);
  return {
    kind,
    ...summary,
    primaryTopic: primary?.key ?? secure?.key ?? null,
    maxDailyQuestions: cap,
    totalQuestions: days.reduce((total, item) => total + item.totalQuestions, 0),
    days,
  };
}
