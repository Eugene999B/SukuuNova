import { randomInt } from "node:crypto";

export const ARCADE_GAMES = ["math", "word", "logic"] as const;
export type ArcadeGame = typeof ARCADE_GAMES[number];
export type ArcadeQuestion = { id: string; prompt: string; options: string[]; answer: string; explanation: string };
export function initialDifficulty(level: string | null) {
  const value = (level ?? "").toLowerCase();
  if (/jhs|junior|grade [7-8]|basic [7-9]/.test(value)) return 3;
  if (/shs|senior|secondary|grade (9|10|11|12)/.test(value)) return 4;
  if (/(primary|basic|grade|p)\s*[4-6]/.test(value)) return 2;
  return 1;
}
export function nextDifficulty(base: number, recent: Array<{ difficulty: number; correct: number }>) {
  if (!recent.length) return base;
  const latest = recent[0].difficulty;
  const same = recent.slice(0, 3).filter(round => round.difficulty === latest);
  if (same.length === 3 && same.every(round => round.correct >= 4)) return Math.min(4, latest + 1);
  if (same.length >= 2 && same.slice(0, 2).every(round => round.correct <= 1)) return Math.max(1, latest - 1);
  return latest;
}
function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
// A separate, versionable bank keeps content out of the renderer. Each entry provides teaching feedback.
const words = [
  [["Choose the word for an animal that meows.", "cat", "sun", "cup", "A cat is an animal that meows."], ["Complete: I can ___ a book.", "read", "eat", "fly", "We read words in a book."], ["Which word rhymes with hat?", "cat", "dog", "pen", "Hat and cat share the ending sound."], ["Choose the opposite of hot.", "cold", "warm", "red", "Cold is the opposite of hot."], ["Which is a colour?", "blue", "jump", "desk", "Blue names a colour."]],
  [["Choose a synonym for happy.", "glad", "sad", "angry", "Glad and happy have similar meanings."], ["Complete: She ___ to school every day.", "walks", "walk", "walking", "Use walks with she in the simple present."], ["Choose the plural of child.", "children", "childs", "childes", "Children is the irregular plural of child."], ["Choose the opposite of generous.", "selfish", "kind", "helpful", "A selfish person is unwilling to share."], ["Which word is a verb?", "discover", "discovery", "discoverer", "Discover describes an action."]],
  [["Choose the word closest to cautious.", "careful", "careless", "speedy", "Cautious means taking care to avoid problems."], ["Complete: Neither answer ___ correct.", "is", "are", "were", "Neither answer is singular."], ["Which sentence uses an adverb?", "She spoke softly.", "She is kind.", "She has a book.", "Softly describes how she spoke."], ["Choose the opposite of scarce.", "abundant", "rare", "limited", "Abundant means available in large quantities."], ["What does infer mean?", "Draw a conclusion from evidence", "Copy a sentence", "Ignore the evidence", "An inference combines evidence with reasoning."]],
  [["Choose the meaning of ambiguous.", "Open to more than one interpretation", "Always false", "Perfectly clear", "Ambiguous language can have multiple meanings."], ["Which is a claim rather than evidence?", "This method is best.", "The test took six minutes.", "Twenty people attended.", "Calling something best needs supporting evidence."], ["Choose the meaning of mitigate.", "Make less severe", "Make certain", "Make larger", "Mitigate means reduce the severity of something."], ["Complete: Had I known, I ___ helped.", "would have", "will have", "would", "A past unreal condition uses would have."], ["Choose the most concise sentence.", "We agreed.", "We came to an agreement together.", "We jointly reached mutual agreement.", "We agreed conveys the same core meaning with fewer words."]]
] as const;
export function createArcadeQuestions(game: ArcadeGame, difficulty: number): ArcadeQuestion[] {
  if (game === "word") return shuffle([...words[difficulty - 1]]).map((row, index) => ({ id: String(index), prompt: row[0], answer: row[1], options: shuffle([row[1], row[2], row[3]]), explanation: row[4] }));
  return Array.from({ length: 5 }, (_, index) => {
    const a = randomInt(2, difficulty === 1 ? 10 : 16), b = randomInt(2, 10);
    let answer: number, prompt: string, explanation: string;
    if (game === "logic") {
      const step = difficulty === 1 ? 1 : difficulty === 2 ? 2 : b;
      const sequence = difficulty === 4 ? [a, a * 2, a * 4] : [a, a + step, a + step * 2];
      answer = difficulty === 4 ? a * 8 : a + step * 3;
      prompt = `What comes next? ${sequence.join(", ")}, …`;
      explanation = difficulty === 4 ? "Multiply each number by 2." : `Add ${step} each time.`;
    } else if (difficulty === 1) {
      answer = a + b; prompt = `${a} + ${b} = ?`; explanation = `Start at ${a} and count on ${b}: ${answer}.`;
    } else if (difficulty === 2) {
      answer = a * b; prompt = `${a} × ${b} = ?`; explanation = `${a} groups of ${b} make ${answer}.`;
    } else if (difficulty === 3) {
      answer = a; prompt = `${a * b} ÷ ${b} = ?`; explanation = `${a} × ${b} = ${a * b}, so the quotient is ${a}.`;
    } else {
      answer = a; prompt = `Solve: ${b}x + ${b} = ${a * b + b}`; explanation = `Subtract ${b}, then divide by ${b}: x = ${a}.`;
    }
    return { id: String(index), prompt, answer: String(answer), options: shuffle([answer, answer + 1, answer + 3, Math.max(0, answer - 2)].map(String)), explanation };
  });
}
export function schoolDay(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
export function learningStreak(days: string[], today: string) {
  const unique = new Set(days);
  const previous = (day: string) => new Date(Date.parse(day + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
  let day = unique.has(today) ? today : previous(today), count = 0;
  while (unique.has(day)) { count++; day = previous(day); }
  return count;
}
