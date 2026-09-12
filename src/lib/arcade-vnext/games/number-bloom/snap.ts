export type NumberBloomSnapRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type NumberBloomSnapCandidate = {
  containerId: string;
  slot: number;
  rect: NumberBloomSnapRect;
};

export type NumberBloomSnapTarget = {
  containerId: string;
  slot: number;
  distance: number;
};

export const NUMBER_BLOOM_SNAP_RADIUS_PX = 48;

export function distanceFromPointToRect(x: number, y: number, rect: NumberBloomSnapRect) {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

export function findNearestNumberBloomSnap(
  x: number,
  y: number,
  candidates: readonly NumberBloomSnapCandidate[],
  radius = NUMBER_BLOOM_SNAP_RADIUS_PX,
): NumberBloomSnapTarget | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return null;

  let best: NumberBloomSnapTarget | null = null;
  for (const candidate of candidates) {
    const distance = distanceFromPointToRect(x, y, candidate.rect);
    if (distance > radius) continue;
    if (!best || distance < best.distance) {
      best = { containerId: candidate.containerId, slot: candidate.slot, distance };
    }
  }
  return best;
}
