import { catalogFor, type CognitiveChallenge, type LearnQuestion, type SessionConfig } from "./learn-domain";

type LevelProfile = {
  minWhole: number;
  wholeSpan: number;
  multiplierMax: number;
  divisorMax: number;
  roundBase: number;
  difficulty: 1 | 2 | 3 | 4;
};

type Target = { id: string; label: string };

const LEVELS: Record<string, LevelProfile> = {
  "basic-1": { minWhole: 1, wholeSpan: 90, multiplierMax: 5, divisorMax: 5, roundBase: 10, difficulty: 1 },
  "basic-2": { minWhole: 10, wholeSpan: 890, multiplierMax: 10, divisorMax: 10, roundBase: 10, difficulty: 2 },
  "basic-3": { minWhole: 100, wholeSpan: 8_900, multiplierMax: 12, divisorMax: 12, roundBase: 100, difficulty: 2 },
  "basic-4": { minWhole: 1_000, wholeSpan: 89_000, multiplierMax: 25, divisorMax: 20, roundBase: 100, difficulty: 3 },
  "basic-5": { minWhole: 10_000, wholeSpan: 890_000, multiplierMax: 50, divisorMax: 25, roundBase: 1_000, difficulty: 3 },
  "basic-6": { minWhole: 100_000, wholeSpan: 8_900_000, multiplierMax: 100, divisorMax: 50, roundBase: 1_000, difficulty: 4 },
};

const NAMES = ["Ama","Kojo","Esi","Yaw","Akosua","Kofi","Abena","Kwame","Mansa","Sena","Amina","Ibrahim","Afia","Kweku","Araba","Nii"] as const;
const CONTEXTS = [
  "a school library","a class fundraiser","a market project","a school garden","a sports day",
  "a book fair","a community clean-up","a class survey","a canteen record","a science fair",
  "a transport count","a savings activity","a reading club","a school shop","a farming project","a health club",
] as const;

export const PRIMARY_MATH_TOPIC_CAPACITY = 80_000_000;

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function pick<T>(values: readonly T[], seed: number, offset = 0) {
  return values[(seed + offset) % values.length];
}

function whole(profile: LevelProfile, seed: number, offset = 0) {
  return profile.minWhole + ((hash(`${seed}:${offset}`) % Math.max(1, profile.wholeSpan)));
}

function clampDifficulty(base: number, delta = 0): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, base + delta)) as 1 | 2 | 3 | 4 | 5;
}

function options(answer: number, seed: number, step = 1) {
  const values = Array.from(new Set([
    answer,
    answer + step,
    answer - step,
    answer + 2 * step,
    Math.max(0, answer - 2 * step),
  ])).slice(0, 4);
  const shift = seed % values.length;
  const rotated = [...values.slice(shift), ...values.slice(0, shift)];
  return {
    options: rotated.map((value, index) => ({ id: String(index), label: value.toLocaleString("en-GH") })),
    answer: String(rotated.indexOf(answer)),
  };
}

function numericQuestion(input: {
  id: string;
  target: Target;
  config: SessionConfig;
  family: string;
  skill: string;
  prompt: string;
  answer: number;
  explanation: string;
  hint?: string;
  challenge?: CognitiveChallenge;
  difficulty?: number;
  seed: number;
  multipleChoice?: boolean;
  optionStep?: number;
}): LearnQuestion {
  const profile = LEVELS[input.config.levelId];
  const common = {
    id: `primary-math-${input.config.levelId}-${input.target.id}-${input.family}-${input.id}`,
    exposureKey: `primary-math:${input.config.levelId}:${input.target.id}:${input.family}:${input.id}`,
    subject: "Mathematics",
    topic: input.target.label,
    skill: input.skill,
    difficulty: clampDifficulty(input.difficulty ?? profile.difficulty),
    prompt: input.prompt,
    explanation: input.explanation,
    hint: input.hint,
    challenge: input.challenge ?? "Apply",
    mission: "Think like a mathematician",
    generationFamily: `primary-math:${input.config.levelId}:${input.target.id}:${input.family}`,
  } as const;
  if (input.multipleChoice) {
    const choice = options(input.answer, input.seed, input.optionStep ?? Math.max(1, Math.round(Math.abs(input.answer) * 0.08)));
    return { ...common, kind: "single", options: choice.options, answer: choice.answer };
  }
  return { ...common, kind: "numeric", answer: input.answer, acceptedAnswers: [String(input.answer)] };
}

function directOrStory(style: number, direct: string, story: string, check: string) {
  if (style % 3 === 0) return direct;
  if (style % 3 === 1) return story;
  return check;
}

function renderNumber(target: Target, config: SessionConfig, seed: number, position: number): LearnQuestion {
  const profile = LEVELS[config.levelId];
  const family = position % 5;
  const name = pick(NAMES, seed, position);
  const style = hash(`${seed}:style:${position}`) % 6;
  const a = whole(profile, seed, position * 3 + 1);
  const placeOptions = config.levelId === "basic-1" ? [1,10] : config.levelId === "basic-2" ? [1,10,100] : config.levelId === "basic-3" ? [1,10,100,1000] : [1,10,100,1000,10000];
  const place = pick(placeOptions, seed, position);
  const digit = Math.floor(a / place) % 10;

  if (family === 0) {
    const answer = digit * place;
    return numericQuestion({
      id: String(seed), target, config, family: "place-value", skill: "Interpret place value",
      prompt: directOrStory(style,
        `In the number ${a.toLocaleString("en-GH")}, what value does the digit ${digit} represent?`,
        `${name} writes ${a.toLocaleString("en-GH")} on the board and circles the digit ${digit} in the ${place.toLocaleString("en-GH")}s place. What is the value of the circled digit?`,
        `A learner says the digit ${digit} in ${a.toLocaleString("en-GH")} is worth only ${digit}. What value should the learner use instead?`
      ),
      answer, explanation: `The digit ${digit} is in the ${place.toLocaleString("en-GH")}s place, so its value is ${answer.toLocaleString("en-GH")}.`,
      hint: "Use the position of the digit, not only the digit itself.", challenge: style >= 2 ? "Analyse" : "Apply", seed, multipleChoice: style % 2 === 0,
    });
  }

  if (family === 1) {
    const base = config.levelId === "basic-1" ? 10 : profile.roundBase;
    const answer = Math.round(a / base) * base;
    return numericQuestion({
      id: String(seed), target, config, family: "rounding-estimation", skill: "Round whole numbers",
      prompt: directOrStory(style,
        `Round ${a.toLocaleString("en-GH")} to the nearest ${base.toLocaleString("en-GH")}.`,
        `For a quick estimate at ${pick(CONTEXTS, seed, position)}, ${name} rounds ${a.toLocaleString("en-GH")} to the nearest ${base.toLocaleString("en-GH")}. What should the estimate be?`,
        `Which rounded value would be the most sensible estimate for ${a.toLocaleString("en-GH")} to the nearest ${base.toLocaleString("en-GH")}?`
      ),
      answer, explanation: `${a.toLocaleString("en-GH")} rounds to ${answer.toLocaleString("en-GH")} at the nearest ${base.toLocaleString("en-GH")}.`,
      hint: "Look at the digit immediately to the right of the place you are rounding to.", challenge: "Apply", seed, multipleChoice: true, optionStep: base,
    });
  }

  if (family === 2) {
    const b = whole(profile, seed, position * 3 + 2);
    const larger = Math.max(a, b);
    const smaller = Math.min(a, b);
    const answer = larger - smaller;
    return numericQuestion({
      id: String(seed), target, config, family: "compare-distance", skill: "Compare whole numbers",
      prompt: `${name} compares ${a.toLocaleString("en-GH")} and ${b.toLocaleString("en-GH")}. How much greater is the larger number than the smaller number?`,
      answer, explanation: `The difference is ${larger.toLocaleString("en-GH")} − ${smaller.toLocaleString("en-GH")} = ${answer.toLocaleString("en-GH")}.`,
      hint: "Identify the larger number first, then subtract the smaller.", challenge: "Analyse", seed, multipleChoice: style % 2 === 1,
    });
  }

  if (family === 3) {
    const step = Math.max(2, Math.min(profile.multiplierMax, 2 + (hash(`${seed}:step`) % Math.max(2, profile.multiplierMax - 1))));
    const start = Math.max(profile.minWhole, a - 2 * step);
    const answer = start + 4 * step;
    return numericQuestion({
      id: String(seed), target, config, family: "sequence", skill: "Continue a number pattern",
      prompt: `Study the pattern: ${start.toLocaleString("en-GH")}, ${(start + step).toLocaleString("en-GH")}, ${(start + 2 * step).toLocaleString("en-GH")}, ${(start + 3 * step).toLocaleString("en-GH")}, __. What number comes next?`,
      answer, explanation: `Each term increases by ${step}, so the next term is ${answer.toLocaleString("en-GH")}.`,
      hint: "Find the change from one term to the next.", challenge: "Analyse", seed, multipleChoice: style % 2 === 0, optionStep: step,
    });
  }

  const part = 2 + (hash(`${seed}:part`) % 8);
  const answer = a * part;
  return numericQuestion({
    id: String(seed), target, config, family: "compose-decompose", skill: "Compose and decompose numbers",
    prompt: `${name} says that ${part} groups of ${a.toLocaleString("en-GH")} make a total. What is the total?`,
    answer, explanation: `${part} × ${a.toLocaleString("en-GH")} = ${answer.toLocaleString("en-GH")}.`,
    hint: "Think of repeated equal groups.", challenge: "Transfer", seed, multipleChoice: style % 2 === 1, optionStep: Math.max(1, a),
  });
}

function renderOperations(target: Target, config: SessionConfig, seed: number, position: number, multiplicationOnly = false): LearnQuestion {
  const profile = LEVELS[config.levelId];
  const family = position % (multiplicationOnly ? 4 : 6);
  const name = pick(NAMES, seed, position);
  const context = pick(CONTEXTS, seed, position);
  const style = hash(`${seed}:opstyle:${position}`) % 6;
  const a = whole(profile, seed, position * 4 + 1);
  const bRaw = whole(profile, seed, position * 4 + 2);
  const b = Math.max(1, bRaw % Math.max(2, Math.floor(profile.wholeSpan / 3)));
  const multA = Math.max(2, (a % Math.max(3, Math.floor(profile.multiplierMax * 1.7))) + 2);
  const multB = Math.max(2, (bRaw % profile.multiplierMax) + 2);

  if (!multiplicationOnly && family === 0) {
    const answer = a + b;
    return numericQuestion({
      id: String(seed), target, config, family: "addition-context", skill: "Add whole numbers in context",
      prompt: directOrStory(style,
        `Calculate ${a.toLocaleString("en-GH")} + ${b.toLocaleString("en-GH")}.`,
        `At ${context}, one record shows ${a.toLocaleString("en-GH")} items and another shows ${b.toLocaleString("en-GH")} items. What is the combined total?`,
        `${name} estimates a total before adding ${a.toLocaleString("en-GH")} and ${b.toLocaleString("en-GH")}. What exact total should be used to check the estimate?`
      ),
      answer, explanation: `${a.toLocaleString("en-GH")} + ${b.toLocaleString("en-GH")} = ${answer.toLocaleString("en-GH")}.`,
      hint: "Align place values before adding.", seed, multipleChoice: style % 2 === 0,
    });
  }

  if (!multiplicationOnly && family === 1) {
    const larger = a + b;
    const answer = a;
    return numericQuestion({
      id: String(seed), target, config, family: "subtraction-context", skill: "Subtract whole numbers in context",
      prompt: directOrStory(style,
        `Calculate ${larger.toLocaleString("en-GH")} − ${b.toLocaleString("en-GH")}.`,
        `${name}'s class recorded ${larger.toLocaleString("en-GH")} items for ${context}. After ${b.toLocaleString("en-GH")} were removed from the count, how many remained?`,
        `A learner checks ${larger.toLocaleString("en-GH")} − ${b.toLocaleString("en-GH")} by adding the answer back to ${b.toLocaleString("en-GH")}. What answer should make the check return ${larger.toLocaleString("en-GH")}?`
      ),
      answer, explanation: `${larger.toLocaleString("en-GH")} − ${b.toLocaleString("en-GH")} = ${answer.toLocaleString("en-GH")}.`,
      hint: "Use place value and check with addition.", challenge: style >= 2 ? "Analyse" : "Apply", seed, multipleChoice: style % 2 === 1,
    });
  }

  if (family === (multiplicationOnly ? 0 : 2)) {
    const answer = multA * multB;
    return numericQuestion({
      id: String(seed), target, config, family: "multiplication-model", skill: "Use multiplication for equal groups",
      prompt: `${context} has ${multB} equal groups with ${multA.toLocaleString("en-GH")} items in each group. How many items are there altogether?`,
      answer, explanation: `${multB} groups of ${multA.toLocaleString("en-GH")} gives ${multB} × ${multA.toLocaleString("en-GH")} = ${answer.toLocaleString("en-GH")}.`,
      hint: "Equal groups suggest multiplication.", challenge: "Transfer", seed, multipleChoice: style % 2 === 0, optionStep: Math.max(1, multA),
    });
  }

  if (family === (multiplicationOnly ? 1 : 3)) {
    const divisor = 2 + (hash(`${seed}:divisor`) % Math.max(2, profile.divisorMax - 1));
    const quotient = Math.max(2, multA);
    const total = divisor * quotient;
    return numericQuestion({
      id: String(seed), target, config, family: "division-sharing", skill: "Use division for equal sharing",
      prompt: `${name} has ${total.toLocaleString("en-GH")} items to share equally among ${divisor} groups. How many items should each group receive?`,
      answer: quotient, explanation: `${total.toLocaleString("en-GH")} ÷ ${divisor} = ${quotient.toLocaleString("en-GH")}.`,
      hint: "Equal sharing suggests division.", challenge: "Transfer", seed, multipleChoice: style % 2 === 1,
    });
  }

  if (family === (multiplicationOnly ? 2 : 4)) {
    const answer = a + b;
    const missing = b;
    return numericQuestion({
      id: String(seed), target, config, family: "inverse-missing-number", skill: "Use inverse operations",
      prompt: `${a.toLocaleString("en-GH")} + □ = ${answer.toLocaleString("en-GH")}. What number belongs in the box?`,
      answer: missing, explanation: `Use the inverse operation: ${answer.toLocaleString("en-GH")} − ${a.toLocaleString("en-GH")} = ${missing.toLocaleString("en-GH")}.`,
      hint: "Undo the known operation.", challenge: "Analyse", seed, multipleChoice: true,
    });
  }

  if (family === (multiplicationOnly ? 3 : 5)) {
    const base = profile.roundBase;
    const exact = a + b;
    const estimate = Math.round(a / base) * base + Math.round(b / base) * base;
    return numericQuestion({
      id: String(seed), target, config, family: "estimate-check", skill: "Estimate and judge reasonableness",
      prompt: `${name} needs a quick estimate for ${a.toLocaleString("en-GH")} + ${b.toLocaleString("en-GH")}. Round each number to the nearest ${base.toLocaleString("en-GH")} and add. What estimate should ${name} get?`,
      answer: estimate, explanation: `Rounded values give an estimate of ${estimate.toLocaleString("en-GH")}. The exact total is ${exact.toLocaleString("en-GH")}, so the estimate is a sensible check.`,
      hint: "Round first, then add the rounded values.", challenge: "Evaluate", seed, multipleChoice: true, optionStep: base,
    });
  }

  throw new Error("Unreachable primary operation family");
}

function renderFractions(target: Target, config: SessionConfig, seed: number, position: number): LearnQuestion {
  const profile = LEVELS[config.levelId];
  const family = position % 5;
  const style = hash(`${seed}:fraction-style:${position}`) % 4;
  const denominator = 2 + (hash(`${seed}:den`) % (config.levelId === "basic-1" ? 2 : 10));
  const numerator = 1 + (hash(`${seed}:num`) % Math.max(1, denominator - 1));
  const factor = 2 + (hash(`${seed}:factor`) % 6);

  if (family === 0) {
    const groups = denominator * (3 + (hash(`${seed}:groups`) % 20));
    const answer = (groups / denominator) * numerator;
    return numericQuestion({
      id: String(seed), target, config, family: "fraction-of-quantity", skill: "Find a fraction of a quantity",
      prompt: `A class has ${groups} counters. ${numerator}/${denominator} of them are used in one activity. How many counters are used?`,
      answer, explanation: `One ${denominator}th is ${groups} ÷ ${denominator} = ${groups / denominator}. Multiply by ${numerator} to get ${answer}.`,
      hint: "Find one equal part first.", challenge: "Apply", seed, multipleChoice: style % 2 === 0,
    });
  }

  if (family === 1) {
    const answer = numerator * factor;
    return numericQuestion({
      id: String(seed), target, config, family: "equivalent-fraction", skill: "Build equivalent fractions",
      prompt: `${numerator}/${denominator} = □/${denominator * factor}. What numerator makes the fractions equivalent?`,
      answer, explanation: `The denominator was multiplied by ${factor}, so multiply the numerator by ${factor}: ${numerator} × ${factor} = ${answer}.`,
      hint: "Equivalent fractions multiply numerator and denominator by the same factor.", challenge: "Analyse", seed, multipleChoice: true,
    });
  }

  if (family === 2) {
    const other = Math.min(denominator - 1, numerator + 1);
    const answer = other > numerator ? other : numerator;
    return numericQuestion({
      id: String(seed), target, config, family: "compare-fractions", skill: "Compare fractions with a common denominator",
      prompt: `Compare ${numerator}/${denominator} and ${other}/${denominator}. What is the numerator of the larger fraction?`,
      answer, explanation: `With the same denominator, the fraction with the larger numerator is larger.`,
      hint: "The equal denominators mean the pieces are the same size.", challenge: "Understand" as CognitiveChallenge, seed, multipleChoice: true,
    });
  }

  if (family === 3 && ["basic-4","basic-5","basic-6"].includes(config.levelId)) {
    const cedis = 10 + (hash(`${seed}:cedis`) % 990);
    const pesewas = hash(`${seed}:pesewas`) % 100;
    const totalPesewas = cedis * 100 + pesewas;
    return numericQuestion({
      id: String(seed), target, config, family: "decimal-money", skill: "Connect decimals and money",
      prompt: `An item costs GH₵${cedis}.${String(pesewas).padStart(2,"0")}. How many pesewas is that altogether?`,
      answer: totalPesewas, explanation: `GH₵1 = 100 pesewas, so GH₵${cedis}.${String(pesewas).padStart(2,"0")} = ${totalPesewas.toLocaleString("en-GH")} pesewas.`,
      hint: "Convert each cedi to 100 pesewas.", challenge: "Transfer", seed, multipleChoice: style % 2 === 1, optionStep: 100,
    });
  }

  const percent = pick([10,20,25,50,75], seed, position);
  const base = 20 * (2 + (hash(`${seed}:base`) % 30));
  const answer = (base * percent) / 100;
  return numericQuestion({
    id: String(seed), target, config, family: "fraction-percent-connection", skill: "Connect fractions, decimals and percentages",
    prompt: `What is ${percent}% of ${base}?`,
    answer, explanation: `${percent}% means ${percent}/100. Multiplying by ${base} gives ${answer}.`,
    hint: "Convert the percentage to a fraction or decimal before multiplying.", challenge: "Apply", difficulty: profile.difficulty + 1, seed, multipleChoice: true,
  });
}

function renderPatterns(target: Target, config: SessionConfig, seed: number, position: number): LearnQuestion {
  const profile = LEVELS[config.levelId];
  const family = position % 4;
  const start = Math.max(1, whole(profile, seed, position) % Math.max(20, Math.floor(profile.wholeSpan / 5)));
  const step = 2 + (hash(`${seed}:step`) % Math.max(3, profile.multiplierMax));
  if (family === 0) {
    const answer = start + 4 * step;
    return numericQuestion({
      id:String(seed),target,config,family:"extend-pattern",skill:"Extend numerical patterns",
      prompt:`Complete the pattern: ${start}, ${start+step}, ${start+2*step}, ${start+3*step}, __.`,
      answer,explanation:`The rule is add ${step}, so the next number is ${answer}.`,hint:"Find the constant change.",challenge:"Analyse",seed,multipleChoice:true,optionStep:step
    });
  }
  if (family === 1) {
    const input = 2 + (hash(`${seed}:input`) % 20);
    const multiplier = 2 + (hash(`${seed}:m`) % 8);
    const add = hash(`${seed}:add`) % 20;
    const answer = input * multiplier + add;
    return numericQuestion({
      id:String(seed),target,config,family:"input-output",skill:"Apply a number rule",
      prompt:`A rule says “multiply by ${multiplier}, then add ${add}”. What output does the rule give for an input of ${input}?`,
      answer,explanation:`${input} × ${multiplier} + ${add} = ${answer}.`,hint:"Follow the rule in the stated order.",challenge:"Apply",seed,multipleChoice:position%2===0
    });
  }
  if (family === 2) {
    const third = start + 2 * step;
    const answer = step;
    return numericQuestion({
      id:String(seed),target,config,family:"infer-rule",skill:"Infer a pattern rule",
      prompt:`${pick(NAMES,seed,position)} writes ${start}, ${start+step}, ${third}, ${start+3*step}. By how much does the pattern increase each time?`,
      answer,explanation:`Consecutive terms differ by ${step}.`,hint:"Subtract one term from the next.",challenge:"Analyse",seed,multipleChoice:true,optionStep:1
    });
  }
  const positionN = 5 + (hash(`${seed}:n`) % 10);
  const answer = start + (positionN - 1) * step;
  return numericQuestion({
    id:String(seed),target,config,family:"nth-term-informal",skill:"Generalise a growing pattern",
    prompt:`A sequence starts at ${start} and increases by ${step} each time. What is the ${positionN}th term?`,
    answer,explanation:`Move ${positionN-1} steps from the first term: ${start} + ${positionN-1} × ${step} = ${answer}.`,hint:"From the first term, count how many equal jumps are needed.",challenge:"Transfer",difficulty:profile.difficulty+1,seed,multipleChoice:position%2===1,optionStep:step
  });
}

function renderGeometry(target: Target, config: SessionConfig, seed: number, position: number): LearnQuestion {
  const family = position % 5;
  const length = 5 + (hash(`${seed}:length`) % 45);
  const width = 3 + (hash(`${seed}:width`) % 30);
  const style = hash(`${seed}:geo-style`) % 3;
  if (family === 0) {
    const answer = 2 * (length + width);
    return numericQuestion({
      id:String(seed),target,config,family:"perimeter",skill:"Calculate perimeter",
      prompt:`A rectangular school garden is ${length} m long and ${width} m wide. How many metres of fencing are needed to go once around it?`,
      answer,explanation:`Perimeter = 2(${length} + ${width}) = ${answer} m.`,hint:"Going around uses all four sides.",challenge:"Transfer",seed,multipleChoice:style===0
    });
  }
  if (family === 1) {
    const answer = length * width;
    return numericQuestion({
      id:String(seed),target,config,family:"area",skill:"Calculate rectangular area",
      prompt:`A classroom display board measures ${length} cm by ${width} cm. What is its area in cm²?`,
      answer,explanation:`Area = length × width = ${length} × ${width} = ${answer} cm².`,hint:"Area measures the surface covered.",challenge:"Apply",seed,multipleChoice:style===1
    });
  }
  if (family === 2) {
    const angle = pick([30,45,60,75,90,110,120,135,150], seed, position);
    const category = angle < 90 ? 1 : angle === 90 ? 2 : 3;
    return numericQuestion({
      id:String(seed),target,config,family:"angle-classification",skill:"Classify angles",
      prompt:`An angle measures ${angle}°. Use 1 for acute, 2 for right, or 3 for obtuse. Which number classifies the angle correctly?`,
      answer:category,explanation:`${angle}° is ${angle<90?"less than 90°, so it is acute":angle===90?"exactly 90°, so it is a right angle":"between 90° and 180°, so it is obtuse"}.`,hint:"Compare the angle with 90°.",challenge:"Understand" as CognitiveChallenge,seed,multipleChoice:false
    });
  }
  if (family === 3) {
    const side = 2 + (hash(`${seed}:side`) % 20);
    const answer = side * side;
    return numericQuestion({
      id:String(seed),target,config,family:"square-reasoning",skill:"Connect side length, perimeter and area",
      prompt:`${pick(NAMES,seed,position)} draws a square with side length ${side} cm. What is its area?`,
      answer,explanation:`Area of a square = side × side = ${side} × ${side} = ${answer} cm².`,hint:"A square has equal length and width.",challenge:"Apply",seed,multipleChoice:true,optionStep:side
    });
  }
  const sides = pick([3,4,5,6,8], seed, position);
  return numericQuestion({
    id:String(seed),target,config,family:"shape-properties",skill:"Reason from shape properties",
    prompt:`A polygon in a geometry exercise has ${sides} sides. How many vertices does it have?`,
    answer:sides,explanation:`A polygon has one vertex where each pair of neighbouring sides meets, so ${sides} sides give ${sides} vertices.`,hint:"Trace each corner around the polygon.",challenge:"Recall",seed,multipleChoice:true,optionStep:1
  });
}

function renderMeasurement(target: Target, config: SessionConfig, seed: number, position: number): LearnQuestion {
  const family = position % 5;
  const style = hash(`${seed}:measurement-style`) % 4;
  if (family === 0) {
    const metres = 2 + (hash(`${seed}:m`) % 98);
    const centimetres = hash(`${seed}:cm`) % 100;
    const answer = metres * 100 + centimetres;
    return numericQuestion({
      id:String(seed),target,config,family:"length-conversion",skill:"Convert length units",
      prompt:`A rope is ${metres} m ${centimetres} cm long. What is its total length in centimetres?`,
      answer,explanation:`${metres} m = ${metres*100} cm. Add ${centimetres} cm to get ${answer} cm.`,hint:"1 metre equals 100 centimetres.",challenge:"Apply",seed,multipleChoice:style%2===0,optionStep:100
    });
  }
  if (family === 1) {
    const startHour = 7 + (hash(`${seed}:start`) % 7);
    const duration = 20 + (hash(`${seed}:duration`) % 101);
    const answer = duration;
    return numericQuestion({
      id:String(seed),target,config,family:"elapsed-time",skill:"Reason about elapsed time",
      prompt:`An activity begins at ${startHour}:00 and ends ${Math.floor(duration/60)} hour(s) and ${duration%60} minute(s) later. How many minutes does the activity last altogether?`,
      answer,explanation:`${Math.floor(duration/60)} hour(s) = ${Math.floor(duration/60)*60} minutes; adding ${duration%60} gives ${duration} minutes.`,hint:"Convert hours to minutes before adding.",challenge:"Transfer",seed,multipleChoice:style%2===1,optionStep:10
    });
  }
  if (family === 2) {
    const price = 5 + (hash(`${seed}:price`) % 95);
    const paid = Math.ceil((price + 5) / 10) * 10;
    const answer = paid - price;
    return numericQuestion({
      id:String(seed),target,config,family:"money-change",skill:"Solve money problems",
      prompt:`An item costs GH₵${price}. A customer pays GH₵${paid}. How much change should the customer receive?`,
      answer,explanation:`Change = amount paid − cost = ${paid} − ${price} = GH₵${answer}.`,hint:"Subtract the cost from the amount paid.",challenge:"Transfer",seed,multipleChoice:true,optionStep:5
    });
  }
  if (family === 3) {
    const massKg = 2 + (hash(`${seed}:kg`) % 40);
    const grams = 100 * (hash(`${seed}:g`) % 10);
    const answer = massKg * 1000 + grams;
    return numericQuestion({
      id:String(seed),target,config,family:"mass-conversion",skill:"Convert mass units",
      prompt:`A package has a mass of ${massKg} kg ${grams} g. What is the total mass in grams?`,
      answer,explanation:`${massKg} kg = ${massKg*1000} g. Adding ${grams} g gives ${answer} g.`,hint:"1 kilogram equals 1,000 grams.",challenge:"Apply",seed,multipleChoice:style===0,optionStep:1000
    });
  }
  const litres = 1 + (hash(`${seed}:litres`) % 20);
  const answer = litres * 1000;
  return numericQuestion({
    id:String(seed),target,config,family:"capacity-conversion",skill:"Convert capacity units",
    prompt:`A container holds ${litres} litres. How many millilitres is that?`,
    answer,explanation:`1 litre = 1,000 millilitres, so ${litres} litres = ${answer.toLocaleString("en-GH")} mL.`,hint:"Multiply litres by 1,000.",challenge:"Apply",seed,multipleChoice:true,optionStep:1000
  });
}

function renderData(target: Target, config: SessionConfig, seed: number, position: number): LearnQuestion {
  const family = position % 5;
  const a = 5 + (hash(`${seed}:a`) % 36);
  const b = 5 + (hash(`${seed}:b`) % 36);
  const c = 5 + (hash(`${seed}:c`) % 36);
  const d = 5 + (hash(`${seed}:d`) % 36);
  const values = [a,b,c,d];

  if (family === 0) {
    const answer = Math.max(...values);
    return numericQuestion({
      id:String(seed),target,config,family:"read-table",skill:"Read and compare data",
      prompt:`A class survey records four groups with ${a}, ${b}, ${c} and ${d} responses. What is the largest frequency?`,
      answer,explanation:`The greatest of the four frequencies is ${answer}.`,hint:"Compare all four values.",challenge:"Understand" as CognitiveChallenge,seed,multipleChoice:true
    });
  }
  if (family === 1) {
    const answer = values.reduce((sum,value)=>sum+value,0);
    return numericQuestion({
      id:String(seed),target,config,family:"data-total",skill:"Find a total from data",
      prompt:`Four teams score ${a}, ${b}, ${c} and ${d} points. What is their combined score?`,
      answer,explanation:`${a} + ${b} + ${c} + ${d} = ${answer}.`,hint:"Add every category once.",challenge:"Apply",seed,multipleChoice:position%2===0
    });
  }
  if (family === 2) {
    const answer = Math.max(...values) - Math.min(...values);
    return numericQuestion({
      id:String(seed),target,config,family:"range",skill:"Describe the spread of data",
      prompt:`For the data ${values.join(", ")}, what is the range?`,
      answer,explanation:`Range = maximum − minimum = ${Math.max(...values)} − ${Math.min(...values)} = ${answer}.`,hint:"Subtract the smallest value from the largest.",challenge:"Analyse",seed,multipleChoice:true
    });
  }
  if (family === 3 && ["basic-5","basic-6"].includes(config.levelId)) {
    const favourable = 1 + (hash(`${seed}:fav`) % 5);
    const total = favourable + 1 + (hash(`${seed}:other`) % 5);
    const answer = favourable;
    return numericQuestion({
      id:String(seed),target,config,family:"chance",skill:"Reason about simple probability",
      prompt:`A bag has ${total} equal counters, ${favourable} of which are red. If one counter is chosen at random, how many favourable outcomes give red?`,
      answer,explanation:`There are ${favourable} red counters, so there are ${favourable} favourable outcomes.`,hint:"Count the outcomes that match the event.",challenge:"Understand" as CognitiveChallenge,seed,multipleChoice:true
    });
  }
  const doubled = [a,a,b,c];
  const answer = a;
  return numericQuestion({
    id:String(seed),target,config,family:"mode",skill:"Identify the mode",
    prompt:`What is the mode of ${doubled.join(", ")}?`,
    answer,explanation:`${a} occurs more often than any other value, so it is the mode.`,hint:"Find the value that appears most often.",challenge:"Analyse",seed,multipleChoice:true
  });
}

function renderRatio(target: Target, config: SessionConfig, seed: number, position: number): LearnQuestion {
  const family = position % 4;
  const left = 2 + (hash(`${seed}:left`) % 10);
  const right = 2 + (hash(`${seed}:right`) % 10);
  const factor = 2 + (hash(`${seed}:factor`) % 10);
  if (family === 0) {
    const answer = left * factor;
    return numericQuestion({
      id:String(seed),target,config,family:"equivalent-ratio",skill:"Build equivalent ratios",
      prompt:`The ratio ${left}:${right} is scaled so the second term becomes ${right*factor}. What should the first term become?`,
      answer,explanation:`Both terms must be multiplied by ${factor}, so ${left} × ${factor} = ${answer}.`,hint:"Equivalent ratios scale both parts equally.",challenge:"Apply",seed,multipleChoice:true
    });
  }
  if (family === 1) {
    const totalParts = left + right;
    const total = totalParts * factor;
    const answer = left * factor;
    return numericQuestion({
      id:String(seed),target,config,family:"share-in-ratio",skill:"Share a quantity in a ratio",
      prompt:`GH₵${total} is shared in the ratio ${left}:${right}. How much goes to the first share?`,
      answer,explanation:`There are ${totalParts} parts, so each part is GH₵${factor}. The first share is ${left} × ${factor} = GH₵${answer}.`,hint:"Find the value of one ratio part first.",challenge:"Transfer",seed,multipleChoice:true,optionStep:factor
    });
  }
  if (family === 2) {
    const quantity = right * factor;
    const answer = factor;
    return numericQuestion({
      id:String(seed),target,config,family:"unit-rate",skill:"Find a unit rate",
      prompt:`${right} identical items cost GH₵${quantity}. What is the cost of one item?`,
      answer,explanation:`GH₵${quantity} ÷ ${right} = GH₵${factor} per item.`,hint:"Divide the total by the number of equal items.",challenge:"Apply",seed,multipleChoice:true
    });
  }
  const answer = left * factor;
  return numericQuestion({
    id:String(seed),target,config,family:"proportion-context",skill:"Use proportional reasoning",
    prompt:`A recipe uses ${left} cups of an ingredient for ${right} portions. If every quantity is multiplied by ${factor}, how many cups are needed?`,
    answer,explanation:`${left} × ${factor} = ${answer} cups.`,hint:"Scale every related quantity by the same factor.",challenge:"Transfer",seed,multipleChoice:position%2===0
  });
}

function renderTarget(target: Target, config: SessionConfig, seed: number, position: number) {
  const id = target.id;
  if (id === "number") return renderNumber(target, config, seed, position);
  if (id === "operations") return renderOperations(target, config, seed, position, false);
  if (id === "multiplication-division") return renderOperations(target, config, seed, position, true);
  if (id.includes("fraction")) return renderFractions(target, config, seed, position);
  if (id === "patterns") return renderPatterns(target, config, seed, position);
  if (id === "geometry") return renderGeometry(target, config, seed, position);
  if (id === "measurement") return renderMeasurement(target, config, seed, position);
  if (id === "data" || id === "data-chance") return renderData(target, config, seed, position);
  if (id === "ratio-proportion") return renderRatio(target, config, seed, position);
  return renderNumber(target, config, seed, position);
}

function targets(config: SessionConfig): Target[] {
  if (config.lane !== "school" || config.programId !== "ghana" || !LEVELS[config.levelId]) return [];
  if (config.subjectId !== "mathematics" && config.subjectId !== "all") return [];
  const program = catalogFor("school").programs.find((item)=>item.id==="ghana");
  const level = program?.levels.find((item)=>item.id===config.levelId);
  const subject = level?.subjects.find((item)=>item.id==="mathematics");
  if (!subject) return [];
  const topics = config.topicId === "all" ? subject.topics : subject.topics.filter((topic)=>topic.id===config.topicId);
  return topics.map((topic)=>({id:topic.id,label:topic.label}));
}

export function primaryMathCapacityForSelection(config: SessionConfig) {
  return targets(config).length * PRIMARY_MATH_TOPIC_CAPACITY;
}

export function buildPrimaryMathQuestions(config: SessionConfig, requestedCount = config.count, seed = config.seed ?? Date.now()): LearnQuestion[] {
  const requested = Math.max(0, Math.min(500, Math.floor(requestedCount)));
  const selected = targets(config);
  if (!requested || !selected.length) return [];

  const result: LearnQuestion[] = [];
  const seen = new Set<string>();
  for (let position=0; result.length<requested && position<requested*8; position+=1) {
    const target = selected[(position + hash(`${seed}:target`)) % selected.length];
    const localSeed = hash(`${seed}:${config.levelId}:${target.id}:${position}`);
    const question = renderTarget(target, config, localSeed, position);
    if (seen.has(question.exposureKey)) continue;
    seen.add(question.exposureKey);
    result.push(question);
  }
  return result;
}
