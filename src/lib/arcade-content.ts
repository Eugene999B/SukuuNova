import { randomInt } from "node:crypto";

export const ARCADE_GAMES = ["math", "word", "logic"] as const;
export type ArcadeGame = typeof ARCADE_GAMES[number];
export const PLAYABLE_ARCADE_GAME_KEYS = [
  "math", "word", "logic", "number-pop", "addition-dash", "times-table-turbo", "division-quest",
  "decimal-defender", "percentage-power", "vocabulary-vault", "grammar-fix", "odd-one-out", "earth-weather",
] as const;
export type PlayableArcadeGame = typeof PLAYABLE_ARCADE_GAME_KEYS[number];
export type ArcadeQuestion = { id: string; prompt: string; options: string[]; answer: string; explanation: string };

export function initialDifficulty(level: string | null) {
  const value = (level ?? "").toLowerCase();
  if (/jhs|junior|grade [7-8]|basic [7-9]/.test(value)) return 3;
  if (/shs|senior|secondary|grade (9|10|11|12)/.test(value)) return 4;
  if (/(primary|basic|grade|p)\s*[4-6]/.test(value)) return 2;
  return 1;
}
export function nextDifficulty(base: number, recent: Array<{ difficulty: number; correct: number; roundLength?: number }>) {
  if (!recent.length) return base;
  const latest = recent[0].difficulty;
  const same = recent.slice(0, 3).filter(round => round.difficulty === latest);
  const accuracy = (round: { correct: number; roundLength?: number }) => round.correct / Math.max(1, round.roundLength ?? 5);
  if (same.length === 3 && same.every(round => accuracy(round) >= 0.8)) return Math.min(5, latest + 1);
  if (same.length >= 2 && same.slice(0, 2).every(round => accuracy(round) <= 0.4)) return Math.max(1, latest - 1);
  return latest;
}
function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function uniqueOptions(answer: string, distractors: Array<string | number>) {
  const values = Array.from(new Set([answer, ...distractors.map(String)].filter(Boolean)));
  let fallback = 1;
  while (values.length < 4) { const candidate = `${answer}-${fallback++}`; if (!values.includes(candidate)) values.push(candidate); }
  return shuffle(values.slice(0, 4));
}
function question(index: number, prompt: string, answer: string | number, distractors: Array<string | number>, explanation: string): ArcadeQuestion {
  const value = String(answer);
  return { id: String(index), prompt, answer: value, options: uniqueOptions(value, distractors), explanation };
}
function numericOptions(answer: number, spread = 2) {
  return [answer + 1, answer + spread, Math.max(0, answer - 1)];
}
type StaticRow = readonly [prompt: string, answer: string, wrong1: string, wrong2: string, wrong3: string, explanation: string];
function bankQuestions(bank: readonly StaticRow[], length: number): ArcadeQuestion[] {
  const output: ArcadeQuestion[] = [];
  let pool = shuffle([...bank]);
  for (let index = 0; index < length; index++) {
    if (!pool.length) pool = shuffle([...bank]);
    const row = pool.pop()!;
    output.push(question(index, row[0], row[1], [row[2], row[3], row[4]], row[5]));
  }
  return output;
}

const words: readonly (readonly StaticRow[])[] = [
  [
    ["Choose the word for an animal that meows.", "cat", "sun", "cup", "run", "A cat is an animal that meows."],
    ["Complete: I can ___ a book.", "read", "eat", "fly", "blue", "We read words in a book."],
    ["Which word rhymes with hat?", "cat", "dog", "pen", "fish", "Hat and cat share the ending sound."],
    ["Choose the opposite of hot.", "cold", "warm", "red", "soft", "Cold is the opposite of hot."],
    ["Which is a colour?", "blue", "jump", "desk", "sing", "Blue names a colour."],
  ],
  [
    ["Choose a synonym for happy.", "glad", "sad", "angry", "tired", "Glad and happy have similar meanings."],
    ["Complete: She ___ to school every day.", "walks", "walk", "walking", "walked", "Use walks with she in the simple present."],
    ["Choose the plural of child.", "children", "childs", "childes", "childrens", "Children is the irregular plural of child."],
    ["Choose the opposite of generous.", "selfish", "kind", "helpful", "giving", "A selfish person is unwilling to share."],
    ["Which word is a verb?", "discover", "discovery", "discoverer", "discoverable", "Discover describes an action."],
  ],
  [
    ["Choose the word closest to cautious.", "careful", "careless", "speedy", "noisy", "Cautious means taking care to avoid problems."],
    ["Complete: Neither answer ___ correct.", "is", "are", "were", "be", "Neither answer is singular."],
    ["Which sentence uses an adverb?", "She spoke softly.", "She is kind.", "She has a book.", "The desk is wooden.", "Softly describes how she spoke."],
    ["Choose the opposite of scarce.", "abundant", "rare", "limited", "few", "Abundant means available in large quantities."],
    ["What does infer mean?", "Draw a conclusion from evidence", "Copy a sentence", "Ignore the evidence", "Read every word aloud", "An inference combines evidence with reasoning."],
  ],
  [
    ["Choose the meaning of ambiguous.", "Open to more than one interpretation", "Always false", "Perfectly clear", "Very short", "Ambiguous language can have multiple meanings."],
    ["Which is a claim rather than evidence?", "This method is best.", "The test took six minutes.", "Twenty people attended.", "The reading was 12 cm.", "Calling something best needs supporting evidence."],
    ["Choose the meaning of mitigate.", "Make less severe", "Make certain", "Make larger", "Make permanent", "Mitigate means reduce the severity of something."],
    ["Complete: Had I known, I ___ helped.", "would have", "will have", "would", "have", "A past unreal condition uses would have."],
    ["Choose the most concise sentence.", "We agreed.", "We came to an agreement together.", "We jointly reached mutual agreement.", "An agreement was mutually made by us.", "We agreed conveys the same core meaning with fewer words."],
  ],
  [
    ["Choose the meaning of corroborate.", "Support with additional evidence", "Disprove immediately", "Summarise briefly", "Avoid discussing", "To corroborate is to support a statement with additional evidence."],
    ["Which sentence is most precise?", "The sample temperature rose from 20°C to 28°C.", "The sample became much hotter.", "Things changed a lot.", "The sample was different.", "Measured values make the statement precise."],
    ["Choose the best meaning of plausible.", "Reasonably believable", "Mathematically certain", "Impossible to question", "Unrelated to evidence", "Plausible means appearing reasonable or probable."],
    ["Which transition signals contrast?", "However", "Therefore", "For example", "Similarly", "However introduces a contrasting idea."],
    ["Choose the sentence with correct parallel structure.", "She likes reading, writing and debating.", "She likes reading, to write and debates.", "She likes to read, writing and debate.", "She likes reading, to write and debating.", "Parallel items should use the same grammatical form."],
  ],
] as const;

const vocabularyBanks: readonly (readonly StaticRow[])[] = [
  [
    ["Which word means very big?", "huge", "tiny", "slow", "quiet", "Huge means very big."],
    ["Which word means to begin?", "start", "finish", "hide", "drop", "Start means to begin."],
    ["Choose the word closest to quick.", "fast", "late", "heavy", "soft", "Fast and quick have similar meanings."],
    ["Which word means not difficult?", "easy", "hard", "rough", "deep", "Easy means not difficult."],
    ["Choose the meaning of silent.", "making no sound", "very bright", "moving quickly", "full of people", "Silent means making no sound."],
  ],
  [
    ["Choose the word closest to enormous.", "very large", "very small", "very old", "very quiet", "Enormous means extremely large."],
    ["What does observe mean?", "watch carefully", "forget quickly", "speak loudly", "move away", "To observe is to watch or notice carefully."],
    ["Choose the meaning of fragile.", "easily broken", "very strong", "always wet", "difficult to find", "Fragile things can break easily."],
    ["What does reluctant mean?", "unwilling", "excited", "certain", "careless", "Reluctant means unwilling or hesitant."],
    ["Choose the meaning of essential.", "necessary", "optional", "hidden", "unusual", "Essential means necessary or very important."],
  ],
  [
    ["Choose the meaning of evaluate.", "judge using evidence", "copy exactly", "guess randomly", "ignore details", "To evaluate is to judge quality or value using evidence."],
    ["What does significant mean?", "important or meaningful", "completely ordinary", "impossible to measure", "always negative", "Significant can mean important or meaningful."],
    ["Choose the word closest to resilient.", "able to recover", "easy to damage", "unwilling to move", "hard to understand", "Resilient means able to recover from difficulty."],
    ["What does contrast mean?", "show differences", "show only similarities", "repeat exactly", "remove evidence", "To contrast is to compare by showing differences."],
    ["Choose the meaning of consequence.", "result of an action", "cause before an action", "unrelated detail", "personal opinion", "A consequence is a result or effect."],
  ],
  [
    ["Choose the meaning of advocate.", "publicly support", "secretly oppose", "measure precisely", "avoid completely", "To advocate is to support or argue for something."],
    ["What does empirical mean?", "based on observation or experiment", "based only on tradition", "impossible to test", "written as fiction", "Empirical evidence comes from observation or experiment."],
    ["Choose the meaning of coherent.", "logical and connected", "random and unrelated", "very brief", "physically heavy", "Coherent ideas fit together logically."],
    ["What does constraint mean?", "a limit or restriction", "a reward", "a prediction", "a celebration", "A constraint limits what can be done."],
    ["Choose the word closest to scrutinise.", "examine closely", "accept without checking", "forget", "simplify automatically", "To scrutinise is to examine carefully."],
  ],
  [
    ["Choose the meaning of nuanced.", "showing subtle differences", "completely simple", "obviously false", "unrelated to context", "Nuanced thinking recognises subtle distinctions."],
    ["What does extrapolate mean?", "extend a pattern beyond known data", "delete unusual data", "repeat a measurement", "prove causation", "Extrapolation estimates beyond observed data using a pattern."],
    ["Choose the meaning of reconcile.", "bring apparently conflicting ideas into agreement", "make a conflict larger", "ignore both ideas", "replace evidence with opinion", "To reconcile is to make differing accounts consistent."],
    ["What does paradigm mean in academic use?", "a model or framework", "a numerical error", "a footnote", "a random event", "A paradigm is a model or framework for understanding something."],
    ["Choose the meaning of substantiate.", "support with evidence", "make deliberately vague", "remove all examples", "change the topic", "To substantiate a claim is to support it with evidence."],
  ],
] as const;

const grammarBanks: readonly (readonly StaticRow[])[] = [
  [
    ["Choose the correct sentence.", "She runs every day.", "She run every day.", "She running every day.", "She runs every days.", "A singular subject takes runs in the simple present."],
    ["Choose the correct plural.", "books", "bookes", "books'", "book", "The regular plural of book is books."],
    ["Complete: They ___ happy.", "are", "is", "am", "be", "They takes are in the present tense."],
    ["Choose the correct sentence.", "I have a pencil.", "I has a pencil.", "I having a pencil.", "I haves a pencil.", "I takes have, not has."],
    ["Complete: The cat ___ sleeping.", "is", "are", "am", "be", "The singular subject cat takes is."],
  ],
  [
    ["Choose the correct sentence.", "The children are playing.", "The children is playing.", "The children am playing.", "The children plays playing.", "Children is plural, so use are."],
    ["Complete: Yesterday we ___ to the market.", "went", "go", "goes", "going", "Went is the past tense of go."],
    ["Choose the correct possessive form.", "Ama's book", "Amas book", "Ama book's", "Amas' book", "Ama's shows that the book belongs to Ama."],
    ["Complete: He has ___ the work.", "finished", "finish", "finishing", "finishes", "Has is followed by the past participle finished."],
    ["Choose the sentence with correct agreement.", "The list of names is here.", "The list of names are here.", "The list of names be here.", "The list of names were here now.", "The head noun list is singular."],
  ],
  [
    ["Complete: If it rains, we ___ inside.", "will stay", "stayed", "staying", "would stayed", "A real future condition commonly uses will in the result clause."],
    ["Choose the correct sentence.", "Neither student was late.", "Neither student were late.", "Neither students was late.", "Neither student are late yesterday.", "Neither student is singular."],
    ["Which sentence uses the passive voice?", "The ball was kicked by Kojo.", "Kojo kicked the ball.", "Kojo kicks well.", "The ball rolled away.", "Was kicked is a passive construction."],
    ["Choose the correctly punctuated clause.", "Although it was late, we continued.", "Although it was late we continued", "Although, it was late we continued.", "Although it was, late we continued.", "An introductory dependent clause is followed by a comma."],
    ["Complete: She is one of the students who ___ early.", "arrive", "arrives", "arriving", "has arrives", "Who refers to the plural students, so use arrive."],
  ],
  [
    ["Choose the sentence with correct parallel structure.", "The role requires planning, organising and reporting.", "The role requires planning, to organise and reports.", "The role requires to plan, organising and report.", "The role requires planning, organise and to report.", "Items in a series should use parallel grammatical forms."],
    ["Choose the correct conditional.", "If I had studied, I would have passed.", "If I studied, I would have passed yesterday.", "If I had study, I will pass.", "If I have studied, I would passed.", "A past unreal condition uses had + past participle and would have + past participle."],
    ["Which sentence avoids a dangling modifier?", "Walking to school, Ama saw the bus.", "Walking to school, the bus was seen by Ama.", "Walking to school, there was a bus.", "Walking to school, the rain started Ama.", "The subject after the introductory phrase should be the person doing the walking."],
    ["Choose the correct reported speech form.", "He said that he was tired.", "He said that I am tired.", "He said that he tired.", "He said he is tired yesterday.", "Reported speech commonly backshifts the tense when reporting a past statement."],
    ["Choose the most grammatically complete sentence.", "Because the evidence was incomplete, the team delayed its decision.", "Because the evidence was incomplete.", "The evidence incomplete, the team decision.", "Because incomplete evidence and delayed.", "The first option has both a dependent clause and a complete main clause."],
  ],
  [
    ["Choose the sentence with correct subject–verb agreement.", "A series of experiments has confirmed the pattern.", "A series of experiments have confirmed the pattern.", "A series of experiment have confirmed the pattern.", "A series of experiments are confirming the pattern yesterday.", "The head noun series is singular, so use has."],
    ["Choose the correct use of the subjunctive.", "The committee recommended that he be appointed.", "The committee recommended that he is appointed.", "The committee recommended that he was appoint.", "The committee recommended him be appointing.", "Formal recommendations can use the base-form subjunctive: be appointed."],
    ["Which sentence uses a semicolon correctly?", "The data were incomplete; the team repeated the test.", "The data; were incomplete the team repeated the test.", "The data were; incomplete, the team repeated the test.", "The data were incomplete; because the team repeated.", "A semicolon can join two closely related independent clauses."],
    ["Choose the sentence with unambiguous pronoun reference.", "When Adwoa met Efua, Adwoa handed over the report.", "When Adwoa met Efua, she handed over the report.", "When they met her, she gave it.", "After speaking to her, she left it there.", "Repeating Adwoa removes uncertainty about who handed over the report."],
    ["Choose the correctly structured comparison.", "The new process is more reliable than the old process.", "The new process is more reliable than before.", "The new process is more reliable compared to old.", "The new process more reliable than the old process is.", "The comparison clearly names two comparable processes."],
  ],
] as const;

const oddOneOutBanks: readonly (readonly StaticRow[])[] = [
  [["Which does not belong?", "car", "cat", "dog", "goat", "Cat, dog and goat are animals; a car is not."], ["Which does not belong?", "blue", "run", "red", "green", "Blue, red and green are colours; run is an action."], ["Which does not belong?", "7", "2", "4", "6", "2, 4 and 6 are even; 7 is odd."], ["Which does not belong?", "spoon", "shirt", "dress", "trousers", "Shirt, dress and trousers are clothing; a spoon is not."], ["Which does not belong?", "Tuesday", "January", "March", "June", "January, March and June are months; Tuesday is a day."]],
  [["Which does not belong?", "triangle", "lion", "tiger", "leopard", "Lion, tiger and leopard are animals; triangle is a shape."], ["Which does not belong?", "15", "10", "20", "30", "10, 20 and 30 are multiples of ten; 15 is not."], ["Which does not belong?", "litre", "metre", "centimetre", "kilometre", "Metre, centimetre and kilometre measure length; litre measures capacity."], ["Which does not belong?", "whisper", "table", "chair", "desk", "Table, chair and desk are furniture; whisper is an action."], ["Which does not belong?", "copper", "oak", "mahogany", "teak", "Oak, mahogany and teak are woods/trees; copper is a metal."]],
  [["Which does not belong?", "evaporation", "addition", "subtraction", "division", "Addition, subtraction and division are arithmetic operations; evaporation is a physical process."], ["Which does not belong?", "mammal", "noun", "verb", "adjective", "Noun, verb and adjective are word classes; mammal is biological."], ["Which does not belong?", "equilateral", "acute", "right", "obtuse", "Acute, right and obtuse describe angles; equilateral describes equal sides."], ["Which does not belong?", "carbon dioxide", "oxygen", "nitrogen", "argon", "Oxygen, nitrogen and argon are elements; carbon dioxide is a compound."], ["Which does not belong?", "cedi", "acceleration", "velocity", "force", "Acceleration, velocity and force are physics quantities; cedi is currency."]],
  [["Which does not belong?", "photosynthesis", "inflation", "interest", "exchange rate", "Inflation, interest and exchange rate are economic concepts; photosynthesis is biological."], ["Which does not belong?", "mitosis", "metaphor", "simile", "personification", "Metaphor, simile and personification are literary devices; mitosis is cell division."], ["Which does not belong?", "database", "legislature", "executive", "judiciary", "Legislature, executive and judiciary are arms of government; database is an ICT term."], ["Which does not belong?", "isotope", "latitude", "longitude", "equator", "Latitude, longitude and equator are geographic terms; isotope is chemistry."], ["Which does not belong?", "algorithm", "hypothesis", "variable", "experiment", "Hypothesis, variable and experiment belong to scientific investigation; algorithm belongs mainly to computing."]],
  [["Which does not belong conceptually?", "causation", "mean", "median", "mode", "Mean, median and mode are measures of central tendency; causation is not."], ["Which does not belong?", "oxidation", "fiscal policy", "monetary policy", "taxation", "Fiscal policy, monetary policy and taxation are economic/government finance concepts; oxidation is chemistry."], ["Which does not belong?", "alliteration", "correlation", "regression", "variance", "Correlation, regression and variance are statistical terms; alliteration is literary."], ["Which does not belong?", "bandwidth", "allele", "gene", "chromosome", "Allele, gene and chromosome are genetics terms; bandwidth is computing/communications."], ["Which does not belong?", "constitution", "derivative", "integral", "function", "Derivative, integral and function are mathematical concepts; constitution is civic/legal."]],
] as const;

const weatherBanks: readonly (readonly StaticRow[])[] = [
  [["Which tool tells us how hot or cold the air is?", "thermometer", "ruler", "clock", "scale", "A thermometer measures temperature."], ["Which describes rain, wind and sunshine over a short time?", "weather", "soil", "seasoning", "distance", "Weather describes atmospheric conditions over a short period."], ["Which cloud often brings rain?", "dark rain cloud", "dust cloud indoors", "smoke from cooking", "no cloud at all", "Dark, moisture-filled clouds can bring rain."], ["What should you carry when rain is likely?", "umbrella", "spoon", "pillow", "football", "An umbrella helps keep you dry in rain."], ["Which is moving air?", "wind", "soil", "shadow", "stone", "Wind is moving air."]],
  [["Which instrument measures rainfall?", "rain gauge", "thermometer", "wind vane", "barometer only", "A rain gauge measures the amount of rainfall."], ["Which instrument shows wind direction?", "wind vane", "rain gauge", "stopwatch", "measuring cylinder", "A wind vane indicates wind direction."], ["What happens to water during evaporation?", "It changes from liquid to vapour", "It changes from gas to solid", "It becomes soil", "It disappears from matter", "Evaporation changes liquid water into water vapour."], ["Which condition usually increases evaporation?", "higher temperature", "lower temperature only", "complete darkness", "no surface area", "Higher temperature gives water molecules more energy to evaporate."], ["Which is part of the water cycle?", "condensation", "multiplication", "digestion", "pollination only", "Condensation is a key water-cycle process."]],
  [["Air pressure is measured using a…", "barometer", "thermometer", "rain gauge", "metre rule", "A barometer measures atmospheric pressure."], ["A long period with very little rainfall is a…", "drought", "flood", "tornado", "dew", "A drought is an extended period of unusually low rainfall."], ["What is humidity?", "amount of water vapour in air", "speed of light", "amount of soil in water", "mass of a cloud", "Humidity describes water vapour in the air."], ["Why do coastal areas often have moderated temperatures?", "large water bodies heat and cool slowly", "sand creates extra sunlight", "sea water stops all wind", "clouds never form near coasts", "Water changes temperature more slowly than land and moderates nearby air."], ["Which front can form when cold air pushes under warm air?", "cold front", "warm current", "equator", "rain shadow only", "A cold front forms where advancing cold air displaces warmer air."]],
  [["Climate differs from weather because climate describes…", "long-term patterns", "only today's rainfall", "one wind gust", "one cloud", "Climate describes typical atmospheric patterns over long periods."], ["Which factor strongly affects temperature with altitude?", "air becomes generally cooler higher up", "air always becomes hotter higher up", "altitude has no effect", "gravity stops above hills", "In the lower atmosphere, temperature generally decreases as altitude rises."], ["The leeward side of a mountain may be drier because of…", "rain-shadow effect", "ocean tides", "earthquakes", "magnetic fields", "Air loses moisture on the windward side, leaving drier air on the leeward side."], ["Which is a greenhouse gas?", "carbon dioxide", "oxygen only", "argon only", "helium only", "Carbon dioxide absorbs outgoing infrared radiation and contributes to the greenhouse effect."], ["A weather forecast is best described as…", "an evidence-based prediction of atmospheric conditions", "a guarantee that cannot change", "a historical climate average only", "a measurement of soil fertility", "Forecasts use observations and models to predict likely weather conditions."]],
  [["Which statement best distinguishes climate variability from climate change?", "Variability is shorter-term fluctuation; climate change is a persistent shift in long-term patterns.", "They always mean exactly the same thing.", "Climate change lasts one afternoon.", "Variability cannot involve rainfall.", "Climate variability describes shorter-term departures, while climate change describes persistent long-term shifts."], ["Why are ensemble forecasts useful?", "They show a range of plausible outcomes and uncertainty.", "They remove all uncertainty.", "They use no observations.", "They predict only past weather.", "Running multiple model scenarios helps estimate forecast uncertainty."], ["Which process releases latent heat into the atmosphere?", "condensation", "evaporation", "melting ice only", "sublimation from ice to vapour", "Condensation releases latent heat as vapour becomes liquid."], ["A strong El Niño can affect weather far from the Pacific because of…", "large-scale atmospheric teleconnections", "local soil colour only", "Earth's magnetic poles", "daily tides alone", "Ocean-atmosphere changes can alter large-scale circulation patterns called teleconnections."], ["Which observation most directly supports a claim about a warming climate trend?", "a sustained multi-decade increase in temperature records", "one unusually hot afternoon", "one cold morning", "one thunderstorm", "Climate trends require long-term evidence rather than individual weather events."]],
] as const;

function mathQuestion(index: number, difficulty: number) {
  const a = randomInt(2, difficulty <= 1 ? 10 : difficulty >= 5 ? 30 : 16), b = randomInt(2, difficulty >= 4 ? 13 : 10);
  let answer: number, prompt: string, explanation: string;
  if (difficulty === 1) { answer = a + b; prompt = `${a} + ${b} = ?`; explanation = `Add ${a} and ${b}: ${answer}.`; }
  else if (difficulty === 2) { answer = a * b; prompt = `${a} × ${b} = ?`; explanation = `${a} groups of ${b} make ${answer}.`; }
  else if (difficulty === 3) { answer = a; prompt = `${a * b} ÷ ${b} = ?`; explanation = `${a} × ${b} = ${a * b}, so the quotient is ${a}.`; }
  else if (difficulty === 4) { answer = a; prompt = `Solve: ${b}x + ${b} = ${a * b + b}`; explanation = `Subtract ${b}, then divide by ${b}: x = ${a}.`; }
  else { const c = randomInt(2, 8); answer = a + c; prompt = `Solve: 2(x − ${c}) = ${2 * a}`; explanation = `Divide by 2 to get x − ${c} = ${a}; then add ${c}: x = ${answer}.`; }
  return question(index, prompt, answer, numericOptions(answer, 3), explanation);
}
function logicQuestion(index: number, difficulty: number) {
  const a = randomInt(2, 12), b = randomInt(2, 8);
  if (difficulty >= 5) {
    const sequence = [a, a + b, a + b * 3, a + b * 6];
    const answer = a + b * 10;
    return question(index, `What comes next? ${sequence.join(", ")}, …`, answer, numericOptions(answer, b), `The increases are ${b}, ${b * 2}, ${b * 3}, so the next increase is ${b * 4}.`);
  }
  const step = difficulty === 1 ? 1 : difficulty === 2 ? 2 : b;
  const geometric = difficulty === 4;
  const sequence = geometric ? [a, a * 2, a * 4] : [a, a + step, a + step * 2];
  const answer = geometric ? a * 8 : a + step * 3;
  return question(index, `What comes next? ${sequence.join(", ")}, …`, answer, numericOptions(answer, step + 1), geometric ? "Multiply each number by 2." : `Add ${step} each time.`);
}
function numberPop(index: number, difficulty: number) {
  const max = [10, 20, 50, 100, 200][difficulty - 1] ?? 200;
  const answer = randomInt(0, max + 1);
  const mode = index % 3;
  if (mode === 0) return question(index, `Which option shows the number ${answer}?`, answer, numericOptions(answer, difficulty + 1), `The numeral for ${answer} is ${answer}.`);
  if (mode === 1) { const before = Math.max(0, answer - 1); return question(index, `What number comes after ${before}?`, answer, numericOptions(answer, 2), `${answer} comes immediately after ${before}.`); }
  const next = answer + 1; return question(index, `What number comes before ${next}?`, answer, numericOptions(answer, 2), `${answer} comes immediately before ${next}.`);
}
function additionDash(index: number, difficulty: number) {
  const max = [10, 30, 100, 500, 2000][difficulty - 1] ?? 2000;
  const a = randomInt(1, max), b = randomInt(1, max);
  const answer = a + b;
  return question(index, `${a} + ${b} = ?`, answer, numericOptions(answer, Math.max(2, difficulty * 3)), `Add the two numbers: ${a} + ${b} = ${answer}.`);
}
function multiplicationTurbo(index: number, difficulty: number) {
  const max = [5, 8, 10, 12, 15][difficulty - 1] ?? 15;
  const a = randomInt(2, max + 1), b = randomInt(2, max + 1), answer = a * b;
  return question(index, `${a} × ${b} = ?`, answer, [a * (b + 1), Math.max(1, (a - 1) * b), answer + a], `${a} groups of ${b} make ${answer}.`);
}
function divisionQuest(index: number, difficulty: number) {
  const max = [5, 8, 10, 12, 15][difficulty - 1] ?? 15;
  const divisor = randomInt(2, max + 1), answer = randomInt(2, max + 1), dividend = divisor * answer;
  return question(index, `${dividend} ÷ ${divisor} = ?`, answer, numericOptions(answer, 2), `Because ${divisor} × ${answer} = ${dividend}, the quotient is ${answer}.`);
}
function decimalDefender(index: number, difficulty: number) {
  if (difficulty <= 2) {
    const whole = randomInt(1, 20), digit = randomInt(1, 10), answer = `${whole}.${digit}`;
    return question(index, `Which decimal represents ${whole} and ${digit} tenths?`, answer, [`${whole + digit}.1`, `${whole}.${Math.max(0, digit - 1)}`, `${digit}.${whole}`], `${digit} tenths is ${digit}/10, so the decimal is ${answer}.`);
  }
  const places = difficulty >= 4 ? 2 : 1;
  const scale = 10 ** places, a = randomInt(10, 100), b = randomInt(10, 100), sum = a + b;
  const fmt = (value: number) => (value / scale).toFixed(places);
  const answer = fmt(sum);
  return question(index, `${fmt(a)} + ${fmt(b)} = ?`, answer, [fmt(sum + 1), fmt(Math.max(0, sum - 1)), fmt(sum + 10)], `Align the decimal places and add: ${fmt(a)} + ${fmt(b)} = ${answer}.`);
}
function percentagePower(index: number, difficulty: number) {
  const percentages = difficulty <= 2 ? [10, 25, 50] : difficulty === 3 ? [5, 10, 20, 25, 50] : [12, 15, 30, 40, 75];
  const pct = percentages[randomInt(percentages.length)];
  const baseFactor = pct === 12 ? 25 : pct === 15 ? 20 : 100 / Math.max(5, gcd(pct, 100));
  const base = Math.max(20, baseFactor * randomInt(2, difficulty >= 4 ? 20 : 10));
  const answer = (pct * base) / 100;
  return question(index, `What is ${pct}% of ${base}?`, answer, [answer + base / 10, Math.max(0, answer - base / 20), (pct * base) / 10], `${pct}% means ${pct}/100. Multiply ${base} by ${pct}/100 to get ${answer}.`);
}
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : Math.abs(a); }

export function canGenerateArcadeContent(gameKey: string): gameKey is PlayableArcadeGame {
  return (PLAYABLE_ARCADE_GAME_KEYS as readonly string[]).includes(gameKey);
}
export function createArcadeGameQuestions(gameKey: PlayableArcadeGame, difficulty: number, length = 5): ArcadeQuestion[] {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeLength = Math.max(1, Math.min(50, Math.trunc(length)));
  if (gameKey === "word") return bankQuestions(words[safeDifficulty - 1], safeLength);
  if (gameKey === "vocabulary-vault") return bankQuestions(vocabularyBanks[safeDifficulty - 1], safeLength);
  if (gameKey === "grammar-fix") return bankQuestions(grammarBanks[safeDifficulty - 1], safeLength);
  if (gameKey === "odd-one-out") return bankQuestions(oddOneOutBanks[safeDifficulty - 1], safeLength);
  if (gameKey === "earth-weather") return bankQuestions(weatherBanks[safeDifficulty - 1], safeLength);
  return Array.from({ length: safeLength }, (_, index) => {
    if (gameKey === "math") return mathQuestion(index, safeDifficulty);
    if (gameKey === "logic") return logicQuestion(index, safeDifficulty);
    if (gameKey === "number-pop") return numberPop(index, safeDifficulty);
    if (gameKey === "addition-dash") return additionDash(index, safeDifficulty);
    if (gameKey === "times-table-turbo") return multiplicationTurbo(index, safeDifficulty);
    if (gameKey === "division-quest") return divisionQuest(index, safeDifficulty);
    if (gameKey === "decimal-defender") return decimalDefender(index, safeDifficulty);
    return percentagePower(index, safeDifficulty);
  });
}
export function createArcadeQuestions(game: ArcadeGame, difficulty: number): ArcadeQuestion[] {
  return createArcadeGameQuestions(game, difficulty, 5);
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
