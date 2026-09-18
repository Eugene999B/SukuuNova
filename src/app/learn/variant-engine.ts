import type { LearnQuestion, QuestionKind, SessionConfig } from "./learn-domain";

const VARIANT_BLOCK_SIZE = 10_000;
const MAX_VARIANT_POOL = 500;

type VariantTemplate = {
  id: string;
  subjectId: string;
  subject: string;
  topicId: string;
  topic: string;
  skill: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  capacity: number;
  schoolLevels: readonly string[];
  examPrograms: readonly string[];
  universityPrograms?: readonly string[];
  skillsPrograms?: readonly string[];
  render: (variantIndex: number) => LearnQuestion;
};

const JHS_LEVELS = ["jhs-1", "jhs-2", "jhs-3"] as const;
const SHS_LEVELS = ["shs-1", "shs-2", "shs-3"] as const;
const JHS_SHS_LEVELS = [...JHS_LEVELS, ...SHS_LEVELS] as const;
const UPPER_PRIMARY_TO_SHS = ["basic-4", "basic-5", "basic-6", ...JHS_SHS_LEVELS] as const;
const BECE_PROGRAMS = ["bece"] as const;
const EXAM_PROGRAMS = ["bece", "wassce"] as const;

const EARLY_NAMES = [
  "Ama", "Kojo", "Akosua", "Kwame", "Esi", "Kofi", "Adwoa", "Yaw",
  "Abena", "Kwaku", "Efua", "Kwesi", "Mansa", "Nana", "Sena", "Tetteh",
  "Amina", "Zainab", "Ibrahim", "Fati", "Kweku", "Afia", "Araba", "Ekow",
  "Yaa", "Kobby", "Nii", "Naa", "Selina", "Daniel", "Mary", "Joseph",
] as const;

const EARLY_OBJECTS = [
  ["bead", "beads"], ["book", "books"], ["pencil", "pencils"], ["orange", "oranges"],
  ["mango", "mangoes"], ["stone", "stones"], ["ball", "balls"], ["cup", "cups"],
  ["shell", "shells"], ["stick", "sticks"], ["star", "stars"], ["coin", "coins"],
  ["button", "buttons"], ["flower", "flowers"], ["seed", "seeds"], ["toy", "toys"],
  ["card", "cards"], ["crayon", "crayons"], ["bottle", "bottles"], ["leaf", "leaves"],
  ["bean", "beans"], ["block", "blocks"], ["drum", "drums"], ["spoon", "spoons"],
  ["plate", "plates"], ["bag", "bags"], ["cap", "caps"], ["rope", "ropes"],
  ["basket", "baskets"], ["box", "boxes"], ["chalk piece", "chalk pieces"], ["counter", "counters"],
] as const;

const EARLY_PLACES = [
  "home", "school", "the classroom", "the playground", "the library", "the garden", "the market", "the farm",
  "the kitchen", "the reading corner", "the activity table", "the school yard", "the community centre", "the art corner", "the maths corner", "the veranda",
  "the hall", "the club room", "the learning centre", "the picnic area", "the sports field", "the craft table", "the science corner", "the shop",
  "the park", "the assembly area", "the study room", "the family room", "the courtyard", "the games area", "the project table", "the story corner",
] as const;

function objectLabel(pair: readonly [string, string], count: number) {
  return count === 1 ? pair[0] : pair[1];
}

function createNumberStoryTemplate({
  id,
  subjectId,
  subject,
  topicId,
  topic,
  maxValue,
  difficulty,
  schoolLevels,
}: {
  id: string;
  subjectId: string;
  subject: string;
  topicId: string;
  topic: string;
  maxValue: number;
  difficulty: 1 | 2;
  schoolLevels: readonly string[];
}): VariantTemplate {
  const dimensions = [maxValue + 1, maxValue + 1, EARLY_NAMES.length, EARLY_OBJECTS.length, EARLY_PLACES.length, 2, 2] as const;
  return {
    id,
    subjectId,
    subject,
    topicId,
    topic,
    skill: "Solve addition and subtraction number stories",
    difficulty,
    capacity: product(dimensions),
    schoolLevels,
    examPrograms: [],
    render: (variant) => {
      const [leftIndex, rightIndex, nameIndex, objectIndex, placeIndex, operation, kindIndex] = decodeVariant(variant, dimensions);
      const left = leftIndex;
      const right = rightIndex;
      const name = EARLY_NAMES[nameIndex];
      const helper = EARLY_NAMES[(nameIndex + 7) % EARLY_NAMES.length];
      const object = EARLY_OBJECTS[objectIndex];
      const place = EARLY_PLACES[placeIndex];
      const addition = operation === 0;
      const starting = addition ? left : left + right;
      const answer = addition ? left + right : left;
      const prompt = addition
        ? `${name} has ${left} ${objectLabel(object, left)} at ${place}. ${helper} gives ${name} ${right} more ${objectLabel(object, right)}. How many ${object[1]} does ${name} have now?`
        : `${name} has ${starting} ${objectLabel(object, starting)} at ${place}. ${name} gives away ${right} ${objectLabel(object, right)}. How many ${object[1]} are left?`;
      return numericOrSingle(
        {
          id: `variant-${id}-${variant}`,
          exposureKey: `variant:${id}:${variant}`,
          subject,
          topic,
          skill: addition ? "Solve addition number stories" : "Solve subtraction number stories",
          difficulty,
          prompt,
          explanation: addition
            ? `${left} + ${right} = ${answer}.`
            : `${starting} - ${right} = ${answer}.`,
          hint: addition ? "Put the two groups together." : "Take away the group that was given out.",
        },
        answer,
        kindIndex === 0 ? "numeric" : "single",
        variant,
      );
    },
  };
}

const kgNumberStories = createNumberStoryTemplate({
  id: "kg-number-stories",
  subjectId: "numeracy",
  subject: "Numeracy",
  topicId: "number-stories",
  topic: "Counting & simple number stories",
  maxValue: 10,
  difficulty: 1,
  schoolLevels: ["kg-1", "kg-2"],
});

const basicOneNumberStories = createNumberStoryTemplate({
  id: "basic-1-number-stories",
  subjectId: "mathematics",
  subject: "Mathematics",
  topicId: "number",
  topic: "Number & operations",
  maxValue: 20,
  difficulty: 1,
  schoolLevels: ["basic-1"],
});

const basicTwoNumberStories = createNumberStoryTemplate({
  id: "basic-2-number-stories",
  subjectId: "mathematics",
  subject: "Mathematics",
  topicId: "number",
  topic: "Number & operations",
  maxValue: 100,
  difficulty: 2,
  schoolLevels: ["basic-2"],
});

const basicThreeNumberStories = createNumberStoryTemplate({
  id: "basic-3-number-stories",
  subjectId: "mathematics",
  subject: "Mathematics",
  topicId: "number",
  topic: "Number & operations",
  maxValue: 1000,
  difficulty: 2,
  schoolLevels: ["basic-3"],
});

function product(values: readonly number[]) {
  return values.reduce((result, value) => result * value, 1);
}

function decodeVariant(index: number, dimensions: readonly number[]) {
  let value = Math.max(0, Math.floor(index));
  return dimensions.map((dimension) => {
    const digit = value % dimension;
    value = Math.floor(value / dimension);
    return digit;
  });
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizedSeed(seed: number) {
  if (!Number.isFinite(seed)) return 1;
  return Math.abs(Math.floor(seed)) >>> 0;
}

function variantIndex(template: VariantTemplate, seed: number, position: number) {
  const blockCount = Math.max(1, Math.floor(template.capacity / VARIANT_BLOCK_SIZE));
  const block = (normalizedSeed(seed) + stableHash(template.id)) % blockCount;
  return (block * VARIANT_BLOCK_SIZE + position) % template.capacity;
}

function signed(value: number) {
  if (value < 0) return `- ${Math.abs(value)}`;
  return `+ ${value}`;
}

function uniqueNumericOptions(answer: number, variant: number) {
  const candidates = [answer, answer + 1, answer - 1, answer + 2, answer - 2, answer + 5];
  const values = Array.from(new Set(candidates)).slice(0, 4);
  const offset = values.length ? variant % values.length : 0;
  const rotated = [...values.slice(offset), ...values.slice(0, offset)];
  const options = rotated.map((value, index) => ({ id: String(index), label: String(value) }));
  return { options, answer: String(rotated.indexOf(answer)) };
}

function numericOrSingle(
  common: Omit<LearnQuestion, "kind" | "answer" | "options" | "acceptedAnswers">,
  answer: number,
  kind: "numeric" | "single",
  variant: number,
): LearnQuestion {
  if (kind === "single") {
    const choice = uniqueNumericOptions(answer, variant);
    return { ...common, kind, answer: choice.answer, options: choice.options };
  }
  return { ...common, kind, answer, acceptedAnswers: [String(answer)] };
}

const arithmeticDimensions = [4, 1000, 1000, 2] as const;
const arithmeticCapacity = product(arithmeticDimensions);

function renderArithmetic(variant: number): LearnQuestion {
  const [operation, leftIndex, rightIndex, kindIndex] = decodeVariant(variant, arithmeticDimensions);
  const left = leftIndex;
  const right = rightIndex + 1;
  let prompt = "";
  let answer = 0;
  let explanation = "";
  let skill = "Apply arithmetic operations";

  if (operation === 0) {
    answer = left + right;
    prompt = `Calculate: ${left} + ${right}`;
    explanation = `Adding ${left} and ${right} gives ${answer}.`;
    skill = "Add whole numbers";
  } else if (operation === 1) {
    answer = left;
    prompt = `Calculate: ${left + right} - ${right}`;
    explanation = `Subtracting ${right} from ${left + right} gives ${answer}.`;
    skill = "Subtract whole numbers";
  } else if (operation === 2) {
    answer = left * right;
    prompt = `Calculate: ${left} × ${right}`;
    explanation = `${left} multiplied by ${right} equals ${answer}.`;
    skill = "Multiply whole numbers";
  } else {
    answer = left;
    prompt = `Calculate: ${left * right} ÷ ${right}`;
    explanation = `${left * right} divided by ${right} equals ${answer}.`;
    skill = "Divide whole numbers";
  }

  return numericOrSingle(
    {
      id: `variant-math-number-${variant}`,
      exposureKey: `variant:math:number:${variant}`,
      subject: "Mathematics",
      topic: "Number & operations",
      skill,
      difficulty: operation >= 2 ? 3 : 2,
      prompt,
      explanation,
      hint: "Work one operation at a time and check the inverse operation.",
    },
    answer,
    kindIndex === 0 ? "numeric" : "single",
    variant,
  );
}

const algebraDimensions = [98, 100, 201, 3] as const;
const algebraCapacity = product(algebraDimensions);

function renderLinearEquation(variant: number): LearnQuestion {
  const [coefficientIndex, solutionIndex, constantIndex, kindIndex] = decodeVariant(variant, algebraDimensions);
  const coefficient = coefficientIndex + 2;
  const solution = solutionIndex < 50 ? solutionIndex - 50 : solutionIndex - 49;
  const constant = constantIndex - 100;
  const total = coefficient * solution + constant;
  const prompt = `Solve for x: ${coefficient}x ${signed(constant)} = ${total}`;
  const common = {
    id: `variant-math-algebra-${variant}`,
    exposureKey: `variant:math:algebra:${variant}`,
    subject: "Mathematics",
    topic: "Algebra",
    skill: "Solve one-variable linear equations",
    difficulty: 3 as const,
    prompt,
    explanation: `Undo the constant term first: ${coefficient}x = ${total - constant}. Dividing by ${coefficient} gives x = ${solution}.`,
    hint: "Isolate the term containing x before dividing by its coefficient.",
  };

  if (kindIndex === 2) {
    return numericOrSingle(common, solution, "single", variant);
  }
  const kind: QuestionKind = kindIndex === 0 ? "numeric" : "fill";
  return { ...common, kind, answer: solution, acceptedAnswers: [String(solution)] };
}

const geometryDimensions = [500, 500, 2, 2] as const;
const geometryCapacity = product(geometryDimensions);

function renderRectangle(variant: number): LearnQuestion {
  const [lengthIndex, widthIndex, task, kindIndex] = decodeVariant(variant, geometryDimensions);
  const length = lengthIndex + 1;
  const width = widthIndex + 1;
  const area = length * width;
  const perimeter = 2 * (length + width);
  const answer = task === 0 ? area : perimeter;
  const quantity = task === 0 ? "area" : "perimeter";
  const unit = task === 0 ? "square units" : "units";
  return numericOrSingle(
    {
      id: `variant-math-geometry-${variant}`,
      exposureKey: `variant:math:geometry:${variant}`,
      subject: "Mathematics",
      topic: "Geometry",
      skill: task === 0 ? "Calculate area of rectangles" : "Calculate perimeter of rectangles",
      difficulty: 2,
      prompt: `A rectangle has length ${length} units and width ${width} units. What is its ${quantity}?`,
      explanation: task === 0
        ? `Area = length × width = ${length} × ${width} = ${area} ${unit}.`
        : `Perimeter = 2(length + width) = 2(${length} + ${width}) = ${perimeter} ${unit}.`,
      hint: task === 0 ? "Use length × width." : "Add length and width, then multiply by 2.",
    },
    answer,
    kindIndex === 0 ? "numeric" : "single",
    variant,
  );
}

const statisticsDimensions = [1000, 99, 10, 2] as const;
const statisticsCapacity = product(statisticsDimensions);

function renderArithmeticMean(variant: number): LearnQuestion {
  const [startIndex, stepIndex, countIndex, style] = decodeVariant(variant, statisticsDimensions);
  const start = startIndex;
  const step = stepIndex + 1;
  const count = countIndex + 3;
  const values = Array.from({ length: count }, (_, index) => start + index * step);
  const last = values[values.length - 1];
  const mean = (start + last) / 2;
  return {
    id: `variant-math-statistics-${variant}`,
    exposureKey: `variant:math:statistics:${variant}`,
    kind: "numeric",
    subject: "Mathematics",
    topic: "Statistics & probability",
    skill: "Calculate the arithmetic mean",
    difficulty: 3,
    prompt: style === 0
      ? `Find the mean of: ${values.join(", ")}`
      : `The values ${values.join(", ")} form a data set. What is their arithmetic mean?`,
    answer: mean,
    acceptedAnswers: [String(mean)],
    explanation: `For this evenly spaced set, the mean is halfway between the first and last values: (${start} + ${last}) ÷ 2 = ${mean}.`,
    hint: "Add the values and divide by how many values there are.",
  };
}

const grammarSubjects = [
  ["The student", "The students"], ["The teacher", "The teachers"], ["The nurse", "The nurses"], ["The engineer", "The engineers"],
  ["The farmer", "The farmers"], ["The driver", "The drivers"], ["The artist", "The artists"], ["The musician", "The musicians"],
  ["The athlete", "The athletes"], ["The scientist", "The scientists"], ["The programmer", "The programmers"], ["The researcher", "The researchers"],
  ["The trader", "The traders"], ["The carpenter", "The carpenters"], ["The tailor", "The tailors"], ["The chef", "The chefs"],
  ["The mechanic", "The mechanics"], ["The doctor", "The doctors"], ["The librarian", "The librarians"], ["The prefect", "The prefects"],
  ["The captain", "The captains"], ["The manager", "The managers"], ["The parent", "The parents"], ["The learner", "The learners"],
  ["The volunteer", "The volunteers"], ["The technician", "The technicians"], ["The designer", "The designers"], ["The journalist", "The journalists"],
  ["The entrepreneur", "The entrepreneurs"], ["The architect", "The architects"], ["The pharmacist", "The pharmacists"], ["The accountant", "The accountants"],
] as const;

const grammarVerbs = [
  ["work", "works"], ["learn", "learns"], ["read", "reads"], ["write", "writes"], ["listen", "listens"], ["speak", "speaks"],
  ["help", "helps"], ["plan", "plans"], ["prepare", "prepares"], ["practise", "practises"], ["participate", "participates"], ["contribute", "contributes"],
  ["respond", "responds"], ["present", "presents"], ["review", "reviews"], ["check", "checks"], ["organise", "organises"], ["improve", "improves"],
  ["collaborate", "collaborates"], ["communicate", "communicates"], ["reflect", "reflects"], ["perform", "performs"], ["arrive", "arrives"], ["study", "studies"],
] as const;

const grammarPlaces = [
  "at school", "in the classroom", "in the library", "at the workshop", "in the laboratory", "at the community centre",
  "during the lesson", "during group work", "at the meeting", "at the training session", "in the computer lab", "on the field",
  "at the clinic", "at the office", "in the studio", "at the market", "at the farm", "in the reading room",
  "at the project site", "at the presentation", "during practice", "at the study centre", "in the hall", "at the club meeting",
] as const;

const grammarTimes = [
  "every morning", "every afternoon", "each Monday", "each Tuesday", "each Wednesday", "each Thursday",
  "each Friday", "before lunch", "after lunch", "before class", "after class", "during the week",
  "once a week", "twice a week", "every weekend", "at the start of the day", "at the end of the day", "during revision",
  "before the activity", "after the activity", "during project week", "each term", "during assessment week", "whenever needed",
] as const;

const grammarDimensions = [grammarSubjects.length, 2, grammarVerbs.length, grammarPlaces.length, grammarTimes.length, 2] as const;
const grammarCapacity = product(grammarDimensions);

function renderConcord(variant: number): LearnQuestion {
  const [subjectIndex, plurality, verbIndex, placeIndex, timeIndex, style] = decodeVariant(variant, grammarDimensions);
  const subject = grammarSubjects[subjectIndex][plurality];
  const [base, singular] = grammarVerbs[verbIndex];
  const correct = plurality === 0 ? singular : base;
  const incorrect = plurality === 0 ? base : singular;
  return {
    id: `variant-english-grammar-${variant}`,
    exposureKey: `variant:english:grammar:${variant}`,
    kind: "single",
    subject: "English Language",
    topic: "Grammar & concord",
    skill: "Apply subject–verb agreement",
    difficulty: 2,
    prompt: style === 0
      ? `Choose the correct verb: ${subject} ___ ${grammarPlaces[placeIndex]} ${grammarTimes[timeIndex]}.`
      : `Complete the sentence correctly: ${subject} ___ ${grammarPlaces[placeIndex]} ${grammarTimes[timeIndex]}.`,
    options: variant % 2 === 0
      ? [{ id: "a", label: correct }, { id: "b", label: incorrect }]
      : [{ id: "a", label: incorrect }, { id: "b", label: correct }],
    answer: variant % 2 === 0 ? "a" : "b",
    explanation: plurality === 0
      ? `The subject is singular, so the present-tense verb takes the singular form “${correct}”.`
      : `The subject is plural, so the base verb form “${correct}” agrees with it.`,
    hint: "Identify whether the subject is singular or plural before choosing the verb.",
  };
}

const livingDimensions = [1000, 1000, 2, 2] as const;
const livingCapacity = product(livingDimensions);

function renderMagnification(variant: number): LearnQuestion {
  const [actualIndex, magnificationIndex, task, kindIndex] = decodeVariant(variant, livingDimensions);
  const actual = actualIndex + 1;
  const magnification = magnificationIndex + 1;
  const image = actual * magnification;
  const answer = task === 0 ? image : magnification;
  return numericOrSingle(
    {
      id: `variant-science-living-${variant}`,
      exposureKey: `variant:science:living:${variant}`,
      subject: "Science",
      topic: "Living things",
      skill: "Apply magnification to biological specimens",
      difficulty: 3,
      prompt: task === 0
        ? `A specimen is ${actual} μm long and is viewed at ×${magnification}. What image length, in μm, does this scale represent?`
        : `A specimen is ${actual} μm long and its image represents ${image} μm. What is the magnification?`,
      explanation: task === 0
        ? `Image size = actual size × magnification = ${actual} × ${magnification} = ${image} μm.`
        : `Magnification = image size ÷ actual size = ${image} ÷ ${actual} = ×${magnification}.`,
      hint: "Use magnification = image size ÷ actual size.",
    },
    answer,
    kindIndex === 0 ? "numeric" : "single",
    variant,
  );
}

const matterDimensions = [1000, 1000, 2, 2] as const;
const matterCapacity = product(matterDimensions);

function renderDensity(variant: number): LearnQuestion {
  const [densityIndex, volumeIndex, task, kindIndex] = decodeVariant(variant, matterDimensions);
  const density = densityIndex + 1;
  const volume = volumeIndex + 1;
  const mass = density * volume;
  const answer = task === 0 ? mass : volume;
  return numericOrSingle(
    {
      id: `variant-science-matter-${variant}`,
      exposureKey: `variant:science:matter:${variant}`,
      subject: "Science",
      topic: "Matter & materials",
      skill: "Apply the density relationship",
      difficulty: 3,
      prompt: task === 0
        ? `A material has density ${density} g/cm³ and volume ${volume} cm³. What is its mass in grams?`
        : `A sample has mass ${mass} g and density ${density} g/cm³. What is its volume in cm³?`,
      explanation: task === 0
        ? `Mass = density × volume = ${density} × ${volume} = ${mass} g.`
        : `Volume = mass ÷ density = ${mass} ÷ ${density} = ${volume} cm³.`,
      hint: "Use density = mass ÷ volume and rearrange it for the unknown quantity.",
    },
    answer,
    kindIndex === 0 ? "numeric" : "single",
    variant,
  );
}

const forceDimensions = [5000, 200, 2] as const;
const forceCapacity = product(forceDimensions);

function renderForce(variant: number): LearnQuestion {
  const [massIndex, accelerationIndex, kindIndex] = decodeVariant(variant, forceDimensions);
  const mass = massIndex + 1;
  const acceleration = accelerationIndex + 1;
  const force = mass * acceleration;
  return numericOrSingle(
    {
      id: `variant-science-energy-${variant}`,
      exposureKey: `variant:science:energy:${variant}`,
      subject: "Science",
      topic: "Force & energy",
      skill: "Apply Newton's second-law relationship",
      difficulty: 3,
      prompt: `A ${mass} kg object accelerates at ${acceleration} m/s². What resultant force acts on it, in newtons?`,
      explanation: `Force = mass × acceleration = ${mass} × ${acceleration} = ${force} N.`,
      hint: "Use F = ma.",
    },
    force,
    kindIndex === 0 ? "numeric" : "single",
    variant,
  );
}

const binaryDimensions = [1_048_576, 2] as const;
const binaryCapacity = product(binaryDimensions);

function renderBinary(variant: number): LearnQuestion {
  const [value, direction] = decodeVariant(variant, binaryDimensions);
  const binary = value.toString(2);
  if (direction === 0) {
    return {
      id: `variant-computing-systems-${variant}`,
      exposureKey: `variant:computing:systems:${variant}`,
      kind: "fill",
      subject: "Computing",
      topic: "Computer systems",
      skill: "Convert decimal numbers to binary",
      difficulty: value > 255 ? 4 : 3,
      prompt: `Convert decimal ${value} to binary.`,
      answer: binary,
      acceptedAnswers: [binary],
      explanation: `Decimal ${value} is represented as ${binary} in base 2.`,
      hint: "Repeatedly divide by 2 and read the remainders from bottom to top.",
    };
  }
  return {
    id: `variant-computing-systems-${variant}`,
    exposureKey: `variant:computing:systems:${variant}`,
    kind: "numeric",
    subject: "Computing",
    topic: "Computer systems",
    skill: "Convert binary numbers to decimal",
    difficulty: value > 255 ? 4 : 3,
    prompt: `Convert binary ${binary} to decimal.`,
    answer: value,
    acceptedAnswers: [String(value)],
    explanation: `The place values in ${binary} add up to decimal ${value}.`,
    hint: "Use powers of 2 from right to left.",
  };
}


function textChoiceQuestion(
  common: Omit<LearnQuestion, "kind" | "answer" | "options" | "acceptedAnswers">,
  correct: string,
  distractors: readonly string[],
  variant: number,
): LearnQuestion {
  const values = Array.from(new Set([correct, ...distractors.filter((value) => value !== correct)])).slice(0, 4);
  if (values.length < 2) throw new Error("Text-choice templates require at least two unique options.");
  const offset = variant % values.length;
  const rotated = [...values.slice(offset), ...values.slice(0, offset)];
  return {
    ...common,
    kind: "single",
    options: rotated.map((value, index) => ({ id: String(index), label: value })),
    answer: String(rotated.indexOf(correct)),
  };
}

const VOCABULARY_BANK = [
  ["abundant", "plentiful", "scarce"],
  ["accurate", "precise", "inaccurate"],
  ["ancient", "old", "modern"],
  ["brief", "concise", "lengthy"],
  ["calm", "peaceful", "agitated"],
  ["cautious", "careful", "reckless"],
  ["difficult", "challenging", "easy"],
  ["eager", "keen", "reluctant"],
  ["enormous", "huge", "tiny"],
  ["fragile", "delicate", "sturdy"],
  ["generous", "giving", "selfish"],
  ["genuine", "authentic", "fake"],
  ["hostile", "unfriendly", "friendly"],
  ["intelligent", "clever", "foolish"],
  ["joyful", "happy", "sad"],
  ["loyal", "faithful", "disloyal"],
  ["rapid", "swift", "slow"],
  ["rare", "uncommon", "common"],
  ["silent", "quiet", "noisy"],
  ["simple", "straightforward", "complex"],
  ["sturdy", "strong", "weak"],
  ["timid", "shy", "bold"],
  ["vacant", "empty", "occupied"],
  ["visible", "seen", "hidden"],
] as const;

const vocabularyDimensions = [VOCABULARY_BANK.length, EARLY_NAMES.length, EARLY_PLACES.length, grammarTimes.length, 2] as const;
const vocabularyCapacity = product(vocabularyDimensions);

function renderVocabulary(variant: number): LearnQuestion {
  const [entryIndex, nameIndex, placeIndex, timeIndex, relation] = decodeVariant(variant, vocabularyDimensions);
  const [word, synonym, antonym] = VOCABULARY_BANK[entryIndex];
  const target = relation === 0 ? synonym : antonym;
  const distractors = [1, 7, 13].map((offset) => VOCABULARY_BANK[(entryIndex + offset) % VOCABULARY_BANK.length][relation === 0 ? 1 : 2]);
  const relationLabel = relation === 0 ? "closest in meaning to" : "opposite in meaning to";
  return textChoiceQuestion(
    {
      id: `variant-english-vocabulary-${variant}`,
      exposureKey: `variant:english:vocabulary:${variant}`,
      subject: "English Language",
      topic: "Vocabulary",
      skill: relation === 0 ? "Recognise synonyms in context" : "Recognise antonyms in context",
      difficulty: 2,
      prompt: `${EARLY_NAMES[nameIndex]} meets the word “${word}” while reading at ${EARLY_PLACES[placeIndex]} ${grammarTimes[timeIndex]}. Which word is ${relationLabel} “${word}”?`,
      explanation: `“${target}” is ${relation === 0 ? "a synonym" : "an antonym"} of “${word}”.`,
      hint: relation === 0 ? "Look for the option with the most similar meaning." : "Look for the option with the most contrasting meaning.",
    },
    target,
    distractors,
    variant,
  );
}

const READING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const readingDimensions = [EARLY_NAMES.length, EARLY_PLACES.length, EARLY_OBJECTS.length, 50, READING_DAYS.length, 3] as const;
const readingCapacity = product(readingDimensions);

function renderReading(variant: number): LearnQuestion {
  const [nameIndex, placeIndex, objectIndex, quantityIndex, dayIndex, questionType] = decodeVariant(variant, readingDimensions);
  const name = EARLY_NAMES[nameIndex];
  const place = EARLY_PLACES[placeIndex];
  const object = EARLY_OBJECTS[objectIndex];
  const quantity = quantityIndex + 1;
  const day = READING_DAYS[dayIndex];
  const passage = `${name} visited ${place} on ${day}. ${name} collected ${quantity} ${objectLabel(object, quantity)} for a class activity.`;

  if (questionType === 0) {
    return textChoiceQuestion(
      {
        id: `variant-english-reading-${variant}`,
        exposureKey: `variant:english:reading:${variant}`,
        subject: "English Language",
        topic: "Reading comprehension",
        skill: "Retrieve an explicit place detail",
        difficulty: 2,
        prompt: `${passage} Where did ${name} visit?`,
        explanation: `The passage directly says that ${name} visited ${place}.`,
        hint: "Find the place named in the first sentence.",
      },
      place,
      [EARLY_PLACES[(placeIndex + 1) % EARLY_PLACES.length], EARLY_PLACES[(placeIndex + 7) % EARLY_PLACES.length], EARLY_PLACES[(placeIndex + 13) % EARLY_PLACES.length]],
      variant,
    );
  }

  if (questionType === 1) {
    return textChoiceQuestion(
      {
        id: `variant-english-reading-${variant}`,
        exposureKey: `variant:english:reading:${variant}`,
        subject: "English Language",
        topic: "Reading comprehension",
        skill: "Retrieve an explicit time detail",
        difficulty: 2,
        prompt: `${passage} On which day did the visit happen?`,
        explanation: `The passage states that the visit happened on ${day}.`,
        hint: "Look for the day named in the first sentence.",
      },
      day,
      [READING_DAYS[(dayIndex + 1) % READING_DAYS.length], READING_DAYS[(dayIndex + 3) % READING_DAYS.length], READING_DAYS[(dayIndex + 5) % READING_DAYS.length]],
      variant,
    );
  }

  return textChoiceQuestion(
    {
      id: `variant-english-reading-${variant}`,
      exposureKey: `variant:english:reading:${variant}`,
      subject: "English Language",
      topic: "Reading comprehension",
      skill: "Retrieve an explicit quantity",
      difficulty: 2,
      prompt: `${passage} How many ${object[1]} did ${name} collect?`,
      explanation: `The passage says that ${name} collected ${quantity} ${objectLabel(object, quantity)}.`,
      hint: "Find the number in the second sentence.",
    },
    String(quantity),
    [String(quantity + 1), String(Math.max(1, quantity - 1)), String(quantity + 5)],
    variant,
  );
}

const writingDimensions = [EARLY_NAMES.length, EARLY_PLACES.length, grammarVerbs.length, grammarTimes.length, 2] as const;
const writingCapacity = product(writingDimensions);

function renderWriting(variant: number): LearnQuestion {
  const [nameIndex, placeIndex, verbIndex, timeIndex, frame] = decodeVariant(variant, writingDimensions);
  const name = EARLY_NAMES[nameIndex];
  const verb = grammarVerbs[verbIndex][1];
  const place = EARLY_PLACES[placeIndex];
  const time = grammarTimes[timeIndex];
  const correct = `${name} ${verb} at ${place} ${time}.`;
  const lowerName = `${name.toLowerCase()} ${verb} at ${place} ${time}.`;
  const noStop = `${name} ${verb} at ${place} ${time}`;
  const lowerNoStop = `${name.toLowerCase()} ${verb} at ${place} ${time}`;

  return textChoiceQuestion(
    {
      id: `variant-english-writing-${variant}`,
      exposureKey: `variant:english:writing:${variant}`,
      subject: "English Language",
      topic: "Writing",
      skill: "Apply basic sentence capitalization and punctuation",
      difficulty: 2,
      prompt: frame === 0
        ? "Which sentence begins the person’s proper name with a capital letter and ends with a full stop?"
        : "Choose the sentence that correctly applies the stated capitalization and end-punctuation rules.",
      explanation: `“${correct}” begins the proper name with a capital letter and ends with a full stop.`,
      hint: "Check the first letter of the person’s name and the punctuation at the end.",
    },
    correct,
    [lowerName, noStop, lowerNoStop],
    variant,
  );
}

const environmentDimensions = [EARLY_PLACES.length, 50, 24, 365, 2] as const;
const environmentCapacity = product(environmentDimensions);

function renderEnvironment(variant: number): LearnQuestion {
  const [placeIndex, rateIndex, hoursIndex, daysIndex, task] = decodeVariant(variant, environmentDimensions);
  const rate = rateIndex + 1;
  const hours = hoursIndex + 1;
  const days = daysIndex + 1;
  const daily = rate * hours;
  const total = daily * days;
  const answer = task === 0 ? daily : total;
  return numericOrSingle(
    {
      id: `variant-science-environment-${variant}`,
      exposureKey: `variant:science:environment:${variant}`,
      subject: "Science",
      topic: "Environment",
      skill: "Quantify water conservation in an environmental scenario",
      difficulty: 3,
      prompt: task === 0
        ? `A leaking pipe at ${EARLY_PLACES[placeIndex]} loses ${rate} litres of water each hour for ${hours} hours per day. How many litres are wasted in one day?`
        : `A leaking pipe at ${EARLY_PLACES[placeIndex]} loses ${rate} litres each hour for ${hours} hours per day. If it is repaired, how many litres would be saved over ${days} days?`,
      explanation: task === 0
        ? `Daily waste = ${rate} × ${hours} = ${daily} litres.`
        : `Daily waste is ${rate} × ${hours} = ${daily} litres, so over ${days} days the saving is ${daily} × ${days} = ${total} litres.`,
      hint: task === 0 ? "Multiply the hourly loss by the number of leaking hours." : "Find the daily loss first, then multiply by the number of days.",
    },
    answer,
    variant % 2 === 0 ? "numeric" : "single",
    variant,
  );
}

const GOVERNANCE_FUNCTIONS = [
  ["debate and pass national laws", "Parliament"],
  ["scrutinise proposed laws through debate and committees", "Parliament"],
  ["approve public spending through the national budget process", "Parliament"],
  ["implement public policy through ministries and departments", "Executive"],
  ["coordinate the day-to-day work of government ministries", "Executive"],
  ["carry out laws and approved government programmes", "Executive"],
  ["interpret the law when deciding a court case", "Judiciary"],
  ["settle legal disputes brought before the courts", "Judiciary"],
] as const;
const CIVIC_AUDIENCES = ["a school civic club", "a community forum", "a youth meeting", "a class discussion", "a radio civic programme", "a debate club", "a community workshop", "a student council session"] as const;
const governanceDimensions = [GOVERNANCE_FUNCTIONS.length, EARLY_NAMES.length, EARLY_PLACES.length, grammarTimes.length, CIVIC_AUDIENCES.length, 2] as const;
const governanceCapacity = product(governanceDimensions);

function renderGovernance(variant: number): LearnQuestion {
  const [functionIndex, nameIndex, placeIndex, timeIndex, audienceIndex, frame] = decodeVariant(variant, governanceDimensions);
  const [action, institution] = GOVERNANCE_FUNCTIONS[functionIndex];
  return textChoiceQuestion(
    {
      id: `variant-social-governance-${variant}`,
      exposureKey: `variant:social:governance:${variant}`,
      subject: "Social Studies",
      topic: "Governance",
      skill: "Distinguish the core functions of state institutions",
      difficulty: 2,
      prompt: frame === 0
        ? `At ${CIVIC_AUDIENCES[audienceIndex]} in ${EARLY_PLACES[placeIndex]} ${grammarTimes[timeIndex]}, ${EARLY_NAMES[nameIndex]} asks which institution is mainly responsible to ${action}. Which answer fits best?`
        : `${EARLY_NAMES[nameIndex]} is preparing a civic presentation for ${CIVIC_AUDIENCES[audienceIndex]}. Which institution is most directly associated with the function “${action}”?`,
      explanation: `${institution} is the institution most directly associated with the stated function: ${action}.`,
      hint: "Separate law-making, law-implementation and judicial decision-making.",
    },
    institution,
    ["Parliament", "Executive", "Judiciary", "Electoral Commission"],
    variant,
  );
}

const CITIZENSHIP_SCENARIOS = [
  ["receiving a fair hearing when accused of wrongdoing", "A civic right"],
  ["being treated equally under the law", "A civic right"],
  ["expressing an opinion peacefully within the law", "A civic right"],
  ["having personal privacy respected within lawful limits", "A civic right"],
  ["accessing basic education", "A civic right"],
  ["taking part in peaceful lawful association", "A civic right"],
  ["obeying lawful rules and regulations", "A civic responsibility"],
  ["respecting the rights of other people", "A civic responsibility"],
  ["protecting public property from damage", "A civic responsibility"],
  ["helping to keep shared surroundings clean", "A civic responsibility"],
  ["reporting a serious danger to an appropriate authority", "A civic responsibility"],
  ["using public resources carefully rather than wasting them", "A civic responsibility"],
  ["taking part constructively in community activities", "A civic responsibility"],
  ["following lawful safety instructions in public spaces", "A civic responsibility"],
  ["showing respect for other people’s lawful beliefs and views", "A civic responsibility"],
  ["helping preserve community facilities for others", "A civic responsibility"],
] as const;
const citizenshipDimensions = [CITIZENSHIP_SCENARIOS.length, EARLY_NAMES.length, EARLY_PLACES.length, grammarTimes.length, CIVIC_AUDIENCES.length, 2] as const;
const citizenshipCapacity = product(citizenshipDimensions);

function renderCitizenship(variant: number): LearnQuestion {
  const [scenarioIndex, nameIndex, placeIndex, timeIndex, audienceIndex, frame] = decodeVariant(variant, citizenshipDimensions);
  const [scenario, category] = CITIZENSHIP_SCENARIOS[scenarioIndex];
  return textChoiceQuestion(
    {
      id: `variant-social-citizenship-${variant}`,
      exposureKey: `variant:social:citizenship:${variant}`,
      subject: "Social Studies",
      topic: "Citizenship",
      skill: "Distinguish civic rights from responsibilities",
      difficulty: 2,
      prompt: frame === 0
        ? `${EARLY_NAMES[nameIndex]} discusses “${scenario}” at ${CIVIC_AUDIENCES[audienceIndex]} in ${EARLY_PLACES[placeIndex]} ${grammarTimes[timeIndex]}. How should this example be classified?`
        : `In a citizenship lesson, how is the example “${scenario}” best described?`,
      explanation: `The example is best classified as ${category.toLowerCase()}.`,
      hint: "Ask whether the example describes something a person is entitled to or something citizens should do.",
    },
    category,
    ["A civic right", "A civic responsibility", "A commercial transaction", "A punishment"],
    variant,
  );
}

const POSITIVE_ENVIRONMENT_ACTIONS = [
  "planting trees to replace lost vegetation",
  "sorting reusable materials for recycling",
  "using a bin instead of dropping litter",
  "repairing a leaking tap",
  "protecting vegetation along a river bank",
  "joining a community clean-up",
  "reusing a durable container",
  "switching off unused electrical devices",
  "reporting illegal dumping to the proper authority",
  "keeping drains free from solid waste",
  "using water carefully during cleaning",
  "maintaining trees already planted",
  "using designated waste collection points",
  "avoiding unnecessary burning of waste",
  "protecting a community green area",
  "encouraging safe disposal of household waste",
] as const;
const HARMFUL_ENVIRONMENT_ACTIONS = [
  "dumping rubbish into a drain",
  "burning mixed plastic waste in the open",
  "leaving a leaking tap running",
  "cutting young trees without replacement",
  "throwing litter beside a water source",
  "blocking a drain with solid waste",
  "wasting water during cleaning",
  "leaving unused lights on all day",
  "dumping refuse in an undeveloped plot",
  "removing vegetation from a river bank",
  "pouring waste oil onto bare soil",
  "leaving rubbish after a public event",
  "damaging newly planted trees",
  "throwing batteries into an open fire",
  "discarding plastic directly into a stream",
  "ignoring a serious waste spill",
] as const;
const peopleEnvironmentDimensions = [POSITIVE_ENVIRONMENT_ACTIONS.length, HARMFUL_ENVIRONMENT_ACTIONS.length, EARLY_NAMES.length, EARLY_PLACES.length, grammarTimes.length] as const;
const peopleEnvironmentCapacity = product(peopleEnvironmentDimensions);

function renderPeopleEnvironment(variant: number): LearnQuestion {
  const [positiveIndex, harmfulIndex, nameIndex, placeIndex, timeIndex] = decodeVariant(variant, peopleEnvironmentDimensions);
  const correct = POSITIVE_ENVIRONMENT_ACTIONS[positiveIndex];
  return textChoiceQuestion(
    {
      id: `variant-social-people-environment-${variant}`,
      exposureKey: `variant:social:people-environment:${variant}`,
      subject: "Social Studies",
      topic: "People & environment",
      skill: "Choose environmentally responsible community actions",
      difficulty: 2,
      prompt: `${EARLY_NAMES[nameIndex]} wants to reduce environmental harm at ${EARLY_PLACES[placeIndex]} ${grammarTimes[timeIndex]}. Which action is the most environmentally responsible choice?`,
      explanation: `The responsible action is ${correct}; it reduces waste, pollution or resource loss rather than increasing it.`,
      hint: "Choose the action that reduces pollution, waste or damage to natural resources.",
    },
    correct,
    [
      HARMFUL_ENVIRONMENT_ACTIONS[harmfulIndex],
      HARMFUL_ENVIRONMENT_ACTIONS[(harmfulIndex + 5) % HARMFUL_ENVIRONMENT_ACTIONS.length],
      HARMFUL_ENVIRONMENT_ACTIONS[(harmfulIndex + 11) % HARMFUL_ENVIRONMENT_ACTIONS.length],
    ],
    variant,
  );
}

const DEVELOPMENT_SECTORS = ["Education", "Health", "Water & sanitation", "Roads"] as const;
const developmentDimensions = [1000, 100, 100, DEVELOPMENT_SECTORS.length, 2] as const;
const developmentCapacity = product(developmentDimensions);

function renderNationalDevelopment(variant: number): LearnQuestion {
  const [baseIndex, gapAIndex, gapBIndex, rotation, task] = decodeVariant(variant, developmentDimensions);
  const base = (baseIndex + 1) * 1000;
  const gapA = (gapAIndex + 1) * 100;
  const gapB = (gapBIndex + 1) * 100;
  const ordered = [base, base + gapA, base + gapA + gapB, base + 2 * gapA + 2 * gapB + 100];
  const allocations = DEVELOPMENT_SECTORS.map((_, index) => ordered[(index + rotation) % ordered.length]);
  const targetValue = task === 0 ? Math.max(...allocations) : Math.min(...allocations);
  const targetSector = DEVELOPMENT_SECTORS[allocations.indexOf(targetValue)];
  const summary = DEVELOPMENT_SECTORS.map((sector, index) => `${sector}: GH₵${allocations[index].toLocaleString("en")}`).join("; ");
  return textChoiceQuestion(
    {
      id: `variant-social-development-${variant}`,
      exposureKey: `variant:social:development:${variant}`,
      subject: "Social Studies",
      topic: "National development",
      skill: "Interpret a simple public-development allocation table",
      difficulty: 3,
      prompt: `A district development plan shows these allocations — ${summary}. Which sector receives the ${task === 0 ? "largest" : "smallest"} allocation?`,
      explanation: `${targetSector} has the ${task === 0 ? "largest" : "smallest"} amount at GH₵${targetValue.toLocaleString("en")}.`,
      hint: task === 0 ? "Compare the four amounts and identify the greatest." : "Compare the four amounts and identify the least.",
    },
    targetSector,
    DEVELOPMENT_SECTORS,
    variant,
  );
}

const DIGITAL_SERVICES = ["email", "school portal", "social account", "cloud drive", "learning app", "online shop", "banking app", "game account", "messaging app", "video platform", "work portal", "library account", "exam portal", "travel account", "photo service", "community forum"] as const;
const DIGITAL_CHANNELS = ["email", "text message", "chat message", "phone call", "pop-up", "QR code", "social message", "web notification"] as const;
const DIGITAL_SAFETY_SCENARIOS = [
  ["an unexpected message asks for a password through a link", "Open the official service separately and verify the alert", ["Enter the password through the message link", "Forward the password to the sender", "Ignore the official site and trust the message"]],
  ["the same password is being used on several important accounts", "Create a long, unique password or passphrase for this account", ["Keep reusing the same password", "Use only a first name and birth year", "Share one password with a friend for backup"]],
  ["the service offers multi-factor authentication", "Enable multi-factor authentication", ["Disable all extra verification", "Give the verification code to anyone who asks", "Post backup codes in a group chat"]],
  ["a user finishes using an account on a public computer", "Sign out completely before leaving", ["Leave the account open for the next person", "Save the password in the public browser", "Write the password on the desk"]],
  ["an unknown sender sends an unexpected attachment", "Verify the sender and attachment before opening it", ["Open it immediately because it arrived by email", "Disable security warnings first", "Upload it everywhere before checking"]],
  ["a classmate asks for the account password", "Keep the password private", ["Share the password because the classmate is known", "Post the password in a class group", "Use the classmate’s password too"]],
  ["a device offers a security update from its trusted update system", "Install the trusted security update", ["Avoid all security updates forever", "Download a random replacement from an unknown site", "Turn off device protection before updating"]],
  ["an unfamiliar QR code promises a prize and asks for login details", "Check the destination and use the official service instead", ["Scan and enter login details immediately", "Send the QR code with your password to friends", "Turn off browser warnings before opening it"]],
  ["a pop-up says the account is locked and demands credentials", "Close the pop-up and check the account through the official app or site", ["Type credentials into the pop-up", "Send the password to the pop-up support contact", "Reuse the same password on another suspicious page"]],
  ["a phone containing signed-in accounts is lost", "Use trusted account or device controls to lock it and report the loss", ["Do nothing even if sensitive accounts are open", "Post account passwords publicly so helpers can log in", "Disable all recovery options"]],
  ["a login code arrives when the user did not try to sign in", "Do not share the code and review account security", ["Send the code to anyone claiming to be support", "Post the code online to ask what it means", "Use the code on an unknown site"]],
  ["a website address looks slightly different from the normal service address", "Stop and verify the official address before signing in", ["Enter credentials first and check later", "Ignore the spelling difference", "Share the suspicious address with passwords included"]],
] as const;
const digitalSafetyDimensions = [DIGITAL_SAFETY_SCENARIOS.length, EARLY_NAMES.length, DIGITAL_SERVICES.length, DIGITAL_CHANNELS.length, grammarTimes.length] as const;
const digitalSafetyCapacity = product(digitalSafetyDimensions);

function renderDigitalSafety(variant: number): LearnQuestion {
  const [scenarioIndex, nameIndex, serviceIndex, channelIndex, timeIndex] = decodeVariant(variant, digitalSafetyDimensions);
  const [event, safeAction, distractors] = DIGITAL_SAFETY_SCENARIOS[scenarioIndex];
  return textChoiceQuestion(
    {
      id: `variant-computing-safety-${variant}`,
      exposureKey: `variant:computing:safety:${variant}`,
      subject: "Computing",
      topic: "Digital safety",
      skill: "Choose a safer response to common account and device risks",
      difficulty: 2,
      prompt: `${EARLY_NAMES[nameIndex]} is using a ${DIGITAL_SERVICES[serviceIndex]} ${grammarTimes[timeIndex]} when ${event} via a ${DIGITAL_CHANNELS[channelIndex]}. What is the safest next action?`,
      explanation: `${safeAction}. This reduces the chance of exposing credentials, devices or account access to an unverified request.`,
      hint: "Prefer official channels, protect credentials, and verify unexpected requests before acting.",
    },
    safeAction,
    distractors,
    variant,
  );
}

const NETWORK_CONTEXTS = ["software update", "video file", "audio archive", "photo collection", "lesson package", "document bundle", "backup file", "presentation", "dataset", "map file", "project folder", "training video", "research file", "media package", "design file", "offline course"] as const;
const networkDimensions = [100, 1000, NETWORK_CONTEXTS.length, 2] as const;
const networkCapacity = product(networkDimensions);

function renderNetworks(variant: number): LearnQuestion {
  const [rateIndex, secondsIndex, contextIndex, task] = decodeVariant(variant, networkDimensions);
  const rate = rateIndex + 1;
  const seconds = secondsIndex + 1;
  const size = rate * seconds;
  const answer = task === 0 ? size : seconds;
  return numericOrSingle(
    {
      id: `variant-computing-network-${variant}`,
      exposureKey: `variant:computing:network:${variant}`,
      subject: "Computing",
      topic: "Internet & networks",
      skill: "Relate data-transfer rate, file size and transfer time",
      difficulty: 3,
      prompt: task === 0
        ? `A ${NETWORK_CONTEXTS[contextIndex]} transfers at a steady ${rate} MB/s for ${seconds} seconds. How many megabytes are transferred?`
        : `A ${NETWORK_CONTEXTS[contextIndex]} is ${size} MB and transfers at a steady ${rate} MB/s. How many seconds will the transfer take?`,
      explanation: task === 0
        ? `Data transferred = rate × time = ${rate} × ${seconds} = ${size} MB.`
        : `Time = file size ÷ rate = ${size} ÷ ${rate} = ${seconds} seconds.`,
      hint: task === 0 ? "Multiply transfer rate by time." : "Divide file size by transfer rate.",
    },
    answer,
    variant % 2 === 0 ? "numeric" : "single",
    variant,
  );
}

const codingDimensions = [1000, 100, 100, 2, 2] as const;
const codingCapacity = product(codingDimensions);

function renderComputationalThinking(variant: number): LearnQuestion {
  const [baseIndex, stepIndex, repeatIndex, operation, kindIndex] = decodeVariant(variant, codingDimensions);
  const base = baseIndex;
  const step = stepIndex + 1;
  const repeats = repeatIndex + 1;
  const addition = operation === 0;
  const start = addition ? base : base + step * repeats;
  const answer = addition ? base + step * repeats : base;
  const operator = addition ? "+" : "-";
  return numericOrSingle(
    {
      id: `variant-computing-coding-${variant}`,
      exposureKey: `variant:computing:coding:${variant}`,
      subject: "Computing",
      topic: "Computational thinking",
      skill: "Trace a repeated pseudocode update",
      difficulty: 3,
      prompt: `Trace this pseudocode: SET value = ${start}; REPEAT ${repeats} TIMES: value = value ${operator} ${step}; END REPEAT. What is the final value?`,
      explanation: `The value changes by ${step} exactly ${repeats} times, so the final value is ${answer}.`,
      hint: `Apply the ${operator} ${step} update exactly ${repeats} times.`,
    },
    answer,
    kindIndex === 0 ? "numeric" : "single",
    variant,
  );
}


const UNIVERSITY_CONTEXTS = [
  "a tutorial", "a lab session", "an assignment", "a revision workshop",
  "a practical class", "a study group", "a lecture example", "a project review",
  "a quiz", "a seminar", "an online lesson", "a class exercise",
  "a peer-learning session", "a mock assessment", "a course project", "a workbook example",
] as const;

const DATA_TYPE_LABELS = ["Integer", "Real number", "Boolean", "String"] as const;
const variableDimensions = [DATA_TYPE_LABELS.length, 1000, 9, EARLY_NAMES.length, UNIVERSITY_CONTEXTS.length] as const;
const variableCapacity = product(variableDimensions);

function renderVariables(variant: number): LearnQuestion {
  const [typeIndex, valueIndex, fractionIndex, nameIndex, contextIndex] = decodeVariant(variant, variableDimensions);
  const type = DATA_TYPE_LABELS[typeIndex];
  const variableName = `item${(valueIndex % 97) + 1}`;
  let value = "";
  if (type === "Integer") value = String(valueIndex - 500);
  else if (type === "Real number") value = `${valueIndex - 500}.${fractionIndex + 1}`;
  else if (type === "Boolean") value = valueIndex % 2 === 0 ? "true" : "false";
  else value = `"${EARLY_NAMES[nameIndex]}-${UNIVERSITY_CONTEXTS[contextIndex].replaceAll(" ", "-")}"`;

  return textChoiceQuestion(
    {
      id: `variant-uni-cs-variables-${variant}`,
      exposureKey: `variant:uni:cs:variables:${variant}`,
      subject: "Programming",
      topic: "Variables & data types",
      skill: "Classify common programming data types",
      difficulty: 2,
      prompt: `During ${UNIVERSITY_CONTEXTS[contextIndex]}, a variable is assigned: ${variableName} = ${value}. Which data type best describes this value?`,
      explanation: `${value} is best classified as a ${type.toLowerCase()} value.`,
      hint: "Distinguish whole numbers, decimal numbers, true/false values and quoted text.",
    },
    type,
    DATA_TYPE_LABELS,
    variant,
  );
}

const controlFlowDimensions = [1000, 1000, 4, 100, 2] as const;
const controlFlowCapacity = product(controlFlowDimensions);

function renderControlFlow(variant: number): LearnQuestion {
  const [leftIndex, rightIndex, comparison, outputIndex, kindIndex] = decodeVariant(variant, controlFlowDimensions);
  const left = leftIndex - 500;
  const right = rightIndex - 500;
  const trueValue = outputIndex + 100;
  const falseValue = -(outputIndex + 1);
  const operators = ["<", ">", "<=", ">="] as const;
  const operator = operators[comparison];
  const condition = comparison === 0 ? left < right
    : comparison === 1 ? left > right
    : comparison === 2 ? left <= right
    : left >= right;
  const answer = condition ? trueValue : falseValue;
  return numericOrSingle(
    {
      id: `variant-uni-cs-control-${variant}`,
      exposureKey: `variant:uni:cs:control:${variant}`,
      subject: "Programming",
      topic: "Control flow",
      skill: "Trace an if/else decision",
      difficulty: 3,
      prompt: `Trace the pseudocode: SET x = ${left}; IF x ${operator} ${right} THEN SET result = ${trueValue}; ELSE SET result = ${falseValue}; END IF. What is result?`,
      explanation: `The condition ${left} ${operator} ${right} is ${condition ? "true" : "false"}, so result becomes ${answer}.`,
      hint: "Evaluate the condition first, then follow only the matching branch.",
    },
    answer,
    kindIndex === 0 ? "numeric" : "single",
    variant,
  );
}

const DATA_STRUCTURE_SCENARIOS = [
  ["undoing the most recent editor action first", "Stack"],
  ["processing print jobs in the order they arrived", "Queue"],
  ["keeping unique course codes without duplicates", "Set"],
  ["accessing an item directly by its numbered position", "Array / list"],
  ["tracking browser back-history so the latest page is revisited first", "Stack"],
  ["serving support tickets in arrival order", "Queue"],
  ["recording unique student IDs only once", "Set"],
  ["storing a sequence of monthly values by index", "Array / list"],
] as const;
const DATA_STRUCTURE_OPTIONS = ["Stack", "Queue", "Set", "Array / list"] as const;
const dataStructureDimensions = [DATA_STRUCTURE_SCENARIOS.length, EARLY_NAMES.length, UNIVERSITY_CONTEXTS.length, 100, 8] as const;
const dataStructureCapacity = product(dataStructureDimensions);

function renderDataStructures(variant: number): LearnQuestion {
  const [scenarioIndex, nameIndex, contextIndex, itemIndex] = decodeVariant(variant, dataStructureDimensions);
  const [scenario, structure] = DATA_STRUCTURE_SCENARIOS[scenarioIndex];
  return textChoiceQuestion(
    {
      id: `variant-uni-cs-structures-${variant}`,
      exposureKey: `variant:uni:cs:structures:${variant}`,
      subject: "Programming",
      topic: "Data structures",
      skill: "Choose a data structure from its access behaviour",
      difficulty: 3,
      prompt: `In ${UNIVERSITY_CONTEXTS[contextIndex]}, ${EARLY_NAMES[nameIndex]} is designing a system for ${scenario} across ${itemIndex + 1} items. Which data structure best matches the required behaviour?`,
      explanation: `${structure} best matches the stated access/uniqueness behaviour.`,
      hint: "Focus on whether the task needs last-in-first-out, first-in-first-out, uniqueness or indexed sequence access.",
    },
    structure,
    DATA_STRUCTURE_OPTIONS,
    variant,
  );
}

const uniNetworkDimensions = [100, 1000, UNIVERSITY_CONTEXTS.length, 2] as const;
const uniNetworkCapacity = product(uniNetworkDimensions);

function renderUniversityNetworkBasics(variant: number): LearnQuestion {
  const [rateIndex, secondsIndex, contextIndex, task] = decodeVariant(variant, uniNetworkDimensions);
  const rateMbps = (rateIndex + 1) * 8;
  const seconds = secondsIndex + 1;
  const megabytes = (rateMbps / 8) * seconds;
  const answer = task === 0 ? megabytes : seconds;
  return numericOrSingle(
    {
      id: `variant-uni-cs-network-basics-${variant}`,
      exposureKey: `variant:uni:cs:network-basics:${variant}`,
      subject: "Computer Networks",
      topic: "Network basics",
      skill: "Relate bit rate, byte size and transfer time",
      difficulty: 3,
      prompt: task === 0
        ? `During ${UNIVERSITY_CONTEXTS[contextIndex]}, a link carries data steadily at ${rateMbps} Mbit/s for ${seconds} seconds. Ignoring overhead, how many megabytes are transferred?`
        : `During ${UNIVERSITY_CONTEXTS[contextIndex]}, ${megabytes} MB must cross a ${rateMbps} Mbit/s link. Ignoring overhead, how many seconds does the transfer take?`,
      explanation: task === 0
        ? `${rateMbps} Mbit/s equals ${rateMbps / 8} MB/s, so ${rateMbps / 8} × ${seconds} = ${megabytes} MB.`
        : `${rateMbps} Mbit/s equals ${rateMbps / 8} MB/s, so ${megabytes} ÷ ${rateMbps / 8} = ${seconds} seconds.`,
      hint: "Convert megabits to megabytes by dividing by 8 before using size = rate × time.",
    },
    answer,
    variant % 2 === 0 ? "numeric" : "single",
    variant,
  );
}

const PROTOCOL_SCENARIOS = [
  ["translate a domain name into an IP address", "DNS"],
  ["automatically provide an IP configuration to a client", "DHCP"],
  ["request ordinary web resources without transport encryption", "HTTP"],
  ["request web resources over an encrypted web connection", "HTTPS"],
  ["provide reliable ordered byte-stream delivery", "TCP"],
  ["send datagrams without connection setup or delivery guarantees", "UDP"],
  ["resolve a human-readable hostname before connecting to a server", "DNS"],
  ["lease network addressing details to a newly connected device", "DHCP"],
  ["load a web page securely with TLS protection", "HTTPS"],
  ["use a connection-oriented transport with retransmission", "TCP"],
  ["prioritise low-overhead datagram delivery over guaranteed arrival", "UDP"],
  ["retrieve a basic unencrypted web page", "HTTP"],
] as const;
const PROTOCOL_OPTIONS = ["DNS", "DHCP", "HTTP", "HTTPS", "TCP", "UDP"] as const;
const protocolDimensions = [PROTOCOL_SCENARIOS.length, EARLY_NAMES.length, UNIVERSITY_CONTEXTS.length, grammarTimes.length, 8] as const;
const protocolCapacity = product(protocolDimensions);

function renderProtocols(variant: number): LearnQuestion {
  const [scenarioIndex, nameIndex, contextIndex, timeIndex] = decodeVariant(variant, protocolDimensions);
  const [role, protocol] = PROTOCOL_SCENARIOS[scenarioIndex];
  return textChoiceQuestion(
    {
      id: `variant-uni-cs-protocols-${variant}`,
      exposureKey: `variant:uni:cs:protocols:${variant}`,
      subject: "Computer Networks",
      topic: "Protocols",
      skill: "Match common network protocols to their roles",
      difficulty: 3,
      prompt: `During ${UNIVERSITY_CONTEXTS[contextIndex]} ${grammarTimes[timeIndex]}, ${EARLY_NAMES[nameIndex]} needs a protocol to ${role}. Which protocol fits best?`,
      explanation: `${protocol} is the protocol most directly associated with this role.`,
      hint: "Separate naming/address configuration, web application protocols and transport protocols.",
    },
    protocol,
    PROTOCOL_OPTIONS,
    variant,
  );
}

const NURSING_CONTEXTS = ["a skills lab", "a classroom simulation", "a physiology tutorial", "a supervised practice exercise", "a revision session", "a case-study worksheet", "a vital-signs exercise", "a calculation drill"] as const;
const cardiovascularDimensions = [141, 600, EARLY_NAMES.length, NURSING_CONTEXTS.length] as const;
const cardiovascularCapacity = product(cardiovascularDimensions);

function renderCardiovascular(variant: number): LearnQuestion {
  const [rateIndex, minutesIndex, nameIndex, contextIndex] = decodeVariant(variant, cardiovascularDimensions);
  const rate = rateIndex + 40;
  const minutes = minutesIndex + 1;
  const beats = rate * minutes;
  return numericOrSingle(
    {
      id: `variant-uni-nursing-cardio-${variant}`,
      exposureKey: `variant:uni:nursing:cardio:${variant}`,
      subject: "Anatomy & Physiology",
      topic: "Cardiovascular system",
      skill: "Use heart-rate units in a physiology calculation",
      difficulty: 2,
      prompt: `In ${NURSING_CONTEXTS[contextIndex]}, ${EARLY_NAMES[nameIndex]} works through a hypothetical pulse-rate calculation of ${rate} beats per minute for ${minutes} minutes. How many beats does the arithmetic represent?`,
      explanation: `Total beats = ${rate} beats/min × ${minutes} min = ${beats} beats.`,
      hint: "Multiply the rate per minute by the number of minutes. This is a unit calculation, not a clinical interpretation.",
    },
    beats,
    variant % 2 === 0 ? "numeric" : "single",
    variant,
  );
}

const respiratoryDimensions = [33, 600, EARLY_NAMES.length, NURSING_CONTEXTS.length] as const;
const respiratoryCapacity = product(respiratoryDimensions);

function renderRespiratory(variant: number): LearnQuestion {
  const [rateIndex, minutesIndex, nameIndex, contextIndex] = decodeVariant(variant, respiratoryDimensions);
  const rate = rateIndex + 8;
  const minutes = minutesIndex + 1;
  const breaths = rate * minutes;
  return numericOrSingle(
    {
      id: `variant-uni-nursing-respiratory-${variant}`,
      exposureKey: `variant:uni:nursing:respiratory:${variant}`,
      subject: "Anatomy & Physiology",
      topic: "Respiratory system",
      skill: "Use respiratory-rate units in a physiology calculation",
      difficulty: 2,
      prompt: `For a calculation exercise in ${NURSING_CONTEXTS[contextIndex]}, ${EARLY_NAMES[nameIndex]} uses a hypothetical respiratory rate of ${rate} breaths per minute for ${minutes} minutes. How many breaths does the arithmetic represent?`,
      explanation: `Total breaths = ${rate} breaths/min × ${minutes} min = ${breaths} breaths.`,
      hint: "Multiply rate by time. Do not use this arithmetic alone to make a clinical judgment.",
    },
    breaths,
    variant % 2 === 0 ? "numeric" : "single",
    variant,
  );
}

const PATIENT_CARE_SCENARIOS = [
  ["before a routine care interaction", "Perform appropriate hand hygiene", ["Skip hand hygiene because gloves may be used", "Reuse visibly soiled gloves", "Touch several surfaces first and clean hands later"]],
  ["before using a record for a care task", "Confirm the correct patient identity using approved identifiers", ["Assume identity from bed location alone", "Use another patient’s record because the names look similar", "Ask a visitor to guess the identity"]],
  ["after completing an observed care activity", "Document the relevant information according to the approved record process", ["Rely only on memory and never document", "Enter the information in an unrelated patient record", "Share the record details publicly"]],
  ["when an unexpected safety concern is noticed", "Follow the local escalation and supervision process", ["Hide the concern to avoid questions", "Invent a treatment without authorisation", "Post identifiable details in a public chat"]],
  ["when confidential information is no longer needed on screen", "Secure the record or sign out according to policy", ["Leave the record open for anyone nearby", "Photograph the record on a personal device for convenience", "Share the login with another person"]],
  ["when preparing equipment for a learning simulation", "Check that the correct clean equipment is available before the task", ["Use damaged equipment without reporting it", "Ignore cleanliness because it is only practice", "Mix labelled items without checking them"]],
  ["when a learner is uncertain about a supervised care step", "Ask the qualified supervisor and follow the approved procedure", ["Guess the step and continue silently", "Copy an unverified social-media post", "Perform an unfamiliar invasive step without supervision"]],
  ["when disposing of routine waste from a simulation", "Use the designated waste stream for the item", ["Leave waste on the floor", "Put every item into the same unlabelled container", "Carry contaminated waste around unnecessarily"]],
  ["before communicating a handover in a training scenario", "Use the approved structured handover process and relevant facts", ["Add rumours that are not in the record", "Omit an important observed safety concern", "Discuss identifiable details in a public area"]],
  ["after removing gloves in a routine training exercise", "Perform hand hygiene as required by the local protocol", ["Assume gloves replace hand hygiene", "Touch personal items first with soiled hands", "Reuse disposable gloves"]],
  ["when a record entry is found to be incorrect", "Use the approved correction process rather than hiding the error", ["Delete evidence secretly if policy forbids it", "Change another person’s record to match", "Ignore the error even when it affects the record"]],
  ["before beginning a delegated learning task", "Confirm the task, supervision and local procedure are understood", ["Begin without knowing the task", "Ignore the supervisor’s instructions", "Use a procedure from an unrelated setting without checking"]],
] as const;
const patientCareDimensions = [PATIENT_CARE_SCENARIOS.length, EARLY_NAMES.length, NURSING_CONTEXTS.length, EARLY_PLACES.length, grammarTimes.length, 8] as const;
const patientCareCapacity = product(patientCareDimensions);

function renderPatientCare(variant: number): LearnQuestion {
  const [scenarioIndex, nameIndex, contextIndex, placeIndex, timeIndex] = decodeVariant(variant, patientCareDimensions);
  const [situation, safeAction, distractors] = PATIENT_CARE_SCENARIOS[scenarioIndex];
  return textChoiceQuestion(
    {
      id: `variant-uni-nursing-care-${variant}`,
      exposureKey: `variant:uni:nursing:care:${variant}`,
      subject: "Fundamentals of Nursing",
      topic: "Patient care",
      skill: "Apply basic safety, identity, hygiene and documentation principles",
      difficulty: 2,
      prompt: `In ${NURSING_CONTEXTS[contextIndex]} at ${EARLY_PLACES[placeIndex]} ${grammarTimes[timeIndex]}, ${EARLY_NAMES[nameIndex]} is asked what to do ${situation}. Which is the safest general training response?`,
      explanation: `${safeAction}. Exact clinical procedures still follow local policy, supervision and the patient’s situation.`,
      hint: "Choose the option that protects identity, hygiene, confidentiality, documentation and supervised practice.",
    },
    safeAction,
    distractors,
    variant,
  );
}

const ACCOUNTING_TRANSACTIONS = [
  ["the owner invests cash in the business", "Debit Cash; Credit Capital", ["Debit Capital; Credit Cash", "Debit Expense; Credit Cash", "Debit Cash; Credit Sales Revenue"]],
  ["the business buys equipment for cash", "Debit Equipment; Credit Cash", ["Debit Cash; Credit Equipment", "Debit Equipment; Credit Capital", "Debit Expense; Credit Accounts Payable"]],
  ["the business earns service revenue and receives cash immediately", "Debit Cash; Credit Service Revenue", ["Debit Service Revenue; Credit Cash", "Debit Cash; Credit Capital", "Debit Accounts Receivable; Credit Cash"]],
  ["the business pays rent in cash", "Debit Rent Expense; Credit Cash", ["Debit Cash; Credit Rent Expense", "Debit Rent Expense; Credit Capital", "Debit Accounts Payable; Credit Rent Expense"]],
  ["a customer pays an amount previously owed on account", "Debit Cash; Credit Accounts Receivable", ["Debit Accounts Receivable; Credit Cash", "Debit Cash; Credit Sales Revenue", "Debit Expense; Credit Cash"]],
  ["the business buys inventory for cash", "Debit Inventory; Credit Cash", ["Debit Cash; Credit Inventory", "Debit Inventory; Credit Revenue", "Debit Accounts Payable; Credit Cash"]],
  ["the business buys inventory on credit from a supplier", "Debit Inventory; Credit Accounts Payable", ["Debit Accounts Payable; Credit Inventory", "Debit Cash; Credit Inventory", "Debit Inventory; Credit Cash"]],
  ["the business pays a supplier for an amount already owed", "Debit Accounts Payable; Credit Cash", ["Debit Cash; Credit Accounts Payable", "Debit Inventory; Credit Cash", "Debit Expense; Credit Accounts Receivable"]],
  ["the business receives cash from a bank loan", "Debit Cash; Credit Loan Payable", ["Debit Loan Payable; Credit Cash", "Debit Cash; Credit Capital", "Debit Expense; Credit Loan Payable"]],
  ["the business pays a utility bill in cash", "Debit Utilities Expense; Credit Cash", ["Debit Cash; Credit Utilities Expense", "Debit Utilities Expense; Credit Revenue", "Debit Accounts Payable; Credit Utilities Expense"]],
  ["the business buys office supplies for cash", "Debit Supplies; Credit Cash", ["Debit Cash; Credit Supplies", "Debit Supplies; Credit Revenue", "Debit Expense; Credit Capital"]],
  ["a customer pays cash in advance for a service not yet earned", "Debit Cash; Credit Unearned Revenue", ["Debit Unearned Revenue; Credit Cash", "Debit Cash; Credit Service Revenue", "Debit Accounts Receivable; Credit Revenue"]],
] as const;
const BUSINESS_NAMES = ["Apex Traders", "North Star Services", "Greenline Ventures", "Unity Supplies", "Prime Works", "Coastal Enterprise", "Golden Field Ltd", "Nova Retail", "Bridgepoint Services", "Summit Stores", "Cedar Works", "Blue Horizon", "MarketLink Ltd", "Bright Path", "Atlas Services", "Crown Trading"] as const;
const doubleEntryDimensions = [ACCOUNTING_TRANSACTIONS.length, 1000, BUSINESS_NAMES.length, 31, 8] as const;
const doubleEntryCapacity = product(doubleEntryDimensions);

function renderDoubleEntry(variant: number): LearnQuestion {
  const [transactionIndex, amountIndex, businessIndex, dayIndex] = decodeVariant(variant, doubleEntryDimensions);
  const [transaction, entry, distractors] = ACCOUNTING_TRANSACTIONS[transactionIndex];
  const amount = (amountIndex + 1) * 10;
  return textChoiceQuestion(
    {
      id: `variant-uni-business-double-entry-${variant}`,
      exposureKey: `variant:uni:business:double-entry:${variant}`,
      subject: "Financial Accounting",
      topic: "Double entry",
      skill: "Apply basic debit and credit rules",
      difficulty: 3,
      prompt: `On day ${dayIndex + 1}, ${BUSINESS_NAMES[businessIndex]} records GH₵${amount.toLocaleString("en")} because ${transaction}. Which entry captures the basic double-entry effect?`,
      explanation: `The appropriate basic entry is: ${entry}.`,
      hint: "Identify which asset, liability, equity, revenue or expense accounts increase or decrease.",
    },
    entry,
    distractors,
    variant,
  );
}

const statementDimensions = [1000, 500, 500, BUSINESS_NAMES.length, 2] as const;
const statementCapacity = product(statementDimensions);

function renderFinancialStatements(variant: number): LearnQuestion {
  const [revenueIndex, costIndex, expenseIndex, businessIndex, task] = decodeVariant(variant, statementDimensions);
  const cost = (costIndex + 1) * 100;
  const expenses = (expenseIndex + 1) * 50;
  const revenue = cost + expenses + (revenueIndex + 1) * 200;
  const grossProfit = revenue - cost;
  const netProfit = grossProfit - expenses;
  const answer = task === 0 ? grossProfit : netProfit;
  return numericOrSingle(
    {
      id: `variant-uni-business-statements-${variant}`,
      exposureKey: `variant:uni:business:statements:${variant}`,
      subject: "Financial Accounting",
      topic: "Financial statements",
      skill: "Calculate gross and net profit from simplified figures",
      difficulty: 3,
      prompt: task === 0
        ? `${BUSINESS_NAMES[businessIndex]} reports revenue of GH₵${revenue.toLocaleString("en")} and cost of sales of GH₵${cost.toLocaleString("en")}. What is gross profit?`
        : `${BUSINESS_NAMES[businessIndex]} reports revenue of GH₵${revenue.toLocaleString("en")}, cost of sales of GH₵${cost.toLocaleString("en")} and other expenses of GH₵${expenses.toLocaleString("en")}. What is net profit?`,
      explanation: task === 0
        ? `Gross profit = revenue − cost of sales = ${revenue} − ${cost} = GH₵${grossProfit}.`
        : `Net profit = revenue − cost of sales − other expenses = ${revenue} − ${cost} − ${expenses} = GH₵${netProfit}.`,
      hint: task === 0 ? "Subtract cost of sales from revenue." : "Subtract both cost of sales and other expenses from revenue.",
    },
    answer,
    variant % 2 === 0 ? "numeric" : "single",
    variant,
  );
}

const MANAGEMENT_SCENARIOS = [
  ["setting objectives and deciding actions before work begins", "Planning"],
  ["preparing a budget and schedule for a future project", "Planning"],
  ["deciding how tasks and resources will be arranged", "Organising"],
  ["assigning roles and grouping related activities", "Organising"],
  ["motivating staff and communicating direction", "Leading"],
  ["coaching a team toward agreed goals", "Leading"],
  ["comparing actual results with targets", "Controlling"],
  ["correcting performance after reviewing a variance", "Controlling"],
  ["choosing milestones for next quarter", "Planning"],
  ["designing reporting lines for a new unit", "Organising"],
  ["giving constructive direction during implementation", "Leading"],
  ["checking whether quality standards are being met", "Controlling"],
  ["deciding what should be achieved and by when", "Planning"],
  ["allocating people to specific responsibilities", "Organising"],
  ["building commitment around a shared objective", "Leading"],
  ["measuring outcomes and taking corrective action", "Controlling"],
] as const;
const MANAGEMENT_OPTIONS = ["Planning", "Organising", "Leading", "Controlling"] as const;
const managementDimensions = [MANAGEMENT_SCENARIOS.length, EARLY_NAMES.length, BUSINESS_NAMES.length, grammarTimes.length, 8] as const;
const managementCapacity = product(managementDimensions);

function renderManagement(variant: number): LearnQuestion {
  const [scenarioIndex, nameIndex, businessIndex, timeIndex] = decodeVariant(variant, managementDimensions);
  const [scenario, managementFunction] = MANAGEMENT_SCENARIOS[scenarioIndex];
  return textChoiceQuestion(
    {
      id: `variant-uni-business-management-${variant}`,
      exposureKey: `variant:uni:business:management:${variant}`,
      subject: "Management",
      topic: "Management functions",
      skill: "Identify planning, organising, leading and controlling",
      difficulty: 2,
      prompt: `At ${BUSINESS_NAMES[businessIndex]} ${grammarTimes[timeIndex]}, ${EARLY_NAMES[nameIndex]} is ${scenario}. Which management function is most directly illustrated?`,
      explanation: `The scenario most directly illustrates ${managementFunction.toLowerCase()}.`,
      hint: "Ask whether the action sets direction, arranges resources, guides people or checks results.",
    },
    managementFunction,
    MANAGEMENT_OPTIONS,
    variant,
  );
}

export const VARIANT_TEMPLATES: readonly VariantTemplate[] = [
  {
    id: "uni-cs-variables",
    subjectId: "programming",
    subject: "Programming",
    topicId: "variables",
    topic: "Variables & data types",
    skill: "Classify common programming data types",
    difficulty: 2,
    capacity: variableCapacity,
    schoolLevels: [],
    examPrograms: [],
    universityPrograms: ["computer-science"],
    render: renderVariables,
  },
  {
    id: "uni-cs-control-flow",
    subjectId: "programming",
    subject: "Programming",
    topicId: "control-flow",
    topic: "Control flow",
    skill: "Trace if/else decisions",
    difficulty: 3,
    capacity: controlFlowCapacity,
    schoolLevels: [],
    examPrograms: [],
    universityPrograms: ["computer-science"],
    render: renderControlFlow,
  },
  {
    id: "uni-cs-data-structures",
    subjectId: "programming",
    subject: "Programming",
    topicId: "data-structures",
    topic: "Data structures",
    skill: "Choose data structures from access behaviour",
    difficulty: 3,
    capacity: dataStructureCapacity,
    schoolLevels: [],
    examPrograms: [],
    universityPrograms: ["computer-science"],
    render: renderDataStructures,
  },
  {
    id: "uni-cs-network-basics",
    subjectId: "networks",
    subject: "Computer Networks",
    topicId: "network-basics",
    topic: "Network basics",
    skill: "Relate bit rate, byte size and transfer time",
    difficulty: 3,
    capacity: uniNetworkCapacity,
    schoolLevels: [],
    examPrograms: [],
    universityPrograms: ["computer-science"],
    render: renderUniversityNetworkBasics,
  },
  {
    id: "uni-cs-protocols",
    subjectId: "networks",
    subject: "Computer Networks",
    topicId: "protocols",
    topic: "Protocols",
    skill: "Match common protocols to their roles",
    difficulty: 3,
    capacity: protocolCapacity,
    schoolLevels: [],
    examPrograms: [],
    universityPrograms: ["computer-science"],
    render: renderProtocols,
  },
  {
    id: "uni-nursing-cardiovascular",
    subjectId: "anatomy",
    subject: "Anatomy & Physiology",
    topicId: "cardiovascular",
    topic: "Cardiovascular system",
    skill: "Use heart-rate units in physiology calculations",
    difficulty: 2,
    capacity: cardiovascularCapacity,
    schoolLevels: [],
    examPrograms: [],
    universityPrograms: ["nursing"],
    render: renderCardiovascular,
  },
  {
    id: "uni-nursing-respiratory",
    subjectId: "anatomy",
    subject: "Anatomy & Physiology",
    topicId: "respiratory",
    topic: "Respiratory system",
    skill: "Use respiratory-rate units in physiology calculations",
    difficulty: 2,
    capacity: respiratoryCapacity,
    schoolLevels: [],
    examPrograms: [],
    universityPrograms: ["nursing"],
    render: renderRespiratory,
  },
  {
    id: "uni-nursing-patient-care",
    subjectId: "fundamentals",
    subject: "Fundamentals of Nursing",
    topicId: "patient-care",
    topic: "Patient care",
    skill: "Apply basic safety and documentation principles",
    difficulty: 2,
    capacity: patientCareCapacity,
    schoolLevels: [],
    examPrograms: [],
    universityPrograms: ["nursing"],
    render: renderPatientCare,
  },
  {
    id: "uni-business-double-entry",
    subjectId: "accounting",
    subject: "Financial Accounting",
    topicId: "double-entry",
    topic: "Double entry",
    skill: "Apply debit and credit rules",
    difficulty: 3,
    capacity: doubleEntryCapacity,
    schoolLevels: [],
    examPrograms: [],
    universityPrograms: ["business"],
    render: renderDoubleEntry,
  },
  {
    id: "uni-business-statements",
    subjectId: "accounting",
    subject: "Financial Accounting",
    topicId: "statements",
    topic: "Financial statements",
    skill: "Calculate simplified profit measures",
    difficulty: 3,
    capacity: statementCapacity,
    schoolLevels: [],
    examPrograms: [],
    universityPrograms: ["business"],
    render: renderFinancialStatements,
  },
  {
    id: "uni-business-management",
    subjectId: "management",
    subject: "Management",
    topicId: "functions",
    topic: "Management functions",
    skill: "Identify core management functions",
    difficulty: 2,
    capacity: managementCapacity,
    schoolLevels: [],
    examPrograms: [],
    universityPrograms: ["business"],
    render: renderManagement,
  },
  kgNumberStories,
  basicOneNumberStories,
  basicTwoNumberStories,
  basicThreeNumberStories,
  {
    id: "english-vocabulary-context",
    subjectId: "english",
    subject: "English Language",
    topicId: "vocabulary",
    topic: "Vocabulary",
    skill: "Recognise synonyms and antonyms in context",
    difficulty: 2,
    capacity: vocabularyCapacity,
    schoolLevels: JHS_LEVELS,
    examPrograms: BECE_PROGRAMS,
    render: renderVocabulary,
  },
  {
    id: "english-reading-retrieval",
    subjectId: "english",
    subject: "English Language",
    topicId: "reading",
    topic: "Reading comprehension",
    skill: "Retrieve explicit details from short passages",
    difficulty: 2,
    capacity: readingCapacity,
    schoolLevels: JHS_LEVELS,
    examPrograms: BECE_PROGRAMS,
    render: renderReading,
  },
  {
    id: "english-writing-mechanics",
    subjectId: "english",
    subject: "English Language",
    topicId: "writing",
    topic: "Writing",
    skill: "Apply basic capitalization and end punctuation",
    difficulty: 2,
    capacity: writingCapacity,
    schoolLevels: JHS_LEVELS,
    examPrograms: BECE_PROGRAMS,
    render: renderWriting,
  },
  {
    id: "science-environment-water-conservation",
    subjectId: "science",
    subject: "Science",
    topicId: "environment",
    topic: "Environment",
    skill: "Quantify water conservation in environmental scenarios",
    difficulty: 3,
    capacity: environmentCapacity,
    schoolLevels: JHS_LEVELS,
    examPrograms: BECE_PROGRAMS,
    render: renderEnvironment,
  },
  {
    id: "social-governance-functions",
    subjectId: "social",
    subject: "Social Studies",
    topicId: "governance",
    topic: "Governance",
    skill: "Distinguish core functions of state institutions",
    difficulty: 2,
    capacity: governanceCapacity,
    schoolLevels: JHS_LEVELS,
    examPrograms: BECE_PROGRAMS,
    render: renderGovernance,
  },
  {
    id: "social-citizenship-rights-responsibilities",
    subjectId: "social",
    subject: "Social Studies",
    topicId: "citizenship",
    topic: "Citizenship",
    skill: "Distinguish civic rights from responsibilities",
    difficulty: 2,
    capacity: citizenshipCapacity,
    schoolLevels: JHS_LEVELS,
    examPrograms: BECE_PROGRAMS,
    render: renderCitizenship,
  },
  {
    id: "social-people-environment-actions",
    subjectId: "social",
    subject: "Social Studies",
    topicId: "environment",
    topic: "People & environment",
    skill: "Choose environmentally responsible community actions",
    difficulty: 2,
    capacity: peopleEnvironmentCapacity,
    schoolLevels: JHS_LEVELS,
    examPrograms: BECE_PROGRAMS,
    render: renderPeopleEnvironment,
  },
  {
    id: "social-national-development-allocation",
    subjectId: "social",
    subject: "Social Studies",
    topicId: "development",
    topic: "National development",
    skill: "Interpret public-development allocations",
    difficulty: 3,
    capacity: developmentCapacity,
    schoolLevels: JHS_LEVELS,
    examPrograms: BECE_PROGRAMS,
    render: renderNationalDevelopment,
  },
  {
    id: "computing-digital-safety-scenarios",
    subjectId: "computing",
    subject: "Computing",
    topicId: "digital-safety",
    topic: "Digital safety",
    skill: "Choose safer responses to common digital risks",
    difficulty: 2,
    capacity: digitalSafetyCapacity,
    schoolLevels: JHS_LEVELS,
    examPrograms: BECE_PROGRAMS,
    render: renderDigitalSafety,
  },
  {
    id: "computing-network-transfer",
    subjectId: "computing",
    subject: "Computing",
    topicId: "internet",
    topic: "Internet & networks",
    skill: "Relate transfer rate, size and time",
    difficulty: 3,
    capacity: networkCapacity,
    schoolLevels: JHS_LEVELS,
    examPrograms: BECE_PROGRAMS,
    render: renderNetworks,
  },
  {
    id: "computing-pseudocode-tracing",
    subjectId: "computing",
    subject: "Computing",
    topicId: "coding",
    topic: "Computational thinking",
    skill: "Trace repeated pseudocode updates",
    difficulty: 3,
    capacity: codingCapacity,
    schoolLevels: JHS_LEVELS,
    examPrograms: BECE_PROGRAMS,
    render: renderComputationalThinking,
  },
  {
    id: "math-number-operations",
    subjectId: "mathematics",
    subject: "Mathematics",
    topicId: "number",
    topic: "Number & operations",
    skill: "Apply arithmetic operations",
    difficulty: 2,
    capacity: arithmeticCapacity,
    schoolLevels: UPPER_PRIMARY_TO_SHS,
    examPrograms: EXAM_PROGRAMS,
    render: renderArithmetic,
  },
  {
    id: "math-linear-equations",
    subjectId: "mathematics",
    subject: "Mathematics",
    topicId: "algebra",
    topic: "Algebra",
    skill: "Solve one-variable linear equations",
    difficulty: 3,
    capacity: algebraCapacity,
    schoolLevels: JHS_SHS_LEVELS,
    examPrograms: EXAM_PROGRAMS,
    render: renderLinearEquation,
  },
  {
    id: "math-rectangle-measures",
    subjectId: "mathematics",
    subject: "Mathematics",
    topicId: "geometry",
    topic: "Geometry",
    skill: "Calculate rectangle measures",
    difficulty: 2,
    capacity: geometryCapacity,
    schoolLevels: UPPER_PRIMARY_TO_SHS,
    examPrograms: EXAM_PROGRAMS,
    render: renderRectangle,
  },
  {
    id: "math-arithmetic-mean",
    subjectId: "mathematics",
    subject: "Mathematics",
    topicId: "statistics",
    topic: "Statistics & probability",
    skill: "Calculate the arithmetic mean",
    difficulty: 3,
    capacity: statisticsCapacity,
    schoolLevels: JHS_SHS_LEVELS,
    examPrograms: EXAM_PROGRAMS,
    render: renderArithmeticMean,
  },
  {
    id: "english-subject-verb-agreement",
    subjectId: "english",
    subject: "English Language",
    topicId: "grammar",
    topic: "Grammar & concord",
    skill: "Apply subject–verb agreement",
    difficulty: 2,
    capacity: grammarCapacity,
    schoolLevels: UPPER_PRIMARY_TO_SHS,
    examPrograms: EXAM_PROGRAMS,
    render: renderConcord,
  },
  {
    id: "science-biological-magnification",
    subjectId: "science",
    subject: "Science",
    topicId: "living",
    topic: "Living things",
    skill: "Apply magnification to biological specimens",
    difficulty: 3,
    capacity: livingCapacity,
    schoolLevels: JHS_SHS_LEVELS,
    examPrograms: EXAM_PROGRAMS,
    render: renderMagnification,
  },
  {
    id: "science-density",
    subjectId: "science",
    subject: "Science",
    topicId: "matter",
    topic: "Matter & materials",
    skill: "Apply the density relationship",
    difficulty: 3,
    capacity: matterCapacity,
    schoolLevels: JHS_SHS_LEVELS,
    examPrograms: EXAM_PROGRAMS,
    render: renderDensity,
  },
  {
    id: "science-force",
    subjectId: "science",
    subject: "Science",
    topicId: "energy",
    topic: "Force & energy",
    skill: "Apply force, mass and acceleration",
    difficulty: 3,
    capacity: forceCapacity,
    schoolLevels: JHS_SHS_LEVELS,
    examPrograms: EXAM_PROGRAMS,
    render: renderForce,
  },
  {
    id: "computing-binary-conversion",
    subjectId: "computing",
    subject: "Computing",
    topicId: "systems",
    topic: "Computer systems",
    skill: "Convert between binary and decimal",
    difficulty: 3,
    capacity: binaryCapacity,
    schoolLevels: JHS_SHS_LEVELS,
    examPrograms: EXAM_PROGRAMS,
    render: renderBinary,
  },
];

function audienceMatches(template: VariantTemplate, config: SessionConfig) {
  if (config.lane === "school") return template.schoolLevels.includes(config.levelId);
  if (config.lane === "exam") return template.examPrograms.includes(config.programId);
  if (config.lane === "university") return template.universityPrograms?.includes(config.programId) ?? false;
  if (config.lane === "skills") return template.skillsPrograms?.includes(config.programId) ?? false;
  return false;
}

function selectionMatches(template: VariantTemplate, config: SessionConfig) {
  const subjectMatches = config.subjectId === "all" || template.subjectId === config.subjectId;
  const topicMatches = config.topicId === "all" || template.topicId === config.topicId;
  return subjectMatches && topicMatches && audienceMatches(template, config);
}

export function templatesForSelection(config: SessionConfig) {
  return VARIANT_TEMPLATES.filter((template) => selectionMatches(template, config));
}

export function variantCapacityForSelection(config: SessionConfig) {
  return templatesForSelection(config).reduce((total, template) => total + template.capacity, 0);
}

export function buildVariantQuestions(config: SessionConfig, requestedCount = config.count, seed = config.seed ?? Date.now()) {
  const requested = Math.max(0, Math.min(MAX_VARIANT_POOL, Math.floor(requestedCount)));
  if (!requested) return [] as LearnQuestion[];

  const templates = templatesForSelection(config);
  if (!templates.length) return [] as LearnQuestion[];

  const positions = new Map<string, number>();
  const result: LearnQuestion[] = [];
  const exposures = new Set<string>();
  let cursor = normalizedSeed(seed) % templates.length;
  let attempts = 0;
  const attemptLimit = requested * Math.max(4, templates.length * 2);

  while (result.length < requested && attempts < attemptLimit) {
    const template = templates[cursor % templates.length];
    const position = positions.get(template.id) ?? 0;
    if (position < Math.min(template.capacity, VARIANT_BLOCK_SIZE)) {
      const index = variantIndex(template, seed, position);
      const question = template.render(index);
      if (!exposures.has(question.exposureKey)) {
        exposures.add(question.exposureKey);
        result.push(question);
      }
      positions.set(template.id, position + 1);
    }
    cursor += 1;
    attempts += 1;
  }

  return result;
}
