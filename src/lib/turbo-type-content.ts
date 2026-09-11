import { randomInt } from "node:crypto";
import type { ArcadeResponseQuestion } from "./arcade-response-content";

const PHRASE_BANK: Record<number, readonly string[]> = {
  1: [
    "Ghana", "learn", "school", "class", "read", "write", "math", "science", "book", "desk", "safe", "focus",
    "ask dad", "sad lad", "all fall", "fast hands", "good work", "keep calm",
  ],
  2: [
    "SukuuNova", "Basic 6", "Kumasi school", "Accra class", "Ready to learn", "Type with care", "Accuracy first",
    "Practice every day", "Keep your eyes up", "Use both hands", "My work is neat", "I can improve",
  ],
  3: [
    "Ready, set, learn!", "Ghana @ 68", "Term 2: Week 5", "Score = 100%", "Save with Ctrl + S", "Room B-12",
    "Accuracy: 95%", "2026-09-11", "safe_passwords", "Name: Ama Osei", "Think, type, check.", "Fast + accurate",
  ],
  4: [
    "Science Lab #4", "Email: class@example.com", "Total = GHS 125.50", "File_Name_v2.docx", "A/B test = 75%",
    "Ctrl + Shift + S", "Use < and > carefully", "Question 7: Why?", "Code: GH-2026-09", "Accuracy > speed",
    "Practice: 15 min/day", "Save & verify!",
  ],
  5: [
    "Accuracy comes before speed; speed grows with practice.",
    "Check the filename, folder, and version before you save.",
    "A careful typist notices capitals, spaces, numbers, and symbols.",
    "Use strong passwords, protect your account, and verify unusual messages.",
    "Learning improves when practice is focused, regular, and challenging.",
    "Type the sentence exactly, then review every character before finishing.",
    "Data becomes useful when it is accurate, organised, and easy to understand.",
    "Good digital habits include saving work and checking trusted sources.",
  ],
};

function shuffle<T>(values: readonly T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = randomInt(index + 1);
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function printableKey(value: unknown) {
  return typeof value === "string" && value.length === 1 && value >= " " && value !== "\u007f";
}

export function turboTypeWeakKeysFromSnapshots(snapshots: unknown[]) {
  const counts = new Map<string, number>();
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) continue;
    const telemetry = (snapshot as Record<string, unknown>).typingTelemetry;
    if (!telemetry || typeof telemetry !== "object" || Array.isArray(telemetry)) continue;
    const keys = (telemetry as Record<string, unknown>).troublesomeKeys;
    if (!Array.isArray(keys)) continue;
    for (const item of keys) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      if (!printableKey(row.key) || typeof row.count !== "number") continue;
      const count = Math.max(0, Math.min(999, Math.trunc(row.count)));
      counts.set(row.key as string, (counts.get(row.key as string) ?? 0) + count);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([key]) => key);
}

export function turboTypeTargetFromPrompt(prompt: string) {
  const marker = "Type this exactly: ";
  const markerIndex = prompt.lastIndexOf(marker);
  return markerIndex >= 0 ? prompt.slice(markerIndex + marker.length) : prompt;
}

export function createTurboTypeQuestions(difficulty: number, length = 5, weakKeys: readonly string[] = []): ArcadeResponseQuestion[] {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeLength = Math.max(1, Math.min(20, Math.trunc(length)));
  const available = Array.from({ length: safeDifficulty }, (_, index) => PHRASE_BANK[index + 1]).flat();
  const safeWeakKeys = weakKeys.filter(printableKey).slice(0, 6) as string[];
  const targeted = safeWeakKeys.length
    ? available.filter((phrase) => safeWeakKeys.some((key) => phrase.toLocaleLowerCase().includes(key.toLocaleLowerCase())))
    : [];
  const general = shuffle(available.filter((phrase) => !targeted.includes(phrase)));
  const focus = shuffle(targeted);
  const desiredTargeted = Math.min(focus.length, Math.ceil(safeLength * 0.6));
  const chosen = [...focus.slice(0, desiredTargeted), ...general.slice(0, safeLength - desiredTargeted)];
  while (chosen.length < safeLength) chosen.push(...shuffle(available).slice(0, safeLength - chosen.length));
  return shuffle(chosen).slice(0, safeLength).map((answer, index) => ({
    id: `turbo-${index}`,
    kind: "typed",
    prompt: `Type this exactly: ${answer}`,
    options: [],
    answer,
    explanation: "Match every character exactly. TurboType rewards accuracy first, then builds speed.",
    caseSensitive: true,
  }));
}
