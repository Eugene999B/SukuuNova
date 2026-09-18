import type { FoundryReviewRow } from "./foundry-review";

export type LocalReviewDecision = "approved" | "held";
export type LocalDecisionFilter = "all" | "pending" | LocalReviewDecision;

export type LocalReviewRecord = {
  decision: LocalReviewDecision;
  note: string;
  updatedAt: string;
};

export type LocalReviewMap = Record<string, LocalReviewRecord>;

const MAX_NOTE_LENGTH = 500;

function normalizeNote(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, MAX_NOTE_LENGTH) : "";
}

function normalizeUpdatedAt(value: unknown) {
  if (typeof value !== "string") return "";
  return Number.isNaN(Date.parse(value)) ? "" : value;
}

export function normalizeLocalReviewMap(value: unknown, allowedIds?: Iterable<string>): LocalReviewMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const allowed = allowedIds ? new Set(allowedIds) : null;
  const result: LocalReviewMap = {};

  for (const [id, rawRecord] of Object.entries(value)) {
    if (!id || (allowed && !allowed.has(id))) continue;
    if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) continue;

    const record = rawRecord as Partial<LocalReviewRecord>;
    if (record.decision !== "approved" && record.decision !== "held") continue;

    result[id] = {
      decision: record.decision,
      note: normalizeNote(record.note),
      updatedAt: normalizeUpdatedAt(record.updatedAt),
    };
  }

  return result;
}

export function setLocalReviewDecision(
  current: LocalReviewMap,
  id: string,
  decision: LocalReviewDecision,
  note: string,
  updatedAt: string,
): LocalReviewMap {
  if (!id.trim()) return current;
  return {
    ...current,
    [id]: {
      decision,
      note: normalizeNote(note),
      updatedAt: normalizeUpdatedAt(updatedAt),
    },
  };
}

export function clearLocalReviewDecision(current: LocalReviewMap, id: string): LocalReviewMap {
  if (!(id in current)) return current;
  const next = { ...current };
  delete next[id];
  return next;
}

export function summarizeLocalReviews(rows: FoundryReviewRow[], decisions: LocalReviewMap) {
  let approved = 0;
  let held = 0;

  for (const row of rows) {
    const decision = decisions[row.id]?.decision;
    if (decision === "approved") approved += 1;
    if (decision === "held") held += 1;
  }

  return {
    total: rows.length,
    approved,
    held,
    pending: Math.max(0, rows.length - approved - held),
  };
}

export function filterFoundryRowsByLocalDecision(
  rows: FoundryReviewRow[],
  decisions: LocalReviewMap,
  filter: LocalDecisionFilter,
) {
  if (filter === "all") return rows;
  if (filter === "pending") return rows.filter((row) => !decisions[row.id]);
  return rows.filter((row) => decisions[row.id]?.decision === filter);
}
