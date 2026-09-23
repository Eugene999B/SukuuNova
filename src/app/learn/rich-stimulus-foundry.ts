import {
  resolveCatalogSelection,
  type LearnQuestion,
  type QuestionStimulus,
  type SessionConfig,
} from "./learn-domain";

type Target = {
  subjectId: string;
  subject: string;
  topicId: string;
  topic: string;
};

const NAMES = ["Ama","Kojo","Akosua","Yaw","Esi","Kofi","Abena","Kwame","Mansa","Sena","Amina","Ibrahim"] as const;
const PLACES = ["the school garden","the library","the community centre","the science club","the market survey","the reading room"] as const;
const QUALITIES = ["careful","patient","curious","responsible","resourceful","thoughtful"] as const;

// Count distinct task families, not cosmetic names or numeric permutations.
export const RICH_STIMULUS_TOPIC_CAPACITY = 6;
const READING_TASK_CAPACITY = 24;
const DATA_TASK_CAPACITY = 4;

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function pick<T>(items: readonly T[], seed: number, offset = 0) {
  return items[(seed + offset) % items.length];
}

function baseDifficulty(levelId: string) {
  if (/kg-|basic-1/.test(levelId)) return 1;
  if (/basic-[23]/.test(levelId)) return 2;
  if (/basic-[45]|jhs-1|shs-1|level-100/.test(levelId)) return 3;
  if (/basic-6|jhs-[23]|shs-2|level-[23]00/.test(levelId)) return 4;
  return 5;
}

function selectedTarget(config: SessionConfig): Target | null {
  const { subject, topic } = resolveCatalogSelection(config);
  if (!subject) return null;
  return {
    subjectId: subject.id,
    subject: subject.contentLabel ?? subject.label,
    topicId: topic?.id ?? config.topicId,
    topic: topic?.label ?? "Mixed topics",
  };
}

function provenance() {
  return { sourceType: "original" as const, rightsStatus: "not-applicable" as const };
}

function numericChoices(answer: number, seed: number, step = 1) {
  const values = Array.from(new Set([
    answer,
    answer + step,
    Math.max(0, answer - step),
    answer + 2 * step,
    Math.max(0, answer - 2 * step),
  ])).slice(0, 4);
  const shift = seed % values.length;
  const rotated = [...values.slice(shift), ...values.slice(0, shift)];
  return {
    options: rotated.map((value, index) => ({ id: String(index), label: String(value) })),
    answer: String(rotated.indexOf(answer)),
  };
}

function geometryQuestion(config: SessionConfig, target: Target, seed: number, position: number): LearnQuestion {
  const family = position % 6;
  const level = baseDifficulty(config.levelId);
  const a = 4 + (hash(`${seed}:a:${position}`) % (level <= 3 ? 28 : 70));
  const b = 3 + (hash(`${seed}:b:${position}`) % (level <= 3 ? 22 : 55));

  if (family === 0) {
    const answer = 2 * (a + b);
    const stimulus: QuestionStimulus = {
      kind: "diagram",
      diagram: "rectangle",
      ariaLabel: `Rectangle with length ${a} centimetres and width ${b} centimetres`,
      labels: { top: `${a} cm`, side: `${b} cm` },
      values: { width: a, height: b },
    };
    return {
      id: `rich-geometry-perimeter-${seed}-${position}`,
      exposureKey: `rich:geometry:perimeter:${config.levelId}:${seed}:${position}`,
      kind: position % 2 === 0 ? "numeric" : "fill",
      subject: target.subject,
      topic: target.topic,
      skill: "Reason from a geometry diagram",
      difficulty: 2,
      prompt: "Study the rectangle. What is its perimeter in centimetres?",
      answer,
      acceptedAnswers: [String(answer)],
      explanation: `Perimeter = 2 × (length + width) = 2 × (${a} + ${b}) = ${answer} cm.`,
      hint: "The perimeter is the distance all the way around the shape.",
      challenge: "Apply",
      mission: "Read the diagram before choosing an operation",
      generationFamily: "rich-geometry-rectangle-perimeter",
      stimulus,
      provenance: provenance(),
    };
  }

  if (family === 1) {
    const answer = a * b;
    return {
      id: `rich-geometry-area-${seed}-${position}`,
      exposureKey: `rich:geometry:area:${config.levelId}:${seed}:${position}`,
      kind: "numeric",
      subject: target.subject,
      topic: target.topic,
      skill: "Calculate area from a diagram",
      difficulty: 2,
      prompt: "The shaded rectangular board has the dimensions shown. What is its area in square centimetres?",
      answer,
      acceptedAnswers: [String(answer)],
      explanation: `Area = length × width = ${a} × ${b} = ${answer} cm².`,
      hint: "Area measures surface, so multiply the perpendicular dimensions.",
      challenge: "Apply",
      mission: "Connect a visual model to a measurement rule",
      generationFamily: "rich-geometry-rectangle-area",
      stimulus: {
        kind: "diagram",
        diagram: "rectangle",
        ariaLabel: `Rectangle with dimensions ${a} by ${b} centimetres`,
        labels: { top: `${a} cm`, side: `${b} cm`, centre: "shaded region" },
        values: { width: a, height: b },
      },
      provenance: provenance(),
    };
  }

  if (family === 2) {
    const first = 25 + (hash(`${seed}:angle1:${position}`) % 55);
    const second = 35 + (hash(`${seed}:angle2:${position}`) % Math.max(10, 125 - first));
    const answer = 180 - first - second;
    return {
      id: `rich-geometry-triangle-angle-${seed}-${position}`,
      exposureKey: `rich:geometry:triangle-angle:${config.levelId}:${seed}:${position}`,
      kind: position % 3 === 0 ? "fill" : "numeric",
      subject: target.subject,
      topic: target.topic,
      skill: "Use the angle sum of a triangle",
      difficulty: 3,
      prompt: "Two interior angles of the triangle are labelled. Find the missing angle x.",
      answer,
      acceptedAnswers: [String(answer), `${answer}°`],
      explanation: `Angles in a triangle total 180°. So x = 180° − ${first}° − ${second}° = ${answer}°.`,
      hint: "All three interior angles of a triangle add to 180°.",
      challenge: "Analyse",
      mission: "Extract relationships from a diagram",
      generationFamily: "rich-geometry-triangle-angle",
      stimulus: {
        kind: "diagram",
        diagram: "triangle",
        ariaLabel: `Triangle with angles ${first} degrees, ${second} degrees and x`,
        labels: { left: `${first}°`, right: `${second}°`, top: "x" },
      },
      provenance: provenance(),
    };
  }

  if (family === 3) {
    const width = 5 + (hash(`${seed}:w:${position}`) % 20);
    const area = width * (6 + (hash(`${seed}:h:${position}`) % 25));
    const answer = area / width;
    return {
      id: `rich-geometry-missing-side-${seed}-${position}`,
      exposureKey: `rich:geometry:missing-side:${config.levelId}:${seed}:${position}`,
      kind: "fill",
      subject: target.subject,
      topic: target.topic,
      skill: "Find a missing dimension",
      difficulty: 3,
      prompt: `The rectangle has area ${area} cm² and width ${width} cm. Fill in the missing length.`,
      answer,
      acceptedAnswers: [String(answer), `${answer} cm`],
      explanation: `Length = area ÷ width = ${area} ÷ ${width} = ${answer} cm.`,
      hint: "Undo multiplication by dividing the area by the known side.",
      challenge: "Analyse",
      mission: "Work backwards from a known result",
      generationFamily: "rich-geometry-missing-dimension",
      stimulus: {
        kind: "diagram",
        diagram: "rectangle",
        ariaLabel: `Rectangle with width ${width} centimetres, unknown length and area ${area} square centimetres`,
        labels: { top: "?", side: `${width} cm`, centre: `${area} cm²` },
      },
      provenance: provenance(),
    };
  }

  if (family === 4) {
    const angle = 20 + (hash(`${seed}:angle:${position}`) % 150);
    const answer = 180 - angle;
    const picked = numericChoices(answer, seed + position, 10);
    return {
      id: `rich-geometry-supplement-${seed}-${position}`,
      exposureKey: `rich:geometry:supplement:${config.levelId}:${seed}:${position}`,
      kind: "single",
      subject: target.subject,
      topic: target.topic,
      skill: "Reason about angles on a straight line",
      difficulty: 2,
      prompt: "The two adjacent angles form a straight line. What is x?",
      options: picked.options,
      answer: picked.answer,
      explanation: `Angles on a straight line add to 180°. Therefore x = 180° − ${angle}° = ${answer}°.`,
      hint: "A straight angle measures 180°.",
      challenge: "Analyse",
      mission: "Use a visual relationship rather than pattern matching",
      generationFamily: "rich-geometry-straight-line",
      stimulus: {
        kind: "diagram",
        diagram: "angle",
        ariaLabel: `Straight line split into adjacent angles ${angle} degrees and x`,
        labels: { first: `${angle}°`, second: "x" },
        values: { angle },
      },
      provenance: provenance(),
    };
  }

  const sideA = 3 + (hash(`${seed}:ta:${position}`) % 30);
  const sideB = 4 + (hash(`${seed}:tb:${position}`) % 30);
  // Strict triangle inequality: |a − b| < c < a + b.
  const sideC = Math.abs(sideA - sideB) + 1 + (hash(`${seed}:tc:${position}`) % (2 * Math.min(sideA, sideB) - 1));
  const answer = sideA + sideB + sideC;
  return {
    id: `rich-geometry-triangle-perimeter-${seed}-${position}`,
    exposureKey: `rich:geometry:triangle-perimeter:${config.levelId}:${seed}:${position}`,
    kind: "numeric",
    subject: target.subject,
    topic: target.topic,
    skill: "Interpret side labels on a triangle",
    difficulty: 1,
    prompt: "Use the side lengths shown to calculate the perimeter of the triangle.",
    answer,
    acceptedAnswers: [String(answer)],
    explanation: `Perimeter = ${sideA} + ${sideB} + ${sideC} = ${answer}.`,
    hint: "Add each outside side exactly once.",
    challenge: "Apply",
    mission: "Translate a visual model into a calculation",
    generationFamily: "rich-geometry-triangle-perimeter",
    stimulus: {
      kind: "diagram",
      diagram: "triangle",
      ariaLabel: `Triangle with side lengths ${sideA}, ${sideB} and ${sideC}`,
      labels: { leftSide: String(sideA), rightSide: String(sideB), base: String(sideC) },
    },
    provenance: provenance(),
  };
}

function readingPassage(seed: number, level: number) {
  const name = pick(NAMES, seed);
  const place = pick(PLACES, seed, 3);
  const quality = pick(QUALITIES, seed, 5);
  const challenge = [
    "noticed that younger pupils were leaving useful books on tables after reading",
    "realised that a class project was wasting water during every practical session",
    "saw that many students copied information online without checking whether it was trustworthy",
    "found that a group kept arguing because nobody recorded the decisions they had already made",
  ][seed % 4];
  const response = [
    "created a simple return station and showed the pupils how to sort the books",
    "measured the wasted water, changed the routine and compared the results after one week",
    "compared several sources and wrote down which details were supported by evidence",
    "started a short decision log so everyone could see what the group had agreed",
  ][seed % 4];
  const result = [
    "The room became easier to use, and more pupils could find the books they needed.",
    "The class used much less water without reducing the quality of the practical work.",
    "The final report became clearer because unsupported claims were removed.",
    "The group spent less time repeating arguments and more time completing the project.",
  ][seed % 4];

  const text = level <= 2
    ? `${name} was working at ${place}. ${name} ${challenge}. Being ${quality}, ${name} ${response}. ${result} The decision was guided by evidence.`
    : `While working at ${place}, ${name} ${challenge}. Instead of accepting the problem as normal, ${name} took a ${quality} approach: ${response}. ${result} The experience showed that a small decision, when guided by evidence, can change how a whole group works.`;

  return { name, text, challenge, response, result };
}

function englishReadingQuestion(config: SessionConfig, target: Target, seed: number, position: number): LearnQuestion {
  const level = baseDifficulty(config.levelId);
  const passage = readingPassage(hash(`${seed}:passage:${Math.floor(position / 6)}`), level);
  const family = position % 6;
  const stimulus: QuestionStimulus = { kind: "passage", title: "Read the passage", text: passage.text };

  if (family === 0) {
    const correct = "A thoughtful response to a practical problem can improve a group's work.";
    const options = [
      correct,
      "Every problem disappears when people work alone.",
      "Rules matter more than evidence in every situation.",
      "The main purpose of group work is to avoid making decisions.",
    ];
    const shift = seed % options.length;
    const rotated = [...options.slice(shift), ...options.slice(0, shift)];
    return {
      id: `rich-reading-main-${seed}-${position}`,
      exposureKey: `rich:reading:main:${config.levelId}:${seed}:${position}`,
      kind: "single", subject: target.subject, topic: target.topic,
      skill: "Identify the main idea", difficulty: 2,
      prompt: "Which statement best expresses the main idea of the passage?",
      options: rotated.map((label,index)=>({id:String(index),label})),
      answer: String(rotated.indexOf(correct)),
      explanation: "The passage centres on noticing a problem, responding thoughtfully and improving the situation.",
      hint: "Choose the idea that covers the whole passage, not one small detail.",
      challenge: "Analyse", mission: "Read for meaning, not isolated words",
      generationFamily: "rich-reading-main-idea", stimulus, provenance: provenance(),
    };
  }

  if (family === 1) {
    const answer = "evidence";
    return {
      id: `rich-reading-fill-${seed}-${position}`,
      exposureKey: `rich:reading:fill:${config.levelId}:${seed}:${position}`,
      kind: "fill", subject: target.subject, topic: target.topic,
      skill: "Use context to complete meaning", difficulty: 1,
      prompt: "Complete the idea from the passage: the decision was guided by ______.",
      answer, acceptedAnswers: ["evidence", "evidence from the situation"],
      explanation: "The final sentence explicitly says the decision was guided by evidence.",
      hint: "Look at the final sentence of the passage.",
      challenge: "Recall", mission: "Retrieve exact meaning from a passage",
      generationFamily: "rich-reading-cloze", stimulus, provenance: provenance(),
    };
  }

  if (family === 2) {
    return {
      id: `rich-reading-inference-${seed}-${position}`,
      exposureKey: `rich:reading:inference:${config.levelId}:${seed}:${position}`,
      kind: "short", subject: target.subject, topic: target.topic,
      skill: "Make a supported inference", difficulty: 3,
      prompt: `What quality of ${passage.name} is most strongly shown by the response to the problem? Give one word.`,
      answer: "resourceful",
      acceptedAnswers: ["resourceful","thoughtful","careful","responsible","curious","proactive","patient"],
      explanation: "The response shows initiative and thoughtful problem solving. Several closely related descriptions are acceptable.",
      hint: "Describe the character shown by the action, not the action itself.",
      challenge: "Analyse", mission: "Infer character from evidence",
      generationFamily: "rich-reading-inference", stimulus, provenance: provenance(),
    };
  }

  if (family === 3) {
    const correct = "The action addressed the problem and led to the improvement described.";
    const options = [
      correct,
      "The action ignored the problem until somebody else solved it.",
      "The action focused only on making the passage longer.",
      "The action succeeded because no evidence was collected.",
    ];
    const shift = (seed + 1) % options.length;
    const rotated = [...options.slice(shift), ...options.slice(0, shift)];
    return {
      id: `rich-reading-evaluate-${seed}-${position}`,
      exposureKey: `rich:reading:evaluate:${config.levelId}:${seed}:${position}`,
      kind: "single", subject: target.subject, topic: target.topic,
      skill: "Evaluate an action using textual evidence", difficulty: 3,
      prompt: "Why was the response in the passage effective?",
      options: rotated.map((label,index)=>({id:String(index),label})),
      answer: String(rotated.indexOf(correct)),
      explanation: "The response was connected to the actual problem and led to an observable improvement.",
      hint: "Link the action to the result described in the passage.",
      challenge: "Evaluate", mission: "Judge actions using evidence from a text",
      generationFamily: "rich-reading-evaluation", stimulus, provenance: provenance(),
    };
  }

  if (family === 4) {
    const answer = passage.name;
    return {
      id: `rich-reading-detail-${seed}-${position}`,
      exposureKey: `rich:reading:detail:${config.levelId}:${seed}:${position}`,
      kind: "fill", subject: target.subject, topic: target.topic,
      skill: "Retrieve a detail accurately", difficulty: 1,
      prompt: "Who took action to address the problem described in the passage?",
      answer, acceptedAnswers: [answer, answer.toLowerCase()],
      explanation: `${answer} is the person who notices the problem and takes action.`,
      hint: "Look at the first sentence and follow the repeated name.",
      challenge: "Recall", mission: "Locate evidence precisely",
      generationFamily: "rich-reading-detail", stimulus, provenance: provenance(),
    };
  }

  const correct = "Small evidence-based changes can improve shared work.";
  const options = [
    correct,
    "Why Every Group Should Avoid Difficult Problems",
    "A List of Places in the Community",
    "The History of School Buildings",
  ];
  const shift = (seed + 2) % options.length;
  const rotated = [...options.slice(shift), ...options.slice(0, shift)];
  return {
    id: `rich-reading-title-${seed}-${position}`,
    exposureKey: `rich:reading:title:${config.levelId}:${seed}:${position}`,
    kind: "single", subject: target.subject, topic: target.topic,
    skill: "Select an appropriate title", difficulty: 2,
    prompt: "Which title best fits the passage?",
    options: rotated.map((label,index)=>({id:String(index),label})),
    answer: String(rotated.indexOf(correct)),
    explanation: "The best title captures the problem-solving idea that runs through the whole passage.",
    hint: "A good title should fit the entire passage.",
    challenge: "Analyse", mission: "Compress a passage into its central idea",
    generationFamily: "rich-reading-title", stimulus, provenance: provenance(),
  };
}

function dataQuestion(config: SessionConfig, target: Target, seed: number, position: number): LearnQuestion {
  const level = baseDifficulty(config.levelId);
  const labels = ["Monday","Tuesday","Wednesday","Thursday"];
  const values = labels.map((_,index)=>10 + (hash(`${seed}:data:${position}:${index}`) % (level <= 3 ? 30 : 80)));
  const stimulus: QuestionStimulus = {
    kind: "table",
    title: "Books borrowed from a class library",
    columns: ["Day","Books"],
    rows: labels.map((label,index)=>[label,String(values[index])]),
  };
  const family = position % 4;

  if (family === 0) {
    const answer = values.reduce((sum,value)=>sum+value,0);
    return {
      id:`rich-table-total-${seed}-${position}`, exposureKey:`rich:table:total:${seed}:${position}`,
      kind:"numeric", subject:target.subject, topic:target.topic, skill:"Calculate a total from a table",
      difficulty:2, prompt:"How many books were borrowed altogether across the four days?",
      answer, acceptedAnswers:[String(answer)], explanation:`Add the four table values to get ${answer}.`,
      hint:"Use every row once.", challenge:"Apply", mission:"Turn organised data into a calculation",
      generationFamily:"rich-data-table-total", stimulus, provenance:provenance(),
    };
  }

  if (family === 1) {
    const answer = Math.max(...values)-Math.min(...values);
    return {
      id:`rich-table-range-${seed}-${position}`, exposureKey:`rich:table:range:${seed}:${position}`,
      kind:"fill", subject:target.subject, topic:target.topic, skill:"Find the range from a table",
      difficulty:2, prompt:"Fill in the range of the four daily values.",
      answer, acceptedAnswers:[String(answer)], explanation:`Range = ${Math.max(...values)} − ${Math.min(...values)} = ${answer}.`,
      hint:"Subtract the smallest value from the largest.", challenge:"Analyse", mission:"Compare values before calculating",
      generationFamily:"rich-data-table-range", stimulus, provenance:provenance(),
    };
  }

  const max = Math.max(...values);
  const days = labels.filter((_, index) => values[index] === max);
  const day = days[0];
  if (family === 2) {
    return {
      id:`rich-table-max-${seed}-${position}`, exposureKey:`rich:table:max:${seed}:${position}`,
      kind:"short", subject:target.subject, topic:target.topic, skill:"Interpret a data table",
      difficulty:1, prompt:"Name one day on which the greatest number of books was borrowed.",
      answer:day, acceptedAnswers:days, explanation:`The largest value is ${max}, recorded on ${days.join(" and ")}. Any one of these days is correct.`,
      hint:"Scan the Books column for the greatest number.", challenge:"Recall", mission:"Read organised data accurately",
      generationFamily:"rich-data-table-maximum", stimulus, provenance:provenance(),
    };
  }

  const first=values[0], last=values[3];
  const answer=last-first;
  return {
    id:`rich-table-change-${seed}-${position}`, exposureKey:`rich:table:change:${seed}:${position}`,
    kind:"numeric", subject:target.subject, topic:target.topic, skill:"Compare two entries in a table",
    difficulty:2, prompt:"What is Thursday's value minus Monday's value? A negative answer is allowed.",
    answer, acceptedAnswers:[String(answer)], explanation:`${last} − ${first} = ${answer}.`,
    hint:"Use the two named rows, in the order stated.", challenge:"Analyse", mission:"Compare data rather than guessing a trend",
    generationFamily:"rich-data-table-change", stimulus, provenance:provenance(),
  };
}

function isGeometry(target: Target) {
  return /math/.test(target.subjectId) && /geometry|measurement|shape|angle|position-transformation/.test(target.topicId);
}

function isReading(target: Target) {
  return /english|literature/.test(target.subjectId) && /reading|interpretation|literature/.test(target.topicId);
}

function isData(target: Target) {
  return /math/.test(target.subjectId) && /data|statistics|probability/.test(target.topicId);
}

type RichMode = "geometry" | "reading" | "data";

function modesForSelection(config: SessionConfig, target: Target): RichMode[] {
  // These are school foundations. Do not relabel them as degree-level or
  // IELTS material merely because a course name contains "math" or "reading".
  if (config.lane === "university" || config.lane === "skills"
    || (config.lane === "exam" && config.programId === "ielts")) return [];
  if (config.lane === "school" && /^(kg-[12]|basic-[123])$/.test(config.levelId)) return [];
  const modes: RichMode[] = [];
  if (config.topicId === "all") {
    if (/math/.test(target.subjectId)) modes.push("geometry", "data");
    if (/english|literature/.test(target.subjectId)) modes.push("reading");
  } else {
    if (isGeometry(target)) modes.push("geometry");
    if (isReading(target)) modes.push("reading");
    if (isData(target)) modes.push("data");
  }
  return modes;
}

export function richStimulusCapacityForSelection(config: SessionConfig) {
  const target = selectedTarget(config);
  if (!target) return 0;
  return modesForSelection(config, target).reduce((total, mode) =>
    total + (mode === "geometry" ? RICH_STIMULUS_TOPIC_CAPACITY
      : mode === "reading" ? READING_TASK_CAPACITY : DATA_TASK_CAPACITY), 0);
}

export function buildRichStimulusQuestions(
  config: SessionConfig,
  requestedCount = config.count,
  seed = config.seed ?? Date.now(),
): LearnQuestion[] {
  const requested = Math.max(0, Math.min(500, Math.floor(requestedCount)));
  if (!requested) return [];
  const target = selectedTarget(config);
  if (!target) return [];

  const modes = modesForSelection(config, target);
  if (!modes.length) return [];

  const output: LearnQuestion[] = [];
  const prompts = new Set<string>();
  for (let position=0; output.length<requested && position<requested*12; position+=1) {
    const mode = modes[position % modes.length];
    const familyPosition = Math.floor(position / modes.length);
    const localSeed = hash(`${seed}:${target.subjectId}:${target.topicId}:${position}`);
    const question = mode === "geometry"
      ? geometryQuestion(config,target,localSeed,familyPosition)
      : mode === "reading"
        ? englishReadingQuestion(config,target,localSeed,familyPosition)
        : dataQuestion(config,target,localSeed,familyPosition);
    let promptKey = JSON.stringify([question.prompt, question.stimulus]);
    if (mode === "reading") {
      // A renamed character or location is not a new comprehension task.
      for (const cosmetic of [...NAMES, ...PLACES, ...QUALITIES]) {
        promptKey = promptKey.replaceAll(cosmetic, "{context}");
      }
    }
    // The same visible problem has the same identity across fresh session seeds.
    question.exposureKey = `rich:${question.generationFamily}:${config.levelId}:${hash(promptKey)}`;
    if (prompts.has(promptKey)) continue;
    prompts.add(promptKey);
    output.push(question);
  }
  return output;
}
