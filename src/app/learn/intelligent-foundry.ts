import {
  catalogFor,
  type CognitiveChallenge,
  type LearnLane,
  type LearnQuestion,
  type QuestionKind,
  type SessionConfig,
} from "./learn-domain";

const MAX_POOL = 500;
const BLOCK_SIZE = 100_000;

type SmartTemplate = {
  id: string;
  lanes: readonly LearnLane[];
  subjectIds: readonly string[];
  topicIds?: readonly string[];
  programIds?: readonly string[];
  programPrefixes?: readonly string[];
  levelIds?: readonly string[];
  capacity: number;
  render: (variant: number, config: SessionConfig) => LearnQuestion;
};

const MODERN_CONTEXTS = [
  "a solar-energy startup",
  "a mobile-money service",
  "an AI-assisted learning lab",
  "a drone-mapping project",
  "a cloud-computing team",
  "a smart-farm cooperative",
  "an electric-vehicle workshop",
  "a community health dashboard",
  "a cybersecurity training lab",
  "an e-commerce warehouse",
  "a climate-monitoring station",
  "a fintech analytics team",
  "a robotics club",
  "a digital media studio",
  "a water-quality sensor project",
  "a satellite-imagery team",
  "a telemedicine platform",
  "a renewable-energy microgrid",
  "a logistics optimisation team",
  "a data-science bootcamp",
  "a construction technology firm",
  "a biomedical research lab",
  "a smart-city transport project",
  "an agritech marketplace",
] as const;

const TECHNOLOGY_CONTEXTS = [
  "a school-management software team",
  "a mobile-money engineering team",
  "a cloud-platform operations team",
  "a cybersecurity training lab",
  "a university coding club",
  "an e-commerce development team",
  "a data-science bootcamp",
  "a digital-learning platform",
  "a fintech API team",
  "a network-operations centre",
  "a web-development studio",
  "a database administration team",
  "a mobile-app startup",
  "an AI research group",
  "a robotics programming lab",
  "an internet-service provider",
  "a software-testing team",
  "a digital identity project",
  "a smart-campus technology team",
  "a computer-repair and networking lab",
  "a logistics software platform",
  "a health-information systems team",
  "a public-sector digital service",
  "an agricultural technology platform",
] as const;

const HEALTH_CONTEXTS = [
  "a teaching hospital",
  "a community health centre",
  "a university physiology laboratory",
  "a biomedical research laboratory",
  "a public-health surveillance unit",
  "a district hospital",
  "a clinical-skills laboratory",
  "a pharmacy training laboratory",
  "a maternal-health clinic",
  "a paediatric care unit",
  "a medical-school teaching laboratory",
  "a community nursing programme",
  "a diagnostic laboratory",
  "a rehabilitation clinic",
  "an emergency-care training unit",
  "a nutrition research programme",
  "an infectious-disease surveillance team",
  "a cardiovascular teaching laboratory",
  "a primary-care clinic",
  "a medical genetics laboratory",
  "a university anatomy laboratory",
  "a population-health research team",
  "a hospital quality-improvement unit",
  "a rural health outreach programme",
] as const;

const BUSINESS_CONTEXTS = [
  "a retail spare-parts business",
  "a mobile-money agency",
  "a small manufacturing company",
  "a supermarket chain",
  "a transport company",
  "a construction supplies business",
  "an agricultural trading company",
  "a local e-commerce business",
  "a financial-services company",
  "a hospitality business",
  "a wholesale distribution company",
  "a pharmacy retail business",
  "a printing company",
  "a logistics company",
  "a food-processing business",
  "a clothing retailer",
  "a technology services company",
  "a cooperative enterprise",
  "a vehicle-parts dealership",
  "a procurement department",
  "a microfinance institution",
  "an export business",
  "a campus enterprise",
  "a renewable-energy company",
] as const;

const ENGINEERING_CONTEXTS = [
  "a bridge design project",
  "a machine workshop",
  "a solar installation project",
  "a building construction site",
  "an electrical maintenance workshop",
  "a water-pumping system",
  "a vehicle engineering workshop",
  "a manufacturing plant",
  "a civil-engineering laboratory",
  "a renewable-energy microgrid",
  "a structural design office",
  "a road construction project",
  "an electronics laboratory",
  "a surveying field exercise",
  "a mechanical design team",
  "an industrial maintenance unit",
  "a smart-building project",
  "a power-distribution training lab",
  "a materials-testing laboratory",
  "a robotics hardware workshop",
  "a technical drawing studio",
  "a drainage design project",
  "a fabrication workshop",
  "an energy-systems laboratory",
] as const;

const LAW_CONTEXTS = [
  "a commercial supply agreement",
  "a residential tenancy agreement",
  "an employment agreement",
  "a vehicle sale transaction",
  "a construction services contract",
  "a land sale transaction",
  "a business partnership agreement",
  "a mobile-phone sale",
  "a professional services agreement",
  "a goods delivery contract",
  "a school services agreement",
  "an equipment hire agreement",
  "a software services contract",
  "a loan agreement",
  "a retail purchase transaction",
  "an insurance agreement",
  "a transport services contract",
  "a property management agreement",
  "a procurement contract",
  "a maintenance services agreement",
  "a photography services contract",
  "a farm produce sale",
  "a consulting agreement",
  "a warehouse lease",
] as const;

const MATHEMATICS_CONTEXTS = [
  "a school canteen",
  "a classroom survey",
  "a football training session",
  "a market stall",
  "a savings club",
  "a bus transport service",
  "a water storage project",
  "a farm harvest record",
  "a phone-repair shop",
  "a solar installation",
  "a community library",
  "a student enterprise",
  "a school sports club",
  "a building project",
  "a delivery service",
  "a household budget",
  "a mobile-data plan",
  "a small bakery",
  "a taxi service",
  "a school science fair",
  "a community event",
  "a bookshop",
  "a tailoring business",
  "a youth training programme",
] as const;

const SCIENCE_CONTEXTS = [
  "a school science laboratory",
  "a university chemistry laboratory",
  "a water-quality testing laboratory",
  "an environmental monitoring project",
  "a food-science laboratory",
  "a soil-testing laboratory",
  "a renewable-energy experiment",
  "a materials-science laboratory",
  "a community water project",
  "an agricultural research station",
  "a laboratory safety exercise",
  "a climate observation project",
  "a quality-control laboratory",
  "a pharmaceutical teaching laboratory",
  "a science-fair experiment",
  "a fisheries research station",
  "a plant-science laboratory",
  "a mineral analysis laboratory",
  "a waste-treatment project",
  "a laboratory calibration exercise",
  "an air-quality monitoring team",
  "a school practical lesson",
  "a food-processing laboratory",
  "a field science investigation",
] as const;

function contextFor(config: SessionConfig, index: number) {
  const selection = `${config.programId} ${config.subjectId}`.toLowerCase();
  let contexts: readonly string[] = MODERN_CONTEXTS;

  if (/law|contract|constitutional|criminal|tort|legal|jurisprudence/.test(selection)) contexts = LAW_CONTEXTS;
  else if (/anatomy|physiology|nursing|medicine|medical|pharmacy|health|biomedical|epidemiology/.test(selection)) contexts = HEALTH_CONTEXTS;
  else if (/account|business|finance|econom|management|marketing|procurement|supply|hrm|human-resource/.test(selection)) contexts = BUSINESS_CONTEXTS;
  else if (/engineering|mechanic|physics|circuit|electric|electronic|drawing|architecture|survey|construction|material/.test(selection)) contexts = ENGINEERING_CONTEXTS;
  else if (/program|comput|network|software|web|cyber|database|cloud|information-technology|data/.test(selection)) contexts = TECHNOLOGY_CONTEXTS;
  else if (/math|statistics|probability|calculus|algebra|actuarial/.test(selection)) contexts = MATHEMATICS_CONTEXTS;
  else if (/chemistry|science|laboratory|biology|genetic|biochemistry|agricultur/.test(selection)) contexts = SCIENCE_CONTEXTS;

  return contexts[index % contexts.length];
}

const PEOPLE = [
  "Ama", "Kojo", "Akosua", "Kwame", "Esi", "Kofi", "Adwoa", "Yaw",
  "Abena", "Kwaku", "Efua", "Kwesi", "Amina", "Ibrahim", "Zainab", "Fati",
  "Nana", "Sena", "Mansa", "Daniel", "Mary", "Joseph", "Selina", "Kobby",
  "Araba", "Ekow", "Naa", "Nii", "Afia", "Kweku", "Tetteh", "Fatima",
] as const;

const GOODS = [
  "laptop", "phone", "bicycle", "solar panel", "textbook", "camera", "printer", "tablet",
  "water pump", "drone", "motorbike", "generator", "3D printer", "router", "sensor kit", "projector",
  "refrigerator", "sewing machine", "farm tool", "graphics tablet", "battery pack", "server", "microscope", "speaker",
] as const;

function product(values: readonly number[]) {
  return values.reduce((result, value) => result * value, 1);
}

function decode(index: number, dimensions: readonly number[]) {
  let value = Math.max(0, Math.floor(index));
  return dimensions.map((dimension) => {
    const digit = value % dimension;
    value = Math.floor(value / dimension);
    return digit;
  });
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function seedValue(seed: number) {
  if (!Number.isFinite(seed)) return 1;
  return Math.abs(Math.floor(seed)) >>> 0;
}

function variantIndex(template: SmartTemplate, seed: number, position: number) {
  // Mix two independent 32-bit hashes into a safe 53-bit integer. This is
  // intentionally non-local: question N+1 should jump across the template's
  // mixed-radix dimensions (numbers, scenario, wording, cognitive style and
  // response format), rather than looking like question N with one digit
  // changed. The result remains deterministic for testability and replay.
  const key = `${template.id}:${seedValue(seed)}:${position}`;
  const high = hash(`${key}:high`);
  const low = hash(`${key}:low`) & 0x1fffff;
  const mixed = high * 0x200000 + low;
  return mixed % template.capacity;
}

function clampDifficulty(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
}

function levelDifficulty(levelId: string) {
  if (levelId === "shs-1" || levelId === "level-100") return 2;
  if (levelId === "shs-2" || levelId === "level-200") return 3;
  if (levelId === "shs-3" || levelId === "level-300") return 4;
  if (levelId === "level-400" || levelId === "level-500" || levelId === "level-600") return 5;
  return 3;
}

function selectedLabels(config: SessionConfig) {
  const catalog = catalogFor(config.lane);
  const program = catalog.programs.find((item) => item.id === config.programId);
  const level = program?.levels.find((item) => item.id === config.levelId);
  const subject = level?.subjects.find((item) => item.id === config.subjectId);
  const topic = subject?.topics.find((item) => item.id === config.topicId);
  return {
    subject: subject?.contentLabel ?? subject?.label ?? config.subjectId.replaceAll("-", " "),
    topic: topic?.label,
  };
}

function topicLabel(config: SessionConfig, fallback: string) {
  return selectedLabels(config).topic ?? fallback;
}

function shuffleChoices(answer: string, distractors: string[], variant: number) {
  const unique = Array.from(new Set([answer, ...distractors]));
  const offset = unique.length ? variant % unique.length : 0;
  const rotated = [...unique.slice(offset), ...unique.slice(0, offset)];
  return {
    options: rotated.map((label, index) => ({ id: String(index), label })),
    answer: String(rotated.indexOf(answer)),
  };
}

function numericChoices(answer: number, variant: number, step = 1) {
  const distractors = [
    answer + step,
    answer - step,
    answer + 2 * step,
    answer - 2 * step,
    answer * 2,
  ].filter((value) => Number.isFinite(value));
  const labels = Array.from(new Set([answer, ...distractors])).slice(0, 4).map((value) =>
    Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3))),
  );
  const answerLabel = Number.isInteger(answer) ? String(answer) : String(Number(answer.toFixed(3)));
  const offset = labels.length ? variant % labels.length : 0;
  const rotated = [...labels.slice(offset), ...labels.slice(0, offset)];
  return {
    options: rotated.map((label, index) => ({ id: String(index), label })),
    answer: String(rotated.indexOf(answerLabel)),
  };
}

function numericQuestion(args: {
  id: string;
  config: SessionConfig;
  variant: number;
  skill: string;
  challenge: CognitiveChallenge;
  mission: string;
  prompt: string;
  answer: number;
  explanation: string;
  hint: string;
  difficulty?: number;
  formatIndex: number;
  topic?: string;
  optionStep?: number;
}): LearnQuestion {
  const difficulty = clampDifficulty(args.difficulty ?? levelDifficulty(args.config.levelId));
  const subject = selectedLabels(args.config).subject;
  const normalized = Number.isInteger(args.answer) ? args.answer : Number(args.answer.toFixed(3));
  const kind: QuestionKind = args.formatIndex % 3 === 0 ? "numeric" : args.formatIndex % 3 === 1 ? "single" : "fill";
  const common = {
    id: `foundry-${args.id}-${args.variant}`,
    exposureKey: `foundry:${args.id}:${args.variant}`,
    subject,
    topic: args.topic ?? topicLabel(args.config, "Applied problem solving"),
    skill: args.skill,
    difficulty,
    prompt: args.prompt,
    explanation: args.explanation,
    hint: args.hint,
    challenge: args.challenge,
    mission: args.mission,
    generationFamily: args.id,
  } as const;

  if (kind === "single") {
    const choice = numericChoices(normalized, args.variant, args.optionStep ?? 1);
    return { ...common, kind, answer: choice.answer, options: choice.options };
  }
  return { ...common, kind, answer: normalized, acceptedAnswers: [String(normalized)] };
}

function singleQuestion(args: {
  id: string;
  config: SessionConfig;
  variant: number;
  skill: string;
  challenge: CognitiveChallenge;
  mission: string;
  prompt: string;
  answer: string;
  distractors: string[];
  explanation: string;
  hint?: string;
  difficulty?: number;
  topic?: string;
}): LearnQuestion {
  const choice = shuffleChoices(args.answer, args.distractors, args.variant);
  return {
    id: `foundry-${args.id}-${args.variant}`,
    exposureKey: `foundry:${args.id}:${args.variant}`,
    kind: "single",
    subject: selectedLabels(args.config).subject,
    topic: args.topic ?? topicLabel(args.config, "Concept transfer"),
    skill: args.skill,
    difficulty: clampDifficulty(args.difficulty ?? levelDifficulty(args.config.levelId)),
    prompt: args.prompt,
    options: choice.options,
    answer: choice.answer,
    explanation: args.explanation,
    hint: args.hint,
    challenge: args.challenge,
    mission: args.mission,
    generationFamily: args.id,
  };
}

const genericTopics = ["core-concepts", "applications", "problem-solving"] as const;

const linearDimensions = [37, 161, 241, MODERN_CONTEXTS.length, 6, 3] as const;
const linearCapacity = product(linearDimensions);

function renderLinearModel(variant: number, config: SessionConfig) {
  const [coefficientIndex, solutionIndex, constantIndex, contextIndex, style, format] = decode(variant, linearDimensions);
  const coefficient = coefficientIndex + 2;
  const solution = solutionIndex - 80;
  const constant = constantIndex - 120;
  const total = coefficient * solution + constant;
  const context = contextFor(config, contextIndex);
  const challenge: CognitiveChallenge = style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer";
  const prompt = style === 0
    ? `Solve for x: ${coefficient}x ${constant >= 0 ? "+" : "-"} ${Math.abs(constant)} = ${total}`
    : style === 1
      ? `At ${context}, a model outputs ${total} from the rule y = ${coefficient}x ${constant >= 0 ? "+" : "-"} ${Math.abs(constant)}. What input x produced that output?`
      : style === 2
        ? `A calibration rule is y = ${coefficient}x ${constant >= 0 ? "+" : "-"} ${Math.abs(constant)}. If y = ${total}, determine x and use substitution to check it.`
        : style === 3
          ? `A learner claims x = ${solution + 1} satisfies ${coefficient}x ${constant >= 0 ? "+" : "-"} ${Math.abs(constant)} = ${total}. What value of x actually satisfies the equation?`
          : style === 4
            ? `${context} charges a fixed adjustment of ${constant} units plus ${coefficient} units per activity. The recorded total is ${total}. How many activities were recorded?`
            : `Reverse-engineer the input: a linear transformation multiplies x by ${coefficient}, then ${constant >= 0 ? "adds" : "subtracts"} ${Math.abs(constant)}, producing ${total}. Find x.`;

  return numericQuestion({
    id: "linear-model",
    config,
    variant,
    skill: "Solve and verify linear models",
    challenge,
    mission: style >= 2 ? "Reverse-engineer the model" : "Crack the linear rule",
    prompt,
    answer: solution,
    explanation: `Move the constant term first: ${coefficient}x = ${total - constant}. Divide by ${coefficient}, giving x = ${solution}. Substitution reproduces ${total}.`,
    hint: "Undo the addition or subtraction before undoing the multiplication.",
    difficulty: levelDifficulty(config.levelId) + (style >= 2 ? 1 : 0),
    formatIndex: format,
  });
}

const percentDimensions = [900, 800, MODERN_CONTEXTS.length, 6, 3] as const;
const percentCapacity = product(percentDimensions);

function renderPercentageModel(variant: number, config: SessionConfig) {
  const [baseIndex, rateIndex, contextIndex, style, format] = decode(variant, percentDimensions);
  const base = baseIndex + 100;
  const rate = (rateIndex % 80) + 1;
  const change = Number((base * rate / 100).toFixed(2));
  const increased = Number((base + change).toFixed(2));
  const context = contextFor(config, contextIndex);
  const decrease = style % 2 === 1;
  const answer = decrease ? Number((base - change).toFixed(2)) : increased;
  const operation = decrease ? "decreases" : "increases";
  const challenge: CognitiveChallenge = style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer";
  const prompt = style < 2
    ? `A metric at ${context} starts at ${base} and ${operation} by ${rate}%. What is the new value?`
    : style < 4
      ? `A dashboard at ${context} records a baseline of ${base}. After a ${rate}% ${decrease ? "drop" : "rise"}, calculate the updated value and check whether the direction of change is reasonable.`
      : `Model a ${rate}% ${decrease ? "reduction" : "growth"} from a starting value of ${base} for ${context}. What value should the next report show?`;
  return numericQuestion({
    id: "percentage-model",
    config,
    variant,
    skill: "Apply percentage change in context",
    challenge,
    mission: "Read the change, not just the numbers",
    prompt,
    answer,
    explanation: `${rate}% of ${base} is ${change}. The new value is ${base} ${decrease ? "-" : "+"} ${change} = ${answer}.`,
    hint: "Find the percentage of the original value, then apply the direction of change.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
    optionStep: Math.max(1, Math.round(change / 4)),
  });
}

const kinematicsDimensions = [51, 30, 30, MODERN_CONTEXTS.length, 6, 3] as const;
const kinematicsCapacity = product(kinematicsDimensions);

function renderKinematics(variant: number, config: SessionConfig) {
  const [uIndex, aIndex, tIndex, contextIndex, style, format] = decode(variant, kinematicsDimensions);
  const u = uIndex;
  const a = aIndex + 1;
  const t = tIndex + 1;
  const v = u + a * t;
  const s = Number((u * t + 0.5 * a * t * t).toFixed(2));
  const context = contextFor(config, contextIndex);
  const askDistance = style % 2 === 1;
  const answer = askDistance ? s : v;
  const prompt = askDistance
    ? `A test vehicle in ${context} starts at ${u} m/s and accelerates uniformly at ${a} m/s² for ${t} s. How far does it travel during that interval?`
    : `A moving system in ${context} has initial velocity ${u} m/s and constant acceleration ${a} m/s² for ${t} s. What is its final velocity?`;
  return numericQuestion({
    id: "kinematics",
    config,
    variant,
    skill: askDistance ? "Model displacement under constant acceleration" : "Model velocity under constant acceleration",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: contextIndex % 2 ? "Engineer the motion" : "Predict the motion",
    prompt,
    answer,
    explanation: askDistance
      ? `Use s = ut + ½at²: ${u}×${t} + 0.5×${a}×${t}² = ${s} m.`
      : `Use v = u + at: ${u} + ${a}×${t} = ${v} m/s.`,
    hint: askDistance ? "Use s = ut + ½at²." : "Use v = u + at.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
  });
}

const circuitDimensions = [240, 200, MODERN_CONTEXTS.length, 6, 3] as const;
const circuitCapacity = product(circuitDimensions);

function renderCircuit(variant: number, config: SessionConfig) {
  const [voltageIndex, resistanceIndex, contextIndex, style, format] = decode(variant, circuitDimensions);
  const voltage = voltageIndex + 1;
  const resistance = resistanceIndex + 1;
  const current = Number((voltage / resistance).toFixed(3));
  const power = Number((voltage * current).toFixed(3));
  const askPower = style % 2 === 1;
  const answer = askPower ? power : current;
  const context = contextFor(config, contextIndex);
  return numericQuestion({
    id: "dc-circuit",
    config,
    variant,
    skill: askPower ? "Connect voltage, current and power" : "Apply Ohm's law",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Debug the electrical model",
    prompt: askPower
      ? `A DC component in ${context} has ${voltage} V across a ${resistance} Ω load. What power does the load use, in watts?`
      : `A ${resistance} Ω component in ${context} has ${voltage} V across it. What current flows, in amperes?`,
    answer,
    explanation: askPower
      ? `First I = V/R = ${voltage}/${resistance} = ${current} A. Then P = VI = ${voltage}×${current} = ${power} W.`
      : `Ohm's law gives I = V/R = ${voltage}/${resistance} = ${current} A.`,
    hint: askPower ? "Find current with I = V/R, then use P = VI." : "Use I = V/R.",
    difficulty: levelDifficulty(config.levelId) + (askPower ? 1 : 0),
    formatIndex: format,
  });
}

const chemistryDimensions = [400, 300, MODERN_CONTEXTS.length, 6, 3] as const;
const chemistryCapacity = product(chemistryDimensions);

function renderChemistry(variant: number, config: SessionConfig) {
  const [molesIndex, volumeIndex, contextIndex, style, format] = decode(variant, chemistryDimensions);
  const moles = Number(((molesIndex + 1) / 20).toFixed(2));
  const volume = Number(((volumeIndex + 10) / 100).toFixed(2));
  const concentration = Number((moles / volume).toFixed(3));
  const askMoles = style % 3 === 2;
  const answer = askMoles ? moles : concentration;
  const context = contextFor(config, contextIndex);
  return numericQuestion({
    id: "solution-chemistry",
    config,
    variant,
    skill: askMoles ? "Rearrange concentration relationships" : "Calculate amount concentration",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Balance the lab model",
    prompt: askMoles
      ? `A solution used by ${context} has concentration ${concentration} mol/L and volume ${volume} L. How many moles of solute does it contain?`
      : `A solution prepared for ${context} contains ${moles} mol of solute in ${volume} L. What is its concentration in mol/L?`,
    answer,
    explanation: askMoles
      ? `n = cV = ${concentration}×${volume} ≈ ${moles} mol.`
      : `c = n/V = ${moles}/${volume} = ${concentration} mol/L.`,
    hint: "Use c = n/V and rearrange for the unknown quantity.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
  });
}

const statsDimensions = [500, 400, 100, MODERN_CONTEXTS.length, 6, 3] as const;
const statsCapacity = product(statsDimensions);

function renderStatistics(variant: number, config: SessionConfig) {
  const [meanIndex, spreadIndex, sampleIndex, contextIndex, style, format] = decode(variant, statsDimensions);
  const mean = meanIndex + 10;
  const spread = (spreadIndex % 50) + 1;
  const sample = sampleIndex + 10;
  const total = mean * sample;
  const missing = mean + spread;
  const partial = total - missing;
  const context = contextFor(config, contextIndex);
  const askMissing = style % 2 === 0;
  const answer = askMissing ? missing : mean;
  return numericQuestion({
    id: "statistical-reasoning",
    config,
    variant,
    skill: askMissing ? "Recover a missing value from a mean" : "Interpret sample summaries",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Interrogate the data",
    prompt: askMissing
      ? `A ${sample}-value dataset from ${context} has mean ${mean}. The sum of ${sample - 1} known values is ${partial}. What is the missing value?`
      : `A dataset from ${context} contains ${sample} observations with total ${total}. What is the arithmetic mean?`,
    answer,
    explanation: askMissing
      ? `Required total = ${mean}×${sample} = ${total}. Missing value = ${total} - ${partial} = ${missing}.`
      : `Mean = total/count = ${total}/${sample} = ${mean}.`,
    hint: askMissing ? "Use mean × count to recover the required total." : "Divide the total by the number of observations.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
  });
}

const programmingDimensions = [500, 30, 80, MODERN_CONTEXTS.length, 6, 3] as const;
const programmingCapacity = product(programmingDimensions);

function renderProgrammingTrace(variant: number, config: SessionConfig) {
  const [startIndex, stepIndex, countIndex, contextIndex, style, format] = decode(variant, programmingDimensions);
  const start = startIndex - 250;
  const step = stepIndex + 1;
  const count = countIndex + 1;
  const final = start + step * count;
  const context = contextFor(config, contextIndex);
  const askIterations = style % 3 === 2;
  const answer = askIterations ? count : final;
  const prompt = askIterations
    ? `In ${context}, pseudocode sets x = ${start} and repeats “x = x + ${step}” exactly ${count} times. How many loop-body executions occur?`
    : `Trace this pseudocode used in ${context}: x = ${start}; repeat ${count} times { x = x + ${step} }. What is the final value of x?`;
  return numericQuestion({
    id: "program-trace",
    config,
    variant,
    skill: askIterations ? "Reason about loop execution" : "Trace state changes through a loop",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Run the code in your head",
    prompt,
    answer,
    explanation: askIterations
      ? `The body is specified to repeat exactly ${count} times.`
      : `Each iteration adds ${step}; after ${count} iterations the total change is ${step * count}, so x = ${start} + ${step * count} = ${final}.`,
    hint: "Track the variable after each iteration or use start + step × iterations.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
  });
}

const networkDimensions = [5000, 32, MODERN_CONTEXTS.length, 6, 3] as const;
const networkCapacity = product(networkDimensions);
const BANDWIDTHS = [1, 2, 4, 5, 8, 10, 16, 20, 25, 32, 40, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000] as const;

function renderNetwork(variant: number, config: SessionConfig) {
  const [sizeIndex, bandwidthIndex, contextIndex, style, format] = decode(variant, networkDimensions);
  const sizeMB = sizeIndex + 1;
  const bandwidthMbps = BANDWIDTHS[bandwidthIndex];
  const seconds = Number(((sizeMB * 8) / bandwidthMbps).toFixed(3));
  const context = contextFor(config, contextIndex);
  return numericQuestion({
    id: "network-throughput",
    config,
    variant,
    skill: "Relate data size, bandwidth and transfer time",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Size the network",
    prompt: `Ignoring overhead, ${context} must transfer a ${sizeMB} MB file over a ${bandwidthMbps} Mb/s link. Approximately how many seconds does the transfer take?`,
    answer: seconds,
    explanation: `${sizeMB} MB = ${sizeMB * 8} Mb. Time = data/bandwidth = ${sizeMB * 8}/${bandwidthMbps} = ${seconds} s.`,
    hint: "Convert megabytes to megabits by multiplying by 8, then divide by Mb/s.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
  });
}

const accountingDimensions = [10_000, 10_000, MODERN_CONTEXTS.length, 6, 3] as const;
const accountingCapacity = product(accountingDimensions);

function renderAccounting(variant: number, config: SessionConfig) {
  const [liabilityIndex, equityIndex, contextIndex, style, format] = decode(variant, accountingDimensions);
  const liabilities = (liabilityIndex + 1) * 10;
  const equity = (equityIndex + 1) * 10;
  const assets = liabilities + equity;
  const context = contextFor(config, contextIndex);
  const askEquity = style % 3 === 2;
  const answer = askEquity ? equity : assets;
  return numericQuestion({
    id: "accounting-equation",
    config,
    variant,
    skill: "Apply and rearrange the accounting equation",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Balance the digital ledger",
    prompt: askEquity
      ? `The ledger for ${context} reports assets of GH₵${assets.toLocaleString()} and liabilities of GH₵${liabilities.toLocaleString()}. What is equity?`
      : `The ledger for ${context} reports liabilities of GH₵${liabilities.toLocaleString()} and equity of GH₵${equity.toLocaleString()}. What are total assets?`,
    answer,
    explanation: askEquity
      ? `Equity = assets - liabilities = ${assets} - ${liabilities} = GH₵${equity}.`
      : `Assets = liabilities + equity = ${liabilities} + ${equity} = GH₵${assets}.`,
    hint: "Use Assets = Liabilities + Equity.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
    optionStep: 10,
  });
}

const breakEvenDimensions = [5000, 500, 400, MODERN_CONTEXTS.length, 6, 3] as const;
const breakEvenCapacity = product(breakEvenDimensions);

function renderBreakEven(variant: number, config: SessionConfig) {
  const [fixedIndex, priceIndex, variableIndex, contextIndex, style, format] = decode(variant, breakEvenDimensions);
  const fixedCost = (fixedIndex + 10) * 100;
  const variableCost = variableIndex + 1;
  const price = variableCost + priceIndex + 2;
  const contribution = price - variableCost;
  const units = Math.ceil(fixedCost / contribution);
  const context = contextFor(config, contextIndex);
  return numericQuestion({
    id: "break-even",
    config,
    variant,
    skill: "Model contribution and break-even output",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Stress-test the business model",
    prompt: `${context} has fixed costs of GH₵${fixedCost.toLocaleString()}, sells one unit for GH₵${price}, and incurs GH₵${variableCost} variable cost per unit. What is the minimum whole number of units needed to cover fixed costs?`,
    answer: units,
    explanation: `Contribution per unit = ${price} - ${variableCost} = GH₵${contribution}. Break-even units = ${fixedCost}/${contribution} = ${(fixedCost / contribution).toFixed(2)}, so at least ${units} whole units are needed.`,
    hint: "Break-even units = fixed cost ÷ contribution per unit, then round up.",
    difficulty: levelDifficulty(config.levelId) + (style >= 3 ? 1 : 0),
    formatIndex: format,
  });
}

const economicsDimensions = [900, 900, 100, MODERN_CONTEXTS.length, 6, 3] as const;
const economicsCapacity = product(economicsDimensions);

function renderElasticity(variant: number, config: SessionConfig) {
  const [quantityIndex, priceIndex, scaleIndex, contextIndex, style, format] = decode(variant, economicsDimensions);
  const quantityChange = (quantityIndex % 90) + 1;
  const priceChange = (priceIndex % 45) + 1;
  const scale = scaleIndex + 1;
  const elasticity = Number((quantityChange / priceChange).toFixed(3));
  const context = contextFor(config, contextIndex);
  const interpretation = elasticity > 1 ? "elastic" : elasticity < 1 ? "inelastic" : "unit elastic";
  const askInterpretation = style % 3 === 2;
  if (askInterpretation) {
    return singleQuestion({
      id: "elasticity-interpretation",
      config,
      variant,
      skill: "Interpret price elasticity of demand",
      challenge: style >= 4 ? "Transfer" : "Analyse",
      mission: "Read the market signal",
      prompt: `In a simulated market for ${context}, quantity demanded changes by ${quantityChange * scale}% when price changes by ${priceChange * scale}% in the opposite direction. The absolute price elasticity is ${elasticity}. How should demand be classified?`,
      answer: interpretation,
      distractors: ["elastic", "inelastic", "unit elastic"].filter((item) => item !== interpretation),
      explanation: `Elasticity = |${quantityChange * scale}% ÷ ${priceChange * scale}%| = ${elasticity}. Values above 1 are elastic, below 1 inelastic, and exactly 1 unit elastic.`,
      hint: "Compare the absolute elasticity value with 1.",
      difficulty: levelDifficulty(config.levelId) + 1,
    });
  }
  return numericQuestion({
    id: "elasticity",
    config,
    variant,
    skill: "Calculate price elasticity of demand",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Quantify the market response",
    prompt: `A market model for ${context} shows quantity demanded changing by ${quantityChange * scale}% while price changes by ${priceChange * scale}% in the opposite direction. Using absolute values, what is the price elasticity of demand?`,
    answer: elasticity,
    explanation: `PED = |%ΔQ ÷ %ΔP| = ${quantityChange * scale}/${priceChange * scale} = ${elasticity}.`,
    hint: "Divide the percentage change in quantity demanded by the percentage change in price.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
  });
}

const epidemiologyDimensions = [50_000, 200_000, MODERN_CONTEXTS.length, 6, 3] as const;
const epidemiologyCapacity = product(epidemiologyDimensions);

function renderEpidemiology(variant: number, config: SessionConfig) {
  const [caseIndex, populationIndex, contextIndex, style, format] = decode(variant, epidemiologyDimensions);
  const population = populationIndex + 1_000;
  const cases = (caseIndex % Math.max(1, Math.min(population - 1, 50_000))) + 1;
  const rate = Number(((cases / population) * 1000).toFixed(3));
  const context = contextFor(config, contextIndex);
  return numericQuestion({
    id: "incidence-rate",
    config,
    variant,
    skill: "Calculate and interpret a population incidence rate",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Read the population signal",
    prompt: `A surveillance exercise linked to ${context} records ${cases} new cases among ${population.toLocaleString()} people during a defined period. What is the incidence per 1,000 people for that period?`,
    answer: rate,
    explanation: `Incidence per 1,000 = (${cases}/${population})×1000 = ${rate}.`,
    hint: "Divide new cases by the population at risk, then multiply by 1,000.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
  });
}

const physiologyDimensions = [101, 101, MODERN_CONTEXTS.length, 6, 3] as const;
const physiologyCapacity = product(physiologyDimensions);

function renderCardiacOutput(variant: number, config: SessionConfig) {
  const [heartIndex, strokeIndex, contextIndex, style, format] = decode(variant, physiologyDimensions);
  const heartRate = heartIndex + 40;
  const strokeVolume = strokeIndex + 40;
  const output = Number(((heartRate * strokeVolume) / 1000).toFixed(3));
  const context = contextFor(config, contextIndex);
  return numericQuestion({
    id: "cardiac-output",
    config,
    variant,
    skill: "Relate heart rate, stroke volume and cardiac output",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Model a physiology relationship",
    prompt: `In an educational physiology dataset from ${context}, heart rate is ${heartRate} beats/min and stroke volume is ${strokeVolume} mL/beat. What is cardiac output in L/min?`,
    answer: output,
    explanation: `Cardiac output = heart rate × stroke volume = ${heartRate}×${strokeVolume} = ${heartRate * strokeVolume} mL/min = ${output} L/min.`,
    hint: "Multiply beats/min by mL/beat, then divide by 1,000 to convert mL to L.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
  });
}

const stressDimensions = [50_000, 10_000, MODERN_CONTEXTS.length, 6, 3] as const;
const stressCapacity = product(stressDimensions);

function renderEngineeringStress(variant: number, config: SessionConfig) {
  const [forceIndex, areaIndex, contextIndex, style, format] = decode(variant, stressDimensions);
  const forceKN = Number(((forceIndex + 10) / 10).toFixed(1));
  const areaMM2 = areaIndex + 10;
  const stressMPa = Number(((forceKN * 1000) / areaMM2).toFixed(3));
  const context = contextFor(config, contextIndex);
  return numericQuestion({
    id: "engineering-stress",
    config,
    variant,
    skill: "Calculate normal engineering stress",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Check the structure",
    prompt: `A component in ${context} carries an axial load of ${forceKN} kN over a cross-sectional area of ${areaMM2} mm². What normal stress does this represent in MPa?`,
    answer: stressMPa,
    explanation: `Stress = force/area = ${forceKN * 1000} N ÷ ${areaMM2} mm² = ${stressMPa} N/mm² = ${stressMPa} MPa.`,
    hint: "Convert kN to N, then divide by mm²; 1 N/mm² = 1 MPa.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
  });
}

const lawDimensions = [PEOPLE.length, PEOPLE.length, GOODS.length, MODERN_CONTEXTS.length, 4, 6, 4] as const;
const lawCapacity = product(lawDimensions);
const CONTRACT_CONCEPTS = [
  {
    label: "offer",
    stem: (a: string, b: string, good: string, context: string) => `${a}, working with ${context}, tells ${b}: “I will sell you my ${good} for GH₵4,000, and this proposal stays open until Friday.”`,
    explanation: "A definite proposal made with the intention that it can be accepted is an offer in this simplified contract-law scenario.",
  },
  {
    label: "acceptance",
    stem: (a: string, b: string, good: string, context: string) => `${a} offers to sell a ${good} for GH₵4,000 in a transaction connected to ${context}. ${b} replies without changing the terms: “I agree to those terms.”`,
    explanation: "An unqualified assent to the terms of an offer illustrates acceptance in this simplified scenario.",
  },
  {
    label: "consideration",
    stem: (a: string, b: string, good: string, context: string) => `${a} transfers a ${good} to ${b} in a transaction for ${context}; in return, ${b} promises to pay the agreed price.`,
    explanation: "The exchanged promises or value illustrate consideration in a basic common-law contract analysis.",
  },
  {
    label: "counter-offer",
    stem: (a: string, b: string, good: string, context: string) => `${a} offers a ${good} for GH₵4,000 while working with ${context}. ${b} replies: “I will buy it for GH₵3,500 instead.”`,
    explanation: "Changing a material term rather than accepting it is a counter-offer in this simplified common-law scenario.",
  },
] as const;

function renderContractReasoning(variant: number, config: SessionConfig) {
  const [personA, personB, goodIndex, contextIndex, conceptIndex, style, rotation] = decode(variant, lawDimensions);
  const concept = CONTRACT_CONCEPTS[conceptIndex];
  const a = PEOPLE[personA];
  const b = PEOPLE[(personB + personA + 1) % PEOPLE.length];
  const good = GOODS[goodIndex];
  const context = contextFor(config, contextIndex);
  return singleQuestion({
    id: "contract-reasoning",
    config,
    variant,
    skill: "Identify contract-law concepts from facts",
    challenge: style < 2 ? "Analyse" : style < 4 ? "Evaluate" : "Transfer",
    mission: "Spot the legal issue in the facts",
    prompt: `${concept.stem(a, b, good, context)} Which contract-law concept is most directly illustrated?`,
    answer: concept.label,
    distractors: CONTRACT_CONCEPTS.filter((_, index) => index !== conceptIndex).map((item) => item.label),
    explanation: concept.explanation,
    hint: "Focus on what the parties communicated or exchanged, not on the technology or item involved.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0) + (rotation % 2),
    topic: topicLabel(config, "Contract reasoning"),
  });
}

const managementDimensions = [PEOPLE.length, MODERN_CONTEXTS.length, 5, 8, 64] as const;
// Capacity counts distinct scenario prompts, not metadata-only permutations.
const managementCapacity = PEOPLE.length * MODERN_CONTEXTS.length * 5;
const MANAGEMENT_CONCEPTS = [
  ["planning", "sets measurable goals and decides the actions, deadlines and resources needed to reach them", "Planning sets objectives and specifies how they will be achieved."],
  ["organising", "groups tasks, assigns responsibilities and arranges resources into a workable structure", "Organising structures tasks, roles and resources."],
  ["leading", "communicates direction, motivates the team and resolves coordination problems", "Leading focuses on direction, motivation and influence."],
  ["controlling", "compares actual results with targets, identifies deviations and decides corrective action", "Controlling measures performance against standards and supports correction."],
  ["delegation", "assigns a defined responsibility and enough authority to another team member while retaining accountability", "Delegation transfers responsibility and authority for a task while overall accountability remains with the manager."],
] as const;

function renderManagementScenario(variant: number, config: SessionConfig) {
  const [personIndex, contextIndex, conceptIndex, style, rotation] = decode(variant, managementDimensions);
  const [answer, action, explanation] = MANAGEMENT_CONCEPTS[conceptIndex];
  const person = PEOPLE[personIndex];
  const context = contextFor(config, contextIndex);
  return singleQuestion({
    id: "management-scenario",
    config,
    variant,
    skill: "Classify management decisions from realistic scenarios",
    challenge: style < 2 ? "Apply" : style < 5 ? "Analyse" : "Transfer",
    mission: "Read the decision behind the action",
    prompt: `At ${context}, ${person} ${action}. Which management concept is most directly demonstrated?`,
    answer,
    distractors: MANAGEMENT_CONCEPTS.filter((_, index) => index !== conceptIndex).slice(0, 3).map((item) => item[0]),
    explanation,
    hint: "Identify the purpose of the manager's action.",
    difficulty: levelDifficulty(config.levelId) + (style >= 5 ? 1 : 0) + (rotation % 2),
  });
}


const compoundDimensions = [9_900, 240, 60, MODERN_CONTEXTS.length, 6, 3] as const;
const compoundCapacity = product(compoundDimensions);

function renderCompoundGrowth(variant: number, config: SessionConfig) {
  const [principalIndex, rateIndex, yearsIndex, contextIndex, style, format] = decode(variant, compoundDimensions);
  const principal = (principalIndex + 100) * 10;
  const rate = Number((((rateIndex % 240) + 1) / 20).toFixed(2));
  const years = (yearsIndex % 20) + 1;
  const factor = 1 + rate / 100;
  const future = Number((principal * factor ** years).toFixed(2));
  const growth = Number((future - principal).toFixed(2));
  const context = contextFor(config, contextIndex);
  const askGrowth = style % 3 === 2;
  return numericQuestion({
    id: "compound-growth",
    config,
    variant,
    skill: askGrowth ? "Separate compound growth from final value" : "Model compound growth",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Project the value through time",
    prompt: askGrowth
      ? `${context} models GH₵${principal.toLocaleString()} growing at ${rate}% per year for ${years} years with annual compounding. How much growth occurs above the starting value?`
      : `${context} models GH₵${principal.toLocaleString()} growing at ${rate}% per year for ${years} years with annual compounding. What is the projected value after ${years} years?`,
    answer: askGrowth ? growth : future,
    explanation: `Compound value = ${principal}(1 + ${rate}/100)^${years} = GH₵${future}. ${askGrowth ? `Growth = ${future} - ${principal} = GH₵${growth}.` : ""}`,
    hint: "Use A = P(1 + r)^n with r written as a decimal.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
    optionStep: Math.max(1, Math.round(principal * rate / 100)),
  });
}

const probabilityDimensions = [999, 999, 40, MODERN_CONTEXTS.length, 6, 3] as const;
const probabilityCapacity = product(probabilityDimensions);

function renderProbability(variant: number, config: SessionConfig) {
  const [successIndex, failureIndex, scaleIndex, contextIndex, style, format] = decode(variant, probabilityDimensions);
  const success = (successIndex % 90) + 1;
  const failure = (failureIndex % 90) + 1;
  const scale = (scaleIndex % 10) + 1;
  const successCount = success * scale;
  const failureCount = failure * scale;
  const total = successCount + failureCount;
  const probability = Number((successCount / total).toFixed(3));
  const percent = Number((probability * 100).toFixed(1));
  const context = contextFor(config, contextIndex);
  const askPercent = style % 2 === 1;
  return numericQuestion({
    id: "probability-model",
    config,
    variant,
    skill: askPercent ? "Translate probability into percentage risk" : "Model empirical probability",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Quantify uncertainty",
    prompt: askPercent
      ? `In a simulation for ${context}, ${successCount} of ${total} trials meet the target condition. What percentage of trials meet the condition?`
      : `In a simulation for ${context}, ${successCount} of ${total} trials meet the target condition. Estimate the empirical probability as a decimal.`,
    answer: askPercent ? percent : probability,
    explanation: askPercent
      ? `Percentage = (${successCount}/${total})×100 = ${percent}%.`
      : `Empirical probability = ${successCount}/${total} = ${probability}.`,
    hint: askPercent ? "Divide successful trials by total trials, then multiply by 100." : "Divide successful trials by total trials.",
    difficulty: levelDifficulty(config.levelId) + (style >= 4 ? 1 : 0),
    formatIndex: format,
    optionStep: askPercent ? 1 : 0.01,
  });
}

const geneticsDimensions = [PEOPLE.length, MODERN_CONTEXTS.length, 5, 12] as const;
const geneticsCapacity = product(geneticsDimensions);
const GENETICS_TRAITS = [
  "seed colour",
  "flower colour",
  "coat colour",
  "blood-group marker expression",
  "leaf shape",
  "fruit colour",
  "stem height",
  "wing pattern",
  "pod colour",
  "kernel texture",
  "pigmentation marker",
  "disease-resistance marker",
] as const;

function renderGenetics(variant: number, config: SessionConfig) {
  const [personIndex, contextIndex, chanceIndex, traitIndex] = decode(variant, geneticsDimensions);
  const dominantChance = [0, 25, 50, 75, 100][chanceIndex];
  const person = PEOPLE[personIndex];
  const context = contextFor(config, contextIndex);
  const trait = GENETICS_TRAITS[traitIndex];
  const answer = `${dominantChance}%`;
  return singleQuestion({
    id: "genetics-probability",
    config,
    variant,
    skill: "Interpret a simplified Mendelian probability model",
    challenge: dominantChance === 50 ? "Analyse" : dominantChance === 0 || dominantChance === 100 ? "Apply" : "Transfer",
    mission: "Reason from genotype to probability",
    prompt: `In a teaching cross about ${trait}, ${person} uses a Punnett-square model at ${context}. The model predicts ${dominantChance} favourable phenotype outcomes for every 100 equally likely offspring outcomes. What probability should be reported for that phenotype?`,
    answer,
    distractors: ["0%", "25%", "50%", "75%", "100%"].filter((item) => item !== answer).slice(0, 3),
    explanation: `The model represents ${dominantChance} favourable outcomes out of 100, so the phenotype probability is ${dominantChance}%.`,
    hint: "Convert favourable outcomes out of 100 directly to a percentage.",
    difficulty: levelDifficulty(config.levelId) + (chanceIndex === 1 || chanceIndex === 3 ? 1 : 0),
    topic: topicLabel(config, "Genetics and inheritance"),
  });
}

const scaleDimensions = [500, 500, 200, MODERN_CONTEXTS.length, 6, 3] as const;
const scaleCapacity = product(scaleDimensions);

function renderDesignScale(variant: number, config: SessionConfig) {
  const [lengthIndex, widthIndex, scaleIndex, contextIndex, style, format] = decode(variant, scaleDimensions);
  const scale = (scaleIndex % 100) + 1;
  const drawingLength = Number(((lengthIndex + 10) / 10).toFixed(1));
  const drawingWidth = Number(((widthIndex + 10) / 10).toFixed(1));
  const actualLength = Number((drawingLength * scale).toFixed(1));
  const actualWidth = Number((drawingWidth * scale).toFixed(1));
  const askArea = style % 2 === 1;
  const answer = askArea ? Number((actualLength * actualWidth).toFixed(2)) : actualLength;
  const context = contextFor(config, contextIndex);
  return numericQuestion({
    id: "design-scale",
    config,
    variant,
    skill: askArea ? "Transfer drawing scale into real area" : "Interpret technical drawing scale",
    challenge: style < 2 ? "Apply" : style < 4 ? "Analyse" : "Transfer",
    mission: "Turn the drawing into reality",
    prompt: askArea
      ? `A plan for ${context} uses scale 1:${scale}. A rectangle measures ${drawingLength} cm by ${drawingWidth} cm on the drawing. What real area does this represent in cm²?`
      : `A plan for ${context} uses scale 1:${scale}. A line measures ${drawingLength} cm on the drawing. What real length does it represent in cm?`,
    answer,
    explanation: askArea
      ? `Real dimensions are ${drawingLength}×${scale} = ${actualLength} cm and ${drawingWidth}×${scale} = ${actualWidth} cm. Area = ${actualLength}×${actualWidth} = ${answer} cm².`
      : `At 1:${scale}, real length = drawing length × scale = ${drawingLength}×${scale} = ${actualLength} cm.`,
    hint: "Multiply each drawing dimension by the scale factor before finding any area.",
    difficulty: levelDifficulty(config.levelId) + (askArea ? 1 : 0),
    formatIndex: format,
  });
}

const researchDimensions = [PEOPLE.length, MODERN_CONTEXTS.length, 6] as const;
const researchCapacity = product(researchDimensions);
const RESEARCH_CONCEPTS = [
  ["random assignment", "participants are allocated to conditions by chance", "Random assignment reduces systematic pre-existing differences between experimental groups."],
  ["random sampling", "members of a population have a chance-based route into the sample", "Random sampling is a method for selecting participants from a population."],
  ["control group", "one group does not receive the intervention being tested", "A control group provides a comparison for estimating an intervention effect."],
  ["independent variable", "the researcher deliberately changes one factor", "The independent variable is the factor manipulated by the researcher."],
  ["dependent variable", "the researcher measures the outcome that may respond to a manipulation", "The dependent variable is the measured outcome."],
  ["confounding variable", "a third factor changes alongside the supposed cause and could explain the result", "A confound varies with the explanatory factor and offers an alternative explanation."],
] as const;

function renderResearchDesign(variant: number, config: SessionConfig) {
  const [personIndex, contextIndex, conceptIndex] = decode(variant, researchDimensions);
  const [answer, description, explanation] = RESEARCH_CONCEPTS[conceptIndex];
  const person = PEOPLE[personIndex];
  const context = contextFor(config, contextIndex);
  const distractorOffset = variant % 3;
  return singleQuestion({
    id: "research-design",
    config,
    variant,
    skill: "Identify research-design concepts from evidence",
    challenge: conceptIndex < 2 ? "Apply" : conceptIndex < 5 ? "Analyse" : "Evaluate",
    mission: "Audit the study design",
    prompt: `${person} is reviewing a study at ${context}. In the design, ${description}. Which research-method concept is most directly illustrated?`,
    answer,
    distractors: RESEARCH_CONCEPTS
      .filter((_, index) => index !== conceptIndex)
      .slice(distractorOffset, distractorOffset + 3)
      .map((item) => item[0]),
    explanation,
    hint: "Focus on what the design is doing, not the technology mentioned in the setting.",
    difficulty: levelDifficulty(config.levelId) + (conceptIndex >= 4 ? 1 : 0),
  });
}

const SMART_TEMPLATES: readonly SmartTemplate[] = [
  {
    id: "linear-model",
    lanes: ["school", "university"],
    subjectIds: ["core-mathematics", "elective-mathematics", "additional-mathematics", "engineering-mathematics", "business-mathematics", "mathematics-for-it", "mathematics-for-pharmacy"],
    topicIds: [...genericTopics, "algebra-and-equations", "functions-and-modelling"],
    capacity: linearCapacity,
    render: renderLinearModel,
  },
  {
    id: "percentage-model",
    lanes: ["school", "university"],
    subjectIds: ["core-mathematics", "economics", "financial-accounting", "business-management", "principles-of-microeconomics", "principles-of-macroeconomics", "principles-of-finance", "financial-accounting-i", "introduction-to-procurement"],
    topicIds: [...genericTopics, "percentages-and-financial-mathematics", "financial-mathematics", "accounting-and-financial-analysis", "markets-and-economic-decisions"],
    capacity: percentCapacity,
    render: renderPercentageModel,
  },
  {
    id: "kinematics",
    lanes: ["school", "university"],
    subjectIds: ["physics", "engineering-mechanics", "engineering-mechanics-i", "engineering-mechanics-ii"],
    topicIds: [...genericTopics, "mechanics-and-motion"],
    capacity: kinematicsCapacity,
    render: renderKinematics,
  },
  {
    id: "dc-circuit",
    lanes: ["school", "university"],
    subjectIds: ["physics", "applied-electricity", "electronics", "circuit-fundamentals", "circuit-theory", "basic-electronics"],
    topicIds: [...genericTopics, "electricity-circuits-and-power", "computer-systems"],
    capacity: circuitCapacity,
    render: renderCircuit,
  },
  {
    id: "solution-chemistry",
    lanes: ["school", "university"],
    subjectIds: ["chemistry", "general-chemistry", "pharmaceutical-chemistry", "analytical-chemistry"],
    topicIds: [...genericTopics, "quantitative-chemistry-and-reactions", "acids-bases-and-solutions", "laboratory-analysis"],
    capacity: chemistryCapacity,
    render: renderChemistry,
  },
  {
    id: "statistical-reasoning",
    lanes: ["school", "university"],
    subjectIds: ["core-mathematics", "elective-mathematics", "statistics", "business-statistics", "business-statistics-ii", "biostatistics", "biostatistics-i", "biostatistics-ii", "introduction-to-statistics"],
    topicIds: [...genericTopics, "statistics-probability-and-data", "data-interpretation", "clinical-and-research-evidence"],
    capacity: statsCapacity,
    render: renderStatistics,
  },
  {
    id: "program-trace",
    lanes: ["school", "university"],
    subjectIds: ["computing", "programming", "programming-fundamentals", "object-oriented-programming", "web-development"],
    topicIds: [...genericTopics, "control-flow", "programming-and-algorithms", "software-and-web-applications"],
    capacity: programmingCapacity,
    render: renderProgrammingTrace,
  },
  {
    id: "network-throughput",
    lanes: ["school", "university"],
    subjectIds: ["computing", "computer-networks", "networking", "data-communications", "advanced-networks"],
    topicIds: [...genericTopics, "network-basics", "networks-and-cybersecurity", "computer-systems"],
    capacity: networkCapacity,
    render: renderNetwork,
  },
  {
    id: "accounting-equation",
    lanes: ["school", "university"],
    subjectIds: ["financial-accounting", "financial-accounting-i", "financial-accounting-ii", "accounting", "public-sector-accounting"],
    topicIds: [...genericTopics, "double-entry", "accounting-and-financial-analysis"],
    capacity: accountingCapacity,
    render: renderAccounting,
  },
  {
    id: "break-even",
    lanes: ["school", "university"],
    subjectIds: ["business-management", "principles-of-management", "management", "principles-of-finance", "financial-accounting", "financial-accounting-i", "marketing-management", "operations-management"],
    topicIds: [...genericTopics, "functions", "cost-volume-profit", "management-and-operations"],
    capacity: breakEvenCapacity,
    render: renderBreakEven,
  },
  {
    id: "elasticity",
    lanes: ["school", "university"],
    subjectIds: ["economics", "principles-of-microeconomics", "intermediate-microeconomics", "development-economics", "managerial-economics"],
    topicIds: [...genericTopics, "markets-and-economic-decisions"],
    capacity: economicsCapacity,
    render: renderElasticity,
  },
  {
    id: "incidence-rate",
    lanes: ["university"],
    subjectIds: ["introduction-to-public-health", "epidemiology-i", "epidemiology-ii", "community-health-nursing-i", "community-health-nursing-ii"],
    topicIds: [...genericTopics, "population-health", "clinical-and-research-evidence"],
    capacity: epidemiologyCapacity,
    render: renderEpidemiology,
  },
  {
    id: "cardiac-output",
    lanes: ["university"],
    subjectIds: ["human-physiology", "physiology", "anatomy"],
    topicIds: [...genericTopics, "cardiovascular", "physiology", "cells-and-body-systems"],
    capacity: physiologyCapacity,
    render: renderCardiacOutput,
  },
  {
    id: "engineering-stress",
    lanes: ["university"],
    subjectIds: ["engineering-mechanics", "mechanics-of-materials", "engineering-materials", "structural-analysis-i"],
    topicIds: [...genericTopics, "materials-and-structures", "mechanics-and-motion"],
    capacity: stressCapacity,
    render: renderEngineeringStress,
  },
  {
    id: "contract-reasoning",
    lanes: ["university"],
    subjectIds: ["law-of-contract-i", "law-of-contract-ii"],
    topicIds: [...genericTopics, "legal-method-and-reasoning", "contract-formation", "case-analysis"],
    capacity: lawCapacity,
    render: renderContractReasoning,
  },
  {
    id: "management-scenario",
    lanes: ["university"],
    subjectIds: ["principles-of-management", "management", "introduction-to-hrm", "organisational-behaviour", "strategic-management"],
    topicIds: [...genericTopics, "functions", "management-and-operations"],
    capacity: managementCapacity,
    render: renderManagementScenario,
  },
  {
    id: "compound-growth",
    lanes: ["school", "university"],
    subjectIds: ["core-mathematics", "elective-mathematics", "economics", "financial-accounting", "business-management", "principles-of-finance", "corporate-finance-i", "corporate-finance-ii", "financial-mathematics-i", "financial-mathematics-ii"],
    topicIds: [...genericTopics, "financial-mathematics", "percentages-and-financial-mathematics"],
    capacity: compoundCapacity,
    render: renderCompoundGrowth,
  },
  {
    id: "probability-model",
    lanes: ["school", "university"],
    subjectIds: ["core-mathematics", "elective-mathematics", "statistics", "probability-i", "probability-ii", "business-statistics", "business-statistics-ii", "biostatistics", "biostatistics-i", "biostatistics-ii"],
    topicIds: [...genericTopics, "statistics-probability-and-data", "data-interpretation"],
    capacity: probabilityCapacity,
    render: renderProbability,
  },
  {
    id: "genetics-probability",
    lanes: ["school", "university"],
    subjectIds: ["biology", "human-biology", "cell-biology", "medical-genetics", "genetics", "molecular-biology-i", "molecular-biology-ii"],
    topicIds: [...genericTopics, "genetics-and-inheritance"],
    capacity: geneticsCapacity,
    render: renderGenetics,
  },
  {
    id: "design-scale",
    lanes: ["school", "university"],
    subjectIds: ["technical-drawing", "engineering-drawing", "architectural-graphics", "design-studio-i", "design-studio-ii", "building-construction", "surveying"],
    topicIds: [...genericTopics, "engineering-drawing-and-scale", "systems-and-design"],
    capacity: scaleCapacity,
    render: renderDesignScale,
  },
  {
    id: "research-design",
    lanes: ["university"],
    subjectIds: ["research-methods", "advanced-research-methods", "educational-research", "marketing-research", "media-research", "research-methods-and-statistics"],
    topicIds: [...genericTopics, "research-design", "sampling-and-evidence", "variables-and-measurement", "data-interpretation", "evaluation-and-conclusions"],
    capacity: researchCapacity,
    render: renderResearchDesign,
  },
];

function templateMatches(template: SmartTemplate, config: SessionConfig) {
  if (!template.lanes.includes(config.lane)) return false;
  if (config.subjectId !== "all" && !template.subjectIds.includes(config.subjectId)) return false;
  if (template.topicIds && config.topicId !== "all" && !template.topicIds.includes(config.topicId)) return false;
  if (template.programIds && !template.programIds.includes(config.programId)) return false;
  if (template.programPrefixes && !template.programPrefixes.some((prefix) => config.programId.startsWith(prefix))) return false;
  if (template.levelIds && !template.levelIds.includes(config.levelId)) return false;
  return true;
}

export function intelligentTemplatesForSelection(config: SessionConfig) {
  return SMART_TEMPLATES.filter((template) => templateMatches(template, config));
}

export function intelligentCapacityForSelection(config: SessionConfig) {
  return intelligentTemplatesForSelection(config).reduce((total, template) => total + template.capacity, 0);
}

export function buildIntelligentQuestions(
  config: SessionConfig,
  requestedCount = config.count,
  seed = config.seed ?? Date.now(),
) {
  const requested = Math.max(0, Math.min(MAX_POOL, Math.floor(requestedCount)));
  if (!requested) return [] as LearnQuestion[];

  const templates = intelligentTemplatesForSelection(config);
  if (!templates.length) return [] as LearnQuestion[];

  const positions = new Map<string, number>();
  const exposures = new Set<string>();
  const output: LearnQuestion[] = [];
  let cursor = seedValue(seed) % templates.length;
  let attempts = 0;
  const attemptLimit = requested * Math.max(8, templates.length * 4);

  while (output.length < requested && attempts < attemptLimit) {
    const template = templates[cursor % templates.length];
    const position = positions.get(template.id) ?? 0;
    if (position < Math.min(template.capacity, BLOCK_SIZE)) {
      const index = variantIndex(template, seed, position);
      const question = template.render(index, config);
      if (!exposures.has(question.exposureKey)) {
        exposures.add(question.exposureKey);
        output.push(question);
      }
      positions.set(template.id, position + 1);
    }
    cursor += 1;
    attempts += 1;
  }

  return output;
}
