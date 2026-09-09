import { randomInt } from "node:crypto";

export type ArcadeWorldKind = "choice_plus" | "match_plus" | "sort_plus" | "grid" | "map" | "memory" | "simulation";
export type ArcadeWorldScene = {
  boardTitle?: string;
  x?: number;
  y?: number;
  cells?: string[];
  meterLabels?: string[];
  cue?: string;
};
export type ArcadeWorldQuestion = {
  id: string;
  kind: ArcadeWorldKind;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
  scene?: ArcadeWorldScene;
};

export const WORLD_ARCADE_GAME_KEYS = [
  "ratio-race",
  "money-math-market",
  "data-detective",
  "letter-hunt",
  "sound-match",
  "reading-detective",
  "tense-trek",
  "essay-planner",
  "force-motion-lab",
  "energy-quest",
  "space-explorer",
  "ghana-map-master",
  "africa-explorer",
  "world-flags-capitals",
  "history-timeline",
  "culture-heritage",
  "environment-guardian",
  "cyber-safety",
  "memory-matrix",
  "logic-grid-lite",
  "budget-boss",
  "healthy-choices",
  "road-safety",
  "entrepreneurship-simulator",
] as const;
export type WorldArcadeGame = typeof WORLD_ARCADE_GAME_KEYS[number];

type ChoiceRow = readonly [prompt: string, answer: string, wrong1: string, wrong2: string, wrong3: string, explanation: string];
type MatchRow = readonly [prompt: string, answer: string, wrong1: string, wrong2: string, wrong3: string, explanation: string];
type SortRow = readonly [prompt: string, items: readonly string[], explanation: string];
type MapRow = readonly [prompt: string, answer: string, wrong1: string, wrong2: string, wrong3: string, explanation: string, x: number, y: number, boardTitle: string];
type SimulationRow = readonly [prompt: string, answer: string, wrong1: string, wrong2: string, wrong3: string, explanation: string, cue: string, meter1: string, meter2: string, meter3: string];
type MemoryRow = readonly [prompt: string, answer: string, wrong1: string, wrong2: string, wrong3: string, explanation: string];

function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
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
function choiceQuestions(bank: readonly ChoiceRow[], length: number, kind: "choice_plus" | "match_plus" = "choice_plus"): ArcadeWorldQuestion[] {
  return repeatBank(bank, length).map((row, index) => ({
    id: String(index), kind, prompt: row[0], answer: row[1], options: shuffle([row[1], row[2], row[3], row[4]]), explanation: row[5],
  }));
}
function sortQuestions(bank: readonly SortRow[], length: number): ArcadeWorldQuestion[] {
  return repeatBank(bank, length).map((row, index) => ({
    id: String(index), kind: "sort_plus", prompt: row[0], answer: JSON.stringify(row[1]), options: shuffle(row[1]), explanation: row[2],
  }));
}
function mapQuestions(bank: readonly MapRow[], length: number): ArcadeWorldQuestion[] {
  return repeatBank(bank, length).map((row, index) => ({
    id: String(index), kind: "map", prompt: row[0], answer: row[1], options: shuffle([row[1], row[2], row[3], row[4]]), explanation: row[5], scene: { x: row[6], y: row[7], boardTitle: row[8] },
  }));
}
function simulationQuestions(bank: readonly SimulationRow[], length: number): ArcadeWorldQuestion[] {
  return repeatBank(bank, length).map((row, index) => ({
    id: String(index), kind: "simulation", prompt: row[0], answer: row[1], options: shuffle([row[1], row[2], row[3], row[4]]), explanation: row[5], scene: { cue: row[6], meterLabels: [row[7], row[8], row[9]] },
  }));
}
function memoryQuestions(bank: readonly MemoryRow[], length: number): ArcadeWorldQuestion[] {
  return repeatBank(bank, length).map((row, index) => ({
    id: String(index), kind: "memory", prompt: row[0], answer: row[1], options: shuffle([row[1], row[2], row[3], row[4]]), explanation: row[5],
  }));
}
function gridQuestion(prompt: string, target: string, cells: string[], explanation: string, id: number): ArcadeWorldQuestion {
  return { id: String(id), kind: "grid", prompt, answer: target, options: cells, explanation, scene: { cells, boardTitle: "Hunt grid" } };
}
function gridQuestions(game: "letter-hunt" | "logic-grid-lite", difficulty: number, length: number): ArcadeWorldQuestion[] {
  if (game === "letter-hunt") {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const size = difficulty >= 4 ? 16 : difficulty >= 2 ? 12 : 9;
    return Array.from({ length }, (_, index) => {
      const target = alphabet[randomInt(alphabet.length)];
      const cells = new Set<string>([target]);
      while (cells.size < size) cells.add(alphabet[randomInt(alphabet.length)]);
      const shuffled = shuffle([...cells]);
      return gridQuestion(`Find the letter ${target}. Tap it in the grid.`, target, shuffled, `The target letter is ${target}.`, index);
    });
  }
  const banks = [
    ["2", "4", "6", "8", "10", "12", "14", "16", "18"],
    ["3", "6", "9", "12", "15", "18", "21", "24", "27"],
    ["5", "10", "15", "20", "25", "30", "35", "40", "45"],
  ];
  return Array.from({ length }, (_, index) => {
    const bank = banks[randomInt(banks.length)];
    const targetIndex = Math.min(bank.length - 1, 3 + randomInt(4));
    const target = bank[targetIndex];
    return gridQuestion(`Scan the grid and find ${target}. Use the surrounding multiples to keep your place.`, target, shuffle(bank), `${target} is the requested multiple in this grid.`, index);
  });
}

function ratioQuestions(difficulty: number, length: number): ArcadeWorldQuestion[] {
  return Array.from({ length }, (_, index) => {
    const factor = randomInt(2, Math.min(8, 3 + difficulty) + 1);
    const left = randomInt(1, 4 + difficulty);
    const right = randomInt(1, 4 + difficulty);
    const answer = `${left * factor}:${right * factor}`;
    const wrong = [`${left * factor + 1}:${right * factor}`, `${left}:${right * factor}`, `${left * factor}:${right * factor + factor}`];
    return { id: String(index), kind: "choice_plus", prompt: `Which ratio is equivalent to ${left}:${right}?`, answer, options: shuffle([answer, ...wrong]), explanation: `Multiplying both parts by ${factor} gives ${answer}.` };
  });
}
function dataQuestions(difficulty: number, length: number): ArcadeWorldQuestion[] {
  return Array.from({ length }, (_, index) => {
    const a = randomInt(5, 12 + difficulty * 3), b = randomInt(5, 12 + difficulty * 3), c = randomInt(5, 12 + difficulty * 3);
    const total = a + b + c;
    const max = Math.max(a, b, c);
    const labels = ["A", "B", "C"];
    const values = [a, b, c];
    if (index % 2 === 0) {
      const answer = String(total);
      return { id: String(index), kind: "choice_plus", prompt: `A small table shows A=${a}, B=${b}, C=${c}. What is the total?`, answer, options: shuffle([answer, String(total + 2), String(Math.max(0, total - 2)), String(max)]), explanation: `${a} + ${b} + ${c} = ${total}.` };
    }
    const answer = labels[values.indexOf(max)];
    return { id: String(index), kind: "choice_plus", prompt: `A small table shows A=${a}, B=${b}, C=${c}. Which category has the greatest value?`, answer, options: shuffle(["A", "B", "C", "All equal"]), explanation: `${answer} has the greatest value, ${max}.` };
  });
}

const soundMatch: readonly MatchRow[] = [
  ["Match the beginning sound /sh/ to a word.", "ship", "cat", "moon", "pen", "Ship begins with the /sh/ sound."],
  ["Match the beginning sound /ch/ to a word.", "chair", "fish", "goat", "sun", "Chair begins with the /ch/ sound."],
  ["Match the beginning sound /b/ to a word.", "ball", "kite", "orange", "ship", "Ball begins with the /b/ sound."],
  ["Match the ending sound /t/ to a word.", "hat", "dog", "pen", "cow", "Hat ends with the /t/ sound."],
  ["Match the long /ee/ sound to a word.", "tree", "cat", "book", "sun", "Tree contains the long /ee/ sound."],
  ["Match the /f/ sound to a word.", "fish", "chair", "goat", "moon", "Fish begins with /f/."],
];
const reading: readonly ChoiceRow[] = [
  ["Mansa checked the bus timetable twice and left home early. What can you infer?", "She wanted to avoid missing the bus", "She wanted the bus to leave late", "She forgot where home was", "She planned to walk all day", "Checking the timetable and leaving early support the inference that she wanted to be on time."],
  ["The soil was dry, so Kweku watered the seedlings before sunset. What caused him to water them?", "The soil was dry", "The sunset was loud", "The seedlings were books", "The watering made the soil dry first", "The sentence directly links the dry soil to Kweku's action."],
  ["A notice says 'Quiet study from 2–4 pm.' What should a library visitor do then?", "Keep noise low", "Play loud music", "Move every book", "Close the library", "The notice asks visitors to preserve a quiet study period."],
  ["After practising every evening, Akosua read the passage more smoothly. Which idea is supported?", "Practice can improve fluency", "Reading always becomes harder", "Evening causes all learning", "The passage changed itself", "The improvement followed repeated practice, supporting the idea that practice can build fluency."],
  ["A report gives two sources that agree on the date of an event. Why is that useful?", "It provides supporting evidence", "It proves every detail is true", "It removes the need to read", "It changes the event date", "Independent agreement can strengthen evidence for a factual detail."],
  ["The writer describes a road as 'a silver ribbon through the hills.' What technique is being used?", "Metaphorical imagery", "A timetable", "A shopping list", "A literal measurement only", "The road is compared imaginatively to a silver ribbon."],
];
const tense: readonly ChoiceRow[] = [
  ["Choose the verb that completes: Yesterday, Ama ___ to school early.", "walked", "walks", "will walk", "walking tomorrow", "Yesterday signals past time, so 'walked' fits."],
  ["Choose the verb that completes: Every Monday, Kojo ___ the library.", "visits", "visited tomorrow", "will visited", "visiting yesterday", "A repeated present routine takes 'visits'."],
  ["Choose the verb that completes: Tomorrow, we ___ the experiment.", "will repeat", "repeated yesterday", "repeats", "was repeat", "Tomorrow signals future time, so 'will repeat' fits."],
  ["Choose the best form: The learners ___ quietly when the bell rang.", "were reading", "are read", "will reads", "has reading", "The ongoing past action is expressed by 'were reading'."],
  ["Choose the best form: She has ___ her homework already.", "finished", "finish", "finishing yesterday", "will finished", "Present perfect uses 'has' plus the past participle 'finished'."],
  ["Choose the best form: By next week, the team ___ the project.", "will have completed", "completed yesterday", "has complete", "is completed last week", "Future perfect describes something expected to be complete by a future time."],
];
const essayPlans: readonly SortRow[] = [
  ["Arrange a simple opinion paragraph plan.", ["State the main opinion", "Give a supporting reason", "Add an example", "Conclude the point"], "A clear paragraph moves from a claim to support, example and conclusion."],
  ["Arrange a basic narrative plan.", ["Introduce the setting and characters", "Present the problem", "Show key events", "Resolve the problem"], "Narratives commonly establish context, develop a problem and events, then resolve it."],
  ["Arrange a short report structure.", ["Title the report", "Introduce the topic", "Present findings", "Give a conclusion or recommendation"], "Reports benefit from a clear title, context, findings and a closing conclusion or recommendation."],
  ["Arrange steps for planning an essay before drafting.", ["Understand the question", "Brainstorm relevant ideas", "Group ideas into sections", "Order the sections logically"], "Good planning begins with understanding the task before organizing ideas."],
  ["Arrange a compare-and-contrast paragraph.", ["Name the two things being compared", "State one similarity", "State one difference", "Explain why the comparison matters"], "The reader needs context before similarities, differences and significance."],
  ["Arrange an explanatory paragraph.", ["State what will be explained", "Describe the first key idea", "Connect the next idea", "Summarize the explanation"], "Explanations benefit from a clear topic, connected ideas and a summary."],
];
const energy: readonly ChoiceRow[] = [
  ["A moving bicycle has mainly which form of energy because it is moving?", "Kinetic energy", "Chemical symbol", "Static mass", "Soundproofing", "Energy of motion is kinetic energy."],
  ["A stretched elastic band stores energy mainly as what?", "Elastic potential energy", "Nuclear waste", "Weather pressure", "Magnetic colour", "Deformation can store elastic potential energy."],
  ["A battery stores energy mainly in which form before use?", "Chemical energy", "Only sound energy", "Only light energy", "Gravitational colour", "Chemical reactions in a battery can supply electrical energy."],
  ["A solar panel receives energy from sunlight. What form arrives from the Sun?", "Radiant/light energy", "Only elastic energy", "Only gravitational energy", "No energy", "Sunlight carries radiant energy."],
  ["When a lamp is switched on, electrical energy is transferred mainly into light and what other common form?", "Thermal energy", "Mass", "Length", "Pressure only", "Lamps also release some energy as heat."],
  ["Which change best describes a falling object?", "Gravitational potential energy decreases as kinetic energy can increase", "All energy disappears", "Kinetic energy must become zero", "Mass becomes energy-free", "As an object falls, gravitational potential energy can transfer into kinetic energy."],
];
const worldCapitals: readonly MatchRow[] = [
  ["Match Ghana to its capital.", "Accra", "Nairobi", "Lagos", "Dakar", "Accra is the capital of Ghana."],
  ["Match Kenya to its capital.", "Nairobi", "Accra", "Cairo", "Kigali", "Nairobi is the capital of Kenya."],
  ["Match Senegal to its capital.", "Dakar", "Accra", "Lomé", "Pretoria", "Dakar is the capital of Senegal."],
  ["Match Egypt to its capital.", "Cairo", "Nairobi", "Abuja", "Kampala", "Cairo is the capital of Egypt."],
  ["Match Nigeria to its federal capital.", "Abuja", "Lagos", "Accra", "Dakar", "Abuja is Nigeria's federal capital."],
  ["Match Rwanda to its capital.", "Kigali", "Cairo", "Accra", "Dakar", "Kigali is the capital of Rwanda."],
];
const history: readonly SortRow[] = [
  ["Arrange these Ghana-history milestones from earlier to later.", ["Bond of 1844", "Formation of the United Gold Coast Convention", "Independence of Ghana", "Ghana becomes a republic"], "The sequence runs from 1844, to the UGCC in 1947, independence in 1957 and republic status in 1960."],
  ["Arrange a historical investigation workflow.", ["Ask a focused question", "Gather relevant sources", "Compare the evidence", "Write a supported conclusion"], "Historical inquiry begins with a question and evidence before a conclusion."],
  ["Arrange these broad technological eras from earlier to later.", ["Handwritten manuscripts", "Printing press expansion", "Electronic computers", "Modern internet services"], "The sequence moves from manuscripts to print, computing and networked digital services."],
  ["Arrange these stages in preserving oral history.", ["Identify a knowledgeable source", "Prepare respectful questions", "Record the interview", "Archive the recording and notes"], "Preparation and interviewing come before long-term archiving."],
  ["Arrange these steps for checking a historical claim.", ["Identify the claim", "Find independent sources", "Check dates and context", "Decide how strongly the evidence supports it"], "Claims should be defined before sources and context are evaluated."],
  ["Arrange these life-record milestones.", ["Birth record", "School enrolment record", "Graduation record", "Employment record"], "These records generally appear in that life-stage order."],
];
const culture: readonly MatchRow[] = [
  ["Match kente to the description.", "A woven Ghanaian textile tradition", "A type of rainfall", "A computer file", "A road sign", "Kente is a renowned woven textile tradition associated with Ghana."],
  ["Match Adinkra symbols to their common cultural role.", "Visual symbols carrying ideas and proverbs", "Only mathematical operators", "Weather instruments", "Traffic lights", "Adinkra symbols communicate concepts, values and proverbial ideas."],
  ["Match a durbar to the description.", "A ceremonial gathering involving chiefs and community", "A file extension", "A laboratory chemical", "A football rule", "Durbars are important ceremonial community gatherings in Ghanaian contexts."],
  ["Match oral tradition to its role.", "Passing knowledge and stories through spoken forms", "Deleting all history", "Measuring voltage", "Printing banknotes", "Oral traditions transmit history, values and stories through spoken performance."],
  ["Match drumming and dance to a cultural function.", "Expression in ceremonies, festivals and social life", "Only silence practice", "A spreadsheet formula", "A weather forecast", "Music and dance can carry social, ceremonial and historical meaning."],
  ["Match heritage conservation to its aim.", "Protecting valued cultural places, objects and practices", "Replacing every old object", "Stopping all learning", "Removing community memory", "Conservation helps protect cultural heritage for present and future communities."],
];

const spaceMap: readonly MapRow[] = [
  ["The marker sits on the third orbit from the Sun. Which planet belongs there?", "Earth", "Mercury", "Mars", "Jupiter", "Earth is the third planet from the Sun.", 43, 50, "Solar-system orbit map"],
  ["The marker sits on the fourth orbit from the Sun. Which planet belongs there?", "Mars", "Venus", "Earth", "Saturn", "Mars is the fourth planet from the Sun.", 53, 48, "Solar-system orbit map"],
  ["The marker is on the largest planet's orbit. Which label fits?", "Jupiter", "Mercury", "Earth", "Mars", "Jupiter is the largest planet in the Solar System.", 66, 52, "Solar-system orbit map"],
  ["The marker is on the second orbit from the Sun. Which planet belongs there?", "Venus", "Mercury", "Earth", "Mars", "Venus is the second planet from the Sun.", 32, 45, "Solar-system orbit map"],
  ["The marker is on the planet famous for its prominent rings. Which label fits?", "Saturn", "Mars", "Venus", "Mercury", "Saturn is well known for its extensive ring system.", 78, 48, "Solar-system orbit map"],
  ["The marker is at the central star of the Solar System. Which label fits?", "Sun", "Moon", "Earth", "Mars", "The Sun is the central star of the Solar System.", 13, 50, "Solar-system orbit map"],
];
const ghanaMap: readonly MapRow[] = [
  ["The marker is in Ghana's coastal capital area. Which label fits?", "Greater Accra Region", "Upper West Region", "Northern Region", "Bono Region", "Greater Accra contains Ghana's national capital and lies on the southern coast.", 69, 83, "Ghana schematic map"],
  ["The marker is in the central-southern area around Kumasi. Which label fits?", "Ashanti Region", "Volta Region", "Upper East Region", "Western North Region", "Ashanti Region lies in the central-southern part of Ghana and includes Kumasi.", 48, 58, "Ghana schematic map"],
  ["The marker is in Ghana's far north-west. Which label fits?", "Upper West Region", "Greater Accra Region", "Central Region", "Oti Region", "Upper West is in the north-west of Ghana.", 29, 15, "Ghana schematic map"],
  ["The marker is in Ghana's far north-east. Which label fits?", "Upper East Region", "Western Region", "Ashanti Region", "Ahafo Region", "Upper East is in the north-eastern part of Ghana.", 66, 13, "Ghana schematic map"],
  ["The marker is along the south-western coast. Which label fits?", "Western Region", "Northern Region", "Oti Region", "Upper East Region", "Western Region occupies part of Ghana's south-western coast.", 20, 78, "Ghana schematic map"],
  ["The marker is in the eastern side near Lake Volta's lower reaches. Which label fits?", "Volta Region", "Savannah Region", "Upper West Region", "Western North Region", "Volta Region lies along Ghana's eastern side.", 79, 59, "Ghana schematic map"],
];
const africaMap: readonly MapRow[] = [
  ["The marker is on the Gulf of Guinea in West Africa. Which country fits?", "Ghana", "Kenya", "Egypt", "South Africa", "Ghana lies in West Africa on the Gulf of Guinea.", 30, 51, "Africa schematic map"],
  ["The marker is in the north-east corner of Africa near the Mediterranean and Red Sea. Which country fits?", "Egypt", "Ghana", "Namibia", "Senegal", "Egypt lies in north-eastern Africa.", 66, 17, "Africa schematic map"],
  ["The marker is on the east of Africa near the Indian Ocean. Which country fits?", "Kenya", "Ghana", "Morocco", "Senegal", "Kenya lies in East Africa and has an Indian Ocean coastline.", 70, 52, "Africa schematic map"],
  ["The marker is near the southern tip of the continent. Which country fits?", "South Africa", "Egypt", "Ghana", "Tunisia", "South Africa occupies the southern end of the African continent.", 57, 87, "Africa schematic map"],
  ["The marker is on Africa's far western bulge. Which country fits?", "Senegal", "Kenya", "Egypt", "Uganda", "Senegal is on the far west of the African mainland.", 14, 39, "Africa schematic map"],
  ["The marker is in the north-west of Africa. Which country fits?", "Morocco", "Kenya", "Ghana", "Botswana", "Morocco lies in north-western Africa.", 28, 11, "Africa schematic map"],
];

const moneySimulation: readonly SimulationRow[] = [
  ["You have GH₵50. An item costs GH₵32. What is the best payment decision if you want the correct change?", "Pay GH₵50 and expect GH₵18 change", "Expect GH₵12 change", "Pay GH₵32 and expect GH₵18 change", "Pay nothing and take the item", "GH₵50 − GH₵32 = GH₵18.", "Balance the purchase and change.", "Cash", "Cost", "Change"],
  ["A notebook is GH₵18 and a pen is GH₵7. You have GH₵30. Which decision is correct?", "Buy both and keep GH₵5", "Buy both and keep GH₵12", "You cannot afford both", "Spend GH₵35", "The total is GH₵25, leaving GH₵5.", "Keep the spending meter inside the cash available.", "Cash", "Spend", "Left"],
  ["A shop gives a GH₵5 discount on an item priced GH₵40. What should the final price be?", "GH₵35", "GH₵45", "GH₵40", "GH₵30", "GH₵40 − GH₵5 = GH₵35.", "Apply the discount before paying.", "Price", "Discount", "Final"],
  ["You receive GH₵100 and want to save GH₵30 before spending. What is the maximum available to spend?", "GH₵70", "GH₵130", "GH₵30", "GH₵100", "Setting aside GH₵30 leaves GH₵70 available.", "Protect savings before choosing spending.", "Income", "Save", "Spendable"],
];
const forceSimulation: readonly SimulationRow[] = [
  ["A toy car is at rest on a smooth floor. Which action is most likely to make it start moving?", "Apply a push or pull", "Remove all forces forever", "Change its colour", "Turn off the lights", "A net force can change an object's state of motion.", "Choose the force that changes motion.", "Force", "Motion", "Friction"],
  ["Two learners push a box equally hard in opposite directions. What is the likely net force?", "Approximately zero", "Double in one direction", "Always upward", "Infinite", "Equal opposite forces balance, giving approximately zero net force.", "Balance the force arrows.", "Left force", "Right force", "Net"],
  ["The same push is applied to two carts, but one has much more mass. Which is likely to accelerate less?", "The heavier cart", "The lighter cart", "Both must accelerate infinitely", "Mass never matters", "For the same net force, greater mass gives smaller acceleration.", "Compare force with mass response.", "Force", "Mass", "Acceleration"],
  ["A rolling ball slows on rough ground. Which force mainly opposes its motion?", "Friction", "Light", "Colour", "Sound", "Friction acts opposite relative motion between surfaces.", "Watch the motion meter lose speed.", "Motion", "Friction", "Speed"],
];
const environmentSimulation: readonly SimulationRow[] = [
  ["A school tap is leaking continuously. Which action best protects water resources?", "Report the leak and arrange repair", "Leave it running", "Break the tap further", "Hide the leak", "Repairing leaks reduces unnecessary water loss.", "Balance daily use against waste.", "Water", "Waste", "Care"],
  ["A classroom has reusable paper on one side. What is the best first action before throwing it away?", "Use the blank side when appropriate", "Burn it indoors", "Throw it into a drain", "Soak it in clean drinking water", "Reusing suitable paper can reduce waste before recycling or disposal.", "Move material from waste toward reuse.", "Use", "Reuse", "Waste"],
  ["The school compound has litter near a drain. What is the most responsible response?", "Organize safe collection and proper disposal", "Push it into the drain", "Add more litter", "Ignore blocked drainage", "Keeping waste out of drains protects sanitation and water flow.", "Protect the drain and shared space.", "Waste", "Drain", "Safety"],
  ["A room is empty but lights and fans are running. What should you do if responsible and safe?", "Switch them off", "Turn on more devices", "Leave every device on all weekend", "Cover the switches", "Turning off unused electrical devices reduces unnecessary energy use.", "Reduce unnecessary energy demand.", "Energy", "Use", "Waste"],
];
const cyberSimulation: readonly SimulationRow[] = [
  ["A message asks for your password to 'verify your account.' What should you do?", "Do not share the password and verify through a trusted channel", "Send the password immediately", "Post the password publicly", "Reuse a friend's password", "Legitimate account safety practices do not require sharing your password through suspicious messages.", "Protect identity before taking action.", "Privacy", "Trust", "Risk"],
  ["You receive an unexpected attachment from an unknown sender. What is safest?", "Do not open it; verify the source first", "Disable security and open it", "Forward it to everyone", "Enter bank details into it", "Unexpected files can be malicious and should be verified before opening.", "Keep the risk meter low.", "Source", "Device", "Risk"],
  ["A website address looks almost like your school's site but has misspelled words. What should you do?", "Stop and verify the address", "Enter your password anyway", "Ignore the spelling difference", "Share the link as official", "Look-alike addresses can be phishing attempts.", "Check the route before sending credentials.", "Address", "Trust", "Credentials"],
  ["A friend asks to use your account because theirs is locked. What is the safest response?", "Keep your account private and help them use official recovery", "Share your password", "Turn off account security", "Post the login in a group", "Account credentials should remain private; official recovery is safer.", "Protect access while helping safely.", "Account", "Privacy", "Recovery"],
];
const budgetSimulation: readonly SimulationRow[] = [
  ["You receive GH₵120 for a week. Transport is GH₵40 and lunch is GH₵50. You want to save at least GH₵20. Which plan works?", "Spend GH₵90 and save GH₵30", "Spend GH₵110 and save GH₵5", "Spend GH₵130", "Save GH₵10 after spending GH₵120", "GH₵40 + GH₵50 = GH₵90, leaving GH₵30 for savings or other needs.", "Keep needs inside income while protecting savings.", "Income", "Needs", "Savings"],
  ["Your budget is tight. Which should usually come first?", "Essential needs before optional wants", "Every optional want before food", "Spend more than income", "Ignore transport to school", "A basic budget prioritizes essential needs before discretionary wants.", "Balance needs, wants and savings.", "Needs", "Wants", "Savings"],
  ["You planned GH₵30 for data but spent GH₵20. What happened to the remaining GH₵10?", "It is still available unless reassigned", "It disappeared", "It became a debt automatically", "It must be spent immediately", "Unspent budget remains available and can be saved or reassigned.", "Move unused budget deliberately.", "Budget", "Spent", "Remaining"],
  ["A new expense would make total spending exceed income. What is the responsible move?", "Reduce or postpone a nonessential expense", "Ignore the limit", "Borrow automatically without considering repayment", "Change the income number on paper", "When planned spending exceeds income, adjust costs or timing before committing.", "Keep the budget balance non-negative.", "Income", "Spending", "Balance"],
];
const healthSimulation: readonly SimulationRow[] = [
  ["You have been sitting for a long study session. Which short break is generally healthier?", "Stand, stretch and move briefly", "Stay still for many more hours", "Skip water all day", "Stare closer at the screen", "Short movement breaks can reduce prolonged sedentary time.", "Balance study with healthy movement.", "Focus", "Movement", "Recovery"],
  ["Which lunch is the more balanced everyday choice?", "A varied meal with vegetables, protein and a staple", "Only sweets", "Only sugary drinks", "No food or water all day", "Balanced meals include varied food groups and adequate hydration.", "Build balance rather than extremes.", "Energy", "Variety", "Hydration"],
  ["You feel very tired after insufficient sleep. What routine best supports recovery?", "Prioritize adequate sleep and a regular bedtime", "Use screens all night", "Skip sleep again", "Drink no water", "Consistent adequate sleep supports attention, mood and physical recovery.", "Restore the recovery meter.", "Sleep", "Focus", "Recovery"],
  ["Before eating, which hygiene action is generally appropriate?", "Wash hands properly", "Touch dirty surfaces then eat", "Share unwashed utensils", "Ignore visible dirt", "Handwashing helps reduce transfer of germs to food and mouth.", "Keep hygiene risk low.", "Cleanliness", "Food", "Risk"],
];
const roadSimulation: readonly SimulationRow[] = [
  ["You need to cross a busy road. What is the safer choice?", "Use a safe crossing point and check traffic carefully", "Run out between parked cars", "Look only at your phone", "Assume every driver has seen you", "A safe crossing point and careful observation reduce risk.", "Protect the safety meter before moving.", "Traffic", "Visibility", "Safety"],
  ["You are a passenger in a vehicle with a seat belt. What should you do?", "Wear it correctly", "Ignore it", "Hold it beside you", "Remove it while moving", "Seat belts reduce injury risk in collisions and sudden stops.", "Secure the passenger before motion.", "Restraint", "Motion", "Safety"],
  ["A traffic light for pedestrians is red. What should you do?", "Wait for the safe signal and check traffic", "Cross immediately without looking", "Stand in the vehicle lane", "Turn away from traffic", "Obeying crossing signals and checking traffic supports safer crossing.", "Wait until the route is safe.", "Signal", "Traffic", "Safety"],
  ["You are walking at night near traffic. What can improve visibility?", "Use reflective or light-coloured visible clothing where appropriate", "Wear only dark clothing and walk in the lane", "Hide behind vehicles", "Turn off all nearby lights", "Being visible helps drivers notice pedestrians sooner.", "Raise visibility before exposure to traffic.", "Visibility", "Traffic", "Safety"],
];
const enterpriseSimulation: readonly SimulationRow[] = [
  ["You buy 10 items at GH₵6 each and sell all at GH₵8 each. What is the gross profit before other costs?", "GH₵20", "GH₵80", "GH₵60", "GH₵2", "Cost is GH₵60 and sales are GH₵80, so gross profit is GH₵20.", "Balance cost against revenue.", "Cost", "Revenue", "Profit"],
  ["Customers keep asking for an item that is always out of stock. What is a sensible response?", "Review demand and restock carefully", "Ignore all demand information", "Raise stock of an unrelated item only", "Stop recording sales", "Demand information can guide responsible restocking decisions.", "Use demand to tune stock.", "Demand", "Stock", "Cash"],
  ["A product costs GH₵25 to make before other expenses. Which selling price is most clearly below that direct cost?", "GH₵20", "GH₵25", "GH₵30", "GH₵35", "GH₵20 is below the GH₵25 direct unit cost.", "Keep price aware of cost.", "Cost", "Price", "Margin"],
  ["A customer reports a genuine defect. What is the strongest long-term business response?", "Handle the complaint fairly and learn from the defect", "Insult the customer", "Hide every complaint", "Delete all quality records", "Fair service and learning from defects support trust and quality improvement.", "Balance customer trust and quality.", "Trust", "Quality", "Retention"],
];
const memory: readonly MemoryRow[] = [
  ["Remember the pair: Ghana → ?", "Accra", "Kumasi", "Tamale", "Takoradi", "Ghana's capital is Accra."],
  ["Remember the pair: H₂O → ?", "Water", "Oxygen", "Salt", "Carbon dioxide", "H₂O is the chemical formula for water."],
  ["Remember the pair: 7 × 8 → ?", "56", "48", "54", "64", "7 × 8 = 56."],
  ["Remember the pair: opposite of 'ancient' → ?", "modern", "old", "historic", "past", "Modern contrasts with ancient in this context."],
  ["Remember the pair: CPU → ?", "Central Processing Unit", "Computer Power Utility", "Central Printing Unit", "Control Picture User", "CPU stands for Central Processing Unit."],
  ["Remember the pair: plant food-making process → ?", "photosynthesis", "evaporation", "erosion", "condensation", "Photosynthesis is the process plants use to make sugars using light energy."],
];

export function canGenerateArcadeWorldContent(game: string): game is WorldArcadeGame {
  return (WORLD_ARCADE_GAME_KEYS as readonly string[]).includes(game);
}
export function createArcadeWorldQuestions(game: WorldArcadeGame, difficulty: number, length: number): ArcadeWorldQuestion[] {
  const safeDifficulty = Math.max(1, Math.min(5, difficulty));
  switch (game) {
    case "ratio-race": return ratioQuestions(safeDifficulty, length);
    case "money-math-market": return simulationQuestions(moneySimulation, length);
    case "data-detective": return dataQuestions(safeDifficulty, length);
    case "letter-hunt": return gridQuestions("letter-hunt", safeDifficulty, length);
    case "sound-match": return choiceQuestions(soundMatch, length, "match_plus");
    case "reading-detective": return choiceQuestions(reading, length);
    case "tense-trek": return choiceQuestions(tense, length);
    case "essay-planner": return sortQuestions(essayPlans, length);
    case "force-motion-lab": return simulationQuestions(forceSimulation, length);
    case "energy-quest": return choiceQuestions(energy, length);
    case "space-explorer": return mapQuestions(spaceMap, length);
    case "ghana-map-master": return mapQuestions(ghanaMap, length);
    case "africa-explorer": return mapQuestions(africaMap, length);
    case "world-flags-capitals": return choiceQuestions(worldCapitals, length, "match_plus");
    case "history-timeline": return sortQuestions(history, length);
    case "culture-heritage": return choiceQuestions(culture, length, "match_plus");
    case "environment-guardian": return simulationQuestions(environmentSimulation, length);
    case "cyber-safety": return simulationQuestions(cyberSimulation, length);
    case "memory-matrix": return memoryQuestions(memory, length);
    case "logic-grid-lite": return gridQuestions("logic-grid-lite", safeDifficulty, length);
    case "budget-boss": return simulationQuestions(budgetSimulation, length);
    case "healthy-choices": return simulationQuestions(healthSimulation, length);
    case "road-safety": return simulationQuestions(roadSimulation, length);
    case "entrepreneurship-simulator": return simulationQuestions(enterpriseSimulation, length);
  }
}
function parseOrder(answer: string) {
  try {
    const parsed = JSON.parse(answer);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed as string[] : null;
  } catch {
    return null;
  }
}
function validPermutation(question: ArcadeWorldQuestion, answer: string) {
  const parsed = parseOrder(answer);
  if (!parsed || parsed.length !== question.options.length || new Set(parsed).size !== parsed.length) return false;
  const expected = [...question.options].sort();
  return [...parsed].sort().every((item, index) => item === expected[index]);
}
export function validArcadeWorldAnswer(question: ArcadeWorldQuestion, answer: string) {
  if (question.kind === "sort_plus") return validPermutation(question, answer);
  return question.options.includes(answer);
}
export function correctArcadeWorldAnswer(question: ArcadeWorldQuestion, answer: string) {
  if (question.kind === "sort_plus") {
    const submitted = parseOrder(answer), expected = parseOrder(question.answer);
    return Boolean(submitted && expected && submitted.length === expected.length && submitted.every((item, index) => item === expected[index]));
  }
  return answer === question.answer;
}
