import { randomInt } from "node:crypto";

export type ArcadeResponseKind = "path" | "build" | "typed";
export type ArcadeResponseQuestion = {
  id: string;
  kind: ArcadeResponseKind;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
  caseSensitive?: boolean;
};

export const RESPONSE_ARCADE_GAME_KEYS = [
  "subtraction-rescue",
  "equation-escape",
  "comprehension-quest",
  "circuit-logic",
  "civic-duty",
  "file-folder-quest",
  "puzzle-path",
  "fraction-forge",
  "punctuation-patrol",
  "binary-basics",
  "spelling-sprint",
  "keyboard-ninja",
] as const;
export type ResponseArcadeGame = typeof RESPONSE_ARCADE_GAME_KEYS[number];

type ChoiceRow = readonly [prompt: string, answer: string, wrong1: string, wrong2: string, wrong3: string, explanation: string];
type BuildRow = readonly [prompt: string, tiles: readonly string[], explanation: string];
type TypedRow = readonly [prompt: string, answer: string, explanation: string, caseSensitive?: boolean];

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
function pathQuestions(bank: readonly ChoiceRow[], length: number): ArcadeResponseQuestion[] {
  return repeatBank(bank, length).map((row, index) => ({
    id: String(index), kind: "path", prompt: row[0], answer: row[1], options: shuffle([row[1], row[2], row[3], row[4]]), explanation: row[5],
  }));
}
function buildQuestions(bank: readonly BuildRow[], length: number): ArcadeResponseQuestion[] {
  return repeatBank(bank, length).map((row, index) => ({
    id: String(index), kind: "build", prompt: row[0], answer: JSON.stringify(row[1]), options: shuffle(row[1]), explanation: row[2],
  }));
}
function typedQuestions(bank: readonly TypedRow[], length: number): ArcadeResponseQuestion[] {
  return repeatBank(bank, length).map((row, index) => ({
    id: String(index), kind: "typed", prompt: row[0], answer: row[1], options: [], explanation: row[2], caseSensitive: row[3] ?? false,
  }));
}
function numberOptions(answer: number) {
  const values = new Set<number>([answer]);
  const offsets = [-4, -3, -2, -1, 1, 2, 3, 4];
  for (const offset of shuffle(offsets)) {
    values.add(Math.max(0, answer + offset));
    if (values.size === 4) break;
  }
  return shuffle(Array.from(values).map(String));
}
function subtractionQuestions(difficulty: number, length: number): ArcadeResponseQuestion[] {
  const ceiling = [10, 30, 80, 200, 500][difficulty - 1] ?? 500;
  return Array.from({ length }, (_, index) => {
    const start = randomInt(Math.max(4, Math.floor(ceiling / 2)), ceiling + 1);
    const removed = randomInt(1, start);
    const answer = start - removed;
    return {
      id: String(index), kind: "path", prompt: `Rescue route: you start with ${start} supplies and use ${removed}. Which gate shows the supplies left?`,
      answer: String(answer), options: numberOptions(answer), explanation: `${start} − ${removed} = ${answer}.`,
    };
  });
}
function equationQuestions(difficulty: number, length: number): ArcadeResponseQuestion[] {
  return Array.from({ length }, (_, index) => {
    const coefficient = randomInt(2, Math.min(9, 3 + difficulty) + 1);
    const answer = randomInt(2, 5 + difficulty * 3);
    const constant = randomInt(1, 4 + difficulty * 2);
    const total = coefficient * answer + constant;
    return {
      id: String(index), kind: "path", prompt: `Escape equation: ${coefficient}x + ${constant} = ${total}. Which door gives x?`,
      answer: String(answer), options: numberOptions(answer), explanation: `Subtract ${constant}, then divide by ${coefficient}: x = ${answer}.`,
    };
  });
}

const comprehension: readonly ChoiceRow[] = [
  ["Kojo carried an umbrella because dark clouds were gathering. What can you reasonably infer?", "Rain may be coming", "Kojo dislikes sunshine", "The umbrella is broken", "It is midnight", "Dark gathering clouds are evidence that rain may be approaching."],
  ["The class planted seedlings, watered them daily and recorded their height each Friday. Why did they record height?", "To track growth over time", "To change the weather", "To count classroom chairs", "To make the seedlings shorter", "Repeated height records let the class compare plant growth over time."],
  ["Ama reread the instructions before connecting the wires. What does this action show?", "She wanted to work carefully", "She had finished the experiment", "She wanted to lose the instructions", "She was measuring rainfall", "Rereading instructions before a task is evidence of careful preparation."],
  ["The library notice says, 'Return borrowed books by Friday so others can use them.' What is the main purpose?", "Encourage timely returns", "Advertise a football match", "Close the library forever", "Ask learners to buy books", "The notice explains a deadline and why returning on time helps other readers."],
  ["Yaw saved part of his pocket money each week. After two months he could replace his broken calculator. Which idea best summarizes the passage?", "Regular saving can help meet a goal", "Calculators never break", "Money should always be spent immediately", "Two months has eight school terms", "Yaw's repeated saving helped him reach a specific purchase goal."],
  ["A report states that attendance rose from 82% to 91% after a reminder system began. Which statement is supported by the figures?", "Attendance was higher after the system began", "Every learner attended every day", "The system caused all absences", "Attendance fell by nine percentage points", "91% is higher than 82%; the figures support an increase, not perfect attendance or proof of cause."],
];
const circuits: readonly ChoiceRow[] = [
  ["A bulb, cell and wires form a complete closed loop. What is most likely?", "The bulb can light", "Current cannot flow anywhere", "The cell becomes a switch", "The wire becomes plastic", "A complete conducting loop allows electric current to flow through the bulb."],
  ["A switch is open in a simple circuit. What happens?", "The circuit path is broken", "The battery doubles", "The bulb becomes a conductor", "Current flows more easily", "An open switch breaks the conducting path."],
  ["Which material is generally a good electrical conductor?", "Copper", "Dry rubber", "Plastic", "Glass", "Copper contains mobile charge carriers and is widely used for electrical wiring."],
  ["Why is plastic commonly used around metal electrical wires?", "It is an electrical insulator", "It produces current", "It is always magnetic", "It increases voltage by itself", "Plastic helps prevent unintended contact with conducting metal."],
  ["Two cells are connected correctly in series in a simple school circuit. Compared with one similar cell, what can increase?", "The potential difference supplied", "The number of switches automatically", "The wire length automatically", "The bulb's mass", "Series cells can provide a larger combined potential difference when oriented correctly."],
  ["Before changing a classroom circuit, what is the safest first action?", "Disconnect the power source", "Touch bare conductors", "Add water to the circuit", "Short the cell terminals", "Disconnecting the source reduces the chance of current flowing while components are changed."],
];
const civic: readonly ChoiceRow[] = [
  ["You notice a public tap has been left running with nobody using it. What is the most responsible action?", "Close it if safe and report a fault if needed", "Leave it running all day", "Damage the tap", "Hide the problem", "Responsible citizenship includes protecting shared resources and reporting faults."],
  ["Two classmates strongly disagree during a group task. What is the best civic approach?", "Listen respectfully and use agreed rules to decide", "Threaten the other person", "Spread false stories", "Refuse every discussion", "Respectful dialogue and fair rules help groups resolve disagreement."],
  ["A community notice asks residents not to dump waste in a drain. Why should the instruction be followed?", "It protects a shared environment and can reduce blockage", "It makes drains smaller", "It removes all need for sanitation", "It prevents rainfall", "Keeping waste out of drains protects shared infrastructure and helps water flow."],
  ["You are unsure whether an online claim about a public issue is true. What should you do before sharing it?", "Check reliable evidence and sources", "Share it immediately", "Change the claim to sound stronger", "Delete all contrary evidence", "Verifying information before sharing supports responsible participation."],
  ["A school elects a class representative. Which behaviour supports a fair process?", "Allow eligible learners to choose without intimidation", "Count only one friend's vote", "Threaten learners who disagree", "Change results secretly", "A fair choice requires participation without intimidation and honest handling of results."],
  ["Which action best demonstrates care for public property?", "Use it properly and report damage", "Damage it because everyone owns it", "Take parts home without permission", "Ignore dangerous faults", "Public property serves many people, so responsible use and reporting help preserve it."],
];
const files: readonly ChoiceRow[] = [
  ["You are saving a science report for the first time. Which filename is most useful?", "Science_Report_Term2.docx", "document.docx", "newfile.docx", "thing.docx", "A descriptive filename makes the file easier to identify later."],
  ["You want to keep Mathematics and English work separate. What should you do?", "Create clearly named folders for each subject", "Rename every file 'work'", "Put every file in the recycle bin", "Delete the folder names", "Subject folders make related files easier to organize and find."],
  ["Before permanently deleting an unfamiliar school file, what is the safest action?", "Confirm what it is and whether it is still needed", "Delete it immediately", "Rename it randomly and delete backups", "Send it to strangers", "Checking the file's purpose reduces accidental data loss."],
  ["A teacher sends an attachment from a trusted school account, but its filename looks unusual. What should you do?", "Verify the attachment and expected file type before opening", "Disable all device security", "Forward it to everyone first", "Enter your password into the file", "Unexpected attachments should be verified before opening even when the apparent sender is familiar."],
  ["You edited a document but want to keep the original version too. What is a sensible approach?", "Save a new copy with a clear version name", "Overwrite every backup without checking", "Delete the original first", "Store both with identical names in the same folder", "A clearly named new version preserves the earlier copy and distinguishes the files."],
  ["A file was accidentally moved to the wrong folder. What is the correct recovery action?", "Move it back to the intended folder", "Reformat the computer", "Delete all folders", "Change the screen brightness", "Moving the file to the correct folder restores organization without unnecessary changes."],
];
const puzzles: readonly ChoiceRow[] = [
  ["A red box is heavier than a blue box. The blue box is heavier than a green box. Which is lightest?", "Green box", "Blue box", "Red box", "They must be equal", "If red > blue and blue > green, green is the lightest."],
  ["Every Kora is a Nemi. No Nemi is a Tavi. Can a Kora be a Tavi?", "No", "Always", "Only on Monday", "The statements give no relationship", "Because every Kora is a Nemi and no Nemi is a Tavi, no Kora can be a Tavi."],
  ["A meeting starts at 2:15 pm and lasts 45 minutes. When does it end?", "3:00 pm", "2:45 pm", "3:15 pm", "1:30 pm", "Adding 45 minutes to 2:15 pm gives 3:00 pm."],
  ["Three learners—Esi, Kofi and Sena—stand in a line. Esi is before Kofi, and Sena is after Kofi. Who is in the middle?", "Kofi", "Esi", "Sena", "Cannot be determined", "The only order satisfying both clues is Esi, Kofi, Sena."],
  ["A code changes each letter to the next letter in the alphabet. What does CAT become?", "DBU", "BAT", "CZU", "CAT", "C→D, A→B and T→U, so CAT becomes DBU."],
  ["A bag has only red and blue counters. If a counter is not red, what must it be?", "Blue", "Green", "Yellow", "Colourless", "With only red and blue possibilities, a counter that is not red must be blue."],
];

const fractions: readonly BuildRow[] = [
  ["Build a true equivalent-fraction statement.", ["one half", "equals", "two quarters"], "One half and two quarters represent the same proportion."],
  ["Build a true equivalent-fraction statement.", ["one third", "equals", "two sixths"], "Multiplying numerator and denominator by two turns one third into two sixths."],
  ["Build the comparison from smaller to larger.", ["one quarter", "is less than", "one half"], "One quarter is smaller than one half."],
  ["Build a whole-number fraction statement.", ["four quarters", "equals", "one whole"], "Four quarters make one whole."],
  ["Build a true equivalent-fraction statement.", ["three fifths", "equals", "six tenths"], "Multiplying numerator and denominator by two gives six tenths."],
  ["Build the comparison from larger to smaller.", ["three quarters", "is greater than", "one half"], "Three quarters is greater than one half."],
];
const punctuation: readonly BuildRow[] = [
  ["Build the correctly punctuated sentence.", ["After school", ",", "we practised football", "."], "An introductory phrase is followed by a comma, and the statement ends with a full stop."],
  ["Build the correctly punctuated question.", ["Where", "are you going", "?"], "A direct question ends with a question mark."],
  ["Build the correctly punctuated exclamation.", ["What a wonderful result", "!"], "An exclamation can end with an exclamation mark."],
  ["Build the sentence showing possession.", ["Ama", "'s", "book is on the desk", "."], "The apostrophe plus s marks singular possession in 'Ama's'."],
  ["Build the correctly punctuated list sentence.", ["We packed books", ",", "pens and rulers", "."], "The comma separates the first item from the remaining list phrase, and the sentence ends with a full stop."],
  ["Build the sentence with direct speech punctuation.", ["Kojo said", ",", "“We are ready.”"], "A reporting clause can be followed by a comma before the quoted words."],
];
const binary: readonly BuildRow[] = [
  ["Build the place-value explanation for binary 1010.", ["8s place: 1", "4s place: 0", "2s place: 1", "1s place: 0", "total: 10"], "Binary 1010 represents 8 + 2 = 10."],
  ["Build the place-value explanation for binary 0101.", ["8s place: 0", "4s place: 1", "2s place: 0", "1s place: 1", "total: 5"], "Binary 0101 represents 4 + 1 = 5."],
  ["Build the place-value explanation for binary 1111.", ["8s place: 1", "4s place: 1", "2s place: 1", "1s place: 1", "total: 15"], "Binary 1111 represents 8 + 4 + 2 + 1 = 15."],
  ["Build the place-value explanation for binary 1001.", ["8s place: 1", "4s place: 0", "2s place: 0", "1s place: 1", "total: 9"], "Binary 1001 represents 8 + 1 = 9."],
  ["Build the place-value explanation for binary 0110.", ["8s place: 0", "4s place: 1", "2s place: 1", "1s place: 0", "total: 6"], "Binary 0110 represents 4 + 2 = 6."],
];

const spelling: readonly TypedRow[] = [
  ["Type the correct spelling for: a place where books are borrowed and read.", "library", "Library is spelled l-i-b-r-a-r-y."],
  ["Type the correct spelling for: the subject that studies numbers, shapes and calculations.", "mathematics", "Mathematics is spelled m-a-t-h-e-m-a-t-i-c-s."],
  ["Type the correct spelling for: careful watching or noticing.", "observation", "Observation is spelled o-b-s-e-r-v-a-t-i-o-n."],
  ["Type the correct spelling for: the ability to keep going despite difficulty.", "perseverance", "Perseverance is spelled p-e-r-s-e-v-e-r-a-n-c-e."],
  ["Type the correct spelling for: a duty or something you are expected to take care of.", "responsibility", "Responsibility is spelled r-e-s-p-o-n-s-i-b-i-l-i-t-y."],
  ["Type the correct spelling for: facts or information used to support a conclusion.", "evidence", "Evidence is spelled e-v-i-d-e-n-c-e."],
  ["Type the correct spelling for: protecting computers, accounts and information from digital threats.", "cybersecurity", "Cybersecurity is commonly written as one word: c-y-b-e-r-s-e-c-u-r-i-t-y."],
  ["Type the correct spelling for: able to be trusted or depended on.", "reliable", "Reliable is spelled r-e-l-i-a-b-l-e."],
];
const keyboard: readonly TypedRow[] = [
  ["Type this exactly: Ghana", "Ghana", "The target begins with a capital G and has no punctuation.", true],
  ["Type this exactly: SukuuNova", "SukuuNova", "The target uses capital S and N with no space.", true],
  ["Type this exactly: Basic 6", "Basic 6", "The target contains a capital B, a space and the numeral 6.", true],
  ["Type this exactly: Ready, set, learn!", "Ready, set, learn!", "Match the capitalization, commas, spaces and exclamation mark.", true],
  ["Type this exactly: Ctrl + S", "Ctrl + S", "Match the capitalization and spaces around the plus sign.", true],
  ["Type this exactly: 2026-09-09", "2026-09-09", "Match every numeral and hyphen in the target date string.", true],
  ["Type this exactly: safe_passwords", "safe_passwords", "Match the lowercase letters and underscore.", true],
  ["Type this exactly: Accuracy = 100%", "Accuracy = 100%", "Match the capital A, spaces, equals sign and percent sign.", true],
];

export function canGenerateArcadeResponseContent(gameKey: string): gameKey is ResponseArcadeGame {
  return (RESPONSE_ARCADE_GAME_KEYS as readonly string[]).includes(gameKey);
}
export function createArcadeResponseQuestions(gameKey: ResponseArcadeGame, difficulty: number, length = 5): ArcadeResponseQuestion[] {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeLength = Math.max(1, Math.min(50, Math.trunc(length)));
  if (gameKey === "subtraction-rescue") return subtractionQuestions(safeDifficulty, safeLength);
  if (gameKey === "equation-escape") return equationQuestions(safeDifficulty, safeLength);
  if (gameKey === "comprehension-quest") return pathQuestions(comprehension, safeLength);
  if (gameKey === "circuit-logic") return pathQuestions(circuits, safeLength);
  if (gameKey === "civic-duty") return pathQuestions(civic, safeLength);
  if (gameKey === "file-folder-quest") return pathQuestions(files, safeLength);
  if (gameKey === "puzzle-path") return pathQuestions(puzzles, safeLength);
  if (gameKey === "fraction-forge") return buildQuestions(fractions, safeLength);
  if (gameKey === "punctuation-patrol") return buildQuestions(punctuation, safeLength);
  if (gameKey === "binary-basics") return buildQuestions(binary, safeLength);
  if (gameKey === "spelling-sprint") return typedQuestions(spelling, safeLength);
  return typedQuestions(keyboard, safeLength);
}

function parseOrder(answer: string): string[] | null {
  try {
    const parsed = JSON.parse(answer);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : null;
  } catch {
    return null;
  }
}
function validPermutation(question: ArcadeResponseQuestion, answer: string) {
  const parsed = parseOrder(answer);
  if (!parsed || parsed.length !== question.options.length || new Set(parsed).size !== parsed.length) return false;
  const expected = [...question.options].sort();
  return [...parsed].sort().every((item, index) => item === expected[index]);
}
export function validArcadeResponseAnswer(question: ArcadeResponseQuestion, answer: string) {
  if (question.kind === "path") return question.options.includes(answer);
  if (question.kind === "build") return validPermutation(question, answer);
  return answer.length <= 160 && answer.trim().length > 0;
}
export function correctArcadeResponseAnswer(question: ArcadeResponseQuestion, answer: string) {
  if (question.kind === "path") return question.answer === answer;
  if (question.kind === "build") {
    const submitted = parseOrder(answer), expected = parseOrder(question.answer);
    return Boolean(submitted && expected && submitted.length === expected.length && submitted.every((item, index) => item === expected[index]));
  }
  const submitted = answer.trim(), expected = question.answer.trim();
  return question.caseSensitive ? submitted === expected : submitted.toLocaleLowerCase() === expected.toLocaleLowerCase();
}
