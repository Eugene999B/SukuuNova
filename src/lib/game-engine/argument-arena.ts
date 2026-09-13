export type ArenaSide = "support" | "oppose";
export type ArenaAudience = "students" | "teachers" | "community";
export type ArenaOutcome = "arena-champion" | "persuasive-case" | "narrow-loss" | "rethink-case";
export type ChallengeType = "causation" | "practicality" | "representativeness" | "opportunity-cost";

export type ArenaEvidence = {
  id: string;
  title: string;
  summary: string;
  source: string;
  credibility: number;
  relevance: Record<ArenaSide, number>;
  tags: string[];
};

export type ArenaReasoning = {
  id: string;
  label: string;
  description: string;
  tagFit: string[];
};

export type ArenaRebuttal = {
  id: string;
  label: string;
  description: string;
  strengthByChallenge: Record<ChallengeType, number>;
  audienceFit: ArenaAudience[];
};

export type ArenaChallenge = {
  id: string;
  type: ChallengeType;
  prompt: string;
};

export type ArenaExchange = {
  round: number;
  evidenceId: string;
  reasoningId: string;
  rebuttalId: string;
  challenge: ArenaChallenge;
  playerPoints: number;
  opponentPoints: number;
  breakdown: {
    relevance: number;
    credibility: number;
    reasoningFit: number;
    rebuttal: number;
    audience: number;
    novelty: number;
  };
  feedback: string[];
};

export type ArgumentArenaState = {
  topic: string;
  side: ArenaSide;
  audience: ArenaAudience;
  round: number;
  maxRounds: number;
  score: number;
  opponentScore: number;
  evidenceUsed: string[];
  exchanges: ArenaExchange[];
  outcome: ArenaOutcome | null;
};

export const ARENA_TOPIC = "The school should replace one weekly assembly with student-led project time.";

export const ARENA_EVIDENCE: ArenaEvidence[] = [
  {
    id: "pilot-completion",
    title: "Six-week project pilot",
    summary: "Classes in a six-week pilot submitted 18% more completed project logs than comparison classes.",
    source: "School pilot report",
    credibility: 0.84,
    relevance: { support: 0.96, oppose: 0.24 },
    tags: ["outcome", "comparison", "data"],
  },
  {
    id: "student-survey",
    title: "Student preference survey",
    summary: "64% of 312 surveyed learners said they would use structured project time for collaborative work.",
    source: "Student council survey",
    credibility: 0.64,
    relevance: { support: 0.76, oppose: 0.3 },
    tags: ["opinion", "representativeness"],
  },
  {
    id: "lab-capacity",
    title: "Lab capacity incidents",
    summary: "Two project sessions exceeded the supervised laboratory capacity and had to be reorganised.",
    source: "Safety incident register",
    credibility: 0.82,
    relevance: { support: 0.22, oppose: 0.94 },
    tags: ["risk", "practicality", "data"],
  },
  {
    id: "teacher-prep",
    title: "Mentor preparation load",
    summary: "Mentors reported an average of 22 extra preparation minutes per project week.",
    source: "Teacher workload log",
    credibility: 0.78,
    relevance: { support: 0.3, oppose: 0.86 },
    tags: ["cost", "practicality", "data"],
  },
  {
    id: "exhibition-output",
    title: "Community exhibition output",
    summary: "The pilot exhibition produced 14 student prototypes, with nine teams receiving external feedback.",
    source: "Exhibition record",
    credibility: 0.72,
    relevance: { support: 0.86, oppose: 0.28 },
    tags: ["outcome", "community", "example"],
  },
  {
    id: "assembly-belonging",
    title: "Assembly belonging pulse",
    summary: "A short school pulse check found 58% of respondents felt weekly assemblies strengthened whole-school belonging.",
    source: "School climate pulse",
    credibility: 0.66,
    relevance: { support: 0.26, oppose: 0.82 },
    tags: ["opinion", "community", "tradeoff"],
  },
];

export const ARENA_REASONING: ArenaReasoning[] = [
  {
    id: "cause",
    label: "Cause and effect",
    description: "Explain how the evidence could produce the claimed outcome without pretending correlation proves everything.",
    tagFit: ["outcome", "risk", "data"],
  },
  {
    id: "comparison",
    label: "Comparison",
    description: "Compare alternatives using the same standard and acknowledge meaningful differences between groups.",
    tagFit: ["comparison", "data", "tradeoff"],
  },
  {
    id: "tradeoff",
    label: "Trade-off",
    description: "Show what is gained, what is lost and why the balance supports your position.",
    tagFit: ["cost", "risk", "tradeoff", "practicality", "community"],
  },
  {
    id: "principle",
    label: "Principle + example",
    description: "Connect a broader principle to a concrete example without treating one example as universal proof.",
    tagFit: ["example", "community", "opinion"],
  },
];

export const ARENA_REBUTTALS: ArenaRebuttal[] = [
  {
    id: "concede-limit",
    label: "Concede, then limit",
    description: "Accept the strongest part of the objection, then show why it does not overturn the whole case.",
    strengthByChallenge: { causation: 0.72, practicality: 0.88, representativeness: 0.82, "opportunity-cost": 0.86 },
    audienceFit: ["teachers", "community"],
  },
  {
    id: "counter-evidence",
    label: "Counter with evidence",
    description: "Answer the objection with a stronger or more directly relevant piece of evidence already in your chain.",
    strengthByChallenge: { causation: 0.9, practicality: 0.76, representativeness: 0.84, "opportunity-cost": 0.72 },
    audienceFit: ["students", "teachers"],
  },
  {
    id: "question-source",
    label: "Question the source",
    description: "Test whether the objection relies on a weak, narrow or unrepresentative source rather than attacking the person.",
    strengthByChallenge: { causation: 0.66, practicality: 0.54, representativeness: 0.96, "opportunity-cost": 0.58 },
    audienceFit: ["students", "community"],
  },
  {
    id: "reframe",
    label: "Reframe the criterion",
    description: "Show that the decision should be judged by a more relevant standard, while still answering the objection.",
    strengthByChallenge: { causation: 0.62, practicality: 0.72, representativeness: 0.64, "opportunity-cost": 0.94 },
    audienceFit: ["community", "teachers"],
  },
];

const CHALLENGES: ArenaChallenge[] = [
  { id: "cause-1", type: "causation", prompt: "How do you know this evidence caused the outcome instead of merely happening at the same time?" },
  { id: "practicality-1", type: "practicality", prompt: "Your plan sounds attractive in theory. What happens when staff time, rooms or supervision are limited?" },
  { id: "representative-1", type: "representativeness", prompt: "Why should this sample or example represent the whole school?" },
  { id: "cost-1", type: "opportunity-cost", prompt: "What valuable thing is lost if the school adopts your proposal?" },
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function createArgumentArenaState(side: ArenaSide = "support", audience: ArenaAudience = "teachers"): ArgumentArenaState {
  return {
    topic: ARENA_TOPIC,
    side,
    audience,
    round: 0,
    maxRounds: 4,
    score: 0,
    opponentScore: 0,
    evidenceUsed: [],
    exchanges: [],
    outcome: null,
  };
}

export function currentArenaChallenge(state: ArgumentArenaState): ArenaChallenge {
  const offset = state.side === "support" ? 0 : 1;
  return CHALLENGES[(state.round + offset) % CHALLENGES.length];
}

function reasoningFit(evidence: ArenaEvidence, reasoning: ArenaReasoning) {
  const matches = evidence.tags.filter((tag) => reasoning.tagFit.includes(tag)).length;
  return clamp01(0.42 + matches * 0.23);
}

function outcomeFor(state: ArgumentArenaState): ArenaOutcome {
  const margin = state.score - state.opponentScore;
  if (state.score >= 300 && margin >= 30) return "arena-champion";
  if (state.score >= 255 && margin >= 0) return "persuasive-case";
  if (state.score >= 205 || margin >= -20) return "narrow-loss";
  return "rethink-case";
}

export function playArenaMove(
  state: ArgumentArenaState,
  evidenceId: string,
  reasoningId: string,
  rebuttalId: string,
): ArgumentArenaState {
  if (state.outcome || state.round >= state.maxRounds) return state;
  const evidence = ARENA_EVIDENCE.find((item) => item.id === evidenceId);
  const reasoning = ARENA_REASONING.find((item) => item.id === reasoningId);
  const rebuttal = ARENA_REBUTTALS.find((item) => item.id === rebuttalId);
  if (!evidence || !reasoning || !rebuttal) return state;

  const challenge = currentArenaChallenge(state);
  const relevance = evidence.relevance[state.side];
  const credibility = evidence.credibility;
  const fit = reasoningFit(evidence, reasoning);
  const rebuttalStrength = rebuttal.strengthByChallenge[challenge.type];
  const audienceFit = rebuttal.audienceFit.includes(state.audience) ? 1 : 0.62;
  const novelty = state.evidenceUsed.includes(evidence.id) ? 0.15 : 1;

  const breakdown = {
    relevance: Math.round(relevance * 34),
    credibility: Math.round(credibility * 18),
    reasoningFit: Math.round(fit * 22),
    rebuttal: Math.round(rebuttalStrength * 20),
    audience: Math.round(audienceFit * 10),
    novelty: Math.round(novelty * 8),
  };
  const playerPoints = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const opponentPoints = Math.round(64 + state.round * 4 + (1 - rebuttalStrength) * 18);
  const feedback: string[] = [];
  if (relevance >= 0.8) feedback.push("Evidence directly supports your side.");
  else if (relevance < 0.45) feedback.push("This evidence pulls weakly toward your side; explain the limitation or choose a stronger source.");
  if (fit >= 0.8) feedback.push("Your reasoning structure fits the evidence well.");
  else feedback.push("The reasoning link is possible, but another structure would connect this evidence more cleanly.");
  if (rebuttalStrength >= 0.84) feedback.push("Your rebuttal directly answers the opponent's challenge.");
  else feedback.push("Your response only partly answers the objection.");
  if (novelty < 0.5) feedback.push("Repeating the same evidence makes the case easier to attack.");
  if (audienceFit < 1) feedback.push(`This rebuttal style is less persuasive for a ${state.audience} audience.`);

  const exchange: ArenaExchange = {
    round: state.round + 1,
    evidenceId,
    reasoningId,
    rebuttalId,
    challenge,
    playerPoints,
    opponentPoints,
    breakdown,
    feedback,
  };
  const next: ArgumentArenaState = {
    ...state,
    round: state.round + 1,
    score: state.score + playerPoints,
    opponentScore: state.opponentScore + opponentPoints,
    evidenceUsed: [...state.evidenceUsed, evidence.id],
    exchanges: [...state.exchanges, exchange],
  };
  return next.round >= next.maxRounds ? { ...next, outcome: outcomeFor(next) } : next;
}
