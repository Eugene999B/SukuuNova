export type ForgePoint = { x: number; y: number };
export type ForgeChallengeId = "courtyard" | "stage" | "tank-pad";

export type ForgeChallenge = {
  id: ForgeChallengeId;
  title: string;
  brief: string;
  targetArea: number;
  areaTolerance: number;
  maxPerimeter: number;
  minVertices: number;
  maxVertices: number;
  requiredRightAngles: number;
};

export type ForgeEvaluation = {
  area: number;
  perimeter: number;
  rightAngles: number;
  selfIntersecting: boolean;
  validVertexCount: boolean;
  areaWithinTarget: boolean;
  perimeterWithinLimit: boolean;
  rightAngleRequirementMet: boolean;
  complete: boolean;
  score: number;
};

export type GeometryForgeState = {
  challengeId: ForgeChallengeId;
  points: ForgePoint[];
  selectedVertex: number | null;
  attempts: number;
  bestScore: number;
};

export const FORGE_GRID = { width: 20, height: 14, snap: 1 } as const;

export const FORGE_CHALLENGES: Record<ForgeChallengeId, ForgeChallenge> = {
  courtyard: {
    id: "courtyard",
    title: "Courtyard plan",
    brief: "Create a usable courtyard close to 48 m² while keeping boundary material at or below 30 m.",
    targetArea: 48,
    areaTolerance: 2,
    maxPerimeter: 30,
    minVertices: 4,
    maxVertices: 6,
    requiredRightAngles: 2,
  },
  stage: {
    id: "stage",
    title: "Community stage",
    brief: "Design a 62 m² performance platform with at least two right-angle corners and no more than 34 m of edge material.",
    targetArea: 62,
    areaTolerance: 3,
    maxPerimeter: 34,
    minVertices: 4,
    maxVertices: 7,
    requiredRightAngles: 2,
  },
  "tank-pad": {
    id: "tank-pad",
    title: "Water-tank foundation",
    brief: "Create a compact 38 m² foundation footprint while holding the perimeter below 26 m and preserving four right-angle corners.",
    targetArea: 38,
    areaTolerance: 2,
    maxPerimeter: 26,
    minVertices: 4,
    maxVertices: 5,
    requiredRightAngles: 4,
  },
};

const STARTING_POINTS: Record<ForgeChallengeId, ForgePoint[]> = {
  courtyard: [{ x: 4, y: 4 }, { x: 12, y: 4 }, { x: 12, y: 10 }, { x: 4, y: 10 }],
  stage: [{ x: 3, y: 3 }, { x: 13, y: 3 }, { x: 13, y: 9 }, { x: 3, y: 9 }],
  "tank-pad": [{ x: 5, y: 4 }, { x: 11, y: 4 }, { x: 11, y: 10 }, { x: 5, y: 10 }],
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const snap = (value: number) => Math.round(value / FORGE_GRID.snap) * FORGE_GRID.snap;

export function createGeometryForgeState(challengeId: ForgeChallengeId = "courtyard"): GeometryForgeState {
  return {
    challengeId,
    points: STARTING_POINTS[challengeId].map((point) => ({ ...point })),
    selectedVertex: null,
    attempts: 0,
    bestScore: 0,
  };
}

export function polygonArea(points: ForgePoint[]) {
  if (points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

export function polygonPerimeter(points: ForgePoint[]) {
  if (points.length < 2) return 0;
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    total += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return total;
}

function orientation(a: ForgePoint, b: ForgePoint, c: ForgePoint) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function segmentsIntersect(a: ForgePoint, b: ForgePoint, c: ForgePoint, d: ForgePoint) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function polygonSelfIntersects(points: ForgePoint[]) {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (first === 0 && secondNext === 0) continue;
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) return true;
    }
  }
  return false;
}

export function countRightAngles(points: ForgePoint[]) {
  if (points.length < 3) return 0;
  let count = 0;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const ax = previous.x - current.x;
    const ay = previous.y - current.y;
    const bx = next.x - current.x;
    const by = next.y - current.y;
    const lengthA = Math.hypot(ax, ay);
    const lengthB = Math.hypot(bx, by);
    if (lengthA === 0 || lengthB === 0) continue;
    const cosine = Math.abs((ax * bx + ay * by) / (lengthA * lengthB));
    if (cosine <= 0.08) count += 1;
  }
  return count;
}

export function evaluateGeometryForge(state: GeometryForgeState): ForgeEvaluation {
  const challenge = FORGE_CHALLENGES[state.challengeId];
  const area = polygonArea(state.points);
  const perimeter = polygonPerimeter(state.points);
  const rightAngles = countRightAngles(state.points);
  const selfIntersecting = polygonSelfIntersects(state.points);
  const validVertexCount = state.points.length >= challenge.minVertices && state.points.length <= challenge.maxVertices;
  const areaError = Math.abs(area - challenge.targetArea);
  const areaWithinTarget = areaError <= challenge.areaTolerance;
  const perimeterWithinLimit = perimeter <= challenge.maxPerimeter;
  const rightAngleRequirementMet = rightAngles >= challenge.requiredRightAngles;
  const complete = !selfIntersecting && validVertexCount && areaWithinTarget && perimeterWithinLimit && rightAngleRequirementMet;

  const areaScore = Math.max(0, 50 - areaError * 6);
  const perimeterScore = Math.max(0, 28 - Math.max(0, perimeter - challenge.maxPerimeter) * 5);
  const angleScore = Math.min(16, rightAngles * 4);
  const simplicityBonus = Math.max(0, 10 - Math.max(0, state.points.length - challenge.minVertices) * 2);
  const invalidPenalty = selfIntersecting || !validVertexCount ? 30 : 0;
  const score = Math.max(0, Math.round(areaScore + perimeterScore + angleScore + simplicityBonus - invalidPenalty));

  return {
    area,
    perimeter,
    rightAngles,
    selfIntersecting,
    validVertexCount,
    areaWithinTarget,
    perimeterWithinLimit,
    rightAngleRequirementMet,
    complete,
    score,
  };
}

export function moveForgeVertex(state: GeometryForgeState, vertexIndex: number, x: number, y: number): GeometryForgeState {
  if (!state.points[vertexIndex]) return state;
  const next = state.points.map((point, index) => index === vertexIndex
    ? { x: snap(clamp(x, 0, FORGE_GRID.width)), y: snap(clamp(y, 0, FORGE_GRID.height)) }
    : point);
  return { ...state, points: next, selectedVertex: vertexIndex };
}

export function addForgeVertex(state: GeometryForgeState): GeometryForgeState {
  const challenge = FORGE_CHALLENGES[state.challengeId];
  if (state.points.length >= challenge.maxVertices) return state;
  let longestIndex = 0;
  let longestLength = -1;
  for (let index = 0; index < state.points.length; index += 1) {
    const current = state.points[index];
    const next = state.points[(index + 1) % state.points.length];
    const length = Math.hypot(next.x - current.x, next.y - current.y);
    if (length > longestLength) {
      longestLength = length;
      longestIndex = index;
    }
  }
  const current = state.points[longestIndex];
  const next = state.points[(longestIndex + 1) % state.points.length];
  const midpoint = { x: snap((current.x + next.x) / 2), y: snap((current.y + next.y) / 2) };
  const points = [...state.points];
  points.splice(longestIndex + 1, 0, midpoint);
  return { ...state, points, selectedVertex: longestIndex + 1 };
}

export function removeForgeVertex(state: GeometryForgeState, vertexIndex = state.selectedVertex): GeometryForgeState {
  const challenge = FORGE_CHALLENGES[state.challengeId];
  if (vertexIndex === null || state.points.length <= challenge.minVertices || !state.points[vertexIndex]) return state;
  return {
    ...state,
    points: state.points.filter((_, index) => index !== vertexIndex),
    selectedVertex: null,
  };
}

export function submitGeometryForge(state: GeometryForgeState): GeometryForgeState {
  const evaluation = evaluateGeometryForge(state);
  return {
    ...state,
    attempts: state.attempts + 1,
    bestScore: Math.max(state.bestScore, evaluation.score),
  };
}
