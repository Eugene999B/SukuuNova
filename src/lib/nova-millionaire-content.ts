import { randomInt } from "node:crypto";
import type { ArcadeQuestion } from "./arcade-content";

export type NovaMillionaireSceneMode = "pattern-wall" | "case-file" | "code-vault" | "analogy-bridge" | "evidence-desk" | "rule-gate" | "order-track" | "logic-switch";
export type NovaMillionaireScene = {
  mode: NovaMillionaireSceneMode;
  title: string;
  instruction: string;
  clues?: string[];
  chips?: string[];
  intensity: "warmup" | "rising" | "spotlight" | "crown";
};
export type NovaMillionaireQuestion = ArcadeQuestion & {
  kind: "millionaire";
  conceptKey: string;
  scene: NovaMillionaireScene;
};

type Row = {
  prompt: string;
  answer: string;
  distractors: string[];
  explanation: string;
  concept: string;
  scene: NovaMillionaireScene;
};

const PEOPLE = ["Ama", "Kojo", "Esi", "Yaw", "Abena", "Kofi", "Sena", "Adwoa"] as const;
const OBJECTS = ["drum", "book", "ball", "kite", "torch", "shell", "badge", "map"] as const;

function clampLevel(value: number) { return Math.max(1, Math.min(5, Math.trunc(value))); }
function shuffle<T>(values: readonly T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}
function options(answer: string, distractors: readonly string[]) {
  const unique = Array.from(new Set([answer, ...distractors].map((value) => value.trim()).filter(Boolean)));
  while (unique.length < 4) unique.push(`Not enough information ${unique.length}`);
  return shuffle(unique.slice(0, 4));
}
function build(index: number, row: Row): NovaMillionaireQuestion {
  return {
    id: String(index),
    kind: "millionaire",
    prompt: row.prompt,
    answer: row.answer,
    options: options(row.answer, row.distractors),
    explanation: row.explanation,
    conceptKey: row.concept,
    scene: row.scene,
  };
}
function intensity(index: number, length: number): NovaMillionaireScene["intensity"] {
  const ratio = (index + 1) / Math.max(1, length);
  if (ratio >= .9) return "crown";
  if (ratio >= .6) return "spotlight";
  if (ratio >= .3) return "rising";
  return "warmup";
}
function scene(mode: NovaMillionaireSceneMode, title: string, instruction: string, index: number, length: number, clues?: string[], chips?: string[]): NovaMillionaireScene {
  return { mode, title, instruction, clues, chips, intensity: intensity(index, length) };
}

function patternQuestion(index: number, level: number, length: number): Row {
  const visual = [
    ["sun", "moon", "sun", "moon", "sun"],
    ["circle", "circle", "star", "circle", "circle", "star"],
    ["red", "blue", "green", "red", "blue", "green"],
  ];
  if (level <= 2) {
    const sequence = visual[randomInt(visual.length)];
    const shown = sequence.slice(0, sequence.length - 1);
    const answer = sequence.at(-1)!;
    return {
      prompt: `Complete the pattern: ${shown.join("  •  ")}  •  ?`,
      answer,
      distractors: shuffle(["sun", "moon", "circle", "star", "red", "blue", "green"]).filter((item) => item !== answer).slice(0, 3),
      explanation: `The pattern repeats in the same order, so the next item is ${answer}.`,
      concept: `millionaire:pattern:${sequence.join("-")}`,
      scene: scene("pattern-wall", "Pattern Wall", "Spot the repeating rule before choosing.", index, length, shown),
    };
  }
  const start = randomInt(2, 10);
  const step = randomInt(2, 6);
  if (level === 3) {
    const seq = [start, start + step, start + step * 2, start + step * 3];
    const answer = String(start + step * 4);
    return {
      prompt: `A signal climbs by the same amount: ${seq.join(", ")}, ?`,
      answer,
      distractors: [String(Number(answer) + 1), String(Number(answer) - 1), String(Number(answer) + step)],
      explanation: `Each signal rises by ${step}. Add ${step} once more to get ${answer}.`,
      concept: `millionaire:pattern:constant:${step}:${start}`,
      scene: scene("pattern-wall", "Signal Pattern", "Find the rule connecting every step, not just the last two.", index, length, seq.map(String)),
    };
  }
  const base = randomInt(2, 6);
  const seq = level === 4 ? [base, base * 2, base * 4, base * 8] : [base, base + 2, base + 6, base + 12];
  const answer = String(level === 4 ? base * 16 : base + 20);
  return {
    prompt: `Which value completes this spotlight pattern: ${seq.join(", ")}, ?`,
    answer,
    distractors: [String(Number(answer) + 2), String(Math.max(0, Number(answer) - 2)), String(Number(answer) + base)],
    explanation: level === 4 ? `Each value doubles, so ${seq.at(-1)} doubles to ${answer}.` : `The jumps are +2, +4, +6, then +8, giving ${answer}.`,
    concept: `millionaire:pattern:${level}:${base}`,
    scene: scene("pattern-wall", "Master Pattern", "Compare the size of every jump before locking.", index, length, seq.map(String)),
  };
}

function deductionQuestion(index: number, level: number, length: number): Row {
  const [a, b, c] = shuffle(PEOPLE).slice(0, 3);
  const [x, y, z] = shuffle(OBJECTS).slice(0, 3);
  if (level <= 2) {
    return {
      prompt: `${a}, ${b}, and ${c} each chose one different item. ${b} chose the ${y}. ${c} chose the ${z}. What did ${a} choose?`,
      answer: x,
      distractors: [y, z, "The same item as everyone"],
      explanation: `${b} already has the ${y} and ${c} has the ${z}; the only item left for ${a} is the ${x}.`,
      concept: `millionaire:deduction:leftover:${x}:${y}:${z}`,
      scene: scene("case-file", "Case File", "Use every clue. Each person must have a different item.", index, length, [`${b} → ${y}`, `${c} → ${z}`, `${a} → ?`]),
    };
  }
  const positions = ["first", "second", "third"];
  return {
    prompt: `${a} finished before ${b}. ${c} finished after ${b}. Which finishing order must be correct?`,
    answer: `${a}, ${b}, ${c}`,
    distractors: [`${b}, ${a}, ${c}`, `${c}, ${b}, ${a}`, `${a}, ${c}, ${b}`],
    explanation: `${a} must be before ${b}, and ${b} must be before ${c}; therefore the only possible order is ${a}, ${b}, ${c}.`,
    concept: `millionaire:deduction:order:${a}:${b}:${c}`,
    scene: scene("case-file", "Deduction Desk", "Build the order from the clues, then test every option.", index, length, [`${a} before ${b}`, `${c} after ${b}`], positions),
  };
}

function codeQuestion(index: number, level: number, length: number): Row {
  const a = randomInt(2, 7);
  const b = randomInt(3, 9);
  if (level <= 2) {
    const answer = String(a + b);
    return {
      prompt: `The vault says ◆ = ${a} and ● = ${b}. What code does ◆ + ● make?`,
      answer,
      distractors: [String(a * b), String(Math.abs(a - b)), String(a + b + 1)],
      explanation: `Replace the symbols with their values: ${a} + ${b} = ${answer}.`,
      concept: `millionaire:code:add:${a}:${b}`,
      scene: scene("code-vault", "Code Vault", "Decode the symbols before doing the operation.", index, length, [`◆ = ${a}`, `● = ${b}`]),
    };
  }
  const c = randomInt(2, 6);
  const answer = String(a * b - c);
  return {
    prompt: `Vault rule: ◆ = ${a}, ● = ${b}, ▲ = ${c}. What is (◆ × ●) − ▲?`,
    answer,
    distractors: [String(a * (b - c)), String(a + b - c), String(a * b + c)],
    explanation: `Substitute first: (${a} × ${b}) − ${c} = ${answer}.`,
    concept: `millionaire:code:mixed:${a}:${b}:${c}`,
    scene: scene("code-vault", "Cipher Chamber", "Decode first. Then follow the operation signs in order.", index, length, [`◆ ${a}`, `● ${b}`, `▲ ${c}`]),
  };
}

function analogyQuestion(index: number, level: number, length: number): Row {
  const rows = level <= 2 ? [
    ["Bird is to nest as bee is to…", "hive", "river", "cave", "leaf", "A nest is a bird's home; a hive is a bee's home."],
    ["Finger is to hand as toe is to…", "foot", "head", "arm", "knee", "A finger is part of a hand; a toe is part of a foot."],
    ["Book is to reading as song is to…", "listening", "painting", "measuring", "planting", "We read a book and listen to a song."],
  ] : [
    ["Compass is to direction as thermometer is to…", "temperature", "distance", "mass", "speed", "A compass indicates direction; a thermometer measures temperature."],
    ["Evidence is to conclusion as clue is to…", "solution", "decoration", "weather", "volume", "Evidence supports a conclusion; a clue supports a solution."],
    ["Blueprint is to building as recipe is to…", "meal", "library", "journey", "instrument", "A blueprint guides construction; a recipe guides preparation of a meal."],
  ];
  const row = rows[randomInt(rows.length)];
  return {
    prompt: row[0], answer: row[1], distractors: row.slice(2, 5), explanation: row[5],
    concept: `millionaire:analogy:${row[0]}`,
    scene: scene("analogy-bridge", "Analogy Bridge", "Name the relationship in the first pair, then reuse it.", index, length),
  };
}

function evidenceQuestion(index: number, level: number, length: number): Row {
  if (level <= 2) {
    return {
      prompt: "A plant beside the window grew taller than the same type of plant kept in a dark cupboard. Which conclusion is best supported?",
      answer: "Light can affect plant growth.",
      distractors: ["All plants must grow at exactly the same speed.", "Cupboards make plants taller.", "The taller plant received no light."],
      explanation: "The compared plants differed in access to light, so the observation supports a link between light and growth.",
      concept: "millionaire:evidence:plant-light",
      scene: scene("evidence-desk", "Evidence Desk", "Choose what the evidence supports—not what merely sounds possible.", index, length, ["Window plant: taller", "Cupboard plant: shorter"]),
    };
  }
  return {
    prompt: "Three buses used the same route. Bus A arrived in 32 minutes, Bus B in 31 minutes, and Bus C in 33 minutes. Which claim is justified by these observations?",
    answer: "The route took about 32 minutes in these three trips.",
    distractors: ["The route will always take exactly 32 minutes.", "Bus B is always the fastest bus.", "Traffic never affects this route."],
    explanation: "The three recorded times cluster around 32 minutes, but three trips cannot justify an 'always' claim.",
    concept: "millionaire:evidence:bus-times",
    scene: scene("evidence-desk", "Evidence Desk", "Separate what was observed from claims that go beyond the data.", index, length, ["32 min", "31 min", "33 min"]),
  };
}

function ruleQuestion(index: number, level: number, length: number): Row {
  if (level <= 2) {
    return {
      prompt: "Rule Gate: an object may enter only if it can roll AND is smaller than a school desk. Which object definitely passes?",
      answer: "A tennis ball",
      distractors: ["A classroom door", "A flat exercise book", "A tall cupboard"],
      explanation: "A tennis ball can roll and is smaller than a desk, so it satisfies both parts of the rule.",
      concept: "millionaire:rule:roll-small",
      scene: scene("rule-gate", "Rule Gate", "An option must satisfy every condition, not just one.", index, length, ["CAN ROLL", "SMALLER THAN A DESK"]),
    };
  }
  return {
    prompt: "Research Gate: a sample is accepted only if it is renewable, produces electricity, and does not burn fuel while operating. Which option fits all three conditions?",
    answer: "A solar panel",
    distractors: ["A diesel generator", "A charcoal stove", "A petrol motor"],
    explanation: "A solar panel uses renewable sunlight to produce electricity without burning fuel during operation.",
    concept: "millionaire:rule:renewable-electricity",
    scene: scene("rule-gate", "Triple Rule Gate", "Test each option against all three conditions before locking.", index, length, ["RENEWABLE", "MAKES ELECTRICITY", "NO FUEL BURNED IN USE"]),
  };
}

function orderQuestion(index: number, level: number, length: number): Row {
  const [a, b, c, d] = shuffle(PEOPLE).slice(0, 4);
  if (level <= 2) {
    return {
      prompt: `${a} stands before ${b}, and ${b} stands before ${c}. Who must be before ${c}?`,
      answer: b,
      distractors: [c, d, "No one"],
      explanation: `The clue directly says ${b} stands before ${c}.`,
      concept: `millionaire:order:direct:${a}:${b}:${c}`,
      scene: scene("order-track", "Order Track", "Place the clues on one line before choosing.", index, length, [`${a} → ${b}`, `${b} → ${c}`]),
    };
  }
  return {
    prompt: `${a} is ahead of ${b}. ${c} is behind ${b}. ${d} is ahead of ${a}. Which person must be first among these four?`,
    answer: d,
    distractors: [a, b, c],
    explanation: `${d} is ahead of ${a}, who is ahead of ${b}, who is ahead of ${c}; therefore ${d} must be first.`,
    concept: `millionaire:order:chain:${a}:${b}:${c}:${d}`,
    scene: scene("order-track", "Order Track", "Link the clues into one chain; do not solve them separately.", index, length, [`${d} before ${a}`, `${a} before ${b}`, `${b} before ${c}`]),
  };
}

function conditionalQuestion(index: number, level: number, length: number): Row {
  if (level <= 2) {
    return {
      prompt: "Every silver pass opens the library door. Kofi's pass is silver. What must be true?",
      answer: "Kofi's pass opens the library door.",
      distractors: ["Every pass is silver.", "Kofi owns the library.", "Only Kofi may enter the library."],
      explanation: "The rule applies to every silver pass, and Kofi's pass is silver.",
      concept: "millionaire:conditional:silver-pass",
      scene: scene("logic-switch", "Logic Switch", "Use only what the rule guarantees.", index, length, ["ALL SILVER PASSES → OPEN", "KOFI'S PASS → SILVER"]),
    };
  }
  return {
    prompt: "If the alarm is armed, the blue light is on. The blue light is off. Which conclusion is logically valid?",
    answer: "The alarm is not armed.",
    distractors: ["The alarm is definitely broken.", "The blue light is always off.", "The building has no electricity."],
    explanation: "If an armed alarm guarantees a blue light, an off blue light rules out the alarm being armed.",
    concept: "millionaire:conditional:contrapositive",
    scene: scene("logic-switch", "Logic Switch", "Ask what the rule forces to be true, not what might be true.", index, length, ["ARMED → BLUE LIGHT ON", "BLUE LIGHT OFF"]),
  };
}

const BUILDERS = [patternQuestion, deductionQuestion, codeQuestion, analogyQuestion, evidenceQuestion, ruleQuestion, orderQuestion, conditionalQuestion] as const;

export function createNovaMillionaireQuestions(difficulty: number, length = 10): NovaMillionaireQuestion[] {
  const safeLength = Math.max(1, Math.min(20, Math.trunc(length)));
  const base = clampLevel(difficulty);
  const offset = randomInt(BUILDERS.length);
  return Array.from({ length: safeLength }, (_, index) => {
    const builder = BUILDERS[(index + offset) % BUILDERS.length];
    const rise = safeLength >= 8 ? Math.floor(index / Math.max(2, Math.floor(safeLength / 3))) : 0;
    const level = clampLevel(base + Math.min(2, rise));
    return build(index, builder(index, level, safeLength));
  });
}
