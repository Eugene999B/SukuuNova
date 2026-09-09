export const ARCADE_AGE_BANDS = ["age_4_5", "age_6_8", "age_9_11", "age_12_14", "age_15_18"] as const;
export type ArcadeAgeBand = typeof ARCADE_AGE_BANDS[number];
export const ARCADE_STANDARD_BANDS = ["kg", "basic_1_3", "basic_4_6", "jhs", "shs"] as const;
export type ArcadeStandardBand = typeof ARCADE_STANDARD_BANDS[number];
export const ARCADE_ENGINES = ["choice_quiz", "rapid_fire", "match_pairs", "sort_sequence", "classify_buckets", "tile_builder", "memory_flip", "grid_hunt", "path_choice", "map_label", "simulation", "typed_response"] as const;
export type ArcadeEngine = typeof ARCADE_ENGINES[number];
export type ArcadeTimerPolicy = "none" | "optional" | "challenge_only";

export type ArcadeGameDefinition = {
  gameKey: string;
  name: string;
  category: string;
  subject: string;
  description: string;
  symbol: string;
  engine: ArcadeEngine;
  ageBands: readonly ArcadeAgeBand[];
  standardBands: readonly ArcadeStandardBand[];
  difficultyMin: number;
  difficultyMax: number;
  roundLengths: readonly number[];
  defaultRoundLength: number;
  timerPolicy: ArcadeTimerPolicy;
  live: boolean;
  curriculumTags: readonly string[];
};

const ageStandards: Record<ArcadeAgeBand, ArcadeStandardBand[]> = {
  age_4_5: ["kg"],
  age_6_8: ["basic_1_3"],
  age_9_11: ["basic_4_6"],
  age_12_14: ["jhs"],
  age_15_18: ["shs"],
};
function standardsFor(ages: readonly ArcadeAgeBand[]) {
  return Array.from(new Set(ages.flatMap((age) => ageStandards[age])));
}
function game(gameKey: string, name: string, category: string, subject: string, description: string, symbol: string, engine: ArcadeEngine, ages: readonly ArcadeAgeBand[], tags: readonly string[], live = false): ArcadeGameDefinition {
  const defaultRoundLength = engine === "rapid_fire" ? 10 : 5;
  return {
    gameKey, name, category, subject, description, symbol, engine, ageBands: ages,
    standardBands: standardsFor(ages), difficultyMin: 1, difficultyMax: 5,
    roundLengths: engine === "rapid_fire" ? [5, 10, 15, 20] : [5, 10, 15],
    defaultRoundLength, timerPolicy: engine === "rapid_fire" ? "optional" : "none", live, curriculumTags: tags,
  };
}
const A45 = ["age_4_5"] as const, A68 = ["age_6_8"] as const, A911 = ["age_9_11"] as const, A1214 = ["age_12_14"] as const, A1518 = ["age_15_18"] as const;
const EARLY = [...A45, ...A68] as const, PRIMARY = [...A68, ...A911] as const, UPPER = [...A911, ...A1214, ...A1518] as const, SCHOOL = [...A68, ...A911, ...A1214, ...A1518] as const, ALL = [...A45, ...A68, ...A911, ...A1214, ...A1518] as const;

export const ARCADE_GAME_CATALOG = [
  game("math", "Math Sprint", "Mathematics", "Mathematics", "Fast mixed numeracy practice that adapts inside the learner's school band.", "+", "choice_quiz", SCHOOL, ["arithmetic", "fluency"], true),
  game("word", "Word Builder", "Literacy", "English", "Vocabulary, grammar and sentence practice with immediate explanations.", "Aa", "choice_quiz", SCHOOL, ["vocabulary", "grammar"], true),
  game("logic", "Logic Lab", "Logic", "Reasoning", "Pattern recognition and number-sequence reasoning.", "…", "choice_quiz", ALL, ["patterns", "reasoning"], true),
  game("number-pop", "Number Pop", "Numeracy", "Mathematics", "Recognise numbers and quantities.", "1", "choice_quiz", EARLY, ["number-recognition"]),
  game("count-match", "Count & Match", "Numeracy", "Mathematics", "Match groups of objects to the correct numeral.", "●", "match_pairs", EARLY, ["counting", "quantity"]),
  game("addition-dash", "Addition Dash", "Mathematics", "Mathematics", "Build addition fluency with short high-energy rounds.", "+", "rapid_fire", [...A68, ...A911, ...A1214], ["addition"]),
  game("subtraction-rescue", "Subtraction Rescue", "Mathematics", "Mathematics", "Solve subtraction challenges to choose the next safe path.", "−", "path_choice", [...A68, ...A911, ...A1214], ["subtraction"]),
  game("times-table-turbo", "Times Table Turbo", "Mathematics", "Mathematics", "Master multiplication facts through repeatable challenge rounds.", "×", "rapid_fire", [...A911, ...A1214], ["multiplication"]),
  game("division-quest", "Division Quest", "Mathematics", "Mathematics", "Practise division facts and quotients.", "÷", "choice_quiz", [...A911, ...A1214], ["division"]),
  game("fraction-forge", "Fraction Forge", "Mathematics", "Mathematics", "Build and compare fractions and equivalent forms.", "½", "tile_builder", UPPER, ["fractions"]),
  game("decimal-defender", "Decimal Defender", "Mathematics", "Mathematics", "Defend place value through decimal comparison and operations.", ".", "choice_quiz", UPPER, ["decimals", "place-value"]),
  game("percentage-power", "Percentage Power", "Mathematics", "Mathematics", "Solve percentage problems in practical contexts.", "%", "choice_quiz", [...A1214, ...A1518], ["percentages"]),
  game("ratio-race", "Ratio Race", "Mathematics", "Mathematics", "Compare and simplify ratios and proportions.", ":", "choice_quiz", [...A1214, ...A1518], ["ratio", "proportion"]),
  game("equation-escape", "Equation Escape", "Mathematics", "Mathematics", "Use algebraic reasoning to escape a chain of equations.", "x", "path_choice", [...A1214, ...A1518], ["algebra", "equations"]),
  game("geometry-builder", "Geometry Builder", "Mathematics", "Mathematics", "Classify shapes, angles and geometric properties.", "△", "classify_buckets", SCHOOL, ["geometry"]),
  game("measurement-master", "Measurement Master", "Mathematics", "Mathematics", "Match units, estimates and conversions.", "↔", "match_pairs", SCHOOL, ["measurement"]),
  game("money-math-market", "Money Math Market", "Mathematics", "Mathematics", "Buy, sell and make change in practical money scenarios.", "₵", "simulation", SCHOOL, ["money", "financial-literacy"]),
  game("data-detective", "Data Detective", "Mathematics", "Mathematics", "Read tables, charts and simple statistics to solve clues.", "▥", "choice_quiz", UPPER, ["data", "statistics"]),
  game("letter-hunt", "Letter Hunt", "Literacy", "English", "Find letters and beginning sounds.", "A", "grid_hunt", EARLY, ["letters", "phonics"]),
  game("sound-match", "Sound Match", "Literacy", "English", "Match common sounds to letters and words.", "♪", "match_pairs", EARLY, ["phonics"]),
  game("spelling-sprint", "Spelling Sprint", "Literacy", "English", "Type the correct spelling from age-suitable prompts.", "ABC", "typed_response", SCHOOL, ["spelling"]),
  game("vocabulary-vault", "Vocabulary Vault", "Literacy", "English", "Unlock meanings, context and word choice.", "V", "choice_quiz", [...A911, ...A1214, ...A1518], ["vocabulary"]),
  game("synonym-switch", "Synonym Switch", "Literacy", "English", "Match words with similar meanings.", "≈", "match_pairs", [...A911, ...A1214, ...A1518], ["synonyms"]),
  game("antonym-arena", "Antonym Arena", "Literacy", "English", "Match words with opposite meanings.", "↔", "match_pairs", [...A911, ...A1214, ...A1518], ["antonyms"]),
  game("grammar-fix", "Grammar Fix", "Literacy", "English", "Repair grammar problems in sentences.", "✓", "choice_quiz", UPPER, ["grammar"]),
  game("sentence-scramble", "Sentence Scramble", "Literacy", "English", "Put words and clauses into clear sentence order.", "≡", "sort_sequence", SCHOOL, ["sentence-structure"]),
  game("reading-detective", "Reading Detective", "Literacy", "English", "Use evidence and inference to solve reading clues.", "?", "choice_quiz", UPPER, ["reading", "inference"]),
  game("comprehension-quest", "Comprehension Quest", "Literacy", "English", "Follow a reading path by answering comprehension questions.", "Q", "path_choice", [...A911, ...A1214, ...A1518], ["reading-comprehension"]),
  game("punctuation-patrol", "Punctuation Patrol", "Literacy", "English", "Place punctuation where meaning needs it.", "?!", "tile_builder", SCHOOL, ["punctuation"]),
  game("tense-trek", "Tense Trek", "Literacy", "English", "Choose verb forms that match time and meaning.", "T", "choice_quiz", [...A911, ...A1214, ...A1518], ["verb-tense"]),
  game("essay-planner", "Essay Planner Challenge", "Literacy", "English", "Arrange ideas into strong paragraph and essay plans.", "¶", "sort_sequence", [...A1214, ...A1518], ["writing", "essay-planning"]),
  game("body-explorer", "Body Explorer", "Science", "Science", "Match body parts, organs and systems to their functions.", "♥", "match_pairs", SCHOOL, ["human-body"]),
  game("living-nonliving", "Living or Non-Living?", "Science", "Science", "Sort examples by the characteristics of living things.", "♧", "classify_buckets", [...A45, ...A68, ...A911], ["living-things"]),
  game("food-chain-builder", "Food Chain Builder", "Science", "Science", "Arrange organisms into sensible food chains.", "→", "sort_sequence", [...A911, ...A1214], ["ecosystems", "food-chain"]),
  game("matter-sort", "Matter Sort", "Science", "Science", "Classify materials and states of matter.", "◇", "classify_buckets", [...A911, ...A1214], ["matter"]),
  game("force-motion-lab", "Force & Motion Lab", "Science", "Science", "Explore simple cause-and-effect force and motion scenarios.", "⇢", "simulation", UPPER, ["forces", "motion"]),
  game("energy-quest", "Energy Quest", "Science", "Science", "Identify forms and transfers of energy.", "⚡", "choice_quiz", UPPER, ["energy"]),
  game("circuit-logic", "Circuit Logic", "Science", "Science", "Reason through simple electricity and circuit choices.", "⌁", "path_choice", UPPER, ["electricity", "circuits"]),
  game("earth-weather", "Earth & Weather", "Science", "Science", "Explore weather, climate and Earth processes.", "☁", "choice_quiz", SCHOOL, ["weather", "earth-science"]),
  game("space-explorer", "Space Explorer", "Science", "Science", "Identify planets, solar-system features and space concepts.", "★", "map_label", SCHOOL, ["space"]),
  game("chemistry-symbol-match", "Chemistry Symbol Match", "Science", "Chemistry", "Match common elements and chemical symbols.", "Fe", "match_pairs", [...A1214, ...A1518], ["chemistry", "elements"]),
  game("ghana-map-master", "Ghana Map Master", "Social & Geography", "Social Studies", "Identify Ghanaian regions and geographic features.", "GH", "map_label", [...A911, ...A1214, ...A1518], ["ghana", "geography"]),
  game("regions-capitals", "Regions & Capitals", "Social & Geography", "Social Studies", "Match Ghanaian regions and capitals.", "◎", "match_pairs", [...A911, ...A1214, ...A1518], ["ghana", "regions"]),
  game("africa-explorer", "Africa Explorer", "Social & Geography", "Geography", "Locate African countries and major features.", "AF", "map_label", UPPER, ["africa", "geography"]),
  game("world-flags-capitals", "World Flags & Capitals", "Social & Geography", "Geography", "Match countries, flags and capitals.", "⚑", "match_pairs", [...A911, ...A1214, ...A1518], ["world-geography"]),
  game("history-timeline", "History Timeline", "Social & Geography", "History", "Arrange historical events in chronological order.", "⌛", "sort_sequence", UPPER, ["history", "chronology"]),
  game("civic-duty", "Civic Duty Challenge", "Social & Geography", "Civics", "Choose responsible actions about rights, duties and governance.", "⚖", "path_choice", UPPER, ["civics"]),
  game("culture-heritage", "Culture & Heritage Match", "Social & Geography", "Social Studies", "Match Ghanaian cultural practices, symbols and heritage.", "◆", "match_pairs", SCHOOL, ["ghana", "culture", "heritage"]),
  game("environment-guardian", "Environment Guardian", "Social & Geography", "Environmental Studies", "Make practical decisions about waste, water and sustainability.", "♻", "simulation", SCHOOL, ["environment", "sustainability"]),
  game("keyboard-ninja", "Keyboard Ninja", "ICT & Computing", "ICT", "Build keyboard familiarity and accurate typing.", "⌨", "typed_response", SCHOOL, ["keyboard", "typing"]),
  game("hardware-match", "Hardware Match", "ICT & Computing", "ICT", "Match computer hardware to names and uses.", "▣", "match_pairs", SCHOOL, ["hardware"]),
  game("file-folder-quest", "File & Folder Quest", "ICT & Computing", "ICT", "Choose safe and correct file-management actions.", "▤", "path_choice", [...A911, ...A1214, ...A1518], ["files", "folders"]),
  game("coding-sequence", "Coding Sequence", "ICT & Computing", "Computing", "Arrange instructions into logical algorithms.", "</>", "sort_sequence", UPPER, ["algorithms", "coding"]),
  game("binary-basics", "Binary Basics", "ICT & Computing", "Computing", "Build and interpret small binary values.", "01", "tile_builder", [...A1214, ...A1518], ["binary"]),
  game("cyber-safety", "Cyber Safety Mission", "ICT & Computing", "ICT", "Practise safe online decisions through realistic scenarios.", "🔒", "simulation", [...A911, ...A1214, ...A1518], ["cyber-safety", "digital-citizenship"]),
  game("memory-matrix", "Memory Matrix", "Logic & Memory", "Reasoning", "Remember and match short visual or concept patterns.", "▦", "memory_flip", ALL, ["memory"]),
  game("odd-one-out", "Odd One Out", "Logic & Memory", "Reasoning", "Identify the item that does not fit a rule.", "○", "choice_quiz", ALL, ["classification", "reasoning"]),
  game("sequence-lab", "Sequence Lab", "Logic & Memory", "Reasoning", "Arrange and extend number, shape and idea sequences.", "↗", "sort_sequence", ALL, ["sequences"]),
  game("logic-grid-lite", "Logic Grid Lite", "Logic & Memory", "Reasoning", "Use clues and elimination to solve compact logic grids.", "#", "grid_hunt", [...A1214, ...A1518], ["deduction"]),
  game("puzzle-path", "Puzzle Path", "Logic & Memory", "Reasoning", "Move through a branching series of reasoning puzzles.", "◇", "path_choice", SCHOOL, ["problem-solving"]),
  game("budget-boss", "Budget Boss", "Life Skills", "Financial Literacy", "Balance needs, wants, savings and a simple budget.", "₵", "simulation", [...A1214, ...A1518], ["budgeting", "financial-literacy"]),
  game("healthy-choices", "Healthy Choices", "Life Skills", "Health", "Choose healthy routines, food and wellbeing decisions.", "♥", "simulation", SCHOOL, ["health", "wellbeing"]),
  game("road-safety", "Road Safety Challenge", "Life Skills", "Safety", "Practise safe pedestrian, passenger and road decisions.", "⚠", "simulation", SCHOOL, ["road-safety"]),
  game("entrepreneurship-simulator", "Entrepreneurship Simulator", "Life Skills", "Business", "Make simple pricing, cost, stock and customer decisions.", "↗", "simulation", [...A1214, ...A1518], ["entrepreneurship", "business"]),
] as const satisfies readonly ArcadeGameDefinition[];

export const ARCADE_GAME_KEYS = ARCADE_GAME_CATALOG.map((item) => item.gameKey);
export const LIVE_ARCADE_GAMES = ARCADE_GAME_CATALOG.filter((item) => item.live);
export function arcadeGame(gameKey: string) { return ARCADE_GAME_CATALOG.find((item) => item.gameKey === gameKey) ?? null; }

export function standardBandFromClassLevel(level: string | null | undefined): ArcadeStandardBand {
  const value = String(level ?? "").trim().toLowerCase();
  if (/\b(kg|kindergarten|nursery)\b/.test(value)) return "kg";
  if (/\b(basic|grade|primary|p)\s*[1-3]\b/.test(value)) return "basic_1_3";
  if (/\b(basic|grade|primary|p)\s*[4-6]\b/.test(value)) return "basic_4_6";
  if (/\b(jhs|junior|basic\s*[7-9]|grade\s*(7|8|9))\b/.test(value)) return "jhs";
  if (/\b(shs|senior|secondary|grade\s*(10|11|12))\b/.test(value)) return "shs";
  return "basic_1_3";
}
export function recommendedAgeBand(standard: ArcadeStandardBand): ArcadeAgeBand {
  return ({ kg: "age_4_5", basic_1_3: "age_6_8", basic_4_6: "age_9_11", jhs: "age_12_14", shs: "age_15_18" } as const)[standard];
}
export function allowedAgeBandsForStandard(standard: ArcadeStandardBand, allowOneAbove = false): ArcadeAgeBand[] {
  const index = ARCADE_STANDARD_BANDS.indexOf(standard);
  const recommended = recommendedAgeBand(standard);
  const result = ARCADE_AGE_BANDS.slice(0, index + 1).filter((age) => ARCADE_AGE_BANDS.indexOf(age) >= Math.max(0, index - 2));
  if (!result.includes(recommended)) result.push(recommended);
  if (allowOneAbove && ARCADE_AGE_BANDS[index + 1]) result.push(ARCADE_AGE_BANDS[index + 1]);
  return Array.from(new Set(result));
}
