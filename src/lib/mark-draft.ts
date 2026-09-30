import type { MarkStatus } from "./mark-sheet-input";

export type DraftSnapshot = { id: string; value: number; status: string; enteredAt: string } | null;
export type MarkDraft = { version: 2; value: string; status: MarkStatus; expected: DraftSnapshot };
export function validMarkDraft(value: unknown): value is MarkDraft {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<MarkDraft>;
  if (row.version !== 2 || typeof row.value !== "string" || !["present", "absent", "excused"].includes(row.status ?? "")) return false;
  const s = row.expected;
  return s === null || Boolean(s && typeof s.id === "string" && Number.isFinite(s.value) &&
    ["present", "absent", "excused"].includes(s.status) && typeof s.enteredAt === "string" && Number.isFinite(Date.parse(s.enteredAt)));
}
export function markDraftKey(schoolId: string, userId: string, assessmentId: string) {
  return "sukuunova:mark-sheet:v2:" + [schoolId, userId, assessmentId].map(encodeURIComponent).join(":");
}
