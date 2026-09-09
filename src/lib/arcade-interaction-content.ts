import { randomInt } from "node:crypto";

export type ArcadeInteractionKind = "match" | "sort" | "classify";
export type ArcadeInteractionQuestion = {
  id: string;
  kind: ArcadeInteractionKind;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
};

export const INTERACTION_ARCADE_GAME_KEYS = [
  "count-match",
  "measurement-master",
  "synonym-switch",
  "antonym-arena",
  "body-explorer",
  "regions-capitals",
  "hardware-match",
  "chemistry-symbol-match",
  "sentence-scramble",
  "food-chain-builder",
  "coding-sequence",
  "sequence-lab",
  "geometry-builder",
  "living-nonliving",
  "matter-sort",
] as const;
export type InteractionArcadeGame = typeof INTERACTION_ARCADE_GAME_KEYS[number];

type MatchRow = readonly [prompt: string, answer: string, wrong1: string, wrong2: string, wrong3: string, explanation: string];
type SortRow = readonly [prompt: string, items: readonly string[], explanation: string];
type ClassifyRow = readonly [prompt: string, answer: string, buckets: readonly string[], explanation: string];

function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function repeatBank<T>(bank: readonly T[], length: number): T[] {
  const result: T[] = [];
  let pool = shuffle(bank);
  for (let index = 0; index < length; index++) {
    if (!pool.length) pool = shuffle(bank);
    result.push(pool.pop()!);
  }
  return result;
}
function matchQuestions(bank: readonly MatchRow[], length: number): ArcadeInteractionQuestion[] {
  return repeatBank(bank, length).map((row, index) => ({
    id: String(index), kind: "match", prompt: row[0], answer: row[1], options: shuffle([row[1], row[2], row[3], row[4]]), explanation: row[5],
  }));
}
function sortQuestions(bank: readonly SortRow[], length: number): ArcadeInteractionQuestion[] {
  return repeatBank(bank, length).map((row, index) => ({
    id: String(index), kind: "sort", prompt: row[0], answer: JSON.stringify(row[1]), options: shuffle(row[1]), explanation: row[2],
  }));
}
function classifyQuestions(bank: readonly ClassifyRow[], length: number): ArcadeInteractionQuestion[] {
  return repeatBank(bank, length).map((row, index) => ({
    id: String(index), kind: "classify", prompt: row[0], answer: row[1], options: shuffle(row[2]), explanation: row[3],
  }));
}

const measurement: readonly MatchRow[] = [
  ["Best unit for the length of a pencil", "centimetre", "kilometre", "litre", "kilogram", "A pencil is conveniently measured in centimetres."],
  ["Best unit for the distance between two cities", "kilometre", "millimetre", "gram", "millilitre", "Long road distances are commonly measured in kilometres."],
  ["Best unit for the mass of a bag of rice", "kilogram", "litre", "metre", "second", "Kilograms measure masses such as a bag of rice."],
  ["Best unit for the amount of water in a bottle", "litre", "kilometre", "degree Celsius", "gram per second", "Litres measure liquid capacity."],
  ["Instrument used to measure temperature", "thermometer", "metre rule", "measuring cylinder", "weighing scale", "A thermometer measures temperature."],
  ["Instrument used to measure the volume of a liquid in a lab", "measuring cylinder", "stopwatch", "spring balance", "protractor", "A measuring cylinder is graduated for liquid volume."],
  ["Instrument used to measure an angle", "protractor", "thermometer", "clock", "rain gauge", "A protractor measures angles in degrees."],
  ["Best unit for the duration of a short sprint", "second", "litre", "kilogram", "centimetre", "Short time intervals are commonly measured in seconds."],
];
const synonyms: readonly MatchRow[] = [
  ["rapid", "fast", "slow", "late", "quiet", "Rapid and fast have similar meanings."],
  ["assist", "help", "refuse", "hide", "damage", "To assist is to help."],
  ["ancient", "very old", "brand new", "noisy", "careless", "Ancient describes something very old."],
  ["fortunate", "lucky", "angry", "empty", "ordinary", "Fortunate means lucky or favoured by circumstances."],
  ["accurate", "correct", "rough", "uncertain", "distant", "Accurate information is correct or precise."],
  ["resilient", "able to recover", "easily broken", "always silent", "hard to see", "Resilient means able to recover after difficulty."],
  ["concise", "brief", "confusing", "very loud", "ancient", "Concise communication uses few words clearly."],
  ["evaluate", "assess", "ignore", "decorate", "repeat", "To evaluate is to assess or judge using evidence."],
];
const antonyms: readonly MatchRow[] = [
  ["ancient", "modern", "historic", "old", "past", "Modern is an opposite of ancient."],
  ["scarce", "abundant", "limited", "rare", "small", "Abundant means plentiful, the opposite of scarce."],
  ["expand", "contract", "grow", "extend", "increase", "Contract can mean become smaller, the opposite of expand."],
  ["generous", "selfish", "kind", "helpful", "giving", "Selfish contrasts with generous."],
  ["transparent", "opaque", "clear", "visible", "bright", "Opaque means light cannot pass through, unlike transparent."],
  ["temporary", "permanent", "brief", "short", "passing", "Permanent is the opposite of temporary."],
  ["accept", "reject", "receive", "agree", "allow", "Reject is the opposite of accept."],
  ["increase", "decrease", "rise", "grow", "expand", "Decrease means become less, the opposite of increase."],
];
const body: readonly MatchRow[] = [
  ["Heart", "pumps blood around the body", "digests food", "filters light", "stores urine", "The heart pumps blood through the circulatory system."],
  ["Lungs", "exchange oxygen and carbon dioxide", "produce urine", "break bones", "pump blood", "The lungs exchange respiratory gases."],
  ["Stomach", "helps digest food", "controls balance", "makes sound", "filters blood into urine", "The stomach helps chemically and mechanically digest food."],
  ["Kidneys", "filter wastes from the blood", "move the arms", "detect sound", "absorb light", "The kidneys filter wastes and help form urine."],
  ["Brain", "coordinates and controls body activities", "pumps blood", "stores bile", "absorbs nutrients", "The brain coordinates many body functions through the nervous system."],
  ["Small intestine", "absorbs most digested nutrients", "produces sound", "moves blood", "detects smell", "Most nutrient absorption happens in the small intestine."],
  ["Skeleton", "supports the body and protects organs", "digests protein", "exchanges gases", "makes hormones only", "The skeleton supports the body and protects organs."],
  ["Skin", "protects the body and helps sense the environment", "pumps blood", "stores urine", "makes red blood cells only", "Skin forms a protective barrier and contains sensory receptors."],
];
const regionsCapitals: readonly MatchRow[] = [
  ["Ashanti Region", "Kumasi", "Accra", "Tamale", "Cape Coast", "Kumasi is the capital of the Ashanti Region."],
  ["Greater Accra Region", "Accra", "Koforidua", "Ho", "Sunyani", "Accra is the capital of the Greater Accra Region."],
  ["Northern Region", "Tamale", "Bolgatanga", "Wa", "Damongo", "Tamale is the capital of the Northern Region."],
  ["Central Region", "Cape Coast", "Sekondi", "Techiman", "Goaso", "Cape Coast is the capital of the Central Region."],
  ["Eastern Region", "Koforidua", "Kumasi", "Hohoe", "Nalerigu", "Koforidua is the capital of the Eastern Region."],
  ["Volta Region", "Ho", "Dambai", "Accra", "Wa", "Ho is the capital of the Volta Region."],
  ["Upper East Region", "Bolgatanga", "Wa", "Tamale", "Damongo", "Bolgatanga is the capital of the Upper East Region."],
  ["Upper West Region", "Wa", "Bolgatanga", "Koforidua", "Goaso", "Wa is the capital of the Upper West Region."],
  ["Bono Region", "Sunyani", "Techiman", "Goaso", "Sefwi Wiawso", "Sunyani is the capital of the Bono Region."],
  ["Bono East Region", "Techiman", "Sunyani", "Dambai", "Cape Coast", "Techiman is the capital of the Bono East Region."],
  ["Ahafo Region", "Goaso", "Sunyani", "Nalerigu", "Ho", "Goaso is the capital of the Ahafo Region."],
  ["Western Region", "Sekondi", "Takoradi", "Sefwi Wiawso", "Kumasi", "Sekondi is the administrative capital of the Western Region."],
  ["Western North Region", "Sefwi Wiawso", "Sekondi", "Goaso", "Damongo", "Sefwi Wiawso is the capital of the Western North Region."],
  ["Oti Region", "Dambai", "Ho", "Techiman", "Wa", "Dambai is the capital of the Oti Region."],
  ["North East Region", "Nalerigu", "Tamale", "Bolgatanga", "Damongo", "Nalerigu is the capital of the North East Region."],
  ["Savannah Region", "Damongo", "Tamale", "Wa", "Dambai", "Damongo is the capital of the Savannah Region."],
];
const hardware: readonly MatchRow[] = [
  ["Keyboard", "enters letters, numbers and commands", "prints paper", "stores electricity", "projects sound only", "A keyboard is an input device for text and commands."],
  ["Mouse", "controls the pointer and selects items", "prints photographs", "stores files permanently", "measures temperature", "A mouse is a pointing input device."],
  ["Monitor", "displays visual output", "records sound", "types text", "cuts paper", "A monitor displays visual information from the computer."],
  ["Printer", "produces hard-copy output", "moves the pointer", "calculates network routes only", "records video", "A printer produces physical copies of digital documents."],
  ["Microphone", "captures sound as input", "displays text", "prints output", "stores paper", "A microphone converts sound into an input signal."],
  ["Scanner", "converts paper images or text into digital input", "plays music only", "moves a cursor", "measures mass", "A scanner digitises physical documents or images."],
  ["SSD", "stores digital data persistently", "displays video", "records voice directly", "prints pages", "An SSD is persistent storage."],
  ["Router", "forwards network traffic between networks", "types letters", "prints documents", "measures angles", "A router directs packets between networks."],
];
const chemistrySymbols: readonly MatchRow[] = [
  ["Hydrogen", "H", "He", "Hg", "N", "H is the chemical symbol for hydrogen."],
  ["Oxygen", "O", "Os", "Ox", "C", "O is the chemical symbol for oxygen."],
  ["Carbon", "C", "Ca", "Co", "Cl", "C is the chemical symbol for carbon."],
  ["Nitrogen", "N", "Na", "Ni", "Ne", "N is the chemical symbol for nitrogen."],
  ["Sodium", "Na", "S", "So", "Sn", "Na is the chemical symbol for sodium."],
  ["Potassium", "K", "P", "Po", "Pt", "K is the chemical symbol for potassium."],
  ["Iron", "Fe", "Ir", "I", "In", "Fe is the chemical symbol for iron."],
  ["Copper", "Cu", "Co", "C", "Cr", "Cu is the chemical symbol for copper."],
  ["Silver", "Ag", "Si", "S", "Au", "Ag is the chemical symbol for silver."],
  ["Gold", "Au", "Ag", "Gd", "Go", "Au is the chemical symbol for gold."],
];

const sentenceOrder: readonly SortRow[] = [
  ["Arrange the words into a clear sentence.", ["The", "children", "read", "quietly."], "A standard English sentence places the subject before the verb and the adverb naturally after the verb here."],
  ["Arrange the words into a clear sentence.", ["Ama", "finished", "her", "homework", "early."], "Subject, verb and object form the core sentence, followed by the time adverb."],
  ["Arrange the words into a question.", ["Where", "are", "you", "going?"], "This wh-question begins with the question word, followed by the auxiliary and subject."],
  ["Arrange the words into a clear sentence.", ["The", "rain", "stopped", "after", "noon."], "The subject comes before the verb, followed by the time phrase."],
  ["Arrange the words into a clear sentence.", ["We", "carefully", "measured", "the", "sample."], "The adverb carefully can appear before the main verb to describe how the action was done."],
  ["Arrange the words into a conditional sentence.", ["If", "it", "rains,", "we", "will", "stay", "inside."], "The condition comes first, followed by the result clause."],
];
const foodChains: readonly SortRow[] = [
  ["Build the food chain from producer to top consumer.", ["grass", "grasshopper", "frog", "snake"], "Energy moves from the grass to the herbivore and then through consumers."],
  ["Build the food chain from producer to top consumer.", ["maize", "mouse", "snake", "hawk"], "Maize is eaten by the mouse, which can be eaten by a snake, then a hawk."],
  ["Build the aquatic food chain from producer onward.", ["algae", "small fish", "large fish", "human"], "Algae are producers; energy then passes through consumers."],
  ["Build the food chain from producer onward.", ["leaves", "caterpillar", "small bird", "hawk"], "Leaves support the caterpillar, which can be eaten by a bird and then a hawk."],
  ["Build the food chain from producer onward.", ["grass", "goat", "human"], "Grass is the producer, the goat is a herbivore, and humans may consume goats."],
];
const codingOrder: readonly SortRow[] = [
  ["Put the steps for opening a saved document in a sensible order.", ["Open the application", "Choose Open", "Select the file", "Confirm Open"], "A user starts the application, chooses Open, selects the file and confirms."],
  ["Put the simple input-process-output algorithm in order.", ["Read two numbers", "Add the numbers", "Store the total", "Display the total"], "The algorithm receives input, processes it, stores the result and produces output."],
  ["Put the steps for a safe password change in order.", ["Open account security", "Verify current identity", "Enter a strong new password", "Save the change"], "Identity should be verified before a new credential is stored."],
  ["Order the loop description.", ["Set counter to 1", "Check whether counter is at most 5", "Run the repeated action", "Increase the counter", "Check the condition again"], "A counter loop initializes, checks, executes, increments and repeats the condition check."],
  ["Order the steps for testing a program change.", ["Describe the expected behaviour", "Run the test", "Compare actual and expected results", "Fix the cause if they differ"], "Testing starts with an expectation, then execution, comparison and correction."],
];

const living: readonly ClassifyRow[] = [
  ["goat", "Living", ["Living", "Non-living"], "A goat feeds, grows, responds and reproduces."],
  ["stone", "Non-living", ["Living", "Non-living"], "A stone does not carry out life processes."],
  ["maize plant", "Living", ["Living", "Non-living"], "A maize plant grows, respires and reproduces."],
  ["bicycle", "Non-living", ["Living", "Non-living"], "A bicycle can move when acted on but does not perform life processes."],
  ["mushroom", "Living", ["Living", "Non-living"], "A mushroom is a living fungus."],
  ["water", "Non-living", ["Living", "Non-living"], "Water is important for life but is not itself living."],
  ["bacterium", "Living", ["Living", "Non-living"], "A bacterium is a living microorganism."],
  ["cloud", "Non-living", ["Living", "Non-living"], "A cloud can change and move but does not carry out biological life processes."],
];
const matter: readonly ClassifyRow[] = [
  ["ice cube at room pressure below 0°C", "Solid", ["Solid", "Liquid", "Gas"], "Ice has a fixed shape and volume as a solid."],
  ["water in a cup", "Liquid", ["Solid", "Liquid", "Gas"], "Liquid water has a fixed volume but takes the shape of its container."],
  ["water vapour", "Gas", ["Solid", "Liquid", "Gas"], "Water vapour is gaseous water."],
  ["oxygen in the air", "Gas", ["Solid", "Liquid", "Gas"], "Oxygen is a gas under ordinary room conditions."],
  ["cooking oil", "Liquid", ["Solid", "Liquid", "Gas"], "Cooking oil flows and takes the shape of its container."],
  ["wooden desk", "Solid", ["Solid", "Liquid", "Gas"], "A wooden desk has a definite shape and volume."],
  ["carbon dioxide in exhaled air", "Gas", ["Solid", "Liquid", "Gas"], "Carbon dioxide is gaseous under ordinary conditions."],
  ["molten wax", "Liquid", ["Solid", "Liquid", "Gas"], "When wax melts it becomes a liquid."],
];
const geometry: readonly ClassifyRow[] = [
  ["An angle measuring 35°", "Acute angle", ["Acute angle", "Right angle", "Obtuse angle", "Reflex angle"], "35° is less than 90°, so it is acute."],
  ["An angle measuring 90°", "Right angle", ["Acute angle", "Right angle", "Obtuse angle", "Reflex angle"], "A 90° angle is a right angle."],
  ["An angle measuring 120°", "Obtuse angle", ["Acute angle", "Right angle", "Obtuse angle", "Reflex angle"], "120° is greater than 90° but less than 180°, so it is obtuse."],
  ["An angle measuring 240°", "Reflex angle", ["Acute angle", "Right angle", "Obtuse angle", "Reflex angle"], "240° is greater than 180° and less than 360°, so it is reflex."],
  ["A polygon with exactly three sides", "Triangle", ["Triangle", "Quadrilateral", "Pentagon", "Hexagon"], "A three-sided polygon is a triangle."],
  ["A polygon with exactly four sides", "Quadrilateral", ["Triangle", "Quadrilateral", "Pentagon", "Hexagon"], "A four-sided polygon is a quadrilateral."],
  ["A polygon with exactly five sides", "Pentagon", ["Triangle", "Quadrilateral", "Pentagon", "Hexagon"], "A five-sided polygon is a pentagon."],
  ["A polygon with exactly six sides", "Hexagon", ["Triangle", "Quadrilateral", "Pentagon", "Hexagon"], "A six-sided polygon is a hexagon."],
];

function countMatchQuestions(difficulty: number, length: number): ArcadeInteractionQuestion[] {
  const max = [5, 8, 12, 16, 20][difficulty - 1] ?? 20;
  return Array.from({ length }, (_, index) => {
    const answer = randomInt(1, max + 1);
    const dots = Array.from({ length: answer }, () => "●").join(" ");
    const distractors = new Set<number>();
    while (distractors.size < 3) {
      const candidate = Math.max(1, Math.min(max, answer + randomInt(-3, 4)));
      if (candidate !== answer) distractors.add(candidate);
    }
    return { id: String(index), kind: "match", prompt: `Count and match: ${dots}`, answer: String(answer), options: shuffle([String(answer), ...Array.from(distractors).map(String)]), explanation: `There are ${answer} dots.` };
  });
}
function sequenceQuestions(difficulty: number, length: number): ArcadeInteractionQuestion[] {
  return Array.from({ length }, (_, index) => {
    const step = difficulty <= 1 ? 1 : difficulty === 2 ? 2 : randomInt(2, 3 + difficulty);
    const start = randomInt(1, 8 + difficulty * 3);
    const ordered = Array.from({ length: difficulty >= 4 ? 5 : 4 }, (_, offset) => String(start + offset * step));
    return { id: String(index), kind: "sort", prompt: `Arrange the numbers from first to last in a +${step} sequence.`, answer: JSON.stringify(ordered), options: shuffle(ordered), explanation: `Each number increases by ${step}: ${ordered.join(", ")}.` };
  });
}

export function canGenerateArcadeInteractionContent(gameKey: string): gameKey is InteractionArcadeGame {
  return (INTERACTION_ARCADE_GAME_KEYS as readonly string[]).includes(gameKey);
}
export function createArcadeInteractionQuestions(gameKey: InteractionArcadeGame, difficulty: number, length = 5): ArcadeInteractionQuestion[] {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeLength = Math.max(1, Math.min(50, Math.trunc(length)));
  if (gameKey === "count-match") return countMatchQuestions(safeDifficulty, safeLength);
  if (gameKey === "measurement-master") return matchQuestions(measurement, safeLength);
  if (gameKey === "synonym-switch") return matchQuestions(synonyms, safeLength);
  if (gameKey === "antonym-arena") return matchQuestions(antonyms, safeLength);
  if (gameKey === "body-explorer") return matchQuestions(body, safeLength);
  if (gameKey === "regions-capitals") return matchQuestions(regionsCapitals, safeLength);
  if (gameKey === "hardware-match") return matchQuestions(hardware, safeLength);
  if (gameKey === "chemistry-symbol-match") return matchQuestions(chemistrySymbols, safeLength);
  if (gameKey === "sentence-scramble") return sortQuestions(sentenceOrder, safeLength);
  if (gameKey === "food-chain-builder") return sortQuestions(foodChains, safeLength);
  if (gameKey === "coding-sequence") return sortQuestions(codingOrder, safeLength);
  if (gameKey === "sequence-lab") return sequenceQuestions(safeDifficulty, safeLength);
  if (gameKey === "geometry-builder") return classifyQuestions(geometry, safeLength);
  if (gameKey === "living-nonliving") return classifyQuestions(living, safeLength);
  return classifyQuestions(matter, safeLength);
}

function parseOrder(answer: string): string[] | null {
  try {
    const parsed = JSON.parse(answer);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : null;
  } catch {
    return null;
  }
}
export function validArcadeInteractionAnswer(question: ArcadeInteractionQuestion, answer: string) {
  if (question.kind !== "sort") return question.options.includes(answer);
  const parsed = parseOrder(answer);
  if (!parsed || parsed.length !== question.options.length || new Set(parsed).size !== parsed.length) return false;
  const expectedItems = [...question.options].sort();
  return [...parsed].sort().every((item, index) => item === expectedItems[index]);
}
export function correctArcadeInteractionAnswer(question: ArcadeInteractionQuestion, answer: string) {
  if (question.kind !== "sort") return question.answer === answer;
  const submitted = parseOrder(answer), expected = parseOrder(question.answer);
  return Boolean(submitted && expected && submitted.length === expected.length && submitted.every((item, index) => item === expected[index]));
}
