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

type FixedRow = {
  prompt: string;
  answer: string;
  distractors: [string, string, string];
  explanation: string;
  key: string;
  clues?: string[];
  chips?: string[];
};

const PEOPLE = ["Ama", "Kojo", "Esi", "Yaw", "Abena", "Kofi", "Sena", "Adwoa", "Nana", "Akosua"] as const;
const OBJECTS = ["drum", "book", "ball", "kite", "torch", "shell", "badge", "map", "puzzle", "flag"] as const;
const COLOURS = ["red", "blue", "green", "gold", "purple", "orange"] as const;

function clampLevel(value: number) { return Math.max(1, Math.min(5, Math.trunc(value))); }
function shuffle<T>(values: readonly T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}
function pick<T>(values: readonly T[]) { return values[randomInt(values.length)]; }
function distinct<T>(values: readonly T[], count: number) { return shuffle(values).slice(0, count); }
function options(answer: string, distractors: readonly string[]) {
  const unique = Array.from(new Set([answer, ...distractors].map((value) => value.trim()).filter(Boolean)));
  let fallback = 1;
  while (unique.length < 4) unique.push(`None of these ${fallback++}`);
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
  const visualPatterns = [
    { values:["sun", "moon", "sun", "moon", "sun"], answer:"moon", key:"sun-moon" },
    { values:["circle", "circle", "star", "circle", "circle"], answer:"star", key:"two-circle-star" },
    { values:["red", "blue", "green", "red", "blue"], answer:"green", key:"three-colour" },
    { values:["clap", "tap", "tap", "clap", "tap"], answer:"tap", key:"clap-two-taps" },
    { values:["A", "B", "B", "A", "B"], answer:"B", key:"abb-repeat" },
  ] as const;
  if (level <= 2) {
    const chosen = pick(visualPatterns);
    return {
      prompt: `Which item continues this pattern? ${chosen.values.join("  •  ")}  •  ?`,
      answer: chosen.answer,
      distractors: distinct(["sun", "moon", "circle", "star", "red", "blue", "green", "clap", "tap", "A", "B"].filter((item) => item !== chosen.answer), 3),
      explanation: `The sequence repeats a consistent arrangement. Following that same arrangement makes the next item ${chosen.answer}.`,
      concept: `millionaire:pattern:visual:${chosen.key}`,
      scene: scene("pattern-wall", "Pattern Wall", "Look across the whole wall for the repeating unit.", index, length, [...chosen.values]),
    };
  }
  const start = randomInt(2, 10);
  if (level === 3) {
    const step = randomInt(2, 7);
    const seq = [start, start + step, start + step * 2, start + step * 3];
    const answer = String(start + step * 4);
    return {
      prompt: `A signal changes by the same amount each time: ${seq.join(", ")}, ?. Which value belongs next?`,
      answer,
      distractors: [String(Number(answer) + 1), String(Number(answer) - 1), String(Number(answer) + step)],
      explanation: `Every jump is +${step}. Applying the same jump once more gives ${answer}.`,
      concept: `millionaire:pattern:constant:${step}:${start}`,
      scene: scene("pattern-wall", "Signal Pattern", "Measure every jump and check that one rule works throughout.", index, length, seq.map(String)),
    };
  }
  const base = randomInt(2, 7);
  const growing = level >= 5;
  const seq = growing ? [base, base + 2, base + 6, base + 12] : [base, base * 2, base * 4, base * 8];
  const answer = String(growing ? base + 20 : base * 16);
  return {
    prompt: `The spotlight wall shows ${seq.join(", ")}, ?. Which value completes the rule?`,
    answer,
    distractors: [String(Number(answer) + 2), String(Math.max(0, Number(answer) - 2)), String(Number(answer) + base)],
    explanation: growing ? `The jumps grow by two each time: +2, +4, +6, then +8. That gives ${answer}.` : `Each value doubles, so ${seq.at(-1)} doubles to ${answer}.`,
    concept: `millionaire:pattern:${growing ? "growing-gap" : "double"}:${base}`,
    scene: scene("pattern-wall", "Master Pattern", "Check the relationship between every neighbouring pair.", index, length, seq.map(String)),
  };
}

function deductionQuestion(index: number, level: number, length: number): Row {
  const [a, b, c] = distinct(PEOPLE, 3);
  const [x, y, z] = distinct(OBJECTS, 3);
  if (level <= 2) {
    const variants = [
      {
        prompt: `${a}, ${b}, and ${c} chose exactly one item each from: ${x}, ${y}, and ${z}. No two chose the same item. ${b} chose the ${y}. ${c} chose the ${z}. What did ${a} choose?`,
        answer: x,
        explanation: `${b} already has the ${y} and ${c} has the ${z}. Because the three listed items are all used once, ${a} must have the ${x}.`,
        key: "three-items",
        clues: [`Available: ${x}, ${y}, ${z}`, `${b} → ${y}`, `${c} → ${z}`, `${a} → ?`],
      },
      {
        prompt: `${a}, ${b}, and ${c} stand in a line. ${a} is not last. ${b} is behind ${a}. ${c} is behind ${b}. Who must be first?`,
        answer: a,
        explanation: `${b} is behind ${a}, and ${c} is behind ${b}. The only order that fits both clues begins with ${a}.`,
        key: "three-person-chain",
        clues: [`${a} before ${b}`, `${b} before ${c}`],
      },
    ] as const;
    const chosen = pick(variants);
    return {
      prompt: chosen.prompt,
      answer: chosen.answer,
      distractors: chosen.key === "three-items" ? [y, z, "There is not enough information"] : [b, c, "There is no first person"],
      explanation: chosen.explanation,
      concept: `millionaire:deduction:${chosen.key}:${a}:${b}:${c}:${x}:${y}:${z}`,
      scene: scene("case-file", "Case File", "Use every clue together. The answer must fit all of them.", index, length, [...chosen.clues]),
    };
  }
  const [d] = distinct(PEOPLE.filter((person) => ![a,b,c].includes(person)), 1);
  const variants: FixedRow[] = [
    {
      prompt: `${a} finished before ${b}. ${c} finished after ${b}. Which finishing order must be correct?`,
      answer: `${a}, ${b}, ${c}`,
      distractors: [`${b}, ${a}, ${c}`, `${c}, ${b}, ${a}`, `${a}, ${c}, ${b}`],
      explanation: `${a} must be before ${b}, and ${b} must be before ${c}. So the only possible order is ${a}, ${b}, ${c}.`,
      key: "three-order",
      clues: [`${a} before ${b}`, `${c} after ${b}`],
    },
    {
      prompt: `Four lockers belong to ${a}, ${b}, ${c}, and ${d}. ${a}'s locker is left of ${b}'s. ${b}'s is left of ${c}'s. ${d}'s is right of ${c}'s. Whose locker must be farthest left?`,
      answer: a,
      distractors: [b, c, d],
      explanation: `The clues make one chain: ${a} → ${b} → ${c} → ${d}. Therefore ${a}'s locker is farthest left.`,
      key: "four-lockers",
      clues: [`${a} left of ${b}`, `${b} left of ${c}`, `${d} right of ${c}`],
    },
  ];
  const chosen = pick(variants);
  return {
    prompt: chosen.prompt,
    answer: chosen.answer,
    distractors: chosen.distractors,
    explanation: chosen.explanation,
    concept: `millionaire:deduction:${chosen.key}:${a}:${b}:${c}:${d}`,
    scene: scene("case-file", "Deduction Desk", "Translate the clues into one consistent arrangement before choosing.", index, length, chosen.clues),
  };
}

function codeQuestion(index: number, level: number, length: number): Row {
  const a = randomInt(2, 8);
  const b = randomInt(3, 10);
  if (level <= 2) {
    const multiply = index % 2 === 1;
    const answer = String(multiply ? a * b : a + b);
    return {
      prompt: `Vault code: ◆ = ${a} and ● = ${b}. What number does ◆ ${multiply ? "×" : "+"} ● produce?`,
      answer,
      distractors: multiply ? [String(a + b), String(Math.abs(a - b)), String(a * b + 1)] : [String(a * b), String(Math.abs(a - b)), String(a + b + 1)],
      explanation: `Replace ◆ with ${a} and ● with ${b}. Then calculate ${a} ${multiply ? "×" : "+"} ${b} = ${answer}.`,
      concept: `millionaire:code:${multiply ? "multiply" : "add"}:${a}:${b}`,
      scene: scene("code-vault", "Code Vault", "Decode the symbols first; calculate only after the values are clear.", index, length, [`◆ = ${a}`, `● = ${b}`]),
    };
  }
  const c = randomInt(2, 7);
  const mode = index % 3;
  const answer = mode === 0 ? a * b - c : mode === 1 ? (a + b) * c : a * c + b;
  const prompt = mode === 0 ? `(◆ × ●) − ▲` : mode === 1 ? `(◆ + ●) × ▲` : `(◆ × ▲) + ●`;
  const wrong = mode === 0 ? [a * (b - c), a + b - c, a * b + c] : mode === 1 ? [a + b * c, (a + b) + c, a * b * c] : [a * (c + b), a + c + b, a * c - b];
  return {
    prompt: `Vault code: ◆ = ${a}, ● = ${b}, ▲ = ${c}. What is ${prompt}?`,
    answer: String(answer),
    distractors: wrong.map(String),
    explanation: `Substitute the symbol values before calculating. Following the brackets and operation signs gives ${answer}.`,
    concept: `millionaire:code:mixed:${mode}:${a}:${b}:${c}`,
    scene: scene("code-vault", "Cipher Chamber", "Substitute first. Then follow brackets and operations in order.", index, length, [`◆ = ${a}`, `● = ${b}`, `▲ = ${c}`]),
  };
}

const SIMPLE_ANALOGIES: readonly FixedRow[] = [
  { prompt:"Bird is to nest as bee is to…", answer:"hive", distractors:["river","cave","leaf"], explanation:"A nest is a bird's home; a hive is a bee's home.", key:"animal-home" },
  { prompt:"Finger is to hand as toe is to…", answer:"foot", distractors:["head","arm","knee"], explanation:"A finger is part of a hand; a toe is part of a foot.", key:"part-whole" },
  { prompt:"Book is to reading as song is to…", answer:"listening", distractors:["painting","measuring","planting"], explanation:"We read a book and listen to a song; the relationship is object to its usual action.", key:"object-action" },
  { prompt:"Pencil is to writing as brush is to…", answer:"painting", distractors:["jumping","measuring","singing"], explanation:"A pencil is a tool for writing; a brush is a tool for painting.", key:"tool-action" },
  { prompt:"Morning is to sunrise as evening is to…", answer:"sunset", distractors:["rainfall","lunchtime","breakfast"], explanation:"Sunrise is associated with morning; sunset is associated with evening.", key:"time-event" },
] as const;
const ADVANCED_ANALOGIES: readonly FixedRow[] = [
  { prompt:"Compass is to direction as thermometer is to…", answer:"temperature", distractors:["distance","mass","speed"], explanation:"A compass indicates direction; a thermometer measures temperature.", key:"instrument-measure" },
  { prompt:"Evidence is to conclusion as clue is to…", answer:"solution", distractors:["decoration","weather","volume"], explanation:"Evidence supports a conclusion; a clue supports a solution.", key:"support-result" },
  { prompt:"Blueprint is to building as recipe is to…", answer:"meal", distractors:["library","journey","instrument"], explanation:"A blueprint guides construction of a building; a recipe guides preparation of a meal.", key:"plan-product" },
  { prompt:"Cause is to effect as question is to…", answer:"answer", distractors:["colour","distance","weather"], explanation:"An effect follows a cause; an answer responds to a question.", key:"relation-response" },
  { prompt:"Editor is to manuscript as mechanic is to…", answer:"machine", distractors:["poem","timetable","cloud"], explanation:"An editor examines and improves a manuscript; a mechanic examines and repairs a machine.", key:"worker-object" },
] as const;
function analogyQuestion(index: number, level: number, length: number): Row {
  const chosen = pick(level <= 2 ? SIMPLE_ANALOGIES : ADVANCED_ANALOGIES);
  return {
    prompt: chosen.prompt,
    answer: chosen.answer,
    distractors: chosen.distractors,
    explanation: chosen.explanation,
    concept: `millionaire:analogy:${chosen.key}`,
    scene: scene("analogy-bridge", "Analogy Bridge", "Name the relationship in the first pair, then reuse that exact relationship.", index, length),
  };
}

const SIMPLE_EVIDENCE: readonly FixedRow[] = [
  { prompt:"Two seedlings of the same type received the same water. The seedling by a bright window grew taller than the seedling kept in a dark cupboard. Which conclusion is best supported?", answer:"Light can affect the seedlings' growth.", distractors:["All plants grow at exactly the same speed.","Cupboards always make plants taller.","Water had no effect on either seedling."], explanation:"The plants were the same type and received the same water; the stated difference was access to light. The evidence therefore supports a link between light and growth.", key:"plant-light", clues:["Same plant type","Same water","Different light","Window seedling grew taller"] },
  { prompt:"Two equal ice cubes were placed at the same time. One was left in sunlight and one in shade. The cube in sunlight melted first. What does this observation support?", answer:"The warmer sunny place made the ice melt faster.", distractors:["Shade always melts ice faster.","The ice cubes were different sizes.","Sunlight makes water freeze immediately."], explanation:"The cubes were equal and started together; the one in sunlight melted sooner. That supports the conclusion that the warmer sunny condition increased melting speed.", key:"ice-sun", clues:["Equal ice cubes","Same start time","Sun vs shade","Sun cube melted first"] },
  { prompt:"Three identical toy cars rolled down the same ramp. Car A travelled 120 cm, Car B 118 cm, and Car C 121 cm. Which statement is best supported?", answer:"The cars travelled about 120 cm in these trials.", distractors:["Every future car will travel exactly 120 cm.","Car C will always travel farthest.","The ramp makes every object travel 200 cm."], explanation:"The three measurements are close to 120 cm. They support an approximate result for these trials, not an absolute claim about every future trial.", key:"car-trials", clues:["120 cm","118 cm","121 cm"] },
  { prompt:"A towel test used the same amount of water on three cloths. Cloth X absorbed the most water each time the test was repeated. Which claim is supported?", answer:"Cloth X was the most absorbent in these tests.", distractors:["Cloth X can absorb unlimited water.","Every cloth in the world behaves the same way.","The test proves water has no mass."], explanation:"Repeated tests under the stated conditions showed Cloth X absorbing the most. That supports a limited claim about these tests.", key:"absorbency", clues:["Same water amount","Test repeated","Cloth X absorbed most"] },
] as const;
const ADVANCED_EVIDENCE: readonly FixedRow[] = [
  { prompt:"Three buses used the same route on similar school mornings. Their journey times were 32, 31, and 33 minutes. Which claim is justified by these observations?", answer:"The route took about 32 minutes in these three trips.", distractors:["The route will always take exactly 32 minutes.","The 31-minute bus is always the fastest bus.","Traffic can never affect this route."], explanation:"The recorded times cluster around 32 minutes. Three observations support an approximate description of those trips, not an 'always' claim.", key:"bus-times", clues:["32 min","31 min","33 min","Same route"] },
  { prompt:"A class tested seed germination. Ten seeds were kept moist and ten matching seeds were kept dry; all other conditions were kept similar. Nine moist seeds germinated and one dry seed germinated. Which conclusion is best supported?", answer:"Moisture increased germination in this test.", distractors:["Every moist seed must germinate.","Dry seeds can never germinate.","Light was definitely the only cause."], explanation:"Moisture was the planned difference between the groups, and far more moist seeds germinated. The evidence supports an effect of moisture in this test.", key:"germination", clues:["10 moist → 9 germinated","10 dry → 1 germinated","Other conditions similar"] },
  { prompt:"A survey asked 20 learners in one class which lunch they preferred. Fourteen chose rice. Which conclusion is justified?", answer:"Most learners surveyed in that class preferred rice.", distractors:["Most learners in Ghana prefer rice.","Every learner in the school prefers rice.","Rice is scientifically the healthiest lunch."], explanation:"The evidence describes only the 20 surveyed learners in one class. It does not justify claims about a whole school, country, or health outcome.", key:"survey-scope", clues:["20 learners","One class","14 chose rice"] },
  { prompt:"A sensor recorded classroom temperature every hour: 27°C, 28°C, 29°C, 29°C, 30°C. What is the strongest evidence-based statement?", answer:"The recorded temperature generally increased over the measured hours.", distractors:["The room will keep heating forever.","The sensor proves tomorrow will be hotter.","The temperature increased by exactly 1°C every hour."], explanation:"The readings show a general rise across the measured period, including one hour with no increase. Claims about forever or tomorrow go beyond the evidence.", key:"temperature-trend", clues:["27°C","28°C","29°C","29°C","30°C"] },
] as const;
function evidenceQuestion(index: number, level: number, length: number): Row {
  const chosen = pick(level <= 2 ? SIMPLE_EVIDENCE : ADVANCED_EVIDENCE);
  return {
    prompt: chosen.prompt,
    answer: chosen.answer,
    distractors: chosen.distractors,
    explanation: chosen.explanation,
    concept: `millionaire:evidence:${chosen.key}`,
    scene: scene("evidence-desk", "Evidence Desk", "Choose only what the observations support. Reject claims that add assumptions.", index, length, chosen.clues),
  };
}

const SIMPLE_RULES: readonly FixedRow[] = [
  { prompt:"Rule Gate: an object may enter only if it can roll AND is smaller than a school desk. Which object definitely passes?", answer:"A tennis ball", distractors:["A classroom door","A flat exercise book","A tall cupboard"], explanation:"A tennis ball can roll and is smaller than a desk, so it satisfies both conditions.", key:"roll-small", chips:["CAN ROLL","SMALLER THAN A DESK"] },
  { prompt:"Adventure Gate: a team item must be wearable AND protect the head. Which item passes both rules?", answer:"A helmet", distractors:["A backpack","A raincoat","A football"], explanation:"A helmet is worn and is designed to protect the head, so it satisfies both conditions.", key:"wear-head", chips:["WEARABLE","PROTECTS HEAD"] },
  { prompt:"Library Gate: an item may go into the reading kit only if it contains pages AND can be read without electricity. Which item passes?", answer:"A printed storybook", distractors:["A calculator","A torch","A football"], explanation:"A printed storybook has pages and can be read without electricity, satisfying both rules.", key:"pages-no-power", chips:["HAS PAGES","NO ELECTRICITY NEEDED"] },
  { prompt:"Shape Gate: a figure passes only if it has exactly four sides AND all four sides are equal. Which figure passes?", answer:"A square", distractors:["A triangle","A rectangle with unequal side lengths","A circle"], explanation:"A square has four sides and all four sides are equal, so it satisfies both conditions.", key:"square-rule", chips:["4 SIDES","ALL SIDES EQUAL"] },
] as const;
const ADVANCED_RULES: readonly FixedRow[] = [
  { prompt:"Research Gate: a power source is accepted only if it is renewable, produces electricity, and does not burn fuel while operating. Which option fits all three conditions?", answer:"A solar panel", distractors:["A diesel generator","A charcoal stove","A petrol motor"], explanation:"A solar panel uses renewable sunlight to generate electricity without burning fuel during operation.", key:"renewable-electricity", chips:["RENEWABLE","MAKES ELECTRICITY","NO FUEL BURNED IN USE"] },
  { prompt:"Data Gate: a record is accepted only if it has a learner ID, a valid date, and a score from 0 to 100. Which record passes?", answer:"ID 42 · 12 Sep · score 78", distractors:["No ID · 12 Sep · score 78","ID 42 · no date · score 78","ID 42 · 12 Sep · score 118"], explanation:"The accepted record includes an ID, a date, and a score within 0–100. Each other option fails at least one rule.", key:"record-validation", chips:["HAS ID","HAS DATE","SCORE 0–100"] },
  { prompt:"Eco Gate: a transport choice passes only if it carries at least 20 people, uses no petrol or diesel while moving, and follows a fixed public route. Which option passes?", answer:"An electric city bus on its scheduled route", distractors:["A petrol taxi","A private electric bicycle","A diesel school bus"], explanation:"The electric city bus meets all three conditions: capacity, no petrol/diesel in operation, and a fixed public route.", key:"transport-rules", chips:["20+ PEOPLE","NO PETROL/DIESEL IN USE","FIXED PUBLIC ROUTE"] },
  { prompt:"Source Gate: a claim may pass only if the source names its author, gives evidence, and states when the information was published. Which source passes?", answer:"An article with a named author, cited data, and publication date", distractors:["An anonymous post with no evidence","A dated advert with no author or evidence","A named opinion with no evidence or date"], explanation:"Only the article satisfies all three source-quality conditions at the same time.", key:"source-quality", chips:["NAMED AUTHOR","EVIDENCE","PUBLICATION DATE"] },
] as const;
function ruleQuestion(index: number, level: number, length: number): Row {
  const chosen = pick(level <= 2 ? SIMPLE_RULES : ADVANCED_RULES);
  return {
    prompt: chosen.prompt,
    answer: chosen.answer,
    distractors: chosen.distractors,
    explanation: chosen.explanation,
    concept: `millionaire:rule:${chosen.key}`,
    scene: scene("rule-gate", level <= 2 ? "Rule Gate" : "Multi-Rule Gate", "Test every option against every condition. One failed condition is enough to reject it.", index, length, undefined, chosen.chips),
  };
}

function orderQuestion(index: number, level: number, length: number): Row {
  const [a, b, c, d] = distinct(PEOPLE, 4);
  if (level <= 2) {
    const variant = index % 2;
    if (variant === 0) {
      return {
        prompt: `${a} is ahead of ${b}, and ${b} is ahead of ${c}. Which statement must be true?`,
        answer: `${a} is ahead of ${c}.`,
        distractors: [`${c} is ahead of ${a}.`, `${b} is behind ${c}.`, `${a} and ${c} are in the same place.`],
        explanation: `The clues form the chain ${a} → ${b} → ${c}. Therefore ${a} must also be ahead of ${c}.`,
        concept: `millionaire:order:transitive:${a}:${b}:${c}`,
        scene: scene("order-track", "Order Track", "Link the clues into one line before judging the statements.", index, length, [`${a} before ${b}`, `${b} before ${c}`]),
      };
    }
    return {
      prompt: `Four runners are ${a}, ${b}, ${c}, and ${d}. ${a} is first. ${b} is immediately after ${a}. ${d} is last. Who must be third?`,
      answer: c,
      distractors: [a, b, d],
      explanation: `${a} is first and ${b} is second. ${d} is fourth, leaving third place for ${c}.`,
      concept: `millionaire:order:four-slots:${a}:${b}:${c}:${d}`,
      scene: scene("order-track", "Order Track", "Fill the fixed positions, then identify the only slot left.", index, length, [`1st: ${a}`, `2nd: ${b}`, `3rd: ?`, `4th: ${d}`]),
    };
  }
  const variants: Row[] = [
    {
      prompt: `${a} is ahead of ${b}. ${c} is behind ${b}. ${d} is ahead of ${a}. Which person must be first among the four?`,
      answer: d,
      distractors: [a, b, c],
      explanation: `The chain is ${d} → ${a} → ${b} → ${c}. Therefore ${d} must be first.`,
      concept: `millionaire:order:chain:${a}:${b}:${c}:${d}`,
      scene: scene("order-track", "Order Track", "Combine all clues into one chain rather than solving them separately.", index, length, [`${d} before ${a}`, `${a} before ${b}`, `${b} before ${c}`]),
    },
    {
      prompt: `Four talks are scheduled once each. ${a}'s talk is before ${b}'s. ${c}'s is after ${b}'s. ${d}'s is before ${a}'s. Which order must be correct?`,
      answer: `${d}, ${a}, ${b}, ${c}`,
      distractors: [`${a}, ${d}, ${b}, ${c}`, `${d}, ${b}, ${a}, ${c}`, `${c}, ${b}, ${a}, ${d}`],
      explanation: `${d} must come before ${a}, ${a} before ${b}, and ${b} before ${c}; the required chain is ${d}, ${a}, ${b}, ${c}.`,
      concept: `millionaire:order:talks:${a}:${b}:${c}:${d}`,
      scene: scene("order-track", "Schedule Track", "Turn every before/after clue into arrows, then join the arrows.", index, length, [`${d} → ${a}`, `${a} → ${b}`, `${b} → ${c}`]),
    },
  ];
  return pick(variants);
}

const SIMPLE_LOGIC: readonly FixedRow[] = [
  { prompt:"Every silver pass opens the library door. Kofi's pass is silver. What must be true?", answer:"Kofi's pass opens the library door.", distractors:["Every pass is silver.","Kofi owns the library.","Only Kofi may enter the library."], explanation:"The rule applies to every silver pass, and Kofi's pass is silver. Therefore his pass opens the door.", key:"silver-pass", clues:["ALL SILVER PASSES → OPEN","KOFI'S PASS → SILVER"] },
  { prompt:"Every team captain wears a gold badge. Ama is a team captain. What must be true?", answer:"Ama wears a gold badge.", distractors:["Everyone with a badge is a captain.","Ama is the only captain.","All gold things are badges."], explanation:"The rule says every captain wears a gold badge. Ama is a captain, so the rule guarantees that she wears one.", key:"captain-badge", clues:["CAPTAIN → GOLD BADGE","AMA → CAPTAIN"] },
  { prompt:"If a card is marked with a star, it goes into Box A. This card has a star. Where must it go?", answer:"Box A", distractors:["Box B","Either box with no rule","Outside every box"], explanation:"The card has the stated star mark, so the if-then rule sends it to Box A.", key:"star-card", clues:["STAR → BOX A","THIS CARD → STAR"] },
  { prompt:"All books on the blue shelf are science books. This book is on the blue shelf. What can we conclude?", answer:"This is a science book.", distractors:["Every science book is on the blue shelf.","This is the only science book.","The book must be blue."], explanation:"The rule covers every book on the blue shelf. Because this book is there, it must be a science book.", key:"blue-shelf", clues:["BLUE SHELF → SCIENCE BOOK","THIS BOOK → BLUE SHELF"] },
] as const;
const ADVANCED_LOGIC: readonly FixedRow[] = [
  { prompt:"If the alarm is armed, the blue light is on. The blue light is off. Which conclusion is logically valid?", answer:"The alarm is not armed.", distractors:["The alarm is definitely broken.","The blue light is always off.","The building has no electricity."], explanation:"An armed alarm guarantees a blue light. Since the light is off, the alarm cannot be armed under the stated rule.", key:"contrapositive-alarm", clues:["ARMED → BLUE LIGHT ON","BLUE LIGHT OFF"] },
  { prompt:"If a file is approved, it carries a green stamp. File X has no green stamp. What follows from the rule?", answer:"File X is not approved.", distractors:["File X was deleted.","Every stamped file is approved.","The stamp printer is broken."], explanation:"Approval would guarantee a green stamp. Because File X has no green stamp, it cannot be approved under the stated rule.", key:"contrapositive-file", clues:["APPROVED → GREEN STAMP","FILE X → NO GREEN STAMP"] },
  { prompt:"Only registered teams may enter the final. Team Nova entered the final. What must be true?", answer:"Team Nova was registered.", distractors:["Team Nova won the final.","Every registered team entered the final.","No other team was registered."], explanation:"‘Only registered teams may enter’ means entry requires registration. Because Team Nova entered, it must have been registered.", key:"only-registered", clues:["ENTER FINAL → REGISTERED","NOVA → ENTERED FINAL"] },
  { prompt:"A sensor sends an alert whenever temperature exceeds 40°C. No alert was sent, and the sensor is known to be working correctly. What follows?", answer:"The temperature did not exceed 40°C.", distractors:["The temperature was exactly 0°C.","The sensor had no power.","The temperature must have been 40°C exactly."], explanation:"With a correctly working sensor, exceeding 40°C would guarantee an alert. No alert therefore rules out a temperature above 40°C.", key:"sensor-alert", clues:[">40°C → ALERT","NO ALERT","SENSOR WORKING"] },
] as const;
function conditionalQuestion(index: number, level: number, length: number): Row {
  const chosen = pick(level <= 2 ? SIMPLE_LOGIC : ADVANCED_LOGIC);
  return {
    prompt: chosen.prompt,
    answer: chosen.answer,
    distractors: chosen.distractors,
    explanation: chosen.explanation,
    concept: `millionaire:logic:${chosen.key}`,
    scene: scene("logic-switch", "Logic Switch", "Use only what the rule guarantees; reject tempting stories that are merely possible.", index, length, chosen.clues),
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
