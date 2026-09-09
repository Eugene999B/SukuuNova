export const SIGNATURE_VECTOR_VERSION = "sukuunova-signature-vector-v1" as const;

export type SignaturePointerType = "mouse" | "pen" | "touch" | "unknown";

export type SignatureVectorPoint = {
  x: number;
  y: number;
  t: number;
  pressure: number;
  pointerType: SignaturePointerType;
};

export type SignatureVectorStroke = {
  id: string;
  width: number;
  points: SignatureVectorPoint[];
};

export type SignatureVectorEvidence = {
  version: typeof SIGNATURE_VECTOR_VERSION;
  sourceWidth: number;
  sourceHeight: number;
  strokes: SignatureVectorStroke[];
  strokeCount: number;
  pointCount: number;
  durationMs: number;
};

export type RawSignaturePoint = {
  x: number;
  y: number;
  time: number;
  pressure: number;
  pointerType: SignaturePointerType;
};

export type RawSignatureStroke = {
  points: RawSignaturePoint[];
  width: number;
};

const MAX_STROKES = 128;
const MAX_POINTS = 10_000;
const MAX_DURATION_MS = 10 * 60 * 1000;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function pointerType(value: unknown): SignaturePointerType {
  return value === "mouse" || value === "pen" || value === "touch" ? value : "unknown";
}

function strokeDuration(stroke: RawSignatureStroke) {
  if (stroke.points.length < 2) return 0;
  return Math.max(0, stroke.points[stroke.points.length - 1].time - stroke.points[0].time);
}

export function createSignatureVectorEvidence(
  strokes: RawSignatureStroke[],
  sourceWidth: number,
  sourceHeight: number,
): SignatureVectorEvidence | null {
  if (!strokes.length || !(sourceWidth > 0) || !(sourceHeight > 0)) return null;
  const safeStrokes = strokes.slice(0, MAX_STROKES);
  let pointBudget = MAX_POINTS;
  const normalized: SignatureVectorStroke[] = [];
  let timelineOffset = 0;

  for (let strokeIndex = 0; strokeIndex < safeStrokes.length && pointBudget > 0; strokeIndex += 1) {
    const stroke = safeStrokes[strokeIndex];
    if (!stroke.points.length) continue;
    const firstTime = finite(stroke.points[0].time) ? stroke.points[0].time : 0;
    const points: SignatureVectorPoint[] = [];
    for (const raw of stroke.points.slice(0, pointBudget)) {
      if (!finite(raw.x) || !finite(raw.y)) continue;
      points.push({
        x: round(clamp(raw.x / sourceWidth, 0, 1), 6),
        y: round(clamp(raw.y / sourceHeight, 0, 1), 6),
        t: Math.round(clamp((finite(raw.time) ? raw.time : firstTime) - firstTime + timelineOffset, 0, MAX_DURATION_MS)),
        pressure: round(clamp(finite(raw.pressure) ? raw.pressure : 0.5, 0, 1), 4),
        pointerType: pointerType(raw.pointerType),
      });
    }
    if (!points.length) continue;
    pointBudget -= points.length;
    normalized.push({
      id: `s${normalized.length}`,
      width: round(clamp(stroke.width / sourceHeight, 0.0005, 0.1), 6),
      points,
    });
    timelineOffset += Math.round(clamp(strokeDuration(stroke), 0, MAX_DURATION_MS - timelineOffset));
  }

  if (!normalized.length) return null;
  const pointCount = normalized.reduce((sum, stroke) => sum + stroke.points.length, 0);
  const durationMs = normalized.reduce((max, stroke) => Math.max(max, stroke.points.at(-1)?.t ?? 0), 0);
  return {
    version: SIGNATURE_VECTOR_VERSION,
    sourceWidth: Math.round(sourceWidth),
    sourceHeight: Math.round(sourceHeight),
    strokes: normalized,
    strokeCount: normalized.length,
    pointCount,
    durationMs,
  };
}

export function restoreSignatureStrokes(
  evidence: SignatureVectorEvidence,
  targetWidth: number,
  targetHeight: number,
): RawSignatureStroke[] {
  return evidence.strokes.map((stroke) => {
    const firstT = stroke.points[0]?.t ?? 0;
    return {
      width: stroke.width * targetHeight,
      points: stroke.points.map((point) => ({
        x: point.x * targetWidth,
        y: point.y * targetHeight,
        time: point.t - firstT,
        pressure: point.pressure,
        pointerType: point.pointerType,
      })),
    };
  });
}

export function parseSignatureVectorEvidence(value: unknown): SignatureVectorEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.version !== SIGNATURE_VECTOR_VERSION) return null;
  if (!finite(row.sourceWidth) || !finite(row.sourceHeight) || row.sourceWidth <= 0 || row.sourceHeight <= 0) return null;
  if (!Array.isArray(row.strokes) || row.strokes.length < 1 || row.strokes.length > MAX_STROKES) return null;

  const strokes: SignatureVectorStroke[] = [];
  let pointCount = 0;
  for (let strokeIndex = 0; strokeIndex < row.strokes.length; strokeIndex += 1) {
    const rawStroke = row.strokes[strokeIndex];
    if (!rawStroke || typeof rawStroke !== "object" || Array.isArray(rawStroke)) return null;
    const strokeRow = rawStroke as Record<string, unknown>;
    if (!finite(strokeRow.width) || strokeRow.width < 0.0005 || strokeRow.width > 0.1 || !Array.isArray(strokeRow.points) || !strokeRow.points.length) return null;
    const points: SignatureVectorPoint[] = [];
    for (const rawPoint of strokeRow.points) {
      if (!rawPoint || typeof rawPoint !== "object" || Array.isArray(rawPoint)) return null;
      const pointRow = rawPoint as Record<string, unknown>;
      if (!finite(pointRow.x) || !finite(pointRow.y) || pointRow.x < 0 || pointRow.x > 1 || pointRow.y < 0 || pointRow.y > 1) return null;
      if (!finite(pointRow.t) || pointRow.t < 0 || pointRow.t > MAX_DURATION_MS) return null;
      if (!finite(pointRow.pressure) || pointRow.pressure < 0 || pointRow.pressure > 1) return null;
      points.push({
        x: round(pointRow.x, 6),
        y: round(pointRow.y, 6),
        t: Math.round(pointRow.t),
        pressure: round(pointRow.pressure, 4),
        pointerType: pointerType(pointRow.pointerType),
      });
      pointCount += 1;
      if (pointCount > MAX_POINTS) return null;
    }
    strokes.push({ id: `s${strokeIndex}`, width: round(strokeRow.width, 6), points });
  }

  const durationMs = strokes.reduce((max, stroke) => Math.max(max, stroke.points.at(-1)?.t ?? 0), 0);
  return {
    version: SIGNATURE_VECTOR_VERSION,
    sourceWidth: Math.round(row.sourceWidth),
    sourceHeight: Math.round(row.sourceHeight),
    strokes,
    strokeCount: strokes.length,
    pointCount,
    durationMs,
  };
}

export function canonicalSignatureVector(evidence: SignatureVectorEvidence) {
  const parsed = parseSignatureVectorEvidence(evidence);
  if (!parsed) throw new Error("Signature vector evidence is invalid.");
  return JSON.stringify({
    version: parsed.version,
    sourceWidth: parsed.sourceWidth,
    sourceHeight: parsed.sourceHeight,
    strokeCount: parsed.strokeCount,
    pointCount: parsed.pointCount,
    durationMs: parsed.durationMs,
    strokes: parsed.strokes.map((stroke) => ({
      id: stroke.id,
      width: stroke.width,
      points: stroke.points.map((point) => ({
        x: point.x,
        y: point.y,
        t: point.t,
        pressure: point.pressure,
        pointerType: point.pointerType,
      })),
    })),
  });
}
