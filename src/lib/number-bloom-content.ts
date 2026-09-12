import { randomInt } from "node:crypto";
import type { ArcadeWorldQuestion, ArcadeWorldScene } from "./arcade-world-content";
import { numberBloomMaxNumber } from "./number-bloom";

export type NumberBloomChallenge = "count" | "match" | "compare" | "make" | "next";
export type NumberBloomObject = "flower" | "seed" | "ladybird" | "butterfly" | "raindrop";

export type NumberBloomScene = ArcadeWorldScene & {
  bloomChallenge: NumberBloomChallenge;
  gardenPatch: string;
  objectKind: NumberBloomObject;
  targetNumber?: number;
  shownCount?: number;
  leftCount?: number;
  rightCount?: number;
  startCount?: number;
  sequenceStart?: number;
  visualInstruction: string;
};

export type NumberBloomQuestion = ArcadeWorldQuestion & {
  conceptKey: string;
  scene: NumberBloomScene;
};

const PATCHES = ["Daisy Patch", "Sunflower Corner", "Ladybird Lane", "Rain Garden", "Butterfly Meadow", "Seedling Bed"] as const;
const OBJECTS: NumberBloomObject[] = ["flower", "seed", "ladybird", "butterfly", "raindrop"];

function shuffle<T>(values: readonly T[]) {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function between(min: number, max: number) {
  if (max <= min) return min;
  return min + randomInt(max - min + 1);
}

function numberOptions(answer: number, max: number) {
  const pool: number[] = [];
  for (let value = 0; value <= Math.max(4, max); value += 1) if (value !== answer) pool.push(value);
  return shuffle([String(answer), ...shuffle(pool).slice(0, 3).map(String)]);
}

function challengeFor(level: number, index: number): NumberBloomChallenge {
  const available: NumberBloomChallenge[] = level <= 1
    ? ["count", "match"]
    : level === 2
      ? ["count", "match", "compare"]
      : level === 3
        ? ["count", "match", "compare", "make"]
        : ["count", "match", "compare", "make", "next"];
  return available[index % available.length] ?? "count";
}

export function createNumberBloomQuestions(difficulty: number, length = 5): NumberBloomQuestion[] {
  const level = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const maxNumber = numberBloomMaxNumber(level);
  const count = Math.max(1, Math.min(20, Math.trunc(length)));
  const order = shuffle(Array.from({ length: count }, (_, index) => challengeFor(level, index)));

  return order.map((challenge, index) => {
    const patch = PATCHES[(index + randomInt(PATCHES.length)) % PATCHES.length] ?? PATCHES[0];
    const objectKind = OBJECTS[(index + randomInt(OBJECTS.length)) % OBJECTS.length] ?? "flower";
    const baseScene = {
      boardTitle: "Number Bloom",
      bloomChallenge: challenge,
      gardenPatch: patch,
      objectKind,
      meterLabels: [patch, `Numbers to ${maxNumber}`, "Take your time"],
    } satisfies Partial<NumberBloomScene>;

    if (challenge === "count") {
      const shownCount = between(1, maxNumber);
      return {
        id: String(index), kind: "simulation", prompt: "How many do you see?", answer: String(shownCount), options: numberOptions(shownCount, maxNumber),
        explanation: `There are ${shownCount}. Touching each object once is a good way to count carefully.`,
        conceptKey: `number-bloom:count:${shownCount}`,
        scene: { ...baseScene, visualInstruction: "Count each one once.", shownCount, cue: "Point to each object once while you count aloud." } as NumberBloomScene,
      };
    }

    if (challenge === "match") {
      const targetNumber = between(1, maxNumber);
      return {
        id: String(index), kind: "simulation", prompt: `Grow ${targetNumber}.`, answer: String(targetNumber), options: numberOptions(targetNumber, maxNumber),
        explanation: `The numeral ${targetNumber} matches a group of ${targetNumber} objects.`,
        conceptKey: `number-bloom:match:${targetNumber}`,
        scene: { ...baseScene, visualInstruction: "Find the group that matches the big number.", targetNumber, cue: "Say the big number, then count each group one object at a time." } as NumberBloomScene,
      };
    }

    if (challenge === "compare") {
      const leftCount = between(1, maxNumber);
      const makeEqual = randomInt(4) === 0;
      let rightCount = makeEqual ? leftCount : between(1, maxNumber);
      if (!makeEqual && rightCount === leftCount) rightCount = leftCount === maxNumber ? Math.max(1, leftCount - 1) : leftCount + 1;
      const answer = leftCount === rightCount ? "same" : leftCount > rightCount ? "left" : "right";
      return {
        id: String(index), kind: "simulation", prompt: "Which garden has more?", answer, options: shuffle(["left", "same", "right"]),
        explanation: leftCount === rightCount ? `Both gardens have ${leftCount}, so they have the same amount.` : `One garden has ${leftCount} and the other has ${rightCount}. The larger group has more.`,
        conceptKey: `number-bloom:compare:${leftCount}:${rightCount}`,
        scene: { ...baseScene, visualInstruction: "Look at both groups. Choose the fuller garden — or the middle sign if they match.", leftCount, rightCount, cue: "Match objects one-to-one. The side with objects left over has more." } as NumberBloomScene,
      };
    }

    if (challenge === "make") {
      const targetNumber = between(2, maxNumber);
      const startCount = between(1, Math.max(1, targetNumber - 1));
      const needed = targetNumber - startCount;
      return {
        id: String(index), kind: "simulation", prompt: `Make ${targetNumber}.`, answer: String(needed), options: numberOptions(needed, Math.max(maxNumber, targetNumber)),
        explanation: `${startCount} and ${needed} more make ${targetNumber}.`,
        conceptKey: `number-bloom:make:${startCount}:${targetNumber}`,
        scene: { ...baseScene, visualInstruction: "How many more should grow?", targetNumber, startCount, cue: "Start with what is already growing, then count up until you reach the big number." } as NumberBloomScene,
      };
    }

    const sequenceStart = between(0, Math.max(0, maxNumber - 1));
    const answer = Math.min(maxNumber, sequenceStart + 1);
    return {
      id: String(index), kind: "simulation", prompt: "What number comes next?", answer: String(answer), options: numberOptions(answer, maxNumber),
      explanation: `${sequenceStart} is followed by ${answer} when we count forward by one.`,
      conceptKey: `number-bloom:next:${sequenceStart}`,
      scene: { ...baseScene, visualInstruction: "Follow the stepping stones one step forward.", sequenceStart, cue: "Say the number you see, then count one more step." } as NumberBloomScene,
    };
  });
}
