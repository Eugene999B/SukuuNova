export type GameQualityTier = "low" | "balanced" | "high";

export type FramePacingSummary = {
  sampleCount: number;
  averageFrameMs: number | null;
  averageFps: number | null;
  p95FrameMs: number | null;
  worstFrameMs: number | null;
  stutterRatio: number;
  recommendedTier: GameQualityTier;
};

export type FramePacingState = {
  samples: number[];
  capacity: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function createFramePacingState(capacity = 180): FramePacingState {
  return { samples: [], capacity: clamp(Math.trunc(capacity), 30, 600) };
}

export function recordFrameTime(state: FramePacingState, frameMs: number) {
  if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 1000) return state;
  state.samples.push(frameMs);
  if (state.samples.length > state.capacity) state.samples.splice(0, state.samples.length - state.capacity);
  return state;
}

function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

/**
 * Stable frame pacing matters more than occasional peak frame rate. Recommendation
 * thresholds intentionally penalise p95 spikes and sustained stutter.
 */
export function summarizeFramePacing(state: FramePacingState): FramePacingSummary {
  const samples = state.samples.filter((sample) => Number.isFinite(sample) && sample > 0);
  if (!samples.length) {
    return {
      sampleCount: 0,
      averageFrameMs: null,
      averageFps: null,
      p95FrameMs: null,
      worstFrameMs: null,
      stutterRatio: 0,
      recommendedTier: "balanced",
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const averageFrameMs = samples.reduce((total, sample) => total + sample, 0) / samples.length;
  const p95FrameMs = percentile(sorted, 0.95) ?? averageFrameMs;
  const worstFrameMs = sorted[sorted.length - 1];
  const stutterThreshold = Math.max(25, averageFrameMs * 1.7);
  const stutterRatio = samples.filter((sample) => sample >= stutterThreshold).length / samples.length;
  const averageFps = 1000 / averageFrameMs;

  let recommendedTier: GameQualityTier = "high";
  if (averageFps < 43 || p95FrameMs > 30 || stutterRatio > 0.08) recommendedTier = "low";
  else if (averageFps < 57 || p95FrameMs > 21 || stutterRatio > 0.035) recommendedTier = "balanced";

  return {
    sampleCount: samples.length,
    averageFrameMs: Number(averageFrameMs.toFixed(3)),
    averageFps: Number(averageFps.toFixed(1)),
    p95FrameMs: Number(p95FrameMs.toFixed(3)),
    worstFrameMs: Number(worstFrameMs.toFixed(3)),
    stutterRatio: Number(stutterRatio.toFixed(4)),
    recommendedTier,
  };
}
