export type IntelligenceSeverity = "positive" | "info" | "warning" | "critical";
export type IntelligenceConfidence = "high" | "medium" | "low";

export type IntelligenceSignal = {
  id: string;
  title: string;
  detail: string;
  severity: IntelligenceSeverity;
  confidence: IntelligenceConfidence;
  metric?: string;
  evidence?: string[];
  href?: string;
  actionLabel?: string;
};

export type IntelligenceRecommendation = {
  id: string;
  title: string;
  detail: string;
  priority: "now" | "soon" | "monitor";
  href?: string;
  actionLabel?: string;
};

export type IntelligenceForecast = {
  label: string;
  value: number;
  unit: "currency" | "percent" | "count";
  confidence: IntelligenceConfidence;
  basis: string;
  caveat: string;
};

export type IntelligenceComponent = {
  label: string;
  score: number | null;
  weight: number;
  detail: string;
};

export type DecisionIntelligence = {
  headline: string;
  summary: string;
  score: number | null;
  label: string;
  components: IntelligenceComponent[];
  signals: IntelligenceSignal[];
  recommendations: IntelligenceRecommendation[];
  forecasts: IntelligenceForecast[];
};

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

export function percentChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function pointDelta(current: number, previous: number) {
  return Math.round((current - previous) * 10) / 10;
}

export function confidenceFromSample(sample: number): IntelligenceConfidence {
  if (sample >= 20) return "high";
  if (sample >= 6) return "medium";
  return "low";
}

export function scoreLabel(score: number | null) {
  if (score == null) return "Insufficient data";
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Stable";
  if (score >= 55) return "Needs attention";
  return "Critical attention";
}

export function weightedScore(components: IntelligenceComponent[]) {
  const available = components.filter((item) => item.score != null && item.weight > 0);
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return null;
  const result = available.reduce((sum, item) => sum + clamp(item.score ?? 0) * item.weight, 0) / totalWeight;
  return Math.round(result);
}

export function sortSignals(signals: IntelligenceSignal[]) {
  const rank: Record<IntelligenceSeverity, number> = { critical: 4, warning: 3, positive: 2, info: 1 };
  return [...signals].sort((a, b) => rank[b.severity] - rank[a.severity]);
}

export function priorityForSeverity(severity: IntelligenceSeverity): IntelligenceRecommendation["priority"] {
  if (severity === "critical") return "now";
  if (severity === "warning") return "soon";
  return "monitor";
}

export function trendPhrase(delta: number, unit = "%") {
  if (delta > 0) return `up ${Math.abs(delta)}${unit}`;
  if (delta < 0) return `down ${Math.abs(delta)}${unit}`;
  return "unchanged";
}

export function collectionForecast(currentSevenDays: number, paymentCountSevenDays: number): IntelligenceForecast {
  const dailyVelocity = currentSevenDays / 7;
  return {
    label: "Projected next 30-day collections",
    value: Math.round(dailyVelocity * 30),
    unit: "currency",
    confidence: confidenceFromSample(paymentCountSevenDays),
    basis: `Simple run-rate projection from the last 7 days (${Math.round(dailyVelocity)} per day).`,
    caveat: "This is an estimate, not a guarantee. Fee due dates, term timing and parent payment behaviour can change the result.",
  };
}

export function attendanceWindowRate(rows: Array<{ attendanceDate: Date; studentId: string | null }>, activeStudents: number) {
  if (!activeStudents) return { rate: 0, recordedDays: 0, averagePresent: 0 };
  const byDate = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.studentId) continue;
    const key = row.attendanceDate.toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, new Set());
    byDate.get(key)?.add(row.studentId);
  }
  const recordedDays = byDate.size;
  if (!recordedDays) return { rate: 0, recordedDays: 0, averagePresent: 0 };
  const totalPresent = [...byDate.values()].reduce((sum, ids) => sum + ids.size, 0);
  const averagePresent = Math.round(totalPresent / recordedDays);
  const rate = Math.round((totalPresent / (activeStudents * recordedDays)) * 100);
  return { rate: clamp(rate), recordedDays, averagePresent };
}

type RiskScoreRow = {
  studentId: string;
  studentName: string;
  className: string;
  value: number | null;
  status: string;
  maxScore: number;
};

export type LearnerRisk = {
  studentId: string;
  studentName: string;
  className: string;
  average: number | null;
  assessmentCount: number;
  absentCount: number;
  riskScore: number;
  severity: "low" | "medium" | "high";
  reason: string;
};

export function buildLearnerRisk(rows: RiskScoreRow[], limit = 8): LearnerRisk[] {
  const students = new Map<string, { name: string; className: string; earned: number; possible: number; assessments: number; absent: number }>();
  for (const row of rows) {
    const current = students.get(row.studentId) || { name: row.studentName, className: row.className, earned: 0, possible: 0, assessments: 0, absent: 0 };
    if (row.status === "absent") current.absent += 1;
    if (row.status !== "excused" && row.value != null && row.maxScore > 0) {
      current.earned += row.value;
      current.possible += row.maxScore;
      current.assessments += 1;
    }
    students.set(row.studentId, current);
  }

  return [...students.entries()].map(([studentId, item]) => {
    const average = item.possible > 0 ? Math.round((item.earned / item.possible) * 100) : null;
    let riskScore = 0;
    const reasons: string[] = [];
    if (average != null && average < 50) { riskScore += 60; reasons.push(`average is ${average}%`); }
    else if (average != null && average < 65) { riskScore += 38; reasons.push(`average is ${average}%`); }
    else if (average != null && average < 75) { riskScore += 18; reasons.push(`average is ${average}%`); }
    if (item.absent > 0) { riskScore += Math.min(30, item.absent * 8); reasons.push(`${item.absent} missed assessment${item.absent === 1 ? "" : "s"}`); }
    riskScore = clamp(riskScore);
    const severity = riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low";
    return {
      studentId,
      studentName: item.name,
      className: item.className,
      average,
      assessmentCount: item.assessments,
      absentCount: item.absent,
      riskScore,
      severity,
      reason: reasons.length ? reasons.join(" · ") : "No strong academic risk signal in recorded scores.",
    };
  }).filter((item) => item.riskScore > 0).sort((a, b) => b.riskScore - a.riskScore).slice(0, limit);
}

export function classAverage(rows: Array<{ value: number | null; status: string; maxScore: number }>) {
  let earned = 0;
  let possible = 0;
  for (const row of rows) {
    if (row.status === "excused" || row.value == null || row.maxScore <= 0) continue;
    earned += row.value;
    possible += row.maxScore;
  }
  return possible > 0 ? Math.round((earned / possible) * 100) : null;
}
