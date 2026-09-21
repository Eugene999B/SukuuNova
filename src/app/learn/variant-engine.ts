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
  render: (variantIndex: number) => LearnQuestion;
};

const UPPER_PRIMARY_LEVELS = [] as const;
const JHS_LEVELS = ["jhs-1"] as const;
const UPPER_PRIMARY_TO_JHS = [...UPPER_PRIMARY_LEVELS, ...JHS_LEVELS] as const;
const EXAM_PROGRAMS: readonly string[] = [];

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
  schoolLevels: [],
});

const basicTwoNumberStories = createNumberStoryTemplate({
  id: "basic-2-number-stories",
  subjectId: "mathematics",
  subject: "Mathematics",
  topicId: "number",
  topic: "Number & operations",
  maxValue: 100,
  difficulty: 2,
  schoolLevels: [],
});

const basicThreeNumberStories = createNumberStoryTemplate({
  id: "basic-3-number-stories",
  subjectId: "mathematics",
  subject: "Mathematics",
  topicId: "number",
  topic: "Number & operations",
  maxValue: 1000,
  difficulty: 2,
  schoolLevels: [],
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

export const VARIANT_TEMPLATES: readonly VariantTemplate[] = [
  kgNumberStories,
  basicOneNumberStories,
  basicTwoNumberStories,
  basicThreeNumberStories,
  {
    id: "math-number-operations",
    subjectId: "mathematics",
    subject: "Mathematics",
    topicId: "number",
    topic: "Number & operations",
    skill: "Apply arithmetic operations",
    difficulty: 2,
    capacity: arithmeticCapacity,
    schoolLevels: UPPER_PRIMARY_TO_JHS,
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
    schoolLevels: JHS_LEVELS,
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
    schoolLevels: UPPER_PRIMARY_TO_JHS,
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
    schoolLevels: JHS_LEVELS,
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
    schoolLevels: UPPER_PRIMARY_TO_JHS,
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
    schoolLevels: JHS_LEVELS,
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
    schoolLevels: JHS_LEVELS,
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
    schoolLevels: JHS_LEVELS,
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
    schoolLevels: JHS_LEVELS,
    examPrograms: EXAM_PROGRAMS,
    render: renderBinary,
  },
];

function audienceMatches(template: VariantTemplate, config: SessionConfig) {
  if (config.lane === "school") return template.schoolLevels.includes(config.levelId);
  if (config.lane === "exam") return template.examPrograms.includes(config.programId);
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
